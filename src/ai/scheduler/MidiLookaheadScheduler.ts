import { IMusicGeneratorAdapter } from "../IMusicGeneratorAdapter";
import { MidiEvent } from "../types";

// ─── MidiLookaheadScheduler ──────────────────────────────────────────────────
//
//   Découpleur temporel entre la GÉNÉRATION (Couche A, asynchrone, sujette
//   aux pics GC de TF.js) et la LECTURE (horloge audio précise, sample-accurate).
//
//   Pattern : "A Tale of Two Clocks" (Chris Wilson, 2013).
//     • Une boucle JS grossière (tick ~25 ms) fait le travail
//     • Les événements sont programmés à l'avance sur l'horloge audio précise
//
//   Deux rôles à chaque tick :
//     1. REMPLISSAGE — si l'horizon de génération n'est pas couvert, appeler
//        l'adapter pour produire plus de notes (async, gardé contre le
//        recouvrement).
//     2. DRAIN — programmer via scheduleCallback les événements dont l'heure
//        tombe dans la fenêtre [now, now + scheduleAheadSec].
//
//   Modulations post-génération appliquées AU DRAIN (donc immédiates, ne
//   passent jamais par le modèle) :
//     • velocityScale — dynamique (main droite du chef)
//     • tempoScale    — tempo       (main droite du chef)
//
//   Les événements sont stockés avec un timing MUSICAL RELATIF (deltaMs au
//   tempo nominal).  Le temps audio absolu est calculé paresseusement au
//   drain en appliquant tempoScale → le tempo est donc immédiat, pas
//   bufferisé.
//
//   Découplages (adapter pattern) :
//     • L'adapter de génération est injecté (n'importe quel IMusicGeneratorAdapter)
//     • L'horloge est injectée (clock: () => audioCtx.currentTime) → testable
//       sans vrai AudioContext
//     • Le scheduleCallback est injecté → le scheduler ne connaît pas Pro54,
//       on lui passe la fonction de programmation (testable avec un mock,
//       branchable sur Pro54 en prod)

export type ScheduleCallback = (event: MidiEvent, timeSec: number) => void;
export type ClockFn = () => number;   // renvoie le temps audio courant en secondes

export interface SchedulerConfig {
    /** Horizon de génération en secondes.  Combien de musique on génère
     *  en avance.  Plus grand = plus résistant aux pics GC et à la latence
     *  d'inférence, mais hyperparamètres plus lents à répondre.
     *  Défaut : 1.5 s.  Configurable et modifiable à chaud (setHorizonSec). */
    horizonSec?: number;

    /** Durée musicale MINIMALE demandée à l'adapter par appel (ms) — la
     *  requête réelle est adaptative (déficit d'horizon, cf generateMore).
     *  Défaut : 1000 ms.  Trop petit = appels d'inférence trop fréquents,
     *  la génération ne tient pas devant la lecture (famine). */
    generationChunkMs?: number;

    /** Fenêtre de programmation audio sample-accurate (s).  Défaut : 0.1 s. */
    scheduleAheadSec?: number;

    /** Période de la boucle de tick (ms).  Défaut : 25 ms. */
    tickMs?: number;

    /** BPM nominal supposé par le modèle.  Défaut : 120. */
    nominalBpm?: number;
}

interface PendingEvent {
    event: MidiEvent;
    /** Temps depuis l'événement précédent, en ms, au tempo NOMINAL. */
    deltaMs: number;
}

export interface SchedulerStats {
    /** Nombre d'appels de génération effectués. */
    generationCalls: number;
    /** Événements programmés avec succès (dans le futur). */
    scheduledEvents: number;
    /** Événements programmés EN RETARD (timeSec < now) = glitch audible.
     *  Métrique de validation clé : doit rester à 0. */
    lateEvents: number;
    /** Ticks où l'horizon réalisé est tombé sous scheduleAheadSec
     *  (buffer dangereusement bas, risque de sous-alimentation). */
    lowBufferTicks: number;
    /** Profondeur courante du buffer en secondes (temps réel, tempo appliqué). */
    bufferDepthSec: number;
    /** Notes (note-on) GÉNÉRÉES par l'adapter depuis le start. */
    notesGenerated: number;
    /** Notes (note-on) effectivement JOUÉES (envoyées au scheduleCallback). */
    notesPlayed: number;
    /** Ré-ancrages de la grille musicale (le buffer s'est vidé ET la
     *  génération est revenue trop tard pour reprendre la grille).
     *  Chaque resync = une rupture de pulsation audible. Doit rester bas. */
    gridResyncs: number;
}

export class MidiLookaheadScheduler {
    // ── Config live-tunable ───────────────────────────────────────────────
    public horizonSec: number;
    public tempoScale = 1.0;       // post-gen, immédiat (main droite)
    public velocityScale = 1.0;    // post-gen, immédiat (main droite)

    private readonly generationChunkMs: number;
    private readonly scheduleAheadSec: number;
    private readonly tickMs: number;

    // ── État ──────────────────────────────────────────────────────────────
    private running = false;
    private generating = false;          // garde contre la génération concurrente
    private tickHandle: ReturnType<typeof setInterval> | null = null;

    private pending: PendingEvent[] = [];   // file musicale relative
    private headTimeSec = 0;                 // temps audio absolu du prochain événement à drainer
    /** Temps audio absolu du DERNIER événement programmé ou en file.  C'est
     *  l'ancre de la GRILLE MUSICALE : quand le buffer se vide puis qu'un
     *  nouveau chunk arrive, son premier événement est posé à
     *  lastEventTimeSec + delta — la pulsation traverse les vidages de
     *  buffer au lieu de repartir d'un instant arbitraire. */
    private lastEventTimeSec = 0;
    private contextWindow: MidiEvent[] = []; // contexte glissant passé à l'adapter

    private _stats: SchedulerStats = {
        generationCalls: 0,
        scheduledEvents: 0,
        lateEvents: 0,
        lowBufferTicks: 0,
        bufferDepthSec: 0,
        notesGenerated: 0,
        notesPlayed: 0,
        gridResyncs: 0,
    };

    constructor(
        private adapter: IMusicGeneratorAdapter,
        private clock: ClockFn,
        private scheduleCallback: ScheduleCallback,
        config: SchedulerConfig = {},
    ) {
        this.horizonSec = config.horizonSec ?? 1.5;
        this.generationChunkMs = config.generationChunkMs ?? 1000;
        this.scheduleAheadSec = config.scheduleAheadSec ?? 0.1;
        this.tickMs = config.tickMs ?? 25;
    }

    get stats(): Readonly<SchedulerStats> { return this._stats; }

    // ── Contrôle live (modulations post-gen + horizon jouable) ────────────

    /** Horizon de génération (s).  Modifiable à chaud — l'utilisateur peut
     *  jouer avec.  Plus court = tempo/caractère plus réactif mais moins de
     *  marge GC. */
    setHorizonSec(sec: number): void {
        this.horizonSec = Math.max(0.1, Math.min(4.0, sec));
    }

    /** Échelle de tempo (1 = nominal).  Appliquée au drain → immédiat. */
    setTempoScale(scale: number): void {
        this.tempoScale = Math.max(0.25, Math.min(4.0, scale));
    }

    /** Échelle de vélocité (1 = inchangé).  Appliquée au drain → immédiat. */
    setVelocityScale(scale: number): void {
        this.velocityScale = Math.max(0.0, Math.min(2.0, scale));
    }

    // ── Cycle de vie ──────────────────────────────────────────────────────

    start(): void {
        if (this.running) return;
        this.running = true;
        this.headTimeSec = this.clock() + this.scheduleAheadSec;
        this.lastEventTimeSec = this.headTimeSec;
        this.pending = [];
        this.contextWindow = [];
        this.tickHandle = setInterval(() => this.tick(), this.tickMs);
    }

    stop(): void {
        this.running = false;
        if (this.tickHandle !== null) {
            clearInterval(this.tickHandle);
            this.tickHandle = null;
        }
        this.pending = [];
    }

    // ── Boucle de tick ────────────────────────────────────────────────────

    private tick(): void {
        if (!this.running) return;
        const now = this.clock();

        // 1. DRAIN — programmer les événements échus
        const until = now + this.scheduleAheadSec;
        while (this.pending.length > 0 && this.headTimeSec < until) {
            const pe = this.pending.shift()!;
            const t = this.headTimeSec;

            let scheduledAt: number;
            if (t < now) {
                // Événement en retard = glitch audible. On le programme quand
                // même (immédiatement) mais on compte la faute.
                this._stats.lateEvents++;
                scheduledAt = now;
            } else {
                this._stats.scheduledEvents++;
                scheduledAt = t;
            }
            this.scheduleCallback(this.applyVelocity(pe.event), scheduledAt);
            if (pe.event.type === "note-on") this._stats.notesPlayed++;

            // Ancre de grille = temps RÉELLEMENT programmé.
            this.lastEventTimeSec = scheduledAt;

            // Avancer la tête : delta du PROCHAIN événement, tempo appliqué.
            // Base = scheduledAt (pas t) : si on a pris du retard, la suite
            // glisse d'autant (rubato) au lieu de rester en retard pour
            // toujours et de partir en rafale.
            const next = this.pending[0];
            if (next) {
                this.headTimeSec = scheduledAt + (next.deltaMs / 1000) / this.tempoScale;
            }
        }

        // 2. Mesurer la profondeur de buffer réalisée (temps réel)
        this._stats.bufferDepthSec = this.realizedHorizonSec(now);
        if (this._stats.bufferDepthSec < this.scheduleAheadSec) {
            this._stats.lowBufferTicks++;
        }

        // 3. REMPLISSAGE — générer si l'horizon n'est pas couvert (async, gardé)
        if (this._stats.bufferDepthSec < this.horizonSec && !this.generating) {
            void this.generateMore();
        }
    }

    /** Horizon réalisé = temps réel entre `now` et la fin du buffer. */
    private realizedHorizonSec(now: number): number {
        if (this.pending.length === 0) return Math.max(0, this.headTimeSec - now);
        let sec = Math.max(0, this.headTimeSec - now);
        // headTimeSec couvre déjà le 1er pending ; ajouter les deltas suivants
        for (let i = 1; i < this.pending.length; i++) {
            sec += (this.pending[i].deltaMs / 1000) / this.tempoScale;
        }
        return sec;
    }

    // ── Génération (async, gardée contre le recouvrement) ─────────────────

    private async generateMore(): Promise<void> {
        this.generating = true;
        try {
            // Taille de requête ADAPTATIVE : viser 1.5× l'horizon pour absorber
            // la latence d'inférence (CPU worker : centaines de ms par appel).
            // De gros chunks = moins d'appels = la génération reste devant la
            // lecture. Converti en temps NOMINAL (les deltas sont au tempo 1).
            const deficitSec = Math.max(0, this.horizonSec * 1.5 - this._stats.bufferDepthSec);
            const dtMs = Math.min(4000, Math.max(this.generationChunkMs, deficitSec * this.tempoScale * 1000));

            const events = await this.adapter.requestNext(this.contextWindow, dtMs);
            this._stats.generationCalls++;
            if (events.length === 0) return;

            // Si le buffer était vide : REPRENDRE LA GRILLE depuis le dernier
            // événement connu (lastEventTimeSec + delta du nouvel événement,
            // qui inclut le silence de fin de chunk reporté par l'adapter).
            // On ne ré-ancre sur "maintenant" QUE si la grille est déjà passée
            // (vraie famine) — chaque ré-ancrage casse la pulsation, compté.
            if (this.pending.length === 0) {
                const now = this.clock();
                const anchor = this.lastEventTimeSec + (events[0].deltaMs / 1000) / this.tempoScale;
                if (anchor >= now + 0.02) {
                    this.headTimeSec = anchor;
                } else {
                    this.headTimeSec = now + this.scheduleAheadSec;
                    this._stats.gridResyncs++;
                }
            }

            for (const ev of events) {
                this.pending.push({ event: ev, deltaMs: ev.deltaMs });
                // Maintenir le contexte glissant (16 derniers note-on)
                if (ev.type === "note-on") {
                    this._stats.notesGenerated++;
                    this.contextWindow.push(ev);
                    if (this.contextWindow.length > 16) this.contextWindow.shift();
                }
            }
        } catch (e) {
            // Une génération ratée ne doit pas tuer le scheduler — on log et on
            // réessaiera au prochain tick.
            console.warn("[MidiLookaheadScheduler] generation failed:", e);
        } finally {
            this.generating = false;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /** Applique velocityScale à un note-on (clampé 1..127).  Les autres
     *  événements sont renvoyés tels quels. */
    private applyVelocity(ev: MidiEvent): MidiEvent {
        if (ev.type !== "note-on" || ev.velocity === undefined) return ev;
        const v = Math.max(1, Math.min(127, Math.round(ev.velocity * this.velocityScale)));
        return { ...ev, velocity: v };
    }
}
