// ─── Types annexes pour la couche IA générative musicale ─────────────────────
//
//   Tous les adapters de génération musicale (Markov, Magenta, ONNX,
//   serveur distant…) parlent ces types-ci.  Ils sont volontairement
//   minimalistes — la richesse est dans les adapters, pas dans le contrat.

/**
 * Un événement MIDI émis par un générateur.
 *
 * Format inspiré de la spec Web MIDI, mais avec un `deltaMs` explicite
 * pour piloter le timing sans dépendre du transport WAM (l'adapter ne
 * sait pas quel transport l'écoute).
 */
export interface MidiEvent {
    /** Type d'événement MIDI logique. */
    type: "note-on" | "note-off" | "cc" | "tempo";

    /** Pitch MIDI 0-127. Présent pour note-on / note-off. */
    note?: number;

    /** Vélocité 0-127. Présent pour note-on. */
    velocity?: number;

    /** Numéro de Control Change 0-127. Présent pour cc. */
    ccNumber?: number;

    /** Valeur CC 0-127. */
    ccValue?: number;

    /** Tempo en BPM. Présent pour type "tempo". */
    bpm?: number;

    /** Canal MIDI 0-15. */
    channel?: number;

    /**
     * Temps (en ms) depuis l'événement précédent dans le flux émis
     * par l'adapter.  0 = simultané avec le précédent.
     */
    deltaMs: number;
}

/**
 * A quantized note exchanged by one-shot pattern generation
 * ({@link IMusicGeneratorAdapter.generatePattern}). Steps are sixteenths
 * on the model grid, relative to the sequence the note belongs to.
 */
export interface PatternNote {
    /** MIDI pitch 0-127. */
    pitch: number;
    /** Start step (inclusive). */
    startStep: number;
    /** End step (exclusive). */
    endStep: number;
}

/**
 * Spécification d'un hyperparamètre exposé par le modèle au mapping gestes.
 *
 * Sert à la fois à :
 *   1. L'UI VR (génère automatiquement un potard 0..1 dans Node3D)
 *   2. Le benchmark (savoir quels paramètres balayer)
 *   3. Le mapping (savoir quoi câbler aux gestes)
 */
export interface HyperparamSpec {
    /** Identifiant stable (pour les logs et la sérialisation). */
    name: string;

    /** Libellé lisible (UI). */
    displayName: string;

    /** Description en une ligne (tooltip / doc générée). */
    description: string;

    /** Borne minimale dans l'unité naturelle du paramètre. */
    min: number;

    /** Borne maximale. */
    max: number;

    /** Valeur par défaut. */
    default: number;

    /**
     * Indique si la mise à jour de ce paramètre a un coût notable
     * (par exemple rechargement partiel du modèle).  Permet au mapping
     * d'éviter de spammer les paramètres coûteux.
     */
    expensiveToUpdate?: boolean;
}

/**
 * Statistiques de performance collectées au fil des appels à
 * `requestNext()`.  Lecture libre par le BenchmarkRunner.
 */
export interface AdapterStats {
    /** Nombre total d'appels à requestNext() depuis init(). */
    callCount: number;

    /** Latence moyenne par appel (ms). */
    avgInferenceMs: number;

    /** Latences clés (en ms). */
    p50InferenceMs: number;
    p95InferenceMs: number;
    p99InferenceMs: number;

    /** Empreinte mémoire JS observée (octets). 0 si la mesure indispo. */
    memHeapBytes: number;

    /** Nombre d'erreurs / NaN / timeouts. */
    failureCount: number;

    /** Temps de chargement initial (ms), rempli par init(). */
    initTimeMs: number;
}

/**
 * Construit un objet AdapterStats vide.  Helper réutilisé par les
 * adapters dans leur constructeur.
 */
export function emptyStats(): AdapterStats {
    return {
        callCount: 0,
        avgInferenceMs: 0,
        p50InferenceMs: 0,
        p95InferenceMs: 0,
        p99InferenceMs: 0,
        memHeapBytes: 0,
        failureCount: 0,
        initTimeMs: 0,
    };
}

/**
 * Options communes passées à init().  Chaque adapter peut en ajouter via
 * un type plus spécifique.
 */
export interface InitOpts {
    /**
     * Callback appelé pendant le chargement avec une fraction [0, 1].
     * Permet à l'UI d'afficher une barre de progression.  Optionnel.
     */
    progressCallback?: (fraction: number) => void;

    /**
     * Si vrai, l'adapter charge les ressources les plus légères possibles
     * (utile en mode développement pour itérer rapidement).
     */
    devMode?: boolean;
}
