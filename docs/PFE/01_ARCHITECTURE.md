# Architecture du système

*Décrit l'architecture du Chef d'Orchestre IA telle qu'elle est implémentée
à un instant T. Document vivant — mis à jour à chaque évolution structurelle.*

---

## Sommaire

- [Vue d'ensemble (trois couches)](#vue-densemble-trois-couches)
- [Couche C — Capture gestuelle (`HandGestureN3D`)](#couche-c--capture-gestuelle-handgesturen3d)
- [Couche B — Mapping (`GestureMapperN3D`)](#couche-b--mapping-gesturemappern3d)
- [Couche A — Génération IA (`AIComposerN3D`)](#couche-a--génération-ia-aicomposern3d)
- [Intégration dans le système Node3D existant](#intégration-dans-le-système-node3d-existant)
- [Budget de latence](#budget-de-latence)

---

## Vue d'ensemble (trois couches)

```
┌────────────────────────────────────────────────────────────────────┐
│ Couche C — CAPTURE GESTUELLE                                       │
│   HandGestureN3D                                                   │
│   In :  WebXR hand tracking (25 joints × 2 mains × 60 Hz)          │
│   Out : ~10 sorties d'automation 0..1 (features géométriques)      │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ Couche B — MAPPING                                                 │
│   GestureMapperN3D                                                 │
│   In :  features gestuelles (entrées automation)                   │
│   Out : paramètres musicaux (sorties automation)                   │
│   Logique : matrice de mapping configurable                        │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ Couche A — GÉNÉRATION IA                                           │
│   AIComposerN3D                                                    │
│   In :  paramètres musicaux (entrées automation)                   │
│   Out : événements MIDI (sortie MIDI)                              │
│   Modèle : Magenta MelodyRNN / DrumRNN (pré-entraîné)              │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│   INSTRUMENTS WAM existants (Pro54, DrumKit, etc.)                 │
└────────────────────────────────────────────────────────────────────┘
```

Chaque Node3D est câblable indépendamment dans l'éditeur 3D du projet, comme
tous les autres instruments. L'utilisateur peut donc tester chaque couche
isolément, ou substituer un mapping personnalisé sans toucher au code.

---

## Couche C — Capture gestuelle (`HandGestureN3D`)

### Statut : **non implémenté** (Phase 1)

### Responsabilités

- Activer `WebXRHandTracking` via Babylon
- Échantillonner les 25 joints × 2 mains à 60 Hz
- Calculer des features géométriques de plus haut niveau
- Exposer chaque feature comme une sortie d'automation 0..1

### Features exposées (provisoire)

| Sortie | Description | Source géométrique |
|--------|-------------|---------------------|
| `rightHandY` | Hauteur main droite (relative au torse) | poignet.y |
| `rightHandVelocity` | Vitesse instantanée main droite | dérivée des positions |
| `rightHandAcceleration` | Accélération instantanée main droite | dérivée seconde |
| `leftHandY` | Hauteur main gauche | poignet.y |
| `leftHandVelocity` | Vitesse instantanée main gauche | dérivée des positions |
| `handSpread` | Distance entre les deux poignets | norme du vecteur |
| `rightHandOpenness` | Ouverture main droite (0=fermée, 1=ouverte) | écart pouce-petit doigt |
| `leftHandOpenness` | Ouverture main gauche | écart pouce-petit doigt |
| `rightHandPinch` | Détection de pince index-pouce | distance index-pouce |
| `leftHandPinch` | Détection de pince index-pouce | distance index-pouce |

### Algorithme

1. À chaque tick du moteur de rendu (60 Hz) :
   - Lire les positions des joints depuis Babylon
   - Calculer les features (vectorisé, sans boucles imbriquées)
   - Normaliser entre 0..1 (les plages min/max sont des constantes calibrées)
   - Écrire sur les sorties automation correspondantes

2. Lissage exponentiel (alpha ≈ 0.7) sur les features dérivées pour éviter
   le bruit haute fréquence du tracking.

### Risques

- Tracking imprécis en faible lumière → ajouter un mode de fallback contrôleurs
- Les features dérivées (vitesse, accélération) amplifient le bruit → lissage
  agressif requis

---

## Couche B — Mapping (`GestureMapperN3D`)

### Statut : **non implémenté** (Phase 2)

### Responsabilités

- Recevoir 10 entrées d'automation (les features gestuelles)
- Appliquer une matrice de mapping `M[features × paramètres]`
- Émettre 6-8 sorties d'automation (les paramètres musicaux)

### Mapping initial (heuristique)

Voir [`PFE_PLAN_APPROCHE_A.md`](../../PFE_PLAN_APPROCHE_A.md#6-mapping-gestes-paramètres-musicaux),
section 6.

### Pourquoi un Node3D dédié et non un mapping in-line ?

- **Séparation des préoccupations** : la capture est invariante, le mapping
  est variable et susceptible d'être réappris par utilisateur.
- **Évaluable indépendamment** : on peut benchmarker le mapping en l'isolant.
- **Substituable** : pour l'étude pilote, on pourra tester un mapping
  Wekinator-style à la place de l'heuristique sans toucher aux autres couches.

---

## Couche A — Génération IA (`AIComposerN3D`)

### Statut : **non implémenté** (Phase 1)

### Responsabilités

- Charger un modèle Magenta pré-entraîné (MelodyRNN par défaut)
- Recevoir des paramètres en entrées d'automation (température, densité, etc.)
- Émettre des événements MIDI au transport WAM
- Ne **pas** s'occuper de la synthèse audio (laissée aux WAM existants)

### Choix du modèle

À déterminer par Phase 0.2 (feasibility). Candidats :

| Modèle | Latence cible | Statut |
|--------|---------------|--------|
| Magenta MelodyRNN | ~10-20 ms / note | Premier choix |
| Magenta MusicVAE | ~30 ms / phrase | Backup (variations) |
| Markov ordre 4 | < 1 ms | Baseline pour étude |

### Algorithme (esquisse)

```
boucle au tempo :
    sur chaque beat :
        si on doit générer (selon densité) :
            inférer la prochaine note depuis le modèle
            avec température courante
        émettre MIDI noteOn/noteOff
        scheduler le noteOff au tick suivant
```

### Risques

- Latence du modèle > 50 ms → bascule vers Markov
- Modèle non chargeable dans le navigateur → autre format ONNX ou fallback

---

## Intégration dans le système Node3D existant

### Réutilisation

- **Protocole automation** : le projet a déjà un système de sorties/entrées
  d'automation (0..1, fan-out, synchronisé réseau). Les trois nouveaux Node3D
  s'y conforment.
- **Protocole MIDI** : Pro54 et autres WAM reçoivent déjà du MIDI via le
  système existant. `AIComposerN3D` produit sur ce même bus.
- **Sync réseau** : `getState` / `setState` du host. Les paramètres internes
  du Composer (température courante, modèle sélectionné) sont synchronisés
  comme tous les autres instruments.
- **Bounding box** : observer de redressement (vu sur l'AudioPlaque) si
  besoin.

### Aucune modification du host

Les trois Node3D s'enregistrent dans `Node3DBuilder.ts` comme tous les autres.
Pas de modification de `Node3DContext.d.ts`, ni de `Node3DInstance.ts`.

### Fichiers prévus

| Fichier | Couche | Statut |
|---------|--------|--------|
| `src/Refactoring/node3d/subs/conductor/HandGestureN3D.ts` | C | À créer |
| `src/Refactoring/node3d/subs/conductor/GestureMapperN3D.ts` | B | À créer |
| `src/Refactoring/node3d/subs/conductor/AIComposerN3D.ts` | A | À créer |
| `src/Refactoring/node3d/subs/conductor/ai/MagentaBackend.ts` | A — backend | À créer |
| `src/Refactoring/node3d/subs/conductor/ai/MarkovBackend.ts` | A — backend baseline | À créer |
| `src/Refactoring/app/Node3DBuilder.ts` | enregistrement | Modification minimale |

---

## Budget de latence

Mesuré bout-en-bout : *geste initié → son entendu*.

| Étape | Cible | Mesurée | Comment |
|-------|-------|---------|---------|
| WebXR hand tracking → Babylon callback | 10-20 ms | À mesurer en Phase 0.3 | Délai natif WebXR Quest 3 |
| Lecture features dans HandGestureN3D | < 5 ms | À mesurer | `performance.now()` autour de l'algo |
| Mapping (matrice 10×6) | < 1 ms | À mesurer | Idem |
| Inférence IA (Magenta) | 10-30 ms | À mesurer en Phase 0.2 | À l'appel `model.continueSequence()` |
| Scheduling MIDI vers WAM | < 5 ms | À mesurer | Délai jusqu'à WAM scheduleEvents |
| Buffer audio (WebAudio) | 10-20 ms | Fixe selon AudioContext | Lié au navigateur |
| **TOTAL** | **< 100 ms** | — | — |

Si la latence totale dépasse 100 ms, l'expérience est qualifiée de "non
temps réel" par la littérature (Wessel & Wright, 2002). Cela invalide
l'approche A et impose un fallback.
