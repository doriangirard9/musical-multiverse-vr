// IMPORTS CIBLÉS (sous-modules) — surtout PAS `@magenta/music` complet.
// Le barrel complet tire gansynth/ddsp/spice/transcription → core/audio_utils,
// qui crée un OfflineAudioContext AU CHARGEMENT (top-level) → crash dans un
// worker ("Cannot use offline audio context in a web worker").  MusicRNN +
// core/sequences ne touchent jamais audio_utils (vérifié).  Bonus : bundle
// bien plus léger partout (main thread inclus).
import { MusicRNN } from "@magenta/music/esm/music_rnn";
import type { INoteSequence } from "@magenta/music/esm/protobuf";
import {
    IMusicGeneratorAdapter, AdapterCapabilities, AdapterTier,
} from "../IMusicGeneratorAdapter";
import {
    MidiEvent, AdapterStats, InitOpts, emptyStats,
} from "../types";
import { RNN_HYPERPARAMS } from "../hyperparams";
import { notesToMidiEvents, notesEndStep } from "./noteConversion";

// ─── MagentaMusicRNNAdapter ──────────────────────────────────────────────────
//
//   Premier vrai modèle d'IA générative dans le benchmark.  Wraps `MusicRNN`
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

export type MagentaRNNVariant =
    | "basic_rnn"            // mélodie monophonique simple
    | "melody_rnn"           // mélodie monophonique structurée
    | "chord_pitches_improv" // mélodie improvisée sur accords (ImprovRNN)
    | "drum_kit_rnn";        // patterns de batterie (DrumsRNN, polyphonique)

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
    drum_kit_rnn:         "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn",
};

// Pitches GM de batterie pour le seed du DrumsRNN
const GM_KICK = 36, GM_SNARE = 38, GM_HIHAT = 42;

const STEPS_PER_QUARTER = 4;   // sixteenths
const DEFAULT_BPM = 120;
const MS_PER_STEP = 60_000 / (DEFAULT_BPM * STEPS_PER_QUARTER);   // 125 ms

const HYPERPARAMS = RNN_HYPERPARAMS;

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

    private rnn: MusicRNN | null = null;
    private variant: MagentaRNNVariant;
    private checkpointUrl: string;
    private chordProgression: string[] | null;
    private primerMaxNotes: number;
    private readonly isDrums: boolean;        // batterie = polyphonique, pas de repliement de hauteur

    private hypers = new Map<string, number>();
    private latencies: number[] = [];

    // Historique des notes générées, en STEPS ABSOLUS (positions explicites →
    // supporte la POLYPHONIE : plusieurs notes au même step). On reconstruit un
    // primer quantifié propre à chaque appel à partir d'ici. `nextStep` suit la
    // fin du primer pour y rattacher la continuation générée.
    private recentNotes: { pitch: number; startStep: number; endStep: number }[] = [];
    private nextStep = 0;
    /** Silence de queue du chunk précédent (ms), reporté sur le premier delta
     *  du chunk suivant — la grille rythmique traverse les frontières de
     *  chunks (cf. règles de conservation des silences dans noteConversion). */
    private padCarryMs = 0;

    constructor(opts: MagentaMusicRNNAdapterOpts = {}) {
        this.variant = opts.variant ?? "basic_rnn";
        this.checkpointUrl = opts.checkpointUrl ?? CHECKPOINT_URLS[this.variant];
        this.primerMaxNotes = opts.primerMaxNotes ?? 8;
        this.isDrums = this.variant === "drum_kit_rnn";

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

        // Seed adapté au type de modèle.
        if (this.isDrums) {
            // Un petit beat rock : kick/snare alternés + hi-hat sur chaque temps.
            // Notes simultanées (même step) → exerce la polyphonie dès le primer.
            this.seedNotes([
                { pitch: GM_KICK,  startStep: 0, endStep: 1 },
                { pitch: GM_HIHAT, startStep: 0, endStep: 1 },
                { pitch: GM_HIHAT, startStep: 2, endStep: 3 },
                { pitch: GM_SNARE, startStep: 4, endStep: 5 },
                { pitch: GM_HIHAT, startStep: 4, endStep: 5 },
                { pitch: GM_HIHAT, startStep: 6, endStep: 7 },
            ]);
        } else {
            // Un court motif Do majeur (C-D-E-G) → contexte TONAL de départ.
            this.seedNotes([
                { pitch: 60, startStep: 0, endStep: 2 },
                { pitch: 62, startStep: 2, endStep: 4 },
                { pitch: 64, startStep: 4, endStep: 6 },
                { pitch: 67, startStep: 6, endStep: 8 },
            ]);
        }
    }

    private seedNotes(notes: { pitch: number; startStep: number; endStep: number }[]): void {
        this.recentNotes = notes.map(n => ({ ...n }));
        this.nextStep = Math.max(...notes.map(n => n.endStep), 0);
    }

    async init(opts?: InitOpts): Promise<void> {
        const t0 = performance.now();
        try {
            opts?.progressCallback?.(0);

            this.rnn = new MusicRNN(this.checkpointUrl);
            await this.rnn.initialize();

            opts?.progressCallback?.(0.7);

            // Warm-up : un premier appel à continueSequence pour amorcer les
            // weights TF.js.  Sans ça, le tout premier appel "réel" payerait le
            // coût du JIT et fausserait la mesure p95.
            await this.rnn.continueSequence(
                this.buildQuantizedPrimer(), 4, 1.0, this.chordProgression ?? undefined,
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
        this.recentNotes.length = 0;
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
            // (Le contexte fourni par le scheduler N'EST PAS absorbé : ce sont
            //  les notes qu'on a déjà générées — les ré-injecter doublerait
            //  l'historique. L'adapter possède sa propre mémoire `recentNotes`.)

            // 1. Primer QUANTIFIÉ propre depuis recentNotes (grille de steps,
            //    aucune conversion secondes ↔ quantification → pas de dérive).
            const primerQ = this.buildQuantizedPrimer();

            // 2. Steps à générer : couvre dtMs, ARRONDI AU TEMPS SUPÉRIEUR
            //    (multiple de 4 steps) pour que les chunks tombent sur la
            //    pulsation. Bornes 8..32 (2 temps à 2 mesures).
            const stepsToGen = Math.min(32, Math.max(8,
                Math.ceil(dtMs / MS_PER_STEP / 4) * 4));

            // 3. Appel au modèle. continueSequence renvoie UNIQUEMENT la
            //    continuation, en steps relatifs 0-based (vérifié S2).
            const temperature = this.hypers.get("temperature")!;
            const generated = await this.rnn.continueSequence(
                primerQ, stepsToGen, temperature, this.chordProgression ?? undefined,
            );

            // 4. La mémoire du modèle (primer du prochain appel) garde la
            //    continuation COMPLÈTE — la cohérence musicale se construit
            //    sur ce que le modèle a réellement composé.
            const genNotes = generated.notes ?? [];
            for (const n of genNotes) {
                const startStep = n.quantizedStartStep ?? 0;
                const endStep = Math.max(startStep + 1, n.quantizedEndStep ?? startStep + 1);
                const rawPitch = n.pitch ?? 60;
                this.recentNotes.push({
                    pitch: rawPitch,
                    startStep: this.nextStep + startStep,
                    endStep: this.nextStep + endStep,
                });
            }
            this.nextStep += stepsToGen;
            while (this.recentNotes.length > this.primerMaxNotes) this.recentNotes.shift();

            // 5. Densité = proportion de notes JOUÉES (filtre d'émission,
            //    la grille reste intacte : retirer une note crée un silence,
            //    pas une compression). Éclaircissage DÉTERMINISTE et MÉTRIQUE :
            //    on retire d'abord les subdivisions faibles (doubles-croches),
            //    le squelette du groove (temps forts) reste — un tirage
            //    aléatoire trouait le rythme de façon imprévisible.
            const density = this.hypers.get("density")!;
            const densitySpec = HYPERPARAMS.find(h => h.name === "density")!;
            const keepProb = density / densitySpec.max;
            let playNotes = genNotes;
            if (keepProb < 1) {
                // Niveau métrique : 0 = début de mesure … 4 = double-croche faible
                const level = (s: number) =>
                    s % 16 === 0 ? 0 : s % 8 === 0 ? 1 : s % 4 === 0 ? 2 : s % 2 === 0 ? 3 : 4;
                const maxLevel = Math.floor(keepProb * 4 + 1e-6);
                playNotes = genNotes.filter(n => level(n.quantizedStartStep ?? 0) <= maxLevel);
            }

            // 6. Conversion en MidiEvent[] (helper partagé : polyphonie,
            //    silences de tête conservés, vélocités musicales).
            //    Mélodie : repliement de hauteur dans la tessiture. Batterie :
            //    hauteur conservée (notes GM 36/38/42…).
            //    CANAL 0 pour tout, batterie comprise : la convention de
            //    wamjamparty (Sequencer, DrumPlateKit…) émet tout sur 0x90 et
            //    les WAMs de batterie (DRM-16, drumsampler) ignorent le canal
            //    10 GM — ils mappent par numéro de note sur le canal 0.
            const events = notesToMidiEvents(playNotes, {
                msPerStep: MS_PER_STEP,
                isDrums: this.isDrums,
                octaveCenter: this.hypers.get("octaveCenter")!,
                pitchRange: this.hypers.get("pitchRange")!,
                channel: 0,
            });

            // 7. GRILLE CONTINUE inter-chunks : le silence de QUEUE du chunk
            //    (après le dernier événement, jusqu'à la frontière stepsToGen)
            //    n'a pas d'événement porteur — on le REPORTE sur le premier
            //    delta du chunk suivant. Chunk sans note émise = chunk entier
            //    reporté (un vrai silence musical, pas un trou de grille).
            if (events.length > 0) {
                events[0].deltaMs += this.padCarryMs;
                const tailSteps = Math.max(0, stepsToGen - notesEndStep(playNotes));
                this.padCarryMs = tailSteps * MS_PER_STEP;
            } else {
                this.padCarryMs += stepsToGen * MS_PER_STEP;
            }

            // 8. Stats
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
     * Construit un NoteSequence QUANTIFIÉ depuis recentNotes (positions en steps
     * ABSOLUS). On re-normalise sur 0 (la plus ancienne note commence au step 0)
     * et on préserve les positions relatives → la POLYPHONIE est conservée
     * (notes simultanées au même step). Aucun quantizeNoteSequence, donc aucune
     * dérive de réalignement.
     */
    private buildQuantizedPrimer(): INoteSequence {
        const notes: INoteSequence["notes"] = [];
        const base = this.recentNotes.length
            ? Math.min(...this.recentNotes.map(n => n.startStep))
            : 0;
        let total = 0;
        for (const rn of this.recentNotes) {
            const s = rn.startStep - base;
            const e = rn.endStep - base;
            notes!.push({
                pitch: rn.pitch,
                quantizedStartStep: s,
                quantizedEndStep: e,
                velocity: 90,
                program: 0,
                isDrum: this.isDrums,
            });
            if (e > total) total = e;
        }
        return {
            quantizationInfo: { stepsPerQuarter: STEPS_PER_QUARTER },
            notes,
            totalQuantizedSteps: total,
        } as INoteSequence;
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

