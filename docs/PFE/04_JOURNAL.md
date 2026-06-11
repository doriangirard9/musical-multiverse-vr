# Journal PFE — Le Chef d'Orchestre IA

Document vivant. Chaque entrée a une date, un titre, un contexte, ce qui
a été décidé/mesuré/découvert, et les questions ouvertes qui en
découlent. Le but : retracer la démarche scientifique au moment du
mémoire et de la soutenance.

> **Convention** : entrées par ordre antichronologique (les plus
> récentes en haut), tags `[décision]` `[mesure]` `[surprise]`
> `[blocage]` `[ressource]`.

---

## 2026-06-11 — Interop MIDI WAM (canal 0) + fix playhead Superformula 3D [décision]

### Bug : AIComposer batterie/mélodie muets sur guitarMIDI et DRM-16
Audit de TOUS les émetteurs MIDI de wamjamparty (Sequencer, Harp,
DrumPlateKit, DrumKit) : **tout le monde émet sur le canal 0** (`0x90`),
y compris DrumPlateKit qui pilote des WAMs de batterie. Notre variante
batterie émettait sur le canal 9 (convention GM canal 10) → les WAMs de
type DRM-16/drumsampler, qui mappent par numéro de note sur le canal 0,
ignoraient tout. **Fix : canal 0 pour tout** (les numéros de notes GM
36/38/42 suffisent aux drum machines).

Pour la mélodie→guitarMIDI : les octets émis sont identiques à ceux du
Sequencer (0x90/0x80, canal 0) et le chemin (`WamNode.scheduleEvents`)
est le même — pas de cause côté AIComposer identifiable hors VR. Ajout de
**diagnostics embarqués** pour trancher au prochain test :
- log console à chaque connexion/déconnexion MIDI (instanceId),
- log du 1er note-on émis puis tous les 50 (avec nb de connexions),
- écran : `♪ En jeu →N` (N = connexions) et **« ⚠ Sortie MIDI non
  câblée ! »** si play sans connexion.
Diagnostic différentiel : si l'écran affiche →1 et que les notes montent
mais silence → le WAM ne joue pas ce qu'on lui envoie (tester la même
chaîne avec le Sequencer pour confirmer) ; si →0 → problème de câblage.

### Bug : la boule du Superformula 3D « ne suit pas le chemin »
Quatre causes cumulées, toutes corrigées :
1. **Maillage sous-échantillonné** (48×24) : la boule suit la formule
   EXACTE mais la surface affichée était une approximation grossière —
   dès m>6 la boule flottait visiblement hors des facettes. → 96×48.
2. **Auto-rotation permanente** : la forme tournait sous la boule, le
   mouvement combiné était illisible. → rotation uniquement pendant le
   morphing (la forme « remue »), stable au repos.
3. **Traînée initialisée à l'origine** → trait parasite au centre. → la
   traînée démarre sur la boule (1re frame).
4. **Culling erratique** : wire (clone) et trail (lignes mises à jour par
   instance) gardaient une bounding info dégénérée jamais rafraîchie →
   disparitions selon l'angle de vue. → `alwaysSelectAsActiveMesh`.

### Leçon (mémoire)
L'interopérabilité MIDI entre générateurs et WAMs ne se joue pas que sur
le protocole (wam-midi/scheduleEvents) mais sur des conventions tacites :
canal d'écoute, gestion des timestamps futurs, mapping de notes. La
convention de l'écosystème hôte (ici : tout sur canal 0) prime sur la
norme générale (GM canal 10 batterie).

---

## 2026-06-10 — Shake VR réparé, redesign AIComposer, Superformula 3D [décision] [surprise]

### Bug : le shake-to-delete ne marchait pas DU TOUT en VR
Cause racine : `ShakeBehavior` écoutait `pointer.onMove` (rayon du pointeur),
un chemin d'input qui ne se déclenche pas pendant que `FullHoldBehaviour`
tient la boîte en VR. Fix dans `Node3DInstance` : la détection se base
désormais sur le **mouvement réel de la bounding box tenue** (observables
`onGrab/onMove/onRelease` du `HoldableBehaviour`) — si le drag marche, la
détection marche. 6 inversions de direction franches (≥5 cm d'amplitude,
fenêtre glissante 900 ms) suppriment, avec couleur blanc→rouge + message %.

### Surprise d'architecture : la bounding box avale les contrôles
La `BoundingBox` pickable ajoute une marge de **+0.1 unité MONDE en
profondeur** autour des meshes `addToBoundingBox`. Mes potards à z=0.28
local étaient entièrement à l'intérieur → le rayon frappait la boîte
invisible avant eux → impossibles à manipuler. L'idiome correct (déjà
utilisé par AudioPlaque/Superformula) : **plaque-poignée à l'arrière** dans
la bounding box, contrôles devant. Autre découverte : le spawn oriente
**+z loin du joueur** → la face interactive doit être en -z.

### Redesign AIComposer (console synthé)
- Châssis métal (seule cible de la BB) + panneau avant sombre face joueur,
  liserés lumineux couleur d'accent par variante (cyan mélodie, orange
  impro, rouge batterie, violet VAE).
- **Potards cylindriques rotatifs** (encoche -135°..+135°, bague colorée)
  sur tiges qui dépassent DEVANT la bounding box → manipulables en VR,
  et toujours câblables (couplage automatique paramètre↔automation).
- **Cœur IA lumineux = bouton play/stop** : vert prêt / ambre clignotant
  chargement / accent en jeu / rouge erreur ; **pulse à chaque note,
  synchronisé au temps AUDIBLE** (setTimeout sur timeSec - currentTime,
  pas à l'émission look-ahead) ; anneau orbital dont la vitesse suit
  l'activité.
- **Écran embarqué** (ADT) : nom du modèle, état, progression du
  chargement, valeurs des 5 potards, jauge de buffer look-ahead,
  compteur de notes, alerte lateEvents.
- `sendSignal` (vague colorée au sol) au démarrage.

### Superformula 3D (nouveau Node3D `superformula3d`)
Supershape de Gielis (produit sphérique de 2 superformules), même rôle que
le 2D : contrôleur d'automation. Mesh updatable 49×25 sommets :
- **Morphing lissé** : les knobs écrivent une CIBLE, les paramètres
  courants glissent vers elle à chaque frame → la surface se déforme
  fluidement (pas de saut).
- Couleurs par rayon (violet→cyan), surcouche wireframe qui s'intensifie
  pendant le morphing, cage 12 arêtes qui pulse, auto-rotation qui
  accélère pendant le morphing.
- Playhead en spirale (θ, φ incommensurables) + traînée fondante ;
  **8 métriques 3D** en automation : posX/Y/Z (Z est nouveau vs 2D),
  rayon, Δrayon, vitesse, accélération, courbure.
- 8 knobs math (2 profils A/B) + échelle + vitesse + resize + passthrough
  audio. Enregistré dans Node3DBuilder + menuConfig.

### Fichiers
- `node3d/instance/Node3DInstance.ts` — détection de secouage via holdable.
- `node3d/subs/ai/AIComposerN3D.ts` — réécriture GUI + feedback.
- `node3d/subs/behaviours/Superformula3DN3D.ts` — NOUVEAU.
- `app/Node3DBuilder.ts`, `xr/menuConfig.json` — enregistrement.

### À tester en VR
1. Secouer un instrument tenu → % monte, boîte rougit, suppression à 100 %.
2. AIComposer : tourner les potards à la main, lancer via le cœur,
   vérifier pulse par note + écran (buffer, notes).
3. Superformula 3D : tourner les knobs → morphing fluide ; câbler
   posX/posY/posZ vers température/densité d'un AIComposer.

---

## 2026-06-08 — UX VR : potards IA directs + suppression revue [décision]

### Contexte
Retour d'usage : (1) les hyperparamètres IA (température/densité) n'étaient
QUE des entrées d'automation (câblables) — impossible de les régler à la main
en VR, et leur valeur n'était pas lisible ; (2) la seule façon de supprimer
un instrument était de secouer sa boîte ~5 s, geste non découvrable et
déclenchable par accident.

### Potards IA directement contrôlables + valeur affichée
- Les 2 premiers hyperparamètres du modèle deviennent des **potards
  `createParameter`** (sphères façade) : directement tournables en VR.
  RNN → température + densité ; VAE → température + morph.
- Subtilité d'archi : l'host couple AUTOMATIQUEMENT chaque paramètre à un
  point d'automation sur le **même mesh** (`Node3DInstance.createParameter`).
  Donc « directement contrôlable » ET toujours câblable pour le chef
  d'orchestre, sans mesh supplémentaire ni encombrement.
- **Panneau de valeurs permanent** au-dessus de l'instrument (plan billboard
  + `AdvancedDynamicTexture`) : affiche en continu température, densité/morph,
  tempo, vélocité, horizon. Mis à jour à chaque changement (`refreshStatus`).
- `setHyperparameter` met en cache même avant `init()` (poussé au worker à
  l'init) → régler un potard avant le play fonctionne.

### Suppression revue (infra partagée — TOUS les Node3D)
- Geste de secouage conservé (choix utilisateur) mais rendu **découvrable et
  progressif** dans `Node3DInstance` :
  - message d'invite « Secoue pour supprimer… NN% »,
  - couleur de la boîte blanc → rouge proportionnelle à l'avancement,
  - seuil raccourci (`DELETE_SHAKE_TICKS = 4`, ~1.6 s) + garde anti-double.
- Évite les suppressions accidentelles (il faut secouer franchement, avec
  feedback clair de ce qui va arriver).

### Fichiers
- `node3d/subs/ai/AIComposerN3D.ts` : GUI (potards façade + panneau billboard),
  logique (knobs hyperparamètres, `refreshStatus`, sync).
- `node3d/instance/Node3DInstance.ts` : handlers `on_start/on_shake/on_stop`.

### À tester en VR
Tourner les potards (valeur visible ?), secouer pour supprimer (feedback +
seuil OK ?), vérifier que le câblage AudioPlaque→potard marche toujours.

---

## 2026-06-05 — Famille 2 : MusicVAE (espace latent) + architecture multi-modèle [décision]

### Objectif
Ajouter la Famille 2 (modèles à espace latent) — l'idée chef d'orchestre la
plus prometteuse : le geste = position dans l'espace latent = morphing continu.

### MusicVAEAdapter
- `mel_2bar_small`. À l'init : 2 phrases-ancres aléatoires → leurs vecteurs
  latents zA, zB. Hyperparamètre `morph` (0..1) interpole : décoder
  lerp(zA, zB, morph) → une phrase qui morphe entre A et B.
- requestNext décode une phrase 2-mesures au morph courant ; le scheduler
  bufferise. Changement de morph → effet à la phrase suivante (bufferisé,
  cohérent avec le modèle deux-latences).
- Hyperparamètres VAE : température (diversité) + morph.

### Refactor pour le multi-modèle
- `ai/hyperparams.ts` : specs PURES (RNN_HYPERPARAMS, VAE_HYPERPARAMS), sans
  import Magenta → importable côté main thread sans tirer TF.js.
- `ai/adapters/noteConversion.ts` : conversion notes→MidiEvent partagée
  (polyphonie, repliement de hauteur), utilisée par RNN et VAE.
- Worker : dispatch par `modelType` (music_rnn | music_vae).
- WebWorkerAdapter : `modelType`, capabilities (hyperparamètres) selon le type.
- AIComposerN3D : entrées d'automation GÉNÉRIQUES — câble les 2 premiers
  hyperparamètres du modèle (RNN→temp+densité, VAE→temp+morph) en lisant les
  specs depuis capabilities. Plus rien de codé en dur.

### Instrument ajouté
`ai_composer_vae` — "AI Composer — Latent (VAE)". Le potard/entrée MORPH
morphe la musique entre deux phrases.

### À tester (run de Yassine)
- VAE → câbler vers Pro54, play. Une phrase mélodique doit sortir.
- Câbler AudioPlaque.Y → morph, bouger : la musique doit MORPHER (caractère
  qui change continûment) à chaque nouvelle phrase.
- vite.config a changé (music_vae) → `rm -rf node_modules/.vite` avant test.

---

## 2026-06-04 — Plusieurs instruments Famille 1 + support polyphonie [décision]

### Objectif
Exposer plusieurs modèles de continuation de séquence (Famille 1) comme
instruments distincts dans WamJamParty. Tous partagent la classe Magenta
`MusicRNN` → un checkpoint = un instrument.

### Pré-requis technique : polyphonie
melody_rnn et chord_pitches_improv sont monophoniques, mais drum_kit_rnn est
POLYPHONIQUE (kick+hihat au même step). L'émission d'événements monophonique
(note-on/off séquentiels) cassait sur les notes simultanées.

→ Refonte de `MagentaMusicRNNAdapter` :
- `recentNotes` passe en **steps absolus** (startStep/endStep explicites) →
  supporte les notes simultanées dans le primer.
- Émission **événementielle triée** : on éclate chaque note en (on@start,
  off@end), on trie tous les événements par step (off avant on à step égal),
  puis deltaMs = écart depuis l'événement précédent. Gère mono ET polyphonie.
- `buildQuantizedPrimer` re-normalise sur 0 en préservant les positions
  relatives (polyphonie conservée), `isDrum` selon le mode.

### Instruments ajoutés (4 variantes AIComposerN3DFactory)
| Kind | Checkpoint | Type | Canal |
|------|-----------|------|-------|
| `ai_composer` | melody_rnn | mélodie tonale | 0 |
| `ai_composer_basic` | basic_rnn | mélodie neutre (comparaison) | 0 |
| `ai_composer_improv` | chord_pitches_improv | mélodie sur accords (Do) | 0 |
| `ai_composer_drums` | drum_kit_rnn | batterie polyphonique | 9 (GM) |

Mode batterie : pas de repliement de hauteur (le pitch = type de fût),
seed = petit beat rock, primer plus grand (24, car polyphonique), sortie
sur canal MIDI 10.

Enregistrés dans Node3DBuilder + menuConfig (mélodie/impro/batterie visibles
en VR ; basic réservé au benchmark).

### À tester (run de Yassine)
- Mélodie/Impro → câbler vers Pro54.
- Batterie → câbler vers un drum kit WAM (wam3d-Drum). Vérifier qu'un beat
  cohérent (kick/snare/hihat) sort, pas du bruit.
- L'émission triée ne doit pas régresser la mélodie (mono = même résultat).

---

## 2026-06-04 — Notes "au hasard" : 6 bugs de génération corrigés [surprise] [décision]

### Symptôme
La musique générée semble aléatoire — ni harmonie ni rythme.

### Diagnostic (6 bugs dans MagentaMusicRNNAdapter)

1. **deltaMs faux (rythme)** — le `note-on` mesurait l'écart depuis le DÉBUT
   de la note précédente, mais le `note-off` avait déjà avancé le temps de la
   durée → double comptage → rythme étiré et irrégulier. C'était le pire.
2. **Primer en secondes + réalignement (cohérence)** — mélange secondes/
   quantification ; au tronquage, réalignement des startTime → notes
   désalignées/superposées → primer corrompu → génération incohérente.
3. **Filtrage de tessiture qui SUPPRIME des notes (rythme)** — trous dans la
   grille.
4. **Double comptage du contexte** — `absorbContextNotes` ré-injectait les
   notes que l'adapter avait déjà générées (le scheduler les repasse).
5. **Chunks de 2 steps** — le modèle n'avait pas la place de former une phrase.
6. **Seed = 1 note** — aucun contexte tonal de départ.

### Corrections
- **Primer en unités de STEP** (`recentNotes: {pitch, durationSteps}[]`),
  reconstruit propre à chaque appel via `buildQuantizedPrimer()` — zéro
  conversion secondes↔quantification.
- **deltaMs séquentiels corrects** : on suit `prevStep`, note-on delta =
  `(start - prevStep)`, note-off delta = `(end - start)`. Le scheduler
  reconstruit alors les bons temps absolus.
- **foldIntoRange** : les hauteurs hors tessiture sont REPLIÉES par octaves
  (préserve la classe de hauteur → l'harmonie) au lieu d'être supprimées.
- **Contexte ignoré** par l'adapter Magenta : il possède sa propre mémoire,
  plus de double comptage.
- **stepsToGen ≥ 4** (plancher), borné à 24, + un peu de densité (sans
  explosion de calcul comme avant).
- **Seed = motif Do majeur C-D-E-G** → contexte tonal.

### À écouter (run de Yassine)
Rejouer le patch AudioPlaque → AIComposer → Pro54. Attendu : mélodie
**cohérente et rythmée** (vraies croches/noires sur la grille), tonalité
audible. Bouger la température (X) doit aller de répétitif (bas) à aventureux
(haut) ; la tessiture/octave doit transposer proprement sans trouer le rythme.

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

## 2026-06-03 — WASM n'a pas le kernel Multinomial → backend CPU [mesure] [décision]

### Symptôme
Worker chargé, modèle initialisé, mais l'inférence (warm-up continueSequence)
échoue : `Error running Multinomial: Neither modular kernel nor forward func
passed` dans MusicRNN.sampleRnn → multinomial_.

### Cause
Le backend **WASM** de TF.js 2.8.6 (2020) a une couverture de kernels
INCOMPLÈTE. `Multinomial` (tirage softmax au cœur du sampling RNN) n'est PAS
implémenté en WASM à cette version.

Vérification par grep des backends installés :
| Backend | Multinomial |
|---------|-------------|
| WASM    | ✗ absent |
| CPU     | ✓ présent |
| WebGL   | ✓ présent |

→ WASM est une IMPASSE pour MusicRNN à cette version. (C'est aussi pour ça
que le run #3 du benchmark, qui tournait en WebGL sur le main thread,
marchait : WebGL a le kernel.)

### Décision : backend CPU dans le worker

CPU a la couverture complète. Surtout : **même lent, l'inférence CPU tourne
dans le WORKER → ne bloque plus le main thread**. C'est l'hypothèse centrale
à tester : le off-main-thread suffit-il indépendamment de la vitesse du
backend ? Le scheduler look-ahead absorbe la latence.

Backend rendu **configurable** (WebWorkerAdapter.backend, défaut "cpu") pour
pouvoir comparer cpu/wasm sans recoder. WebGL+OffscreenCanvas reste l'option
de repli si CPU est trop lent (lateEvents qui montent).

### Finding mémoire
Couverture de kernels variable selon le backend TF.js = contrainte réelle
pour "AI in the browser". Le choix du backend n'est pas qu'une question de
vitesse : c'est d'abord une question de COMPLÉTUDE FONCTIONNELLE. WASM
2.8.6, séduisant pour le worker, est inutilisable ici faute de Multinomial.
Trade-off à documenter : CPU (complet, lent, worker-friendly) vs WebGL
(complet, rapide, nécessite OffscreenCanvas en worker) vs WASM (incomplet).

### À mesurer (run de Yassine)
Backend CPU dans le worker. Regarder le PerfMonitor :
1. `backend=cpu`, plus d'erreur Multinomial
2. **frame MAX du main thread** : reste-t-il bas (< 25 ms) malgré la lenteur
   CPU ? → si oui, le off-main-thread fonctionne, le lag VR est résolu
3. **latence d'inférence CPU** (avgInferenceMs) : 200 ms ? 500 ms ? 1 s ?
4. **lateEvents** : si > 0, CPU trop lent pour l'horizon → augmenter
   l'horizon (potard) ou passer à WebGL

---

## 2026-06-03 — `Cannot use offline audio context in a web worker` [surprise] [blocage]

### Symptôme
Après le fix `window`, nouvelle erreur au chargement du worker :
`Cannot use offline audio context in a web worker` (magenta:16142, appelé
au top-level 45774).

### Cause
`import * as mm from "@magenta/music"` (le barrel COMPLET) tire TOUT :
gansynth, ddsp, spice, transcription, players SoundFont… Plusieurs de ces
modules importent `core/audio_utils.js`, qui fait AU TOP-LEVEL (ligne 8) :
```js
const offlineCtx = getOfflineAudioContext(SAMPLE_RATE);
```
→ création d'un OfflineAudioContext au chargement du module → impossible
dans un worker → crash.

On n'a besoin QUE de MusicRNN (génération MIDI symbolique, zéro audio).

### Investigation (cartographie des imports)
- `audio_utils` n'est importé que par : spice, transcription, gansynth, ddsp.
- AUCUNE dépendance de music_rnn ne le touche : data, aux_inputs, chords,
  melodies, logging, performance, constants, sequences → 0 référence.
- `core/sequences` n'importe que protobuf + constants. Propre.

### Fix : imports ciblés (sous-modules, pas le barrel)
Dans MagentaMusicRNNAdapter :
```ts
import { MusicRNN } from "@magenta/music/esm/music_rnn";
import * as sequences from "@magenta/music/esm/core/sequences";
import type { INoteSequence } from "@magenta/music/esm/protobuf";
```
Dans le worker : `import * as tf from "@tensorflow/tfjs"` (au lieu de mm.tf).
vite.config optimizeDeps : sous-modules au lieu de `@magenta/music`.

Avantage bonus : bundle BEAUCOUP plus léger partout (main thread inclus),
plus de gansynth/ddsp/spice inutiles embarqués.

### Finding mémoire (important)
Les libs ML "tout-en-un" (Magenta) initialisent de l'audio (OfflineAudio
Context, players) AU CHARGEMENT du barrel, même si on ne veut que
l'inférence symbolique. Pour du off-main-thread, il FAUT importer les
sous-modules feuilles (tree-shaking manuel) pour éviter ces effets de bord.
C'est une friction "AI in the browser / worker" concrète et chiffrable
(taille du bundle, modules évités), à documenter.

### Cache
Changement de vite.config → `rm -rf node_modules/.vite` avant de relancer.

---

## 2026-06-03 — `window is not defined` dans le worker [surprise] [blocage]

### Symptôme
Au play : pas de son. Console : `Uncaught ReferenceError: window is not
defined` à @magenta_music.js:16150, propagé par le worker.onerror.

### Cause
Magenta référence `window` au CHARGEMENT du module. Les Web Workers n'ont
pas `window` (ils ont `self`/globalThis). Dès l'import de Magenta dans le
worker → crash → worker jamais chargé → pas de son.

Même famille que le `global is not defined` du bench (Node→browser), mais
ici browser-main→worker.

### Fix
Module `worker-polyfill.ts` qui fait `globalThis.window = globalThis`,
importé EN PREMIER dans ai-worker.ts (avant Magenta). Les imports ES étant
hoistés, on ne peut pas faire ce setup dans le même fichier avant l'import
Magenta — d'où le module séparé importé en tête (l'ordre source des imports
garantit qu'il s'exécute avant).

Pas de `define: { window: 'globalThis' }` dans Vite : ça casserait le
feature-detection (`typeof window === 'undefined'`) dans le bundle principal
et Babylon. Le polyfill ciblé worker est plus sûr.

### Finding mémoire
Faire tourner une lib ML grand public (Magenta) dans un worker exige de
polyfiller les globals navigateur qu'elle suppose présents (`global`,
`window`). C'est une friction récurrente "AI in the browser / off-main-
thread" rarement documentée → matière pour la section difficultés
d'ingénierie.

---

## 2026-06-03 — WebWorkerAdapter + instrumentation perf [décision] [ressource]

### Solution au lag : inférence dans un Web Worker

`WebWorkerAdapter` (main thread, implémente IMusicGeneratorAdapter) délègue
toute l'inférence à `ai-worker.ts` (worker thread). Le main thread reste
libre → rendu VR fluide.

**Élégance de l'adapter pattern** : le scheduler et l'AIComposerN3D ne
changent PAS. On échange juste `new MagentaMusicRNNAdapter(...)` contre
`new WebWorkerAdapter(...)`. Le worker, lui, réutilise le
MagentaMusicRNNAdapter TEL QUEL. Aucune logique de génération dupliquée.

### Backend WASM

- `@tensorflow/tfjs-backend-wasm@2.8.6` installé (matche tfjs 2.8.6 de
  Magenta). `tfjs-core@2.8.6` dédupliqué → la registration WASM est visible
  par l'instance TF.js de Magenta (mm.tf).
- Le worker force `mm.tf.setBackend("wasm")`. Choisi car WASM tourne dans un
  worker sans OffscreenCanvas (contrairement à WebGL). Si trop lent →
  WebGL+OffscreenCanvas en itération suivante.
- Binaires WASM servis depuis le CDN jsdelivr (setWasmPaths) pour éviter les
  soucis de chemin Vite.

### Protocole worker

requestId → resolver. init / requestNext renvoient des promesses résolues
quand le worker répond. setHyperparameter est fire-and-forget (caché côté
main pour getHyperparameter synchrone + posté au worker).

### Instrumentation : PerfMonitor

Métrique CLÉ = **frame times du main thread**. Un gel de 150 ms (inférence
main-thread) = frame max 150 ms + janky frames. En worker, frame max doit
s'effondrer vers ~16-20 ms → preuve directe du gain.

PerfMonitor hooke onBeforeRenderObservable, accumule les deltas, et logge
toutes les 2 s une ligne consolidée :
- RENDU : fps, frame avg/p95/MAX, janky(>33ms)
- INFÉRENCE : backend, latence avg/p95/p99, nb appels
- FLUX : notes générées/jouées, profondeur buffer, retards, lowBuf

SchedulerStats étendu : notesGenerated + notesPlayed.

### Comparaison attendue (à mesurer par Yassine)

| | Main thread (avant) | Worker WASM (après) |
|---|---------------------|---------------------|
| frame MAX | ~150 ms (gèle) | ~16-25 ms (fluide) |
| janky frames | élevé | ~0 |
| latence inférence | ~150 ms | possiblement + (WASM < WebGL) mais SANS bloquer |

Le point clé : même si l'inférence WASM est plus lente que WebGL, elle ne
bloque plus le rendu. Le scheduler (horizon 0.5 s) absorbe la latence.

### À tester (run de Yassine)

Patch AudioPlaque → AIComposer → Pro54 comme avant. Au play, regarder la
console : les lignes `[PerfMonitor]`. Vérifier :
1. `backend=wasm` à l'init
2. **frame MAX bas (< 25 ms)** et **janky ~0** même pendant la génération
   → le lag VR a disparu
3. Bouger l'AudioPlaque (densité) ne fait plus chuter les FPS
4. notes générées ≈ notes jouées (le flux est consommé)
5. Comparer la latence WASM affichée à celle du benchmark WebGL (run #3,
   ~154 ms sous charge) → nouveau finding

Si WASM est trop lent (latence > horizon, lateEvents montent) → augmenter
l'horizon ou passer à WebGL+OffscreenCanvas.

---

## 2026-06-03 — BLOCAGE : TF.js gèle le thread principal [surprise] [blocage]

### Symptôme

AIComposer validé dans le monde VR : le son sort de Pro54, génération
parfaite, câblage AudioPlaque→température/densité fonctionne. MAIS dès que
le modèle tourne, le WamJamParty **lague fortement**. Et ça empire à mesure
que X (température) et surtout Y (densité) augmentent.

### Diagnostic

**TF.js exécute l'inférence sur le THREAD PRINCIPAL.** Le RNN tourne sur le
GPU (WebGL) mais l'orchestration JS + le download des tenseurs GPU→CPU
bloquent le main thread ~100-150 ms par génération. Ce thread est partagé
avec :
- boucle de rendu Babylon (16 ms/frame à 60 fps)
- rendu XR (11 ms/frame à 90 fps sur Quest)
- traitement audio des WAM

→ chaque génération gèle le rendu ~100-150 ms = frames sautées = lag VR.

### Pourquoi ça empire avec la densité (Y)

density ↑ a un DOUBLE effet aggravant :
1. plus de notes/génération → buffer se vide plus vite → générations plus
   FRÉQUENTES
2. `stepsToGen = baseSteps × (density/2)` → chaque génération plus LONGUE
   (plus de pas RNN à calculer)

La température (X) seule ne change pas le coût de calcul → c'est bien la
densité le coupable. Confirme la nature "compute-bound sur main thread"
du problème.

### Le scheduler look-ahead ne résout PAS ça

Important : le scheduler résout le problème de TIMING (les notes sortent au
bon moment malgré la latence). Mais il n'empêche pas le BLOCAGE du thread :
quand `requestNext` tourne dans `generateMore()`, c'est du JS synchrone sur
le main thread qui gèle le rendu, scheduler ou pas. Le scheduler masque les
trous AUDIO, pas les trous VISUELS.

### Solutions (par ordre de propreté)

1. **Web Worker** (LA solution) : faire tourner Magenta/TF.js dans un worker
   thread. Le main thread reste libre pour le rendu. Défis :
   - TF.js WebGL en worker nécessite OffscreenCanvas
   - Communication worker↔main par messages (sérialiser les MidiEvent)
   - L'adapter devient async-over-postMessage → un nouvel adapter
     `WebWorkerAdapter` qui wrappe n'importe quel adapter dans un worker
   - S'intègre PARFAITEMENT à l'adapter pattern : c'est juste un adapter
     qui délègue à un worker.
2. **Throttle de densité** : caper stepsToGen, générer par plus gros chunks
   moins souvent (réduit la fréquence mais pas la durée du gel → palliatif).
3. **Backend WebGPU** de TF.js : potentiellement moins bloquant, à
   benchmarker.
4. **Tier 2 serveur** : déplacer l'inférence hors navigateur (déjà prévu
   comme extension). Le serveur ne bloque jamais le rendu VR.

### Décision

Le **WebWorkerAdapter** est la prochaine grosse tâche. Il valide aussi
élégamment l'adapter pattern : on enveloppe melody_rnn dans un worker sans
toucher au scheduler ni à l'AIComposerN3D. C'est un finding fort pour le
mémoire : "AI in the browser" pour de la VR temps réel EXIGE le threading,
sinon le rendu et l'inférence se battent pour le main thread. Peu de
travaux le mesurent dans ce contexte précis (cf section 8.6 du plan).

### Étape validée malgré tout

La chaîne Couche A → audio fonctionne dans le monde VR, et la synergie
contrôleurs→IA est démontrée. Le lag est un problème de PERFORMANCE
(threading), pas d'ARCHITECTURE. L'archi est bonne ; il faut juste sortir
l'inférence du main thread.

---

## 2026-06-02 — AIComposerN3D : l'IA entre dans le monde VR [décision]

### Premier instrument IA intégré

`node3d/subs/ai/AIComposerN3D.ts` — encapsule adapter melody_rnn +
MidiLookaheadScheduler dans un Node3D câblable dans le monde.

### Réutilisation de l'existant (exigence respectée)

- **Sortie MIDI** : `MidiN3DConnectable.ListOutput` natif. Le scheduler
  envoie les événements via `scheduleEvents()` à tous les WAM câblés en
  aval — EXACTEMENT le pattern du SequencerN3D (vérifié : SequencerN3D.ts
  ligne 234, `for(const cn of this.midi_output.connections) cn.scheduleEvents(...)`).
  Donc l'AIComposer se câble nativement à Pro54 dans le monde, comme
  n'importe quel générateur MIDI.

### La synergie réalisée

Entrées d'automation `température` et `densité` (AutomationN3DConnectable
.Input). L'AudioPlaque et la Superformula SORTENT déjà des signaux 0..1.
→ On peut câbler `AudioPlaque.X → AIComposer.température` et diriger l'IA
avec la balle, AVANT toute capture gestuelle. Démo intermédiaire.

### Mapping des deux latences, concrètement

| Contrôle | Câblage | Latence |
|----------|---------|---------|
| température, densité | entrées automation (depuis AudioPlaque/etc.) | bufferisée (~horizon) |
| tempo, vélocité | potards locaux → scheduler (drain) | immédiat |
| horizon | potard local | règle le buffer |

### Init paresseux

L'adapter télécharge son checkpoint (~qq s). Init au PREMIER play, pas au
spawn (sinon tout spawn bloquerait). Bouton play : vert=prêt,
jaune=chargement, rouge=en cours, rouge foncé=erreur. Message
"Chargement du modèle IA…" affiché pendant.

### Enregistrement

- `Node3DBuilder` : kind `ai_composer` → `AIComposerN3DFactory.MELODY`
- `menuConfig.json` : entrée "AI Composer" dans Instruments
- Type-check global propre.

### À tester (prochain run de Yassine)

Patch de démo à monter dans le monde VR :
```
AudioPlaque ──X(auto)──► AIComposer ──MIDI──► Pro54 ──audio──► AudioOutput
                              ▲
            Superformula.radius┘ (densité, optionnel)
```
1. Spawn AIComposer + Pro54 + AudioOutput
2. Câbler AIComposer.MIDI → Pro54.MIDI-in, Pro54.audio → speaker
3. Appuyer play sur l'AIComposer → modèle charge → musique sort de Pro54
4. Spawn AudioPlaque, câbler X → AIComposer.température
5. Bouger la balle → entendre le caractère de la musique changer (avec
   ~horizon de retard, normal)
6. Tourner les potards tempo/vélocité → changement immédiat

→ Si ça marche : chaîne complète Couche A → audio validée DANS le monde
VR, et la synergie contrôleurs→IA démontrée. Prêt pour la capture
gestuelle (Couche C) qui se câblera aux mêmes entrées.

---

## 2026-06-02 — VALIDATION scheduler sur Pro54 : architecture confirmée [mesure] [décision]

### Résultats (4 min, melody_rnn primer 8, branché sur Pro54 réel)

```
generationCalls : 509
scheduledEvents : 989
lateEvents      : 2      (uniquement après stress-test extrême)
lowBufferTicks  : 406
bufferDepthSec  : 0.460 s
adapter p95     : 154.1 ms
adapter p99     : 208.0 ms
```

À l'oreille : **son parfaitement continu**, aucun trou. Tempo et vélocité
réagissent instantanément. Température réagit avec ~horizon de retard
(attendu, bufferisé).

### Verdict : ARCHITECTURE LOOK-AHEAD VALIDÉE

- **lateEvents = 0 à réglages normaux** même quand l'adapter p99 monte à
  208 ms → le buffer absorbe bien les pics GC. C'était LA preuve attendue.
- Les 2 lateEvents ne sont apparus QU'APRÈS avoir poussé l'horizon à
  0.10 s + maxé tempo/vélocité/température.

### Le "glitch" est une confirmation, pas un échec

Horizon 0.10 s < p95 du modèle 0.154 s. On ne peut PAS générer plus vite
que le modèle ne tourne. Si horizon < latence_génération, le buffer DOIT
finir par se vider — impossibilité physique, pas bug. 2 lateEvents sur
989 (0.2 %) dans ces conditions cassées = amorti par le chunk multi-notes.

### RÈGLE DE CONCEPTION (publiable)

> **Horizon minimal viable ≈ p95 de latence du modèle SOUS CHARGE.**

Horizon sûr ≈ 2-3× la p95. Avec p95 ≈ 154 ms → horizon 0.5 s = ~3× =
marge confortable. Valide le défaut 0.5 s. En dessous de la latence du
modèle → glitches inévitables. Façon principielle de régler l'horizon.

### Finding : latence sous charge ≈ +50 % vs benchmark isolé

| Contexte | melody_rnn p95 |
|----------|----------------|
| Benchmark isolé (run #3) | 102 ms |
| Sous charge (Pro54 + audio + UI) | 154 ms |

→ **La vraie latence d'usage est celle sous charge.** Le benchmark isolé
sous-estime de ~50 %. À mentionner dans le mémoire : toujours mesurer en
conditions d'usage, pas seulement en isolation. (Renforce la leçon du
run #1/#2 sur les benchmarks trompeurs.)

### Note : lowBufferTicks = 406 mais 0 échec réel

Buffer descendu en zone d'alerte (< scheduleAheadSec 0.1 s) sur ~4 % des
ticks (~9600 ticks sur 4 min) — surtout pendant le stress-test à 0.10 s
et au démarrage. Au régime stable : bufferDepthSec 0.46 s ≈ horizon =
sain. La marge fonctionne. Levier si besoin un jour : augmenter
generationChunkMs (250 → 500) pour des chunks de sécurité plus gros.

### Synergie repérée pour la suite

Le `AIComposerN3D` (Node3D à venir) exposera ses hyperparamètres
(température, densité) comme ENTRÉES d'automation. Or l'AudioPlaque et la
Superformula déjà construites SORTENT des signaux d'automation 0..1.
→ On pourra **diriger l'IA avec la balle de l'AudioPlaque ou la courbe de
la Superformula AVANT même d'avoir la capture gestuelle**. Démo
intermédiaire puissante qui réutilise tout l'existant.

---

## 2026-06-02 — Architecture look-ahead : découplage génération/lecture [décision]

### Le problème résolu

Run #3 a montré : latence Magenta ~100 ms (p95) + pics GC jusqu'à 300 ms
(p99). Trop pour un appel-par-note dans le chemin audio. Solution : un
**scheduler look-ahead** qui découple deux horloges.

### Décision d'architecture (centrale pour le PFE)

Le `MidiLookaheadScheduler` introduit une séparation entre :
- **Temps de génération** : le modèle produit en avance dans un buffer
- **Temps de lecture** : le transport draine le buffer aux temps précis

Pattern "A Tale of Two Clocks" (Chris Wilson, 2013) : boucle JS grossière
(tick 25 ms) qui programme sur l'horloge audio précise (AudioContext).

### Le geste pilote DEUX choses à DEUX latences

| Domaine | Gestes (chef) | Latence | Implémentation |
|---------|---------------|---------|----------------|
| Hyperparamètres | main gauche (température, densité, gamme) | = horizon buffer (~500 ms) | passés à l'adapter, affectent la génération FUTURE |
| Post-génération | main droite (tempo, dynamique, accent) | ≈ 0 | appliqués AU DRAIN, ne passent pas par le modèle |

**Insight musicalement authentique** : la main droite du chef (baguette =
articulation/dynamique immédiate) tombe sur les contrôles à latence nulle ;
la main gauche (façonnage du caractère, anticipé) tombe sur les
hyperparamètres bufferisés. La double latence n'est pas un compromis subi,
elle est **isomorphe à la cognition de la direction d'orchestre**. → À
argumenter dans le mémoire comme contribution de conception.

### Choix techniques retenus

- **Horizon de génération configurable et jouable** (champ public
  `horizonSec` + `setHorizonSec`, slider dans la page de test). Défaut
  0.5 s ≈ 1 mesure à 120 BPM. L'utilisateur peut le régler ; ça devient
  potentiellement un hyperparamètre exposé au mapping.
- **Timing musical relatif dans le buffer** : les événements sont stockés
  en deltaMs au tempo nominal, le temps audio absolu est calculé au drain
  avec tempoScale → **tempo ET vélocité immédiats** (appliqués au drain,
  pas pré-calculés). C'est plus propre que stocker des temps absolus.
- **scheduleCallback découplé** (adapter pattern, comme demandé) : le
  scheduler ignore Pro54, on lui injecte la fonction de programmation.
  Testable avec un mock, branchable sur Pro54 en prod, réutilisable.
- **Branchement Pro54 seul** (pas d'effet dans la chaîne) pour isoler la
  validation du scheduler.

### Métriques de validation (dans SchedulerStats)

- `lateEvents` : événements programmés dans le passé = glitch audible.
  **Critère de succès : doit rester à 0.** C'est LA preuve que le buffer
  masque les pics GC.
- `lowBufferTicks` : ticks où le buffer est tombé sous scheduleAheadSec
  (risque de sous-alimentation).
- `bufferDepthSec` : profondeur courante.

### Fichiers livrés

- `ai/scheduler/MidiLookaheadScheduler.ts` — composant pur
- `ai/scheduler/scheduler-test-page.{ts,html}` — validation sur Pro54 réel
  avec sliders (horizon, tempo, vélocité, température) + choix du modèle

### À mesurer (prochain run de Yassine)

Lancer la page, démarrer avec melody_rnn, laisser tourner plusieurs
minutes en bougeant les sliders. Vérifier :
1. **lateEvents reste à 0** même quand l'adapter p99 monte à 300 ms
   → le buffer absorbe bien les pics GC
2. Le **son est continu** (pas de trou à l'oreille)
3. Tempo/vélocité **réagissent instantanément**
4. Température réagit avec un **retard ≈ horizon** (normal, bufferisé)
5. Réduire l'horizon à 0.15 s → voir apparaître des lateEvents (preuve
   que l'horizon protège bien, et qu'il y a un plancher)

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
