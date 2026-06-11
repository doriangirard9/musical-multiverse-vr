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
    { name: "temperature", displayName: "Température", description: "Chaos vs prévisibilité du tirage softmax (1.0 = naturel)", min: 0.1, max: 2.5, default: 1.0 },
    { name: "density", displayName: "Densité", description: "Steps générés par appel — plus haut = flux plus dense", min: 1, max: 8, default: 2 },
    { name: "octaveCenter", displayName: "Octave centrale", description: "Pitch MIDI médian (60 = Do4). Ignoré en mode batterie.", min: 48, max: 84, default: 60 },
    { name: "pitchRange", displayName: "Tessiture", description: "Demi-tons d'étendue autour de l'octave centrale", min: 12, max: 60, default: 36 },
];

/** MusicVAE (Famille 2) — espace latent. */
export const VAE_HYPERPARAMS: HyperparamSpec[] = [
    { name: "temperature", displayName: "Température", description: "Diversité du décodage (0 = déterministe, haut = varié)", min: 0.0, max: 1.5, default: 0.5 },
    { name: "morph", displayName: "Morph latent", description: "Position dans l'espace latent entre deux phrases-ancres (0 = A, 1 = B). Le geste morphe la musique.", min: 0.0, max: 1.0, default: 0.5 },
];
