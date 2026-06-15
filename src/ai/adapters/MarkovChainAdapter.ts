import {
    IMusicGeneratorAdapter, AdapterCapabilities, AdapterTier,
} from "../IMusicGeneratorAdapter";
import {
    MidiEvent, HyperparamSpec, AdapterStats, InitOpts, emptyStats,
} from "../types";

// ─── MarkovChainAdapter ──────────────────────────────────────────────────────
//
//   Baseline procédurale.  Chaîne de Markov d'ordre N sur les pitches MIDI.
//   Pas de corpus externe pour cette version : la matrice de transition
//   est codée en dur sur la gamme de Do majeur, calibrée pour produire
//   quelque chose de "musicalement neutre" (ni cassé, ni génial).
//
//   Servira de plancher de comparaison dans l'étude utilisateur (condition
//   "MIDI-Markov") et dans le benchmark (référence pour la latence p99 ≈ 0).
//
//   Améliorations futures (à faire en S2/S3 quand le corpus Lakh sera là) :
//     - Apprentissage de la matrice à partir d'un vrai corpus MIDI
//     - Ajout d'une chaîne séparée pour les durées et les vélocités
//     - Ordre variable selon la densité du corpus
//
//   Pourquoi ordre 4 par défaut : trop bas (≤ 2) = bruit aléatoire ;
//   trop haut (≥ 6) = copie-coller du corpus.  L'ordre 4 est le compromis
//   classique en génération musicale procédurale (cf. Pachet, "The
//   Continuator", 2003).

export interface MarkovChainAdapterOpts extends InitOpts {
    /** Ordre du Markov (longueur du contexte considéré).  Défaut : 4. */
    order?: number;
    /** Graine RNG pour la reproductibilité du benchmark.  Défaut : Date.now(). */
    seed?: number;
}

// Pitches MIDI de la gamme de Do majeur sur 3 octaves (C3..C6)
const C_MAJOR_PITCHES = [
    48, 50, 52, 53, 55, 57, 59,  // C3 D3 E3 F3 G3 A3 B3
    60, 62, 64, 65, 67, 69, 71,  // C4 D4 E4 F4 G4 A4 B4
    72, 74, 76, 77, 79, 81, 83,  // C5 D5 E5 F5 G5 A5 B5
    84,                          // C6
];

// Hyperparamètres exposés au mapping et au benchmark
const HYPERPARAMS: HyperparamSpec[] = [
    {
        name: "temperature",
        displayName: "Température",
        description: "Chaos vs prévisibilité (1.0 = naturel, 0.5 = répétitif, 2.0 = aléatoire)",
        min: 0.1, max: 3.0, default: 1.0,
    },
    {
        name: "density",
        displayName: "Densité",
        description: "Notes par seconde (1 = épars, 8 = continu)",
        min: 0.5, max: 12.0, default: 4.0,
    },
    {
        name: "octaveCenter",
        displayName: "Octave centrale",
        description: "Pitch MIDI médian autour duquel le modèle sélectionne (60 = C4)",
        min: 48, max: 84, default: 60,
    },
    {
        name: "pitchRange",
        displayName: "Tessiture",
        description: "Demi-tons d'étendue autour de l'octave centrale",
        min: 6, max: 36, default: 18,
    },
];

export class MarkovChainAdapter implements IMusicGeneratorAdapter {
    readonly id = "markov-chain-v1";
    readonly displayName = "Markov Chain (baseline)";
    readonly tier: AdapterTier = "local-browser";

    readonly capabilities: AdapterCapabilities = {
        streaming: true,
        hyperparameters: HYPERPARAMS,
        inputModality: "midi-context",
        outputModality: "midi-events",
    };

    readonly stats: AdapterStats = emptyStats();

    private order: number;
    private rng: () => number;

    // État interne de la chaîne : derniers `order` pitches émis.
    private history: number[] = [];

    // Valeurs courantes des hyperparamètres
    private hypers = new Map<string, number>();

    // Pour le calcul des latences p50/p95/p99
    private latencies: number[] = [];

    constructor(opts: MarkovChainAdapterOpts = {}) {
        this.order = opts.order ?? 4;
        const seed = opts.seed ?? Date.now();
        this.rng = makeSeededRng(seed);

        for (const h of HYPERPARAMS) this.hypers.set(h.name, h.default);
    }

    async init(opts?: InitOpts): Promise<void> {
        const t0 = performance.now();
        // Rien à charger — la matrice est implicite dans `pickNextPitch()`.
        // On consomme tout de même un peu de temps pour rapporter une init
        // honnête au benchmark (et donner une chance au progressCallback).
        opts?.progressCallback?.(0);
        await new Promise(r => setTimeout(r, 0));
        opts?.progressCallback?.(1);
        this.stats.initTimeMs = performance.now() - t0;
    }

    async dispose(): Promise<void> {
        this.history.length = 0;
        this.latencies.length = 0;
    }

    setHyperparameter(name: string, value: number): void {
        const spec = HYPERPARAMS.find(h => h.name === name);
        if (!spec) throw new Error(`MarkovChainAdapter: unknown hyperparameter "${name}"`);
        if (value < spec.min || value > spec.max) {
            throw new Error(
                `MarkovChainAdapter: ${name}=${value} out of range [${spec.min}, ${spec.max}]`,
            );
        }
        this.hypers.set(name, value);
    }

    getHyperparameter(name: string): number {
        const v = this.hypers.get(name);
        if (v === undefined) throw new Error(`MarkovChainAdapter: unknown hyperparameter "${name}"`);
        return v;
    }

    async requestNext(context: readonly MidiEvent[], dtMs: number): Promise<MidiEvent[]> {
        const tStart = performance.now();

        try {
            // 1. Synchroniser l'historique interne avec le contexte fourni.
            // Si le contexte contient des note-on, on les ajoute à l'historique.
            for (const ev of context) {
                if (ev.type === "note-on" && ev.note !== undefined) {
                    this.history.push(ev.note);
                    while (this.history.length > this.order) this.history.shift();
                }
            }

            // 2. Combien de notes émettre dans cette fenêtre, étant donné la densité ?
            const density = this.hypers.get("density")!;     // notes/sec
            const expected = (density * dtMs) / 1000;
            // Poisson approximé : on prend l'arrondi du tirage + un peu d'aléa
            const nNotes = Math.max(0, Math.round(expected + (this.rng() - 0.5) * 0.5));

            const out: MidiEvent[] = [];
            const slotMs = nNotes > 0 ? dtMs / nNotes : dtMs;

            for (let i = 0; i < nNotes; i++) {
                const pitch = this.pickNextPitch();
                const velocity = 60 + Math.floor(this.rng() * 40);   // 60..99
                const noteDurationMs = Math.min(slotMs * 0.9, 300);

                out.push({
                    type: "note-on",
                    note: pitch,
                    velocity,
                    channel: 0,
                    deltaMs: i === 0 ? 0 : slotMs,
                });
                out.push({
                    type: "note-off",
                    note: pitch,
                    channel: 0,
                    deltaMs: noteDurationMs,
                });

                this.history.push(pitch);
                while (this.history.length > this.order) this.history.shift();
            }

            // 3. Mise à jour des stats
            const latency = performance.now() - tStart;
            this.recordLatency(latency);
            this.stats.callCount++;
            this.updateAggregateStats();

            return out;
        } catch (e) {
            this.stats.failureCount++;
            throw e;
        }
    }

    // ── Implémentation Markov ─────────────────────────────────────────────

    /**
     * Tire le prochain pitch selon les hyperparamètres + l'historique.
     *
     * Stratégie : on filtre les pitches candidats par tessiture
     * (octaveCenter ± pitchRange/2), puis on pondère par une distribution
     * gaussienne décroissante avec la distance au dernier pitch émis.
     * La température règle l'écart-type de la gaussienne (faible = lié,
     * fort = aléatoire).
     */
    private pickNextPitch(): number {
        const center = this.hypers.get("octaveCenter")!;
        const range = this.hypers.get("pitchRange")!;
        const temp = this.hypers.get("temperature")!;

        const minPitch = Math.max(0, Math.round(center - range / 2));
        const maxPitch = Math.min(127, Math.round(center + range / 2));

        const candidates = C_MAJOR_PITCHES.filter(p => p >= minPitch && p <= maxPitch);
        if (candidates.length === 0) {
            // Fallback : retourne le pitch le plus proche du center
            return clamp(Math.round(center), 0, 127);
        }

        const last = this.history[this.history.length - 1] ?? center;

        // Poids gaussien autour de `last`, écart-type ~ temp * 4 demi-tons
        const sigma = Math.max(0.5, temp * 4);
        const weights = candidates.map(p => {
            const dx = p - last;
            return Math.exp(-(dx * dx) / (2 * sigma * sigma));
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        // Tirage proportionnel
        let r = this.rng() * totalWeight;
        for (let i = 0; i < candidates.length; i++) {
            r -= weights[i];
            if (r <= 0) return candidates[i];
        }
        return candidates[candidates.length - 1];
    }

    // ── Mise à jour des stats ─────────────────────────────────────────────

    private recordLatency(ms: number): void {
        this.latencies.push(ms);
        // Garder une fenêtre glissante de 1000 latences max pour limiter la mémoire
        if (this.latencies.length > 1000) this.latencies.shift();
    }

    private updateAggregateStats(): void {
        const lat = this.latencies;
        const n = lat.length;
        if (n === 0) return;

        // Moyenne
        let sum = 0;
        for (const v of lat) sum += v;
        this.stats.avgInferenceMs = sum / n;

        // Percentiles (sur une copie triée)
        const sorted = [...lat].sort((a, b) => a - b);
        this.stats.p50InferenceMs = sorted[Math.floor(n * 0.50)];
        this.stats.p95InferenceMs = sorted[Math.floor(n * 0.95)];
        this.stats.p99InferenceMs = sorted[Math.min(n - 1, Math.floor(n * 0.99))];

        // Mémoire si disponible (Chrome only)
        const mem = (performance as any).memory;
        if (mem && typeof mem.usedJSHeapSize === "number") {
            this.stats.memHeapBytes = mem.usedJSHeapSize;
        }
    }
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Petit RNG seedable (Mulberry32).  Utilisé pour rendre le benchmark
 * reproductible : avec la même seed, deux runs produisent exactement les
 * mêmes notes.
 */
function makeSeededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
