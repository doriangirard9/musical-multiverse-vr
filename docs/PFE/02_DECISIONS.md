# Journal des décisions (ADR)

*Une entrée par décision technique structurante. Format inspiré des
Architecture Decision Records. Les décisions ne sont jamais effacées : si
elles sont remises en cause plus tard, on les marque **DÉPRÉCIÉE** avec un
lien vers la décision qui la remplace.*

---

## Format d'une entrée

```
## ADR-NNN : <titre court>

**Date :** YYYY-MM-DD
**Statut :** Proposée | Acceptée | Dépréciée
**Contexte :** Pourquoi cette décision est-elle nécessaire ?
**Décision :** Que faisons-nous ?
**Alternatives écartées :** Avec brève justification
**Conséquences :** Effets attendus, positifs et négatifs
```

---

## ADR-001 : Adopter l'approche A — modulation continue par gestes

**Date :** 2026-05-21
**Statut :** Acceptée

**Contexte :**
Trois approches étaient envisagées pour le PFE Chef d'Orchestre IA (voir
[`CADRAGE.md`](./CADRAGE.md), section 2) :
- (A) modulation continue d'un flux IA par les gestes
- (B) gestes qui composent les notes directement via IA
- (C) orchestration multi-sections

Il fallait choisir une et une seule pour rester dans le scope d'un PFE.

**Décision :**
Approche A. L'IA génère en continu, les gestes modulent.

**Alternatives écartées :**
- (B) Trop sensible à la latence d'inférence à chaque geste, méthodologie
  d'évaluation floue ("est-ce qu'une phrase générée est bonne ?").
- (C) Trois problèmes de recherche en un (séparation de voix, génération
  multi-piste, désambiguïsation gestuelle) — hors scope PFE.

**Conséquences :**
- L'IA est utilisée comme **outil intégré pré-entraîné**, pas comme
  contribution. La contribution du PFE est dans le mapping et l'évaluation.
- Le système doit faire tourner un modèle de génération continue avec une
  latence < 100 ms — à valider en Phase 0.

---

## ADR-002 : Trois Node3D séparés (capture, mapping, génération)

**Date :** 2026-05-21
**Statut :** Acceptée

**Contexte :**
On pourrait tout coller dans un seul Node3D "Conductor". Mais l'évaluation
exige de pouvoir comparer des conditions (geste-IA vs potards-IA vs
potards-Markov) où seule une couche change. Si tout est dans un seul
nœud, il faut tout dupliquer.

**Décision :**
Séparer en trois Node3D :
- `HandGestureN3D` (couche C — capture)
- `GestureMapperN3D` (couche B — mapping)
- `AIComposerN3D` (couche A — génération, avec backends interchangeables)

**Alternatives écartées :**
- Monolithique : moins de plomberie, mais empêche la comparaison ABAB
  rigoureuse exigée par H1/H2.
- Quatre Node3D (en séparant l'audio output du Composer) : sur-ingénierie,
  les WAM existants font déjà ce travail.

**Conséquences :**
- Plus de Node3D à concevoir, mais chacun est testable isolément.
- L'utilisateur peut câbler/débrancher chaque couche depuis l'éditeur 3D,
  ce qui facilite la démonstration aux encadrants.
- Les paramètres synchronisés sur le réseau triplent — vérifier que le
  système de sync supporte ce volume sans saturation (a priori oui).

---

## ADR-003 : Magenta.js comme modèle de génération de référence

**Date :** 2026-05-21 · **Mise à jour :** 2026-06-01
**Statut :** **Acceptée** *(validée par M-001)*

**Contexte :**
Quatre familles de modèles de génération musicale étaient candidates : (i)
modèles symboliques compactes (Magenta MelodyRNN, MusicVAE), (ii) modèles
symboliques lourds (Music Transformer, Pop Music Transformer), (iii) modèles
audio (MusicGen, MusicLM), (iv) modèles non-DL (Markov, L-systèmes).

Critères : latence < 50 ms par note, exécutable navigateur, hyperparamètres
exposés.

**Décision (proposée) :**
- Modèle principal : **Magenta MelodyRNN** (modèle `basic_rnn` ou
  `attention_rnn`).
- Modèle baseline : **chaîne de Markov ordre 4** entraînée sur un sous-corpus
  du Lakh MIDI Dataset.

**Alternatives écartées :**
- Music Transformer / Pop Music Transformer : nécessite conversion ONNX,
  latence supérieure, peu de support browser-friendly.
- MusicGen / MusicLM : trop lourd (~GB), génère de l'audio, pas du symbolique,
  pas exécutable temps réel sans GPU dédié.

**Conséquences :**
- Modèle limité à la mélodie symbolique (pas d'arrangement multi-piste sans
  travail supplémentaire — `MusicVAE` pourrait combler).
- Latence très favorable (~10-30 ms par note attendue).
- À valider expérimentalement en Phase 0.2 : si la latence mesurée dépasse
  50 ms par note sur la machine de référence, basculer entièrement sur la
  baseline Markov comme modèle principal.

**Mise à jour 2026-06-01 (M-001) :** validé. `melody_rnn` retenu (p95 102 ms en
isolation, primer 8). `attention_rnn` absent du CDN public → remplacé par
`chord_pitches_improv`. Le critère « < 50 ms/note » initial était trop strict :
le scheduler look-ahead (ADR-005) le rend caduc — seul l'horizon compte.

---

## ADR-004 : Adapter pattern pour les modèles génératifs

**Date :** 2026-05-19
**Statut :** Acceptée

**Contexte :**
Le PFE doit benchmarker plusieurs modèles (Markov, Magenta variants, futur
serveur distant) et permettre d'en changer sans réécrire le reste. L'évaluation
exige aussi une baseline procédurale comparable.

**Décision :**
Interface commune `IMusicGeneratorAdapter` (init/dispose, setHyperparameter,
requestNext, capabilities, stats). Chaque modèle = un adapter. Le scheduler et
l'AIComposerN3D ne dépendent que de l'interface.

**Alternatives écartées :**
- Coder Magenta en dur dans l'AIComposer : empêche le benchmark et la baseline.
- Une classe par modèle sans interface commune : duplication, pas de
  substituabilité.

**Conséquences :**
- Changer de modèle ou de thread = une ligne (ex. `WebWorkerAdapter` enveloppe
  `MagentaMusicRNNAdapter` sans le modifier).
- Le banc d'essai instancie les adapters en boucle → tableau comparatif.
- L'extension serveur (tier 2) sera un simple `RemoteModelAdapter`.

---

## ADR-005 : Scheduler look-ahead (découplage génération/lecture)

**Date :** 2026-06-02
**Statut :** Acceptée *(validée par M-004)*

**Contexte :**
Latence Magenta ~100 ms + pics GC ~300 ms. Trop pour générer une note puis la
jouer aussitôt (trous audibles). Il faut découpler génération et lecture.

**Décision :**
`MidiLookaheadScheduler` — pattern "two clocks". Le modèle génère en avance dans
un buffer (horizon ~0.5 s) ; le transport draine le buffer aux temps précis sur
l'horloge audio. Tempo/vélocité appliqués au drain (immédiats) ; hyperparamètres
affectent la génération future (latence = horizon).

**Alternatives écartées :**
- Génération en lockstep (1 inférence/note) : trous garantis dès qu'une
  inférence dépasse l'intervalle inter-notes.
- Pré-générer un morceau entier : pas de réactivité aux gestes.

**Conséquences :**
- La latence du modèle n'a plus besoin d'être < 100 ms, seulement < horizon
  → **révise le budget de latence du cadrage**.
- Découverte d'un isomorphisme : les deux latences (immédiate/bufferisée)
  correspondent aux deux mains du chef (droite/gauche). Contribution de
  conception du mémoire.
- Validé M-004 : lateEvents = 0 malgré pics GC.

---

## ADR-006 : Inférence dans un Web Worker, backend CPU

**Date :** 2026-06-03
**Statut :** Acceptée *(à confirmer par M-006)*

**Contexte :**
L'inférence TF.js sur le main thread gèle le rendu Babylon/XR (~150 ms/appel) →
lag VR. Le scheduler résout le timing audio mais pas le gel visuel.

**Décision :**
`WebWorkerAdapter` délègue l'inférence à un worker. Backend **CPU** (et non
WASM) : WASM 2.8.6 n'a pas le kernel `Multinomial` du sampling RNN (M-005). CPU
est complet ; même lent, il ne bloque plus le main thread.

**Alternatives écartées :**
- WASM : plus rapide mais incomplet (Multinomial absent) → casse MusicRNN.
- WebGL + OffscreenCanvas dans le worker : complet et rapide, mais setup plus
  lourd. Gardé en repli si CPU trop lent (lateEvents).
- Rester sur le main thread : lag VR rédhibitoire pour l'étude utilisateur.

**Conséquences :**
- Backend rendu configurable (cpu/wasm) pour comparaison.
- Latence CPU probablement > WebGL, absorbée par l'horizon. À mesurer (M-006).
- Finding mémoire : le choix de backend est d'abord une question de
  **complétude de kernels**, pas que de vitesse.

---

## ADR-007 : Imports sous-modules Magenta (éviter l'audio)

**Date :** 2026-06-03
**Statut :** Acceptée

**Contexte :**
`import * as mm from "@magenta/music"` (barrel complet) crée un
`OfflineAudioContext` au chargement (via gansynth/ddsp/spice → audio_utils) →
crash dans un worker. On ne veut que MusicRNN (symbolique).

**Décision :**
Importer les sous-modules feuilles : `@magenta/music/esm/music_rnn` et
`@magenta/music/esm/core/sequences`. Aucune dépendance de MusicRNN ne touche
`audio_utils` (vérifié par cartographie des imports).

**Alternatives écartées :**
- Polyfiller `OfflineAudioContext` dans le worker : masque le problème, échoue
  plus tard si l'audio est réellement utilisé.

**Conséquences :**
- Worker fonctionnel. Bonus : bundle bien plus léger partout (main thread inclus).
- Finding mémoire : les libs ML "tout-en-un" initialisent de l'audio au
  chargement ; le off-main-thread exige du tree-shaking manuel par sous-modules.

---

## Modèle d'entrée pour les prochaines décisions

```
## ADR-NNN : <titre>

**Date :**
**Statut :**

**Contexte :**

**Décision :**

**Alternatives écartées :**

**Conséquences :**
```
