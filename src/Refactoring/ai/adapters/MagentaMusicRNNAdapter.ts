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
    MidiEvent, HyperparamSpec, AdapterStats, InitOpts, emptyStats,
} from "../types";

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

    private rnn: MusicRNN | null = null;
    private variant: MagentaRNNVariant;
    private checkpointUrl: string;
    private chordProgression: string[] | null;
    private primerMaxNotes: number;

    private hypers = new Map<string, number>();
    private latencies: number[] = [];

    // Historique des notes générées, en unités de STEP (grille quantifiée).
    // On reconstruit un primer quantifié propre à chaque appel à partir d'ici —
    // aucun mélange secondes/quantification (qui désalignait les notes dans
    // l'ancienne version et corrompait le contexte du modèle).
    private recentNotes: { pitch: number; durationSteps: number }[] = [];

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

        // Seed : un court motif Do majeur (C-D-E-G) pour donner au modèle un
        // contexte TONAL de départ → sortie plus harmonique qu'avec une note seule.
        this.recentNotes = [
            { pitch: 60, durationSteps: 2 },
            { pitch: 62, durationSteps: 2 },
            { pitch: 64, durationSteps: 2 },
            { pitch: 67, durationSteps: 2 },
        ];
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

            // 2. Steps à générer : fonction propre de dtMs, plancher à 4 pour
            //    laisser le modèle former une phrase. density ajoute un peu
            //    (borné — pas d'explosion de calcul comme avant).
            const density = this.hypers.get("density")!;
            const stepsToGen = Math.max(4, Math.min(24,
                Math.round(dtMs / MS_PER_STEP) + Math.round(density)));

            // 3. Appel au modèle. continueSequence renvoie UNIQUEMENT la
            //    continuation, en steps relatifs 0-based (vérifié S2).
            const temperature = this.hypers.get("temperature")!;
            const generated = await this.rnn.continueSequence(
                primerQ, stepsToGen, temperature, this.chordProgression ?? undefined,
            );

            // 4. Trier par step de début (sécurité)
            const genNotes = (generated.notes ?? [])
                .slice()
                .sort((a, b) => (a.quantizedStartStep ?? 0) - (b.quantizedStartStep ?? 0));

            // 5. Émission avec des deltaMs SÉQUENTIELS corrects.
            //    Le scheduler additionne les deltaMs : chaque deltaMs = temps
            //    depuis l'événement PRÉCÉDENT.
            //      note-on  : écart depuis le step du dernier événement (un off)
            //      note-off : durée de la note
            //    (L'ancienne version mesurait l'écart depuis le DÉBUT de la note
            //    précédente alors que le off avait déjà avancé le temps de la
            //    durée → double comptage → rythme étiré.)
            //    Les hauteurs hors tessiture sont REPLIÉES par octaves, pas
            //    supprimées (filtrer trouait le rythme).
            const center = this.hypers.get("octaveCenter")!;
            const range = this.hypers.get("pitchRange")!;
            const events: MidiEvent[] = [];
            let prevStep = genNotes.length ? (genNotes[0].quantizedStartStep ?? 0) : 0;
            for (const n of genNotes) {
                const startStep = n.quantizedStartStep ?? 0;
                const endStep = Math.max(startStep + 1, n.quantizedEndStep ?? startStep + 1);
                const pitch = foldIntoRange(n.pitch ?? 60, center, range);
                const velocity = n.velocity ?? 90;

                events.push({
                    type: "note-on", note: pitch, velocity, channel: 0,
                    deltaMs: Math.max(0, (startStep - prevStep) * MS_PER_STEP),
                });
                prevStep = startStep;
                events.push({
                    type: "note-off", note: pitch, channel: 0,
                    deltaMs: Math.max(1, (endStep - startStep) * MS_PER_STEP),
                });
                prevStep = endStep;

                // Mémoriser pour le primer du prochain appel (en steps)
                this.recentNotes.push({ pitch, durationSteps: endStep - startStep });
            }

            // 6. Fenêtre glissante du primer (en steps — pas de réalignement fragile)
            while (this.recentNotes.length > this.primerMaxNotes) this.recentNotes.shift();

            // 7. Stats
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
     * Construit un NoteSequence QUANTIFIÉ (grille de steps) depuis recentNotes.
     * On bâtit directement en steps contigus — pas de quantizeNoteSequence,
     * donc aucune dérive de réalignement. Les notes sont placées bout à bout.
     */
    private buildQuantizedPrimer(): INoteSequence {
        const notes: INoteSequence["notes"] = [];
        let step = 0;
        for (const rn of this.recentNotes) {
            notes!.push({
                pitch: rn.pitch,
                quantizedStartStep: step,
                quantizedEndStep: step + rn.durationSteps,
                velocity: 90,
                program: 0,
                isDrum: false,
            });
            step += rn.durationSteps;
        }
        return {
            quantizationInfo: { stepsPerQuarter: STEPS_PER_QUARTER },
            notes,
            totalQuantizedSteps: step,
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

/**
 * Replie une hauteur MIDI dans la tessiture [center ± range/2] par sauts
 * d'octave (±12). Préserve la classe de hauteur (donc l'harmonie) tout en
 * gardant la note DANS la plage — au lieu de la supprimer et trouer le rythme.
 */
function foldIntoRange(pitch: number, center: number, range: number): number {
    const min = center - range / 2;
    const max = center + range / 2;
    let p = pitch;
    while (p < min) p += 12;
    while (p > max) p -= 12;
    return Math.max(0, Math.min(127, Math.round(p)));
}
