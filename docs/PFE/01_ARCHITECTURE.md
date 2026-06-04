# Architecture du système

*Architecture du Chef d'Orchestre IA telle qu'implémentée. Document vivant.*

> **Statut global** : Couche A (génération IA) **implémentée et validée**.
> Couches B (mapping) et C (capture gestuelle) **non commencées**. En
> attendant la capture gestuelle, les contrôleurs existants (AudioPlaque,
> Superformula) servent de source de modulation — voir [synergie](#synergie-contrôleurs--ia).

---

## Sommaire

- [Vue d'ensemble (trois couches)](#vue-densemble-trois-couches)
- [Le découpage en deux latences](#le-découpage-en-deux-latences)
- [Couche A — Génération IA (implémentée)](#couche-a--génération-ia-implémentée)
  - [Adapter pattern](#adapter-pattern)
  - [Le scheduler look-ahead](#le-scheduler-look-ahead)
  - [Le threading (Web Worker)](#le-threading-web-worker)
  - [AIComposerN3D](#aicomposern3d)
  - [Paramètres du modèle](#paramètres-du-modèle)
- [Couche B — Mapping (à venir)](#couche-b--mapping-à-venir)
- [Couche C — Capture gestuelle (à venir)](#couche-c--capture-gestuelle-à-venir)
- [Synergie contrôleurs → IA](#synergie-contrôleurs--ia)
- [Carte des fichiers](#carte-des-fichiers)
- [Budget de latence (révisé)](#budget-de-latence-révisé)

---

## Vue d'ensemble (trois couches)

```
┌────────────────────────────────────────────────────────────────────┐
│ Couche C — CAPTURE GESTUELLE        (non implémentée — Phase 1)    │
│   WebXR hand tracking → ~10 sorties d'automation 0..1              │
└────────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────────┐
│ Couche B — MAPPING                  (non implémentée — Phase 2)    │
│   features gestuelles → paramètres musicaux (matrice)             │
└────────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────────┐
│ Couche A — GÉNÉRATION IA            ✅ IMPLÉMENTÉE                  │
│   AIComposerN3D                                                    │
│     ├─ adapter (IMusicGeneratorAdapter)  ── Markov | Magenta | Worker │
│     ├─ MidiLookaheadScheduler  (découplage génération/lecture)     │
│     └─ sortie MIDI (MidiN3DConnectable.ListOutput)                 │
└────────────────────────────────────────────────────────────────────┘
                              │  MIDI
┌────────────────────────────────────────────────────────────────────┐
│   INSTRUMENTS WAM existants (Pro54, DrumKit…) → audio              │
└────────────────────────────────────────────────────────────────────┘
```

Chaque Node3D est câblable indépendamment dans l'éditeur 3D, comme tout
instrument. On peut tester chaque couche isolément — exigence de l'évaluation
comparative (geste-IA vs potards-IA vs potards-Markov).

---

## Le découpage en deux latences

**Décision structurante** (voir [ADR-005](./02_DECISIONS.md)). Le geste du chef
pilote DEUX familles de contrôles à DEUX latences différentes :

| Famille | Contrôles | Chemin | Latence | Main du chef |
|---------|-----------|--------|---------|--------------|
| **Génération** | température, densité, gamme | → hyperparamètres du modèle → génération FUTURE | ≈ horizon du buffer (~0.5 s) | gauche (façonne le caractère) |
| **Lecture** | tempo, vélocité | → appliqués au drain du scheduler | ≈ 0 (immédiat) | droite (articulation) |

Cet isomorphisme — main droite immédiate / main gauche anticipée — est
**musicalement authentique** et c'est ce qui rend la latence des modèles
génératifs acceptable en VR temps réel. C'est une contribution de conception
du PFE, pas un compromis subi.

---

## Couche A — Génération IA (implémentée)

### Adapter pattern

Tous les modèles génératifs implémentent une interface commune
`IMusicGeneratorAdapter` (`src/Refactoring/ai/IMusicGeneratorAdapter.ts`) :

```
init() / dispose()
setHyperparameter(name, value) / getHyperparameter(name)
requestNext(context, dtMs) → MidiEvent[]
capabilities { streaming, hyperparameters, in/out modality }
stats { avg/p50/p95/p99 inférence, callCount, … }
```

Adapters implémentés :

| Adapter | Rôle | Backend |
|---------|------|---------|
| `MarkovChainAdapter` | baseline procédurale (ordre 4) | JS pur, < 1 ms |
| `MagentaMusicRNNAdapter` | melody_rnn / basic_rnn / chord_pitches_improv | TF.js (main thread) |
| `WebWorkerAdapter` | délègue à un worker (n'importe quel adapter) | worker, CPU |

L'intérêt : changer de modèle ou de thread = changer une ligne, sans toucher
au scheduler ni à l'AIComposerN3D. Le benchmark instancie chaque adapter à tour
de rôle.

### Le scheduler look-ahead

`MidiLookaheadScheduler` (`src/Refactoring/ai/scheduler/`). Découple le temps de
**génération** (lent, irrégulier) du temps de **lecture** (sample-accurate).
Pattern "A Tale of Two Clocks" (Chris Wilson, 2013).

- Boucle de tick grossière (25 ms) qui **programme à l'avance** sur l'horloge
  audio précise (`AudioContext.currentTime`).
- Buffer de notes en temps **musical relatif** → tempo/vélocité appliqués au
  drain = immédiats.
- À chaque tick : (1) DRAIN des événements échus, (2) REMPLISSAGE si l'horizon
  n'est pas couvert.

Paramètres clés :

| Paramètre | Défaut | Rôle | Latence |
|-----------|--------|------|---------|
| `horizonSec` | 0.5 s | musique générée en avance | structurel |
| `tempoScale` | 1.0 | vitesse de lecture | immédiat |
| `velocityScale` | 1.0 | dynamique | immédiat |

**Règle d'or mesurée** : horizon minimal viable ≈ p95 de latence du modèle
*sous charge*. Métriques de validation dans `SchedulerStats` : `lateEvents`
(doit rester 0), `lowBufferTicks`, `bufferDepthSec`, `notesGenerated`,
`notesPlayed`.

### Le threading (Web Worker)

L'inférence TF.js sur le main thread gèle le rendu Babylon/XR (~150 ms/appel).
`WebWorkerAdapter` (`src/Refactoring/ai/adapters/WebWorkerAdapter.ts`) délègue
l'inférence à un worker (`src/Refactoring/ai/worker/ai-worker.ts`), qui réutilise
le `MagentaMusicRNNAdapter` tel quel.

Frictions résolues (cf [04_JOURNAL](./04_JOURNAL.md)) :
- `global is not defined` → `define: { global: 'globalThis' }` (vite.config)
- `window is not defined` → polyfill worker importé en premier
- `OfflineAudioContext` → imports sous-modules Magenta (pas le barrel audio)
- WASM sans kernel `Multinomial` → backend **CPU** ([ADR-006](./02_DECISIONS.md))

Le `PerfMonitor` (`src/Refactoring/ai/perf/`) mesure les frame times du main
thread (frame MAX, janky frames) pour quantifier le gain de threading.

### AIComposerN3D

`src/Refactoring/node3d/subs/ai/AIComposerN3D.ts`. Le Node3D qui rend l'IA
jouable dans le monde VR.

- **Sortie MIDI** : `MidiN3DConnectable.ListOutput` natif → se câble à Pro54
  comme le Sequencer (le scheduler envoie via `scheduleEvents` aux WAM câblés).
- **Entrées d'automation** : `température`, `densité` → câblables depuis
  AudioPlaque/Superformula/potards.
- **Potards** : tempo, vélocité (immédiats), horizon (buffer).
- **Bouton play/stop** avec init paresseux de l'adapter (worker chargé au 1er play).

### Paramètres du modèle

Hyperparamètres exposés par `MagentaMusicRNNAdapter` (côté génération, latence
bufferisée) :

| Paramètre | Plage | Défaut | Rôle |
|-----------|-------|--------|------|
| `temperature` | 0.1–2.5 | 1.0 | aléa du tirage softmax : bas=répétitif, haut=chaotique |
| `density` | 1–8 | 2 | notes par appel. ⚠ coûte du calcul (génération plus longue ET fréquente) |
| `octaveCenter` | 48–84 | 60 | hauteur MIDI médiane (60 = Do4) |
| `pitchRange` | 12–60 | 36 | étendue des sauts mélodiques |

Modèle : **MusicRNN** (LSTM Magenta), API `continueSequence(primer, steps,
temperature, chords?)`. Primer = 8 dernières notes (compromis contexte/latence,
[ADR mesuré](./03_MESURES.md)). Checkpoints publics : `basic_rnn`, `melody_rnn`,
`chord_pitches_improv` (`attention_rnn` absent du CDN).

---

## Couche B — Mapping (à venir)

`GestureMapperN3D` (Phase 2). Reçoit les features gestuelles (entrées
automation), applique une matrice configurable, émet les paramètres musicaux
(sorties automation). Mapping initial heuristique dans [CADRAGE](./CADRAGE.md)
§6 ; option Wekinator à l'étude. **Non implémenté.**

---

## Couche C — Capture gestuelle (à venir)

`HandGestureN3D` (Phase 1). Active `WebXRHandTracking`, échantillonne 25 joints
× 2 mains à 60 Hz, calcule des features géométriques (hauteur, vitesse,
accélération, ouverture, pince, écartement) exposées en sorties d'automation
0..1. **Non implémenté.**

| Sortie prévue | Source géométrique |
|---------------|---------------------|
| `rightHandY`, `leftHandY` | poignet.y |
| `rightHandVelocity`, … | dérivées |
| `handSpread` | distance poignets |
| `*Openness`, `*Pinch` | écarts doigts |

---

## Synergie contrôleurs → IA

Les entrées d'automation de l'AIComposerN3D acceptent n'importe quelle source
0..1. Or l'**AudioPlaque** et la **Superformula** (déjà construites) *sortent*
de tels signaux. On peut donc **diriger l'IA avec la balle de l'AudioPlaque ou
la courbe de la Superformula AVANT d'avoir la capture gestuelle** :

```
AudioPlaque.X ──automation──► AIComposer.température ──MIDI──► Pro54 ──► audio
Superformula.radius ──auto──► AIComposer.densité
```

Démo intermédiaire qui valide la chaîne complète Couche A → audio et réutilise
tout l'existant. Quand la Couche C arrivera, elle se câblera aux mêmes entrées.

---

## Carte des fichiers

| Fichier | Rôle | Statut |
|---------|------|--------|
| `ai/IMusicGeneratorAdapter.ts` | interface commune | ✅ |
| `ai/types.ts` | MidiEvent, HyperparamSpec, AdapterStats | ✅ |
| `ai/adapters/MarkovChainAdapter.ts` | baseline | ✅ |
| `ai/adapters/MagentaMusicRNNAdapter.ts` | modèle principal | ✅ |
| `ai/adapters/WebWorkerAdapter.ts` | délégation worker | ✅ |
| `ai/worker/ai-worker.ts` + `worker-polyfill.ts` | worker thread | ✅ |
| `ai/scheduler/MidiLookaheadScheduler.ts` | découplage temporel | ✅ |
| `ai/perf/PerfMonitor.ts` | métriques FPS/frames/flux | ✅ |
| `ai/benchmark/bench-page.{ts,html}` | benchmark modèles | ✅ |
| `ai/scheduler/scheduler-test-page.{ts,html}` | validation scheduler/Pro54 | ✅ |
| `node3d/subs/ai/AIComposerN3D.ts` | Node3D IA | ✅ |
| `node3d/subs/.../HandGestureN3D.ts` | couche C | ⬜ |
| `node3d/subs/.../GestureMapperN3D.ts` | couche B | ⬜ |

(Préfixe : `src/Refactoring/`)

---

## Budget de latence (révisé)

Le budget « < 100 ms bout-en-bout » du cadrage initial **ne s'applique qu'au
chemin temps-réel strict** (geste de lecture → son), pas à la génération.

| Chemin | Cible | Mesuré | Note |
|--------|-------|--------|------|
| Geste de lecture (tempo/vélocité) → audio | < 50 ms | — | post-gen, pas de modèle |
| Geste de caractère (température/densité) → audio | < horizon (~500 ms) | — | bufferisé, acceptable |
| Inférence modèle (interne) | < horizon | ~150 ms (WebGL) / CPU à mesurer | absorbée par le buffer |

→ La révision vient du scheduler look-ahead : la latence du **modèle** n'a plus
besoin d'être < 100 ms, seulement < profondeur du buffer. Voir [ADR-005](./02_DECISIONS.md)
et [03_MESURES](./03_MESURES.md).
