# Journal PFE — Le Chef d'Orchestre IA

Document vivant. Chaque entrée a une date, un titre, un contexte, ce qui
a été décidé/mesuré/découvert, et les questions ouvertes qui en
découlent. Le but : retracer la démarche scientifique au moment du
mémoire et de la soutenance.

> **Convention** : entrées par ordre antichronologique (les plus
> récentes en haut), tags `[décision]` `[mesure]` `[surprise]`
> `[blocage]` `[ressource]`.

---

## 2026-05-19 — Démarrage du travail technique [décision]

### Contexte
Plan PFE validé par les deux encadrants. Calendrier Mois 1 démarré. Le
plan prévoit :
- Revue de littérature (en parallèle, dossier `refs/`)
- Démarches éthiques + RGPD (à lancer cette semaine)
- Implémentation de l'interface `IMusicGeneratorAdapter`
- Premier adapter : Markov d'ordre 4 (baseline)
- Test de faisabilité Magenta MusicRNN

### Décisions d'architecture
- **Couche IA isolée** dans `src/Refactoring/ai/` :
  - `ai/IMusicGeneratorAdapter.ts` — l'interface commune
  - `ai/types.ts` — types annexes (MidiEvent, HyperparamSpec, etc.)
  - `ai/adapters/MarkovChainAdapter.ts` — la baseline
  - `ai/adapters/MagentaMusicRNNAdapter.ts` — premier vrai modèle IA
  - `ai/benchmark/BenchmarkRunner.ts` — l'outil de mesure
- **Pourquoi un dossier séparé** : la couche IA est délibérément
  indépendante du wiring Node3D. Cela facilite :
  - Le benchmark hors-VR (mesures CLI pures sur les adapters)
  - L'extension future vers `RemoteModelAdapter` (tier 2)
  - La portabilité du benchmark vers d'autres projets

### Choix de la baseline Markov
- **Ordre 4** : compromis classique en génération musicale procédurale.
  Trop bas (ordre 1-2) = bruit aléatoire perçu. Trop haut (≥ ordre 6) =
  copie-coller du corpus → pas de génération réelle.
- **Corpus d'apprentissage** : Lakh MIDI Dataset filtré (mélodies seules,
  3000 morceaux de pop/rock/jazz/classique mélangés). À récupérer en S2.
- **Pour S1, version simplifiée** : matrice de transition manuelle sur
  une gamme C majeure pour valider l'architecture. Pas besoin du corpus
  Lakh tout de suite.

### Décisions de tooling
- **Pas de nouvelles dépendances cette semaine** — la version S1 du
  Markov est en TypeScript pur.
- En S2, j'ajouterai `@magenta/music` (et `@tensorflow/tfjs` qu'il
  embarque automatiquement).
- Benchmark : `performance.now()` natif. Pas besoin de Benchmark.js
  pour ce niveau de mesure.

### À faire cette semaine
- [x] Créer ce journal
- [x] Créer la structure de dossiers
- [x] Écrire `types.ts`
- [x] Écrire `IMusicGeneratorAdapter.ts`
- [x] Écrire `MarkovChainAdapter.ts` (version simplifiée gamme C majeure)
- [x] Test de fumée + exécution `MarkovChainAdapter.smoke.ts`
- [ ] Démarrer démarches éthiques (lancer un mail au responsable RGPD
  de l'établissement)
- [ ] Commencer la revue de littérature : 3 premiers papiers Wessel,
  Fiebrink, et un papier Magenta (cf section 8 du plan)

### Questions ouvertes
1. **Le corpus Lakh est-il sous licence permettant un usage scientifique
   public dans le mémoire ?** À vérifier en S2 avant d'entraîner les
   chaînes de Markov sur des morceaux réels.
2. **Niveau de qualité acceptable de la baseline Markov pour H2** —
   si Markov produit du bruit pur, la condition « MIDI-Markov » dans
   l'étude utilisateur sera trivialement inférieure. Il faut un Markov
   *raisonnable*, pas un Markov *cassé*. Calibrer en S3 sur l'écoute.

---

## 2026-06-01 — Run #3 : loi primer↔latence + décision modèle [mesure] [décision]

### Résultats (hard-reload effectué, mesure principale 60 calls)

```
| Adapter                          | Init | Avg    | p50    | p95    | p99    | Notes/call |
|----------------------------------|------|--------|--------|--------|--------|------------|
| Markov (baseline)                | 8    | 0.01   | 0.00   | 0.10   | 0.10   | 1.0        |
| Magenta basic_rnn (primer 8)     | 136  | 94.05  | 95.60  | 104.80 | 106.00 | 1.0        |
| Magenta basic_rnn (primer 4)     | 41   | 76.14  | 74.90  | 78.60  | 200.00 | 1.0        |
| Magenta basic_rnn (primer 16)    | 38   | 145.86 | 143.10 | 268.40 | 306.00 | 1.0        |
| Magenta melody_rnn (primer 8)    | 67   | 95.16  | 99.40  | 102.30 | 218.80 | 0.9        |
| Magenta chord_pitches (primer 8) | 79   | 126.09 | 122.60 | 140.60 | 296.60 | 0.9        |
```

Tous les modèles génèrent maintenant (Notes/call ≈ 1, plus de ERR sur
chord_pitches_improv grâce à l'accord par défaut `["C"]`).

### Finding chiffrable : latence ≈ linéaire en longueur de primer

Sur basic_rnn, en faisant varier UNIQUEMENT primerMaxNotes :

| Primer | Avg (ms) | p95 (ms) |
|--------|----------|----------|
| 4      | 76.1     | 78.6     |
| 8      | 94.0     | 104.8    |
| 16     | 145.9    | 268.4    |

Régression linéaire sur la moyenne :

> **latence_moyenne ≈ 53 ms + 5.8 ms × (nombre de notes de primer)**

Coût fixe ~53 ms (overhead du modèle + génération des 2 steps utiles),
puis ~5.8 ms par note de primer reconsommée. **Confirme quantitativement
l'hypothèse du run #2 : la re-consommation du primer domine le coût** (RNN
sans état, reconstruit son état caché à chaque appel).

→ Résultat propre, reproductible, à mettre dans le mémoire (graphique
latence vs primer length).

### Finding : pics p99 = garbage collector TF.js

p99 erratique partout (200, 268, 306, 218, 296 ms) alors que p50 est
stable. Signature classique de pauses GC : TF.js alloue des tenseurs
WebGL à chaque inférence, le GC passe périodiquement et fige ~150-250 ms.

→ **Argument décisif pour le look-ahead** : un pic de 300 ms dans le
chemin audio = glitch audible. Derrière un buffer de 2 s = invisible.
Le look-ahead n'est pas une optimisation, c'est une nécessité de
robustesse face au GC.

### Note méthodo : balayage température trop court

Les colonnes du balayage de température (10 calls par temp) sont très
bruitées (ex. melody_rnn temp 0.5 = 45 ms vs temp 1.0 = 57 ms — dans le
bruit GC). Pour un résultat publiable, refaire avec ≥ 100 calls par
température dans un run dédié. La mesure principale (60 calls) reste
la référence fiable.

### Décisions verrouillées

1. **Modèle pour la suite : `melody_rnn`** (préliminaire). p95 ≈ basic_rnn
   (102 vs 105 ms) mais produit des mélodies plus structurées (entraîné
   sur des mélodies, pas des séquences génériques). Décision FINALE après
   les métriques qualité (perplexité/entropie) prévues en S3.
2. **Primer = 8 notes** (déjà le défaut). Compromis contexte/latence :
   ~100 ms, dans le budget look-ahead, contexte musical suffisant.
3. **Architecture look-ahead bufferisée : CONFIRMÉE et nécessaire.**
   Prochain gros chantier technique.

### Prochaines étapes possibles (à arbitrer avec Yassine)

- **Option A — Scheduler look-ahead** : `MidiLookaheadScheduler` qui
  appelle l'adapter en avance, remplit un buffer, et expose les notes
  au transport WAM aux bons temps. C'est le verrou architectural avant
  toute intégration gestuelle.
- **Option B — Métriques qualité** : calcul offline de perplexité,
  entropie, diversité sur les sorties MIDI capturées → décide
  définitivement du modèle.
- **Option C — Plus d'adapters** : MusicVAE, DrumRNN, PerformanceRNN
  pour compléter le tableau de benchmark.

Recommandation : **A d'abord** (débloque tout le reste), puis B (pour
figer le modèle), puis C (complétude du benchmark).

---

## 2026-06-01 — Deuxième benchmark : la latence réelle + insight architectural [mesure] [décision] [surprise]

### Le retournement

Le run #2 (avec le fix du slice) donne des chiffres TRÈS différents du
run #1 :

```
| Adapter                       | Init  | Avg     | p95     | p99     | Notes/call |
|-------------------------------|-------|---------|---------|---------|------------|
| Markov (baseline)             | 1     | 0.01    | 0.10    | 0.10    | 1.0        |
| Magenta basic_rnn             | 116   | 148.29  | 285.50  | 312.80  | 1.0        |
| Magenta melody_rnn            | 80    | 146.63  | 254.90  | 270.50  | 1.1        |
| Magenta chord_pitches_improv  | —     | —       | —       | —       | ERR        |
```

(NB : init bien plus rapide ici — 116/80 ms — car les poids étaient
en cache navigateur depuis le run #1. Le cold-start reste ~5 s.)

### POURQUOI le run #1 était faux (leçon importante)

Le run #1 affichait 20 ms p95. Le run #2 affiche 285 ms. La SEULE
différence de code était l'extraction de notes (filter → slice).

**Explication** : au run #1, `Notes/call = 0`. Aucune note n'était
ajoutée au primer. Le primer restait à 1 note (la graine). Donc
`continueSequence(primer-1-note, 2 steps)` ne traitait quasiment rien
= 20 ms. **On mesurait un adapter qui ne générait rien.**

Au run #2, les notes sont extraites ET ajoutées au primer, qui grandit
jusqu'à 16 notes. Le RNN doit reconsommer ces 16 notes pour reconstruire
son état caché à chaque appel → ~8× plus de calcul → 148 ms.

→ **Leçon méthodologique pour le mémoire** : un benchmark de latence
doit impérativement valider que le système fait réellement son travail
(ici : génère des notes ET maintient le contexte). Mesurer un no-op
donne des chiffres flatteurs et faux. C'est exactement le genre de
piège que le pré-enregistrement du protocole (OSF, prévu mois 4) doit
éviter.

### Le coût dominant = longueur du primer (autorégression)

`MusicRNN.continueSequence` est **sans état** : il reconstruit l'état
caché du RNN à partir du primer entier à chaque appel. Donc le coût
≈ proportionnel à (longueur_primer + steps_générés). Avec un primer
de 16 notes pour générer 2 steps, on paie 16 pas de "réchauffage" pour
2 pas utiles → ~89 % du calcul est gaspillé en re-consommation.

→ Le run #3 (en cours) mesure ce compromis : primer 4 vs 8 vs 16.

### INSIGHT ARCHITECTURAL MAJEUR — découplage génération / lecture

La latence de 285 ms dépasse le budget de 100 ms **SI** on appelle le
modèle dans le chemin audio-critique (une génération par note jouée).
Mais ce n'est PAS l'architecture nécessaire.

**Décision de conception (centrale pour le PFE)** : le modèle ne tourne
PAS en lockstep avec la lecture. Il génère **en avance** dans un buffer
(look-ahead), et le transport WAM draine ce buffer aux bons temps.

```
   Geste utilisateur ──┬──► hyperparamètres ──► génération FUTURE (buffer)
                       │         (tolère 285 ms de latence)
                       └──► modulation post-gen (tempo, dynamique, mix)
                                 (immédiat, < 5 ms, sans modèle)
```

Conséquence : la latence du modèle doit être inférieure à la PROFONDEUR
du buffer (ex. 2 secondes d'avance), pas inférieure à l'intervalle
inter-notes. **285 ms << 2000 ms → parfaitement acceptable.**

Ce qui doit rester temps-réel strict, c'est la modulation
post-génération (volume, tempo, panoramique) que le geste applique au
flux déjà bufferisé — et ça ne passe pas par le modèle (< 5 ms).

→ **Ceci devient une contribution de conception du mémoire** : montrer
que la métaphore "chef d'orchestre" (qui SHAPE un flux, ne COMPOSE pas
note-à-note) est précisément ce qui rend la latence des modèles
génératifs acceptable en VR temps réel. Le chef d'orchestre n'attend pas
non plus que l'orchestre joue note par note sur son geste — il dirige
une intention que l'orchestre anticipe.

### Faisabilité — verdict nuancé mais POSITIF

| Scénario | Latence requise | Magenta tient ? |
|----------|-----------------|-----------------|
| Génération en lockstep (naïf) | < 100 ms | ❌ Non (285 ms) |
| Génération look-ahead bufferisée | < profondeur buffer (~2 s) | ✅ Largement |
| Modulation post-gen (geste→mix) | < 50 ms | ✅ (pas de modèle) |

→ On continue en local (tier 1) AVEC architecture look-ahead. Pas de
bascule serveur nécessaire.

### Bugs/résolutions de ce run

- **chord_pitches_improv** : `"Chord progression expected but not
  provided"`. C'est un checkpoint CONDITIONNÉ par accords. L'adapter
  supporte désormais un `chordProgression` (4e arg de continueSequence),
  défaut `["C"]` pour cette variante. À re-tester au run #3.
- **Heap 212 MB au départ** : le run #2 a démarré avec un heap chargé
  (run #1 pas entièrement GC). La colonne mémoire reste donc peu fiable
  — confirmer avec `tf.memory().numBytes` dans un futur run propre, et
  hard-reload entre chaque mesure.

### Run #3 — protocole

Mesurer l'effet de la longueur de primer (4/8/16) sur la latence, et
valider chord_pitches_improv avec accord par défaut. Adapters
reconfigurés dans `bench-page.ts`. Primer par défaut abaissé à 8.

---

## 2026-06-01 — Premier benchmark Magenta [mesure] [décision]

### Conditions
- MacBook Pro M4 / Chrome 148 / 10 cores / 16 GB RAM
- Page `bench-page.html`, protocole : warmup 5 + mesure 60 × 250 ms
- Date : `2026-06-01T09:32:23.961Z`

### Résultats bruts

```
| Adapter                          | Init (ms) | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Mem (MB) | Notes/call | Failures |
|----------------------------------|-----------|----------|----------|----------|----------|----------|------------|----------|
| Markov (baseline)                | 2         | 0.00     | 0.00     | 0.10     | 0.10     | 13.9     | 1.0        | 0        |
| Magenta MusicRNN — basic_rnn     | 4926      | 19.47    | 20.00    | 24.60    | 25.50    | 27.9     | 0.0        | 0        |
| Magenta MusicRNN — melody_rnn    | 4260      | 17.34    | 15.70    | 20.60    | 32.70    | 15.7     | 0.0        | 0        |
| Magenta MusicRNN — attention_rnn | —         | —        | —        | —        | —        | —        | —          | ERR      |
```

Balayage de température : aucune corrélation significative entre la
température et la latence (variations 16–20 ms sur basic_rnn, 16–19 ms
sur melody_rnn, dans le bruit). Attendu : la température n'affecte que
le tirage softmax post-inférence, pas le coût des matrix-mul.

### Verdict scientifique principal — FAISABILITÉ VALIDÉE

| Critère du plan PFE | Cible | basic_rnn | melody_rnn |
|---------------------|-------|-----------|------------|
| Latence p95 | < 100 ms (critique) | **24.60 ms** | **20.60 ms** |
| Latence p99 | < 80 ms (souhaitée) | **25.50 ms** | **32.70 ms** |
| Init | < 5 s | **4.93 s** | **4.26 s** |

→ **Marge de 4× sous le budget critique.** La VR temps réel avec
génération IA en local sur M4 est viable. **Pas de bascule sur le tier 2
serveur nécessaire.** Le calendrier du plan est conservé.

### Bugs trouvés à corriger

#### Bug 1 — `Notes/call = 0` sur Magenta [surprise]

Les modèles s'exécutent (latence mesurée correctement) mais l'adapter
ne renvoie aucune note. Cause identifiée : le filtre de "nouvelles
notes" se faisait piéger par des `quantizedStartStep` undefined sur
les notes retournées :

```typescript
// AVANT — bug
const newNotes = (generated.notes ?? []).filter(
    n => (n.quantizedStartStep ?? 0) >= (qns.totalQuantizedSteps ?? 0),
);
// Si quantizedStartStep est undefined : 0 >= positif → faux → tout filtré
```

Corrigé par une détection par taille de tableau (robuste aux undefined) :

```typescript
// APRÈS — fix
const primerNoteCount = qns.notes?.length ?? 0;
const allGenNotes = generated.notes ?? [];
const newNotes = allGenNotes.length > primerNoteCount
    ? allGenNotes.slice(primerNoteCount)
    : allGenNotes;
```

#### Bug 2 — `attention_rnn` n'est pas hébergé publiquement [ressource]

L'URL `https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/attention_rnn/config.json`
retourne 404. Google Cloud Storage répond avec un body XML (`<?xml version=...`)
que Magenta tente de parser comme JSON → crash dans `init()`.

**Finding pour le mémoire** : le checkpoint `attention_rnn` est
référencé dans certains tutoriels Magenta mais n'a apparemment jamais
été publié sur le CDN public, ou a été retiré. Remplacé dans le
benchmark par `chord_pitches_improv` (autre `music_rnn/*` du CDN qui
fonctionne avec la même classe `MusicRNN`).

### Observations à creuser

1. **Init time 5s** : dominé par le téléchargement réseau (~10 MB).
   Sur un second run dans la même session le navigateur cache et c'est
   plus rapide, mais sur un cold start (utilisateur réel) c'est 5 s.
   À considérer pour l'UX VR — peut-être un écran de chargement avec
   barre de progression au premier lancement.

2. **Memory `usedJSHeapSize` ne croît pas linéairement avec le modèle** :
   basic_rnn : 27.9 MB, melody_rnn : 15.7 MB. C'est l'usage TOTAL du
   heap JS au moment de la mesure, pas l'usage propre du modèle. La
   différence vient probablement du timing du GC entre les deux runs.
   **Ne pas sur-interpréter cette colonne** dans le mémoire — utiliser
   plutôt `tf.memory().numBytes` côté TF.js pour une mesure propre dans
   un futur benchmark plus rigoureux.

3. **p99 melody_rnn = 32.7 ms vs basic_rnn = 25.5 ms** : melody_rnn a
   une queue plus longue malgré une moyenne plus basse. À surveiller
   sur un run plus long (1000+ calls) pour distinguer le bruit du
   vrai comportement.

### Conclusions opérationnelles

- **Modèle élu pour l'étude utilisateur (préliminaire)** : `melody_rnn`,
  meilleure latence moyenne et p95, init plus rapide. À confirmer
  après ajout de MusicVAE / DrumRNN / PerformanceRNN au benchmark (S3).
- **À refaire** : re-run du benchmark après les deux fixes ci-dessus
  pour valider que Notes/call > 0 ET que les 3 RNN tournent.

### Prochaines étapes (S3 prévu)

- Re-run du benchmark fixé
- Ajout des adapters : `MagentaMusicVAEAdapter`, `MagentaDrumRNNAdapter`,
  `MagentaPerformanceRNNAdapter`
- Première mesure offline de la qualité musicale (perplexité, entropie,
  diversité) sur les sorties MIDI capturées

---

## S2 — `global is not defined` au chargement Magenta [surprise] [blocage]

### Symptôme

Premier chargement de la page de benchmark dans Chrome : page vide,
puis (grâce au garde-fou ajouté dans `bench-page.html`) message :

```
ReferenceError: global is not defined
    at node_modules/typedarray-pool/pool.js (...)
    at __require2 (chunk-PLDDJCW6.js)
    at node_modules/ndarray-fft/fft.js
    at node_modules/ndarray-resample/resample.js
    at @magenta_music.js
```

### Diagnostic

Bug classique des libs Node portées vers le browser. `typedarray-pool`
(transitif via `ndarray-fft` et `ndarray-resample` que Magenta utilise
pour ses features d'analyse audio) assume que la variable `global`
existe — c'est vrai en Node, faux dans le navigateur.

Le pré-bundling esbuild de Vite ne corrige PAS ça : il transforme
les `require()` en `__require2()` mais conserve les références à
`global` telles quelles.

### Fix

Une ligne dans `vite.config.js` (section `define`) :

```js
define: {
    global: 'globalThis',
}
```

`define` injecte un remplacement textuel à l'étape esbuild : toutes les
occurrences de `global` dans le code bundlé deviennent `globalThis`
(qui, lui, existe partout — navigateur, Node, Workers, Deno).

### Étape critique : purger le cache

Vite cache le résultat du pré-bundling dans `node_modules/.vite/deps`.
La modif de `define` n'aura PAS d'effet tant que ce cache n'est pas
purgé :

```bash
rm -rf node_modules/.vite
make all
```

### Conséquence pour le PFE

À documenter dans la section "Limitations et difficultés d'ingénierie"
du mémoire — exemple concret de la friction entre :
- Modèles ML écrits pour Node.js
- Exécution en environnement navigateur via WebGL/WebGPU
- Bundlers modernes (Vite/esbuild) qui n'ont pas tous les polyfills par défaut

C'est typiquement le genre de problème qui ralentit les recherches
"AI in the browser" et qui justifie en partie pourquoi peu de travaux
benchmarkent ce contexte exact (voir section 8.6 du plan).

---

## S2 — Intégration Magenta + page de benchmark [décision] [ressource]

### Ce qui a été fait

- **`@magenta/music@1.23.1`** installé (tire `@tensorflow/tfjs@2.8.6`).
  À noter : Magenta n'a plus de release majeure depuis 2021, mais
  l'API publique est stable et les checkpoints publics fonctionnent
  toujours. Les `13 vulnérabilités` reportées par npm concernent des
  dépendances transitives (lodash, etc.) — pas bloquant pour un projet
  de recherche, à mentionner brièvement dans la section "limites" du
  mémoire.

- **`MagentaMusicRNNAdapter.ts`** conforme à `IMusicGeneratorAdapter` :
  - Variantes acceptées : `basic_rnn` (par défaut), `melody_rnn`, `attention_rnn`
  - Checkpoints chargés depuis le CDN Google Magenta
  - Warm-up systématique dans `init()` (un premier `continueSequence`
    pour amorcer TF.js avant la première mesure réelle — sinon le
    p95 serait pollué par le JIT du tout premier appel)
  - Primer rolling de 16 notes (fenêtre glissante)
  - Conversion `NoteSequence` ↔ `MidiEvent` propre

- **`vite.config.js`** : ajout de `@magenta/music` et `@tensorflow/tfjs`
  dans `optimizeDeps.include`. Anticipation : TF.js 2.x mélange ESM et
  CommonJS et Vite peut s'étrangler au premier import sinon. Le
  pré-bundling esbuild résout ça.

- **`bench-page.html` + `bench-page.ts`** : page navigateur autonome,
  servie par Vite. Protocole intégré (warmup 5 calls, mesure 60 calls,
  fenêtre 250 ms, balayage de température sur 5 valeurs). Affiche un
  tableau Markdown copiable directement collable ici.

### Comment lancer la mesure (à faire **sur ton M4 / Chrome**)

```bash
make all   # ou: npm run dev
```

Puis dans Chrome :

```
https://localhost:5179/src/Refactoring/ai/benchmark/bench-page.html
```

Accepter le certificat auto-signé, cliquer **Run benchmark**. Le bouton
exécute les 4 adapters l'un après l'autre :

1. Markov (baseline)
2. Magenta `basic_rnn` (~10 MB téléchargés depuis le CDN Google)
3. Magenta `melody_rnn` (~12 MB)
4. Magenta `attention_rnn` (~13 MB)

Durée totale estimée : **2–4 minutes** (1 init de ~1–3 s par modèle
Magenta + 60 mesures × 250 ms + balayage température).

À la fin, cliquer **Copier le markdown** → coller dans la section
"Résultats benchmark S2" ci-dessous.

### Critère de faisabilité (décision PFE)

- **p95 < 100 ms** sur le meilleur Magenta → on continue avec l'IA en local
- **p95 entre 100–200 ms** → on évalue au cas par cas (tier 1 reste viable mais
  bordeline pour la VR temps réel)
- **p95 > 200 ms** → bascule sur l'architecture serveur (tier 2) plus tôt
  que prévu dans le calendrier

### Résultats benchmark S2 — à remplir après exécution

```
(coller ici la sortie de la page de benchmark)
```

### Questions ouvertes après cette étape

1. Les modèles Magenta téléchargent leurs poids à chaque `init()` (pas
   de cache disque par défaut). À étudier : ajouter du cache via
   `CacheStorage` API pour éviter le coût répété en dev.
2. La mémoire `performance.memory` n'est dispo que dans Chrome ET
   demande parfois `--enable-precise-memory-info` pour les valeurs
   précises. À vérifier au premier run.
3. Si l'utilisateur du PFE tourne sous Safari un jour, TF.js WebGL
   peut avoir des comportements différents (pas critique vu qu'on
   cible Chrome).

---

## 2026-05-19 — Premier test de fumée Markov [mesure]

Le `MarkovChainAdapter.smoke.ts` tourne sur Node 22 / Mac M4. Résultats :

```
callCount            : 50
avgInferenceMs       : 0.0047 ms
p50InferenceMs       : 0.0025 ms
p95InferenceMs       : 0.0147 ms
p99InferenceMs       : 0.0608 ms
failureCount         : 0
```

### Observations
- **Latence sub-milliseconde** pour Markov. C'est attendu (pas de réseau
  de neurones), mais c'est utile comme **plancher de référence** pour
  comparer aux modèles Magenta en S2.
- **Densité observée = consigne** (4.00 notes/sec demandées, 4.00
  observées). Le contrôle de la densité fonctionne.
- **Cohérence des hyperparamètres** : les 4 paramètres déclarés
  (temperature, density, octaveCenter, pitchRange) sont accessibles via
  l'interface, le setter rejette correctement les valeurs hors plage et
  les noms inconnus.
- **Type-check global** : `npx tsc --noEmit` toujours propre, aucune
  régression sur le reste du projet (l'isolation dans `ai/` paie déjà).

### Implications pour la suite
- L'architecture adapter est validée end-to-end. On peut passer à un
  vrai adapter Magenta en S2 avec confiance que le contrat tient.
- La granularité de mesure (ns) est nettement suffisante pour Markov,
  donc largement suffisante pour Magenta (ms-scale).
- **`performance.memory` n'existe pas hors Chrome**. La mesure mémoire
  reste à zéro en CLI Node — ça marchera quand on bench depuis Chrome
  réel. À noter dans la doc du benchmark.

---

## 2026-05-19 — Initialisation du journal [décision]

Document créé. Convention adoptée : antichronologique, tags entre
crochets. Toutes les décisions techniques majeures, mesures, surprises
et blocages s'y consignent au fil de l'eau.

---

## Sections de référence

### Sources et papiers cités

À remplir au fil de la lecture. Format : nom, année, lien arxiv/DOI,
note d'une ligne sur la pertinence.

- (à venir)

### Bench results — par modèle

À remplir au mois 2 quand le banc d'essai produira ses premières lignes
CSV.

| Adapter | Charge (ms) | Latence moy. (ms) | Latence p95 (ms) | Empreinte mém. (MB) | Perplexité | Notes |
|---------|-------------|--------------------|------------------|---------------------|-----------|-------|
| (à venir)

### Lexique
- **Adapter** : implémentation d'un modèle génératif derrière l'interface
  commune `IMusicGeneratorAdapter`
- **Hyperparamètre** : variable de génération exposée au mapping (ex :
  température, densité, gamme)
- **Tier 1 / Tier 2** : modèles locaux navigateur (T1) vs serveur
  distant (T2)
- **GEMS** : Geneva Emotional Music Scale, utilisée pour mesurer
  l'émotion ressentie post-écoute
- **NASA-TLX** : échelle standard de charge mentale en HCI
