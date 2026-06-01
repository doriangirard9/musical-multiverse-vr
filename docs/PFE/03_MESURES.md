# Journal des mesures quantitatives

*Toute mesure citée dans le mémoire passe d'abord par ce document, avec
contexte matériel, méthode et données brutes. Les analyses (moyennes,
écarts-types, tests statistiques) sont calculées à partir d'ici, jamais
"de tête".*

---

## Conventions

- **Une mesure = une entrée datée** avec :
  - Date et heure
  - Matériel (laptop, navigateur, version Quest 3 si pertinent)
  - Conditions (charge système, mode VR ou non, autres apps fermées)
  - Outil de mesure
  - N (nombre d'échantillons)
  - Données brutes ou lien vers un fichier CSV dans `data/`
  - Synthèse (moyenne, médiane, écart-type, max)
- **Une mesure n'est pas barrée** : si elle est invalidée, on l'annote
  *"Invalidée le YYYY-MM-DD parce que <raison>"* et on garde le texte.

---

## Sommaire

- [Phase 0 — Faisabilité](#phase-0--faisabilité)
  - [M-001 : Latence d'inférence Magenta](#m-001--latence-dinférence-magenta)
  - [M-002 : Échantillonnage WebXR hand tracking](#m-002--échantillonnage-webxr-hand-tracking)
- [Phase 3 — Étude pilote (futur)](#phase-3--étude-pilote-futur)
- [Phase 4 — Étude principale (futur)](#phase-4--étude-principale-futur)

---

## Phase 0 — Faisabilité

### M-001 : Latence d'inférence Magenta

**Date :** *(à mesurer en Phase 0.2)*
**Matériel :** *(à compléter — préciser modèle Mac, RAM, version Chrome)*
**Conditions :** *(à compléter — onglet seul, navigateur fraîchement ouvert)*
**Outil :** `performance.now()` autour de `model.continueSequence()`
**N :** 100 inférences successives
**Modèle Magenta :** *(à choisir — basic_rnn / attention_rnn / autre)*
**Longueur de séquence inférée :** 1 note à la fois

**Méthode :**
```javascript
const t0 = performance.now();
const seq = await model.continueSequence(seed, 1, temperature);
const dt = performance.now() - t0;
samples.push(dt);
```

**Données brutes :** `data/M-001_magenta_latency.csv` *(à créer)*

**Synthèse :**
- Moyenne : *(à mesurer)*
- Médiane : *(à mesurer)*
- p95 : *(à mesurer)*
- Max : *(à mesurer)*

**Critère de réussite :** moyenne < 30 ms ET p95 < 60 ms.

---

### M-002 : Échantillonnage WebXR hand tracking

**Date :** *(à mesurer en Phase 0.3)*
**Matériel :** *(à compléter — préciser Quest 3 firmware, navigateur)*
**Conditions :** Pièce bien éclairée, mains visibles, distance ~50 cm du casque
**Outil :** Babylon `onAfterRenderObservable` + timestamps
**N :** 600 frames (~10 secondes à 60 Hz)

**Méthode :**
Enregistrer le timestamp à chaque image et la position du poignet droit.
Calculer le delta entre images consécutives.

**Données brutes :** `data/M-002_webxr_hand_sampling.csv` *(à créer)*

**Synthèse :**
- Période d'échantillonnage moyenne : *(à mesurer)*
- Variabilité (écart-type de la période) : *(à mesurer)*
- Taux de "frames manquées" : *(à mesurer — frames où les joints sont null)*

**Critère de réussite :** période moyenne entre 14 et 18 ms (60-72 Hz),
écart-type < 4 ms, taux de pertes < 5%.

---

## Phase 3 — Étude pilote (futur)

*(Section à étoffer au mois 3)*

### Mesures planifiées

- M-101 : satisfaction du mapping initial sur 5-8 participants
- M-102 : suggestions d'ajustement par gesture
- M-103 : latence ressentie (subjective)

---

## Phase 4 — Étude principale (futur)

*(Section à étoffer au mois 4-5)*

### Mesures objectives (système)

- M-201 : Latence bout-en-bout par condition
- M-202 : Stabilité du mapping
- M-203 : Précision tempo intentionnel
- M-204 : Perplexité de la sortie MIDI vs corpus de validation
- M-205 : Entropie de Shannon des notes générées

### Mesures subjectives (utilisateurs)

- M-301 : NASA-TLX (charge cognitive) — 6 sous-échelles
- M-302 : GEMS-9 (émotion ressentie) — 9 dimensions
- M-303 : Échelle d'agentivité (Tapal et al. 2017) — 13 items
- M-304 : Échelle expressivité custom — 5 items (à valider en pilote)
- M-305 : IPQ Présence VR — version courte

### Mesures perceptuelles (auditeurs tiers)

- M-401 : Préférences A/B aveugles sur émotion évoquée
- M-402 : Préférences A/B aveugles sur qualité musicale

---

## Index des fichiers de données

| ID | Fichier | Statut |
|----|---------|--------|
| M-001 | `data/M-001_magenta_latency.csv` | À créer |
| M-002 | `data/M-002_webxr_hand_sampling.csv` | À créer |
