# PFE — Le Chef d'Orchestre IA

*Documentation scientifique et technique du projet PFE.*

Branche de travail : `feature/orchestra-conductor`.
Document de cadrage : [`PFE_PLAN_APPROCHE_A.md`](../../PFE_PLAN_APPROCHE_A.md) à la racine du dépôt.

---

## Organisation des documents

| Fichier | Rôle |
|---------|------|
| [`00_ETAT_DE_L_ART.md`](./00_ETAT_DE_L_ART.md) | Revue de la littérature, classée par thèmes. Toutes les références citées dans le mémoire passent d'abord par ici. |
| [`01_ARCHITECTURE.md`](./01_ARCHITECTURE.md) | Architecture du système (couches, schémas, fichiers). Mise à jour à chaque évolution structurelle. |
| [`02_DECISIONS.md`](./02_DECISIONS.md) | Journal des décisions techniques au format ADR (Architecture Decision Record). Chaque entrée datée, justifiée, et associée à une alternative écartée. |
| [`03_MESURES.md`](./03_MESURES.md) | Journal des mesures quantitatives (latence, perplexité, taux d'utilisation des features…). Données brutes + analyse. |
| [`04_JOURNAL.md`](./04_JOURNAL.md) | Journal de travail daté. Une entrée par session. Sert à reconstruire le timeline du PFE pour le mémoire. |
| `feasibility/` | Scripts de tests de faisabilité (Phase 0). Tout est éphémère — supprimé une fois Phase 0 close. |

---

## Phases du PFE

```
Phase 0 — De-risk et documentation       ← MAINTENANT
Phase 1 — HandGestureN3D + AIComposerN3D minimum viable
Phase 2 — GestureMapperN3D + mapping heuristique
Phase 3 — Étude pilote (5-8 personnes)
Phase 4 — Étude principale (20-25 personnes)
Phase 5 — Analyse + mémoire
```

Le détail de chaque phase est dans [`PFE_PLAN_APPROCHE_A.md`](../../PFE_PLAN_APPROCHE_A.md).

---

## Conventions

- **Tout en français** dans ces documents (le mémoire est en français).
- **Citations en format APA**, archivées dans `00_ETAT_DE_L_ART.md`.
- **Mesures avec date, dispositif matériel et conditions** — pas de chiffre flottant sans contexte.
- **Décisions = entrées datées** dans `02_DECISIONS.md`, jamais effacées (rayées si invalidées plus tard).
