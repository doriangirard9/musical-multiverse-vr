# Tests de faisabilité (Phase 0)

*Phase 0 close. Les tests prévus ici (scripts HTML éphémères) ont été
remplacés par des **outils de mesure intégrés** dans `src/`, plus durables et
reproductibles car ils réutilisent le code de production via l'adapter pattern.*

## Où sont les outils maintenant

| Test prévu (Phase 0) | Réalisé sous forme de | Mesure actée dans |
|----------------------|------------------------|-------------------|
| Latence Magenta (0.2) | `src/Refactoring/ai/benchmark/bench-page.html` | [M-001, M-003](../03_MESURES.md) |
| Validation scheduler | `src/Refactoring/ai/scheduler/scheduler-test-page.html` | [M-004](../03_MESURES.md) |
| Hand tracking WebXR (0.3) | *à créer en Phase 1* (capture gestuelle) | M-002 (futur) |

## Pourquoi ce déplacement

Le cadrage prévoyait des scripts jetables. En pratique, les outils de mesure
sont devenus des **pages servies par Vite** qui réutilisent le code de
production (adapters, scheduler). Ils restent donc valides au fil du projet au
lieu d'être supprimés. Conclusions de Phase 0 : [`../02_DECISIONS.md`](../02_DECISIONS.md)
(ADR-003 à 007) et [`../03_MESURES.md`](../03_MESURES.md).
