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
[`PFE_PLAN_APPROCHE_A.md`](../../PFE_PLAN_APPROCHE_A.md), section 2) :
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

**Date :** 2026-05-21
**Statut :** Proposée *(à valider après Phase 0.2)*

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
