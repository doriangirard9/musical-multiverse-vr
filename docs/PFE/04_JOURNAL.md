# Journal de travail

*Une entrée par session de travail. Sert à reconstruire la chronologie du
PFE pour le mémoire (section "Démarche"), à se souvenir de ce qui a été
testé et abandonné, et à matérialiser les pivots.*

---

## Format d'une entrée

```
## YYYY-MM-DD — <durée approximative>

**Objectif :** Que cherchais-je à faire aujourd'hui ?

**Fait :**
- Liste à puces de ce qui a effectivement été produit
- Fichiers créés/modifiés, mesures prises, décisions actées

**Trouvé :** Découvertes ou obstacles importants

**Prochaine étape :** Que faire la prochaine session
```

---

## 2026-05-21 — ~1 h

**Objectif :** Démarrer l'approche A. Cadrer la phase 0 et poser les
fondations documentaires avant tout code.

**Fait :**
- Branche `feature/orchestra-conductor` créée et confirmée propre
- Document de cadrage `PFE_PLAN_APPROCHE_A.md` (déjà en place) relu
- Structure de documentation `docs/PFE/` créée :
  - `README.md` — index
  - `00_ETAT_DE_L_ART.md` — squelette de revue littéraire avec ~25 références
    initiales classées en 6 thèmes
  - `01_ARCHITECTURE.md` — architecture en 3 couches (C-B-A) avec budget de
    latence
  - `02_DECISIONS.md` — trois premiers ADR (approche A retenue, séparation en
    3 Node3D, Magenta proposé sous réserve de phase 0)
  - `03_MESURES.md` — squelette du journal de mesures avec deux entrées
    planifiées (M-001 latence Magenta, M-002 échantillonnage WebXR)
  - `04_JOURNAL.md` — le présent document

**Trouvé :**
- Tone.js déjà installé dans le projet, utile pour la planification MIDI
- Magenta.js n'est pas encore installé — à faire en Phase 0.2

**Prochaine étape :**
- **Phase 0.2** : prototype de faisabilité Magenta (standalone HTML, hors
  intégration Node3D). Mesurer la latence d'inférence pour décider si l'on
  poursuit avec Magenta ou si l'on bascule sur Markov.
- Cette mesure conditionne l'ADR-003 (modèle de génération).

---
