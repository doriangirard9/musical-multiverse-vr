import { MidiEvent, HyperparamSpec, AdapterStats, InitOpts } from "./types";

// ─── IMusicGeneratorAdapter ──────────────────────────────────────────────────
//
//   Contrat commun à tous les modèles génératifs musicaux candidats au
//   banc d'essai (Markov, Magenta variants, ONNX, modèles serveur…).
//
//   Conception :
//     • Asynchrone partout (les modèles ML peuvent bloquer, les modèles
//       distants ajoutent du RTT)
//     • Streaming-friendly : `requestNext()` renvoie une fenêtre courte,
//       pas un morceau entier
//     • Hyperparamètres déclarés, pas hardcodés — le mapping gestes et
//       le benchmark s'en servent par introspection (capabilities.hyperparameters)
//     • Stats publiques pour le benchmark, remplies par l'adapter

/**
 * Tier d'exécution de l'adapter.
 *   "local-browser" : tourne entièrement dans Chrome (TF.js, ONNX-Web, etc.)
 *   "remote-server" : envoie une requête à un serveur Python/GPU distant
 */
export type AdapterTier = "local-browser" | "remote-server";

/**
 * Modalité d'entrée acceptée par le modèle.
 *   "midi-context"  : on lui passe les N derniers événements MIDI joués
 *   "text-prompt"   : on lui passe un prompt textuel (MusicGen, MusicLM…)
 *   "audio-seed"    : on lui passe un extrait audio en entrée
 */
export type InputModality = "midi-context" | "text-prompt" | "audio-seed";

/**
 * Modalité de sortie produite par le modèle.
 *   "midi-events" : événements MIDI (à reconnecter à un synthé / WAM)
 *   "audio-pcm"   : signal audio brut (PCM)
 */
export type OutputModality = "midi-events" | "audio-pcm";

/**
 * Capacités déclarées de l'adapter.  Le benchmark et le mapping s'appuient
 * dessus pour adapter leur comportement.
 */
export interface AdapterCapabilities {
    /**
     * true : peut produire en continu une note/événement à la fois.
     * false : produit par bloc (phrase, mesure, etc.) — le mapping doit
     *         alors gérer le buffering en amont.
     */
    streaming: boolean;

    /** Hyperparamètres exposés au mapping gestes et au benchmark. */
    hyperparameters: HyperparamSpec[];

    /** Modalité d'entrée principale. */
    inputModality: InputModality;

    /** Modalité de sortie principale. */
    outputModality: OutputModality;
}

/**
 * L'interface que tout adapter de génération musicale doit implémenter.
 */
export interface IMusicGeneratorAdapter {
    // ── Identité et métadonnées ────────────────────────────────────────────

    /** Identifiant unique (logs, benchmark, sérialisation). */
    readonly id: string;

    /** Nom lisible (UI, mémoire de PFE). */
    readonly displayName: string;

    /** Où s'exécute l'adapter. */
    readonly tier: AdapterTier;

    /** Capacités déclarées. */
    readonly capabilities: AdapterCapabilities;

    /**
     * Statistiques de performance, remplies par l'adapter au fil de
     * l'eau.  Lecture libre par le benchmark.
     */
    readonly stats: AdapterStats;

    // ── Cycle de vie ───────────────────────────────────────────────────────

    /**
     * Charge le modèle (téléchargement, init GPU, ouverture de socket).
     * Renvoie quand le modèle est prêt à recevoir requestNext().
     *
     * Doit remplir `stats.initTimeMs` avant de résoudre.
     */
    init(opts?: InitOpts): Promise<void>;

    /**
     * Libère toutes les ressources (modèle GPU, sockets, workers).
     * Appelable même si init() a échoué — doit être idempotent.
     */
    dispose(): Promise<void>;

    // ── Contrôle des hyperparamètres ───────────────────────────────────────

    /**
     * Modifie un hyperparamètre.  Doit être appelable à tout moment
     * (y compris entre deux appels à requestNext()).
     *
     * Lève si le name est inconnu ou si value est hors plage.
     */
    setHyperparameter(name: string, value: number): void;

    /**
     * Lit la valeur actuelle d'un hyperparamètre.  Utile pour l'UI VR
     * qui synchronise les potards.
     */
    getHyperparameter(name: string): number;

    /**
     * Optionnel.  Informe l'adapter de la SIGNATURE RYTHMIQUE de l'hôte
     * (transmise par les wam-transport events du WamTransportManager).
     * Les adapters rythmiques (RNN batterie/mélodie) s'en servent pour
     * aligner leurs barres et leurs accents métriques (4/4, 3/4, 6/8…).
     * Le TEMPO, lui, est appliqué au drain par le scheduler (immédiat),
     * pas ici.
     */
    setMeter?(numerator: number, denominator: number): void;

    // ── Génération ─────────────────────────────────────────────────────────

    /**
     * Demande la génération de la prochaine fenêtre d'événements MIDI.
     *
     * @param context  Les N derniers événements émis (ou consommés).
     *                  Permet aux modèles autorégressifs de continuer la
     *                  séquence.  Peut être vide au premier appel.
     * @param dtMs     Durée à générer, en millisecondes.  Le modèle est
     *                  libre de produire 0, 1, ou plusieurs événements
     *                  dans cette fenêtre selon sa densité et le hasard.
     *
     * @returns Liste d'événements MIDI à jouer.  Le champ `deltaMs` de
     *           chaque événement est relatif au précédent dans la liste
     *           (le premier est relatif au début de la fenêtre).
     *
     * Doit incrémenter `stats.callCount` et mettre à jour les latences
     * (mesurer avec `performance.now()` au début et à la fin).
     */
    requestNext(context: readonly MidiEvent[], dtMs: number): Promise<MidiEvent[]>;
}
