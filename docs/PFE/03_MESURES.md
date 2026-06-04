# Journal des mesures quantitatives

*Toute mesure citée dans le mémoire passe d'abord par ce document, avec
contexte matériel, méthode et données brutes. Les analyses sont calculées à
partir d'ici, jamais "de tête". Une mesure invalidée est annotée, jamais
effacée.*

> **Outils de mesure** (pages servies par Vite, à lancer dans Chrome sur la
> machine de référence) :
> - `src/Refactoring/ai/benchmark/bench-page.html` — latence/qualité des modèles
> - `src/Refactoring/ai/scheduler/scheduler-test-page.html` — validation scheduler/Pro54
> - `PerfMonitor` intégré à l'AIComposerN3D (logs console en VR) — comparaison
>   threading avant/après *in situ*

---

## Machine de référence

- **MacBook M4**, 10 cœurs, 16 GB RAM
- **Chrome 148** (sortie d'usine, secteur, mode performance)
- Mesures isolées sauf indication "sous charge"

---

## Phase 0 — Faisabilité (RÉALISÉE)

### M-001 : Latence d'inférence Magenta MusicRNN

**Date :** 2026-06-01 · **Outil :** bench-page · **N :** 60 appels mesurés
(après 5 warmup) × fenêtre 250 ms.

**Résultat (run #3, après corrections) :**

| Adapter | Init (ms) | Avg (ms) | p50 | p95 | p99 |
|---------|-----------|----------|-----|-----|-----|
| Markov (baseline) | 8 | 0.01 | 0.00 | 0.10 | 0.10 |
| Magenta basic_rnn (primer 8) | 136 | 94.0 | 95.6 | 104.8 | 106.0 |
| Magenta basic_rnn (primer 4) | 41 | 76.1 | 74.9 | 78.6 | 200.0 |
| Magenta basic_rnn (primer 16) | 38 | 145.9 | 143.1 | 268.4 | 306.0 |
| Magenta melody_rnn (primer 8) | 67 | 95.2 | 99.4 | 102.3 | 218.8 |

**Critère de réussite (cadrage) :** p95 < 100 ms. **Atteint** pour primer ≤ 8
en isolation. → faisabilité validée, on reste en local (pas de tier 2 serveur).

**⚠ Piège méthodologique documenté :** le premier run affichait ~20 ms p95
mais mesurait un adapter **cassé** (Notes/call = 0, primer jamais alimenté).
Un benchmark de latence doit valider que le système génère réellement. (Voir
[04_JOURNAL](./04_JOURNAL.md), entrée run #2.)

---

### M-003 : Loi longueur de primer ↔ latence

**Date :** 2026-06-01 · Dérivée de M-001 (sweep primer sur basic_rnn).

| Primer (notes) | Latence moyenne (ms) |
|----------------|----------------------|
| 4 | 76.1 |
| 8 | 94.0 |
| 16 | 145.9 |

**Régression linéaire :**
> latence_moyenne ≈ 53 ms (coût fixe) + 5.8 ms × (notes de primer)

Le coût est dominé par la re-consommation du primer (RNN sans état). Justifie
le choix **primer = 8** (compromis contexte musical / latence). Pics p99 =
pauses GC de TF.js.

---

### M-004 : Validation du scheduler look-ahead (sur Pro54)

**Date :** 2026-06-02 · **Outil :** scheduler-test-page · **Durée :** 4 min ·
melody_rnn primer 8, branché sur un vrai Pro54.

| Métrique | Valeur |
|----------|--------|
| generationCalls | 509 |
| scheduledEvents | 989 |
| lateEvents (réglages normaux) | **0** |
| lateEvents (stress horizon 0.10 s) | 2 |
| bufferDepthSec (régime stable) | 0.46 s |
| adapter p95 / p99 **sous charge** | 154 / 208 ms |

**Conclusions :**
- `lateEvents = 0` à réglages normaux malgré p99 = 208 ms → **le buffer absorbe
  les pics GC**. Architecture validée. Son continu à l'oreille.
- Les 2 retards n'apparaissent qu'avec horizon (0.10 s) < latence modèle
  (0.154 s) — impossibilité physique, pas un bug.
- **Règle dégagée** : horizon minimal viable ≈ p95 sous charge ; horizon sûr ≈
  2-3× (0.5 s ≈ 3× → valide le défaut).
- **Latence sous charge ≈ +50 % vs isolée** (154 vs 102 ms) → toujours mesurer
  en conditions d'usage.

---

### M-005 : Couverture de kernels par backend TF.js

**Date :** 2026-06-03 · **Méthode :** grep des packages backend installés.

| Backend | Kernel `Multinomial` (sampling RNN) |
|---------|-------------------------------------|
| WASM | ✗ absent (TF.js 2.8.6) |
| CPU | ✓ présent |
| WebGL | ✓ présent |

**Conséquence :** WASM inutilisable pour MusicRNN à cette version → backend
**CPU** dans le worker (complet, lent, mais hors main thread). Voir
[ADR-006](./02_DECISIONS.md).

---

### M-006 : Threading avant/après — DANS WamJamParty

**Date :** *(à mesurer)* · **Outil :** `PerfMonitor` intégré à l'AIComposerN3D
(logs console). **Méthode :** comparaison dans l'application réelle, charge VR
incluse — pas en synthétique. On échange l'adapter de l'AIComposerN3D entre
`MagentaMusicRNNAdapter` (main thread, AVANT) et `WebWorkerAdapter` (worker,
APRÈS), on lance le même patch (AudioPlaque → AIComposer → Pro54), on lit les
lignes `[PerfMonitor]` (bloc RENDU).

**Critère clé :** frame MAX (plus long gel du main thread) et janky frames
(> 33 ms), mesurés sous la vraie charge Babylon/XR.

| Condition | FPS | frame avg | frame MAX | janky | inf. avg | backend |
|-----------|-----|-----------|-----------|-------|----------|---------|
| AVANT — Magenta main thread | *(à mesurer)* | | | | | webgl |
| APRÈS — WebWorker | *(à mesurer)* | | | | | cpu |

→ **Données brutes** : `data/M-006_threading.md` *(coller les lignes PerfMonitor)*.

> Note : un premier benchmark synthétique (boucle rAF) avait été écrit puis
> retiré — il ne reproduisait pas la charge réelle de l'application. La
> comparaison valable se fait avec le PerfMonitor *in situ*.

---

## Phase 3 — Étude pilote (futur)

*(à étoffer au mois 3)* — M-101 satisfaction du mapping initial (5-8 pers.),
M-102 suggestions d'ajustement, M-103 latence ressentie.

## Phase 4 — Étude principale (futur)

### Objectives (système)
M-201 latence bout-en-bout/condition · M-202 stabilité du mapping ·
M-203 précision tempo · M-204 perplexité MIDI vs corpus · M-205 entropie.

### Subjectives (utilisateurs)
M-301 NASA-TLX · M-302 GEMS-9 · M-303 agentivité (Tapal 2017) ·
M-304 expressivité custom · M-305 IPQ présence VR.

### Perceptuelles (auditeurs tiers)
M-401 A/B aveugle émotion · M-402 A/B aveugle qualité.

---

## Index des fichiers de données

| ID | Fichier | Statut |
|----|---------|--------|
| M-001/003 | sortie bench-page (run #3) | dans 04_JOURNAL |
| M-004 | sortie scheduler-test-page | dans 04_JOURNAL |
| M-006 | `data/M-006_threading.md` | à créer (run à faire) |
