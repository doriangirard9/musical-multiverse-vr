import * as mm from "@magenta/music";
import {
    IMusicGeneratorAdapter, AdapterCapabilities, AdapterTier,
} from "../IMusicGeneratorAdapter";
import {
    MidiEvent, HyperparamSpec, AdapterStats, InitOpts, emptyStats,
} from "../types";

// ─── MagentaMusicRNNAdapter ──────────────────────────────────────────────────
//
//   Premier vrai modèle d'IA générative dans le benchmark.  Wraps `mm.MusicRNN`
//   de Magenta.js (TensorFlow.js sous le capot).
//
//   Trois checkpoints disponibles côté Google (URLs publiques) :
//     - basic_rnn       : monophonique, sortie en gamme C, ~10 MB
//     - melody_rnn      : monophonique avec contexte d'accords, ~12 MB
//     - attention_rnn   : ajoute un mécanisme d'attention, ~13 MB
//
//   Le choix du checkpoint se fait au constructeur via `opts.variant`.
//   Par défaut on charge `basic_rnn` car c'est le plus léger et le plus
//   documenté — idéal pour le test de faisabilité.
//
//   Stratégie temporelle :
//     - Magenta opère en *steps* (sixteenths à 120 BPM par défaut)
//     - 1 step = 125 ms à 120 BPM
//     - Pour requestNext(context, dtMs), on génère ceil(dtMs / 125) steps
//     - On garde un *primer rolling* (les 16 dernières notes émises) pour
//       que le réseau ait toujours du contexte
//
//   Latence attendue (cible) :
//     - init : 1-3 s (téléchargement + warm-up TF.js)
//     - requestNext : 20-50 ms par appel sur M4 / Chrome
//
//   Si la latence p95 dépasse 100 ms → drapeau rouge, bascule sur
//   l'architecture serveur (tier 2) discutée Section 5.6 du plan PFE.

export type MagentaRNNVariant = "basic_rnn" | "melody_rnn" | "chord_pitches_improv";

export interface MagentaMusicRNNAdapterOpts extends InitOpts {
    /** Quel checkpoint Magenta charger.  Défaut : "basic_rnn". */
    variant?: MagentaRNNVariant;
    /** URL du checkpoint personnalisé (override la variant). */
    checkpointUrl?: string;
    /**
     * Progression d'accords pour les checkpoints conditionnés
     * (chord_pitches_improv).  Ignoré par basic_rnn / melody_rnn.
     * Défaut pour chord_pitches_improv : ["C"].
     */
    chordProgression?: string[];
    /**
     * Nombre max de notes gardées dans le primer (fenêtre glissante).
     * Lever ce nombre = plus de contexte musical mais inférence plus
     * lente (le RNN reconsomme tout le primer à chaque appel).
     * Défaut : 8 (compromis trouvé en S2, cf PFE_JOURNAL).
     */
    primerMaxNotes?: number;
}

// URLs des checkpoints publics hébergés par Google.
//
// Note S2 : `attention_rnn` était initialement listé dans le plan PFE
// mais n'est PAS publié sur le CDN public — l'URL retourne un XML 404
// que Magenta tente de parser en JSON et fait planter init().  Remplacé
// par `chord_pitches_improv` (autre music_rnn du CDN qui fonctionne avec
// la même classe `MusicRNN`).  Finding documenté dans PFE_JOURNAL.md.
const CHECKPOINT_URLS: Record<MagentaRNNVariant, string> = {
    basic_rnn:            "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn",
    melody_rnn:           "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn",
    chord_pitches_improv: "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv",
};

const STEPS_PER_QUARTER = 4;   // sixteenths
const DEFAULT_BPM = 120;
const MS_PER_STEP = 60_000 / (DEFAULT_BPM * STEPS_PER_QUARTER);   // 125 ms

const HYPERPARAMS: HyperparamSpec[] = [
    {
        name: "temperature",
        displayName: "Température",
        description: "Chaos vs prévisibilité du tirage softmax (1.0 = naturel)",
        min: 0.1, max: 2.5, default: 1.0,
    },
    {
        name: "density",
        displayName: "Densité",
        description: "Steps de génération par appel — plus haut = flux plus dense",
        min: 1, max: 8, default: 2,
    },
    {
        name: "octaveCenter",
        displayName: "Octave centrale",
        description: "Pitch MIDI médian. Sert au post-filtrage des notes hors tessiture.",
        min: 48, max: 84, default: 60,
        expensiveToUpdate: false,
    },
    {
        name: "pitchRange",
        displayName: "Tessiture",
        description: "Demi-tons d'étendue autour de l'octave centrale (post-filtrage)",
        min: 12, max: 60, default: 36,
    },
];

export class MagentaMusicRNNAdapter implements IMusicGeneratorAdapter {
    readonly id: string;
    readonly displayName: string;
    readonly tier: AdapterTier = "local-browser";

    readonly capabilities: AdapterCapabilities = {
        streaming: true,
        hyperparameters: HYPERPARAMS,
        inputModality: "midi-context",
        outputModality: "midi-events",
    };

    readonly stats: AdapterStats = emptyStats();

    private rnn: mm.MusicRNN | null = null;
    private variant: MagentaRNNVariant;
    private checkpointUrl: string;
    private chordProgression: string[] | null;
    private primerMaxNotes: number;

    private hypers = new Map<string, number>();
    private latencies: number[] = [];

    // Primer NoteSequence — historique des notes émises, taille bornée
    private primer: mm.INoteSequence = {
        notes: [],
        totalTime: 0,
        ticksPerQuarter: 220,
        tempos: [{ time: 0, qpm: DEFAULT_BPM }],
    };

    constructor(opts: MagentaMusicRNNAdapterOpts = {}) {
        this.variant = opts.variant ?? "basic_rnn";
        this.checkpointUrl = opts.checkpointUrl ?? CHECKPOINT_URLS[this.variant];
        this.primerMaxNotes = opts.primerMaxNotes ?? 8;

        // chord_pitches_improv exige une progression d'accords.
        // Défaut : un seul accord de Do si non fourni.
        if (opts.chordProgression) {
            this.chordProgression = opts.chordProgression;
        } else if (this.variant === "chord_pitches_improv") {
            this.chordProgression = ["C"];
        } else {
            this.chordProgression = null;
        }

        this.id = `magenta-music-rnn-${this.variant}`;
        this.displayName = `Magenta MusicRNN (${this.variant})`;

        for (const h of HYPERPARAMS) this.hypers.set(h.name, h.default);

        // Seed le primer avec une simple note de Do (sinon continueSequence refuse
        // une séquence vide).  Sera vite remplacée par les vraies notes émises.
        this.primer.notes!.push({
            pitch: 60, startTime: 0, endTime: 0.25, velocity: 80,
        });
        this.primer.totalTime = 0.25;
    }

    async init(opts?: InitOpts): Promise<void> {
        const t0 = performance.now();
        try {
            opts?.progressCallback?.(0);

            this.rnn = new mm.MusicRNN(this.checkpointUrl);
            await this.rnn.initialize();

            opts?.progressCallback?.(0.7);

            // Warm-up : un premier appel à continueSequence pour amorcer les
            // weights TF.js dans le contexte WebGL.  Sans ça, le tout premier
            // appel "réel" payerait le coût du JIT et fausserait la mesure p95.
            const qns = mm.sequences.quantizeNoteSequence(this.primer, STEPS_PER_QUARTER);
            await this.rnn.continueSequence(
                qns, 4, 1.0, this.chordProgression ?? undefined,
            );

            opts?.progressCallback?.(1);
            this.stats.initTimeMs = performance.now() - t0;
        } catch (e) {
            this.stats.initTimeMs = performance.now() - t0;
            this.stats.failureCount++;
            throw e;
        }
    }

    async dispose(): Promise<void> {
        if (this.rnn) {
            this.rnn.dispose();
            this.rnn = null;
        }
        this.latencies.length = 0;
        this.primer.notes = [];
    }

    setHyperparameter(name: string, value: number): void {
        const spec = HYPERPARAMS.find(h => h.name === name);
        if (!spec) throw new Error(`MagentaMusicRNNAdapter: unknown hyperparameter "${name}"`);
        if (value < spec.min || value > spec.max) {
            throw new Error(
                `MagentaMusicRNNAdapter: ${name}=${value} out of range [${spec.min}, ${spec.max}]`,
            );
        }
        this.hypers.set(name, value);
    }

    getHyperparameter(name: string): number {
        const v = this.hypers.get(name);
        if (v === undefined) throw new Error(`MagentaMusicRNNAdapter: unknown hyperparameter "${name}"`);
        return v;
    }

    async requestNext(context: readonly MidiEvent[], dtMs: number): Promise<MidiEvent[]> {
        if (!this.rnn) {
            this.stats.failureCount++;
            throw new Error("MagentaMusicRNNAdapter: init() must be called before requestNext()");
        }

        const tStart = performance.now();

        try {
            // 1. Intégrer les nouvelles notes du contexte dans le primer
            this.absorbContextNotes(context);

            // 2. Quantifier le primer
            const qns = mm.sequences.quantizeNoteSequence(this.primer, STEPS_PER_QUARTER);

            // 3. Choisir combien de steps générer
            //    densityFactor = 1..8 → on multiplie par ceil(dtMs / MS_PER_STEP)
            const baseSteps = Math.max(1, Math.ceil(dtMs / MS_PER_STEP));
            const densityFactor = this.hypers.get("density")!;
            const stepsToGen = Math.min(32, Math.round(baseSteps * (densityFactor / 2)));

            // 4. Appel au modèle (chordProgression seulement si conditionné)
            const temperature = this.hypers.get("temperature")!;
            const generated = await this.rnn.continueSequence(
                qns, stepsToGen, temperature, this.chordProgression ?? undefined,
            );

            // 5. Extraction des NOUVELLES notes
            //
            // MusicRNN.continueSequence peut renvoyer SOIT la continuation
            // seule, SOIT primer + continuation, selon les versions/checkpoints.
            // L'ancienne logique « filtrer par quantizedStartStep » se faisait
            // piéger par les champs undefined (cf S2 — Notes/call = 0 dans
            // le premier bench).  Détection robuste par comparaison de taille :
            //   - si on a plus de notes que le primer → primer est inclus, on slice
            //   - sinon → c'est déjà juste la continuation, on prend tout
            const primerNoteCount = qns.notes?.length ?? 0;
            const allGenNotes = generated.notes ?? [];
            const newNotes = allGenNotes.length > primerNoteCount
                ? allGenNotes.slice(primerNoteCount)
                : allGenNotes;

            // 6. Post-filtrage selon la tessiture utilisateur
            const octaveCenter = this.hypers.get("octaveCenter")!;
            const pitchRange = this.hypers.get("pitchRange")!;
            const minP = octaveCenter - pitchRange / 2;
            const maxP = octaveCenter + pitchRange / 2;
            const filtered = newNotes.filter(n => {
                const p = n.pitch ?? 60;
                return p >= minP && p <= maxP;
            });

            // 7. Conversion en MidiEvent[] avec deltaMs relatifs
            const events: MidiEvent[] = [];
            let lastTimeSec = 0;
            for (const n of filtered) {
                const startSec = (n.quantizedStartStep ?? 0) * (MS_PER_STEP / 1000);
                const endSec   = (n.quantizedEndStep   ?? 0) * (MS_PER_STEP / 1000);
                const startDelta = events.length === 0 ? 0 : (startSec - lastTimeSec) * 1000;

                events.push({
                    type: "note-on",
                    note: n.pitch,
                    velocity: n.velocity ?? 80,
                    channel: 0,
                    deltaMs: Math.max(0, startDelta),
                });
                events.push({
                    type: "note-off",
                    note: n.pitch,
                    channel: 0,
                    deltaMs: Math.max(1, (endSec - startSec) * 1000),
                });

                lastTimeSec = startSec;

                // Mettre à jour le primer avec cette nouvelle note
                this.primer.notes!.push({
                    pitch: n.pitch,
                    startTime: this.primer.totalTime!,
                    endTime: this.primer.totalTime! + (endSec - startSec),
                    velocity: n.velocity,
                });
                this.primer.totalTime = (this.primer.totalTime ?? 0) + (endSec - startSec);
            }

            // 8. Tronquer le primer si trop long (fenêtre glissante)
            while ((this.primer.notes!.length) > this.primerMaxNotes) {
                const dropped = this.primer.notes!.shift()!;
                const droppedDuration = (dropped.endTime ?? 0) - (dropped.startTime ?? 0);
                // Réaligner les startTimes restants pour éviter une dérive
                for (const remaining of this.primer.notes!) {
                    remaining.startTime = (remaining.startTime ?? 0) - droppedDuration;
                    remaining.endTime = (remaining.endTime ?? 0) - droppedDuration;
                }
                this.primer.totalTime = (this.primer.totalTime ?? 0) - droppedDuration;
            }

            // 9. Stats
            const latency = performance.now() - tStart;
            this.recordLatency(latency);
            this.stats.callCount++;
            this.updateAggregateStats();

            return events;
        } catch (e) {
            this.stats.failureCount++;
            throw e;
        }
    }

    // ── Helpers internes ──────────────────────────────────────────────────

    /**
     * Si l'appelant fournit du contexte (notes consommées récemment),
     * on l'absorbe dans le primer avant de générer.  Permet à un user
     * tiers (par exemple un autre instrument live) d'influencer la suite.
     */
    private absorbContextNotes(context: readonly MidiEvent[]): void {
        for (const ev of context) {
            if (ev.type !== "note-on" || ev.note === undefined) continue;
            // Ne ré-ajoute pas si la note est déjà la dernière du primer
            const last = this.primer.notes![this.primer.notes!.length - 1];
            if (last && last.pitch === ev.note) continue;

            const duration = 0.25; // valeur arbitraire pour le contexte externe
            this.primer.notes!.push({
                pitch: ev.note,
                startTime: this.primer.totalTime!,
                endTime: this.primer.totalTime! + duration,
                velocity: ev.velocity ?? 80,
            });
            this.primer.totalTime = (this.primer.totalTime ?? 0) + duration;
        }
    }

    private recordLatency(ms: number): void {
        this.latencies.push(ms);
        if (this.latencies.length > 1000) this.latencies.shift();
    }

    private updateAggregateStats(): void {
        const lat = this.latencies;
        const n = lat.length;
        if (n === 0) return;

        let sum = 0;
        for (const v of lat) sum += v;
        this.stats.avgInferenceMs = sum / n;

        const sorted = [...lat].sort((a, b) => a - b);
        this.stats.p50InferenceMs = sorted[Math.floor(n * 0.50)];
        this.stats.p95InferenceMs = sorted[Math.floor(n * 0.95)];
        this.stats.p99InferenceMs = sorted[Math.min(n - 1, Math.floor(n * 0.99))];

        const mem = (performance as any).memory;
        if (mem && typeof mem.usedJSHeapSize === "number") {
            this.stats.memHeapBytes = mem.usedJSHeapSize;
        }
    }
}
