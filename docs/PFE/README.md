# PFE — Le Chef d'Orchestre IA

*Documentation scientifique et technique du projet PFE.*

Branche de travail : `feature/orchestra-conductor`.

> **Statut au dernier point** : Phase 0 (faisabilité) **terminée et validée**.
> Couche A (génération IA) **implémentée** : adapters, scheduler look-ahead,
> Web Worker, AIComposerN3D jouable dans le monde VR. Reste : valider le gain
> de threading (M-006), puis Phases 1-2 (capture gestuelle + mapping).

---

## Organisation des documents

| Fichier | Rôle |
|---------|------|
| [`CADRAGE.md`](./CADRAGE.md) | Document de cadrage : question de recherche, hypothèses, méthodologie, calendrier. La référence de fond. |
| [`00_ETAT_DE_L_ART.md`](./00_ETAT_DE_L_ART.md) | Revue de littérature classée par thèmes. Toute référence du mémoire passe par ici. |
| [`01_ARCHITECTURE.md`](./01_ARCHITECTURE.md) | Architecture **telle qu'implémentée** : 3 couches, adapter pattern, scheduler look-ahead, threading, paramètres du modèle. |
| [`02_DECISIONS.md`](./02_DECISIONS.md) | Décisions techniques au format ADR. ADR-001 à 007. |
| [`03_MESURES.md`](./03_MESURES.md) | Mesures quantitatives. Phase 0 réalisée (M-001 à M-006), études futures planifiées. |
| [`04_JOURNAL.md`](./04_JOURNAL.md) | Journal de travail chronologique détaillé (findings, frictions, décisions au fil de l'eau). |
| `feasibility/` | Pointeurs vers les outils de mesure (pages bench dans `src/`). |

**Ordre de lecture conseillé** : CADRAGE (le pourquoi) → 01_ARCHITECTURE (le
comment) → 02_DECISIONS (les choix justifiés) → 03_MESURES (les preuves) →
04_JOURNAL (le détail chronologique).

---

## Outils de mesure (dans `src/Refactoring/ai/`)

| Page (servie par Vite) | Mesure |
|------------------------|--------|
| `benchmark/bench-page.html` | latence/qualité des modèles (M-001, M-003) |
| `scheduler/scheduler-test-page.html` | validation scheduler sur Pro54 (M-004) |
| `PerfMonitor` (intégré à l'AIComposerN3D) | FPS/frame times/flux en VR |

---

## Phases du PFE

```
Phase 0 — De-risk + documentation              ✅ terminée
Phase 1 — HandGestureN3D + AIComposerN3D        ◐ AIComposer fait, gestes à venir
Phase 2 — GestureMapperN3D + mapping heuristique ⬜
Phase 3 — Étude pilote (5-8 personnes)          ⬜
Phase 4 — Étude principale (20-25 personnes)    ⬜
Phase 5 — Analyse + mémoire                     ⬜
```

Détail de chaque phase dans [`CADRAGE.md`](./CADRAGE.md).

---

## Conventions

- **Tout en français** (le mémoire est en français).
- **Citations APA**, archivées dans `00_ETAT_DE_L_ART.md`.
- **Mesures avec date, matériel et conditions** — pas de chiffre sans contexte.
- **Décisions = entrées ADR datées**, jamais effacées (marquées DÉPRÉCIÉE si
  invalidées, avec lien vers la décision qui remplace).
