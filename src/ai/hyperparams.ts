import { HyperparamSpec } from "./types";

// ─── Specs d'hyperparamètres par type de modèle ──────────────────────────────
//
//   Données PURES (aucun import Magenta) → importable côté main thread
//   (WebWorkerAdapter) ET côté worker (adapters Magenta), sans tirer TF.js
//   dans le bundle principal.
//
//   L'AIComposerN3D câble les DEUX PREMIERS hyperparamètres aux entrées
//   d'automation (température en premier dans les deux familles → UX cohérente
//   avec l'AudioPlaque : X→[0], Y→[1]).

/** MusicRNN (Famille 1) — mélodie / impro / batterie. */
export const RNN_HYPERPARAMS: HyperparamSpec[] = [
    { name: "temperature", displayName: "Temperature", description: "Chaos vs predictability of the softmax draw (1.0 = natural)", min: 0.1, max: 2.5, default: 1.0 },
    { name: "density", displayName: "Density", description: "Proportion of notes played (8 = all; lowering drops the weak subdivisions first)", min: 1, max: 8, default: 8 },
    { name: "octaveCenter", displayName: "Center Octave", description: "Median MIDI pitch (60 = C4). Ignored in drum mode.", min: 48, max: 84, default: 60 },
    { name: "pitchRange", displayName: "Pitch Range", description: "Semitone span around the center octave", min: 12, max: 60, default: 36 },
];

/** MusicVAE (Family 2) — latent space. */
export const VAE_HYPERPARAMS: HyperparamSpec[] = [
    { name: "temperature", displayName: "Temperature", description: "Decoding diversity (0 = deterministic, high = varied)", min: 0.0, max: 1.5, default: 0.5 },
    { name: "morph", displayName: "Latent Morph", description: "Position in latent space between two anchor phrases (0 = A, 1 = B). The gesture morphs the music.", min: 0.0, max: 1.0, default: 0.5 },
];
