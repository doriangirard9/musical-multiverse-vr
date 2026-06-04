# PFE — Le Chef d'Orchestre IA

**Approche A : modulation continue par gestes d'un flux musical génératif**

*Document de cadrage à destination des deux encadrants. Version 2 —
intègre une phase de benchmark empirique des modèles et une architecture
extensible (local navigateur + serveur distant).*

---

## 1. Vue d'ensemble en une phrase

Construire un système VR où **un modèle d'IA musicale génère en continu
un flux MIDI** que **l'utilisateur sculpte en temps réel par ses gestes
des deux mains**, en s'inspirant de la métaphore du chef d'orchestre :
l'IA joue les notes, l'humain dirige.

Le système est conçu pour accueillir **plusieurs modèles
interchangeables** via un *adapter design pattern*, et un **benchmark
empirique** est mené avant l'étude utilisateur pour justifier
quantitativement le modèle retenu.

---

## 2. Question de recherche et hypothèses

### Question principale

> **Une interface gestuelle VR qui module en continu un flux musical
> généré par IA permet-elle à des utilisateurs non-musiciens d'atteindre
> un sentiment d'expressivité musicale supérieur à celui obtenu avec un
> contrôleur traditionnel (clavier/potards MIDI), tout en produisant un
> résultat sonore jugé d'au moins équivalente qualité par des auditeurs
> externes ?**

### Hypothèses testables

- **H1 (expressivité)** : sur les échelles GEMS-9 et l'échelle
  d'agentivité de Tapal et al. (2017), les participants en condition
  « chef d'orchestre VR » rapporteront des scores significativement plus
  élevés (p < 0.05, N ≥ 20) qu'en condition contrôleur MIDI, à contenu
  IA équivalent.

- **H2 (qualité perçue)** : des auditeurs externes naïfs (N ≥ 30,
  écoute aveugle, paires A/B) ne sauront pas distinguer significativement
  la qualité musicale des deux conditions — c'est-à-dire que l'interface
  gestuelle ne *dégrade* pas la qualité musicale.

- **H3 (charge cognitive)** : la charge cognitive mesurée par NASA-TLX
  sera comparable entre les deux conditions.

Si H1 est confirmée *et* H2 et H3 ne sont pas réfutées → la thèse de
l'utilité du système est défendue.

---

## 3. Où se trouve l'IA, exactement

Trois couches distinctes :

### Couche A — Génération musicale (le rôle principal de l'IA)

Un **modèle pré-entraîné** émet en continu un flux d'événements MIDI à
la fréquence du tempo en cours. **Je n'entraîne aucun modèle** — j'utilise
des poids existants. Le choix du modèle se fait par **benchmark empirique
multi-modèles** (voir Section 5), pas par décision a priori.

### Couche B — Mapping gestes → paramètres musicaux

Une couche **que je conçois** transforme les caractéristiques des gestes
en valeurs 0..1, redirigées soit vers les hyperparamètres de l'IA, soit
vers des paramètres de lecture *post-génération* (tempo, dynamique,
panoramique). **C'est ici que se joue l'essentiel de la recherche en
interaction.**

### Couche C — Capture gestuelle

Le WebXR de Babylon expose 25 articulations par main à ~60 Hz. Je calcule
sur ce signal brut des features géométriques. **Aucune IA dans cette
couche** — géométrie pure (~5 ms par image).

### Tableau de répartition

| Couche | IA ? | Mon travail | Risque |
|--------|------|-------------|--------|
| A — Génération musicale | **Oui (modèles pré-entraînés, sélection par benchmark)** | Adapter pattern + intégration + benchmark | Faible |
| B — Mapping gestes→paramètres | Non (heuristique + Wekinator possible) | **Cœur du travail** | Modéré |
| C — Capture gestuelle | Non (géométrie WebXR) | Implémentation directe | Faible |

---

## 4. Architecture technique

### Vue globale

```
┌──────────────────────────────────────────────────────────────────────┐
│ Couche C — CAPTURE GESTUELLE                                         │
│ Babylon WebXRHandTracking → 25 joints × 2 mains × 60 Hz              │
│ → features géométriques (vitesse, hauteur, posture, écartement)      │
│ Latence cible : < 5 ms                                               │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (signaux 0..1 normalisés)
┌──────────────────────────────────────────────────────────────────────┐
│ Couche B — MAPPING                                                   │
│ Heuristique (au début) ou Wekinator (régression apprise par démo)    │
│ Matrice signaux_gestes × paramètres_musicaux                         │
│ Latence cible : < 1 ms                                               │
└──────────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴────────────┐
                ▼                          ▼
┌──────────────────────────┐  ┌──────────────────────────────────────┐
│ Couche A — IA GÉNÉRATIVE │  │ MODULATION POST-GÉNÉRATION           │
│ Adapter ─► modèle élu    │  │ Tempo, vélocité, voix actives        │
│ (benchmark Section 5)    │  │ (mix et effets)                      │
│ Latence cible : < 50 ms  │  │ Latence cible : < 5 ms               │
└──────────────────────────┘  └──────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ MOTEUR AUDIO (existant) — WAM Pro54 / DrumKit / etc. via WebAudio    │
│ Latence cible : 10–20 ms (bufferisation audio)                       │
└──────────────────────────────────────────────────────────────────────┘

LATENCE TOTALE BUDGÉTÉE : ~65–75 ms  (cible recherche : < 100 ms)
```

### Trois nouveaux Node3D dans l'architecture existante

- `HandGestureN3D` — Lit le WebXR hand tracking, expose les features
  gestuelles comme sorties d'automation. **Couche C.**
- `GestureMapperN3D` — Matrice configurable signaux→paramètres.
  **Couche B.**
- `AIComposerN3D` — Encapsule le modèle pré-entraîné, émet du MIDI.
  **Couche A — interchangeable via adapter.**

L'utilisateur peut câbler ces trois nœuds comme n'importe quel autre
instrument. Cohérent avec l'architecture existante, aucune modification
du host.

---

## 5. Sélection du modèle par benchmark empirique

### 5.1 Pourquoi un benchmark plutôt qu'un choix a priori

Trois raisons :

1. **Argumentation scientifique** : « j'ai pris Magenta parce que c'est
   connu » n'est pas un argument. « J'ai mesuré N modèles selon M
   critères sur le même hardware/navigateur, voici le tableau, voici le
   classement » l'est.
2. **Reproductibilité** : le banc d'essai est un livrable indépendant du
   reste, réutilisable par toute personne souhaitant comparer des modèles
   musicaux temps réel en navigateur.
3. **Robustesse face aux questions du jury** : « pourquoi pas X ? »
   reçoit une réponse chiffrée, pas une opinion.

### 5.2 Adapter design pattern

Tous les modèles candidats se conforment à une même interface
TypeScript :

```typescript
interface IMusicGeneratorAdapter {
    readonly id: string;
    readonly displayName: string;
    readonly tier: 'local-browser' | 'remote-server';
    readonly capabilities: {
        streaming: boolean;             // émet note par note vs phrase par phrase
        hyperparameters: HyperparamSpec[];  // ceux exposés au mapping
        inputModality: 'midi-context' | 'text-prompt' | 'audio-seed';
        outputModality: 'midi-events' | 'audio-pcm';
    };

    init(opts?: InitOpts): Promise<void>;
    setHyperparameter(name: string, value: number): void;
    requestNext(context: MidiEvent[], dt: number): Promise<MidiEvent[]>;
    dispose(): void;

    // Pour le benchmark
    readonly stats: { avgInferenceMs: number; p95InferenceMs: number; mem: number };
}
```

Chaque modèle a son propre adapter :

- `MagentaMusicRNNAdapter` (TF.js)
- `MagentaMusicVAEAdapter` (TF.js)
- `MagentaDrumRNNAdapter` (TF.js)
- `MagentaPerformanceRNNAdapter` (TF.js)
- `ONNXMusicTransformerAdapter` (onnxruntime-web)
- `MarkovChainAdapter` (TypeScript natif — baseline)
- `RemoteModelAdapter` (WebSocket vers serveur Python — extension future)

`AIComposerN3D` détient un seul adapter à la fois, configurable au spawn
ou via un paramètre. Le banc d'essai instancie chaque adapter à tour de
rôle et collecte les statistiques.

### 5.3 Banc d'essai — protocole expérimental

**Plateforme cible :** MacBook M4 (10 cœurs CPU, 10 cœurs GPU, 16 cœurs
Neural Engine), Chrome stable, configuration sortie d'usine
(pas d'overclocking, pas d'extensions ralentissant le runtime).

**Configuration matérielle exacte** documentée et publiée avec les
résultats (RAM, OS, version Chrome, version WebGPU).

**Conditions de mesure** : navigateur seul ouvert, audio actif, pas de
caméra, branchement secteur, mode performance.

**Protocole par modèle** :

1. Charger le modèle (mesurer le temps de chargement)
2. Préparer un contexte MIDI initial standard (8 mesures de Do majeur)
3. Boucle de mesure : générer 1 000 notes successives, chronométrer
   chaque appel à `requestNext()`
4. Mesurer la consommation RAM avant/pendant/après
5. Sauvegarder la sortie MIDI pour évaluation qualitative
6. Tester avec 5 réglages de température différents (vérifier la
   plage de variation)
7. Répéter 3 fois (pour mesurer la variance)

### 5.4 Critères et métriques de comparaison

| Catégorie | Métrique | Cible | Outil |
|-----------|----------|-------|-------|
| **Latence** | Latence moyenne par note | < 50 ms | `performance.now()` |
| | Latence p95 par note | < 80 ms | idem |
| | Temps de chargement initial | < 5 s | idem |
| **Ressources** | Empreinte mémoire (heap JS) | < 200 MB | `performance.memory` |
| | Taille du modèle téléchargé | < 50 MB | Network panel |
| | Charge CPU moyenne | < 30 % | Activity Monitor + Chrome perf |
| **Qualité musicale** | Perplexité sur corpus de validation | À comparer | Calcul offline |
| | Entropie de Shannon sur les notes | À comparer | idem |
| | Diversité (notes uniques / total) | À comparer | idem |
| | Cohérence rythmique (CV des intervalles) | À comparer | idem |
| **Contrôlabilité** | Réactivité à la température (delta de sortie) | > 30 % de variation | Mesure ad hoc |
| | Réactivité à la densité | idem | idem |
| **Robustesse** | Taux d'échec (NaN, modèle crashé, etc.) | 0 % | Comptage |

Les résultats sont consignés dans un **tableau récapitulatif** publié
dans le mémoire. Le modèle retenu pour l'étude utilisateur est celui qui
**satisfait les contraintes dures** (latence, ressources, robustesse)
**et** maximise le compromis qualité × contrôlabilité.

### 5.5 Candidats à benchmarker (liste initiale)

| Adapter | Type | Taille | Tier | Inclus dans le benchmark ? |
|---------|------|--------|------|---------------------------|
| **MarkovChainAdapter** (n=4) | Procédural pur | ~1 KB | local | **Oui (baseline)** |
| **MagentaMusicRNN** (basic_rnn) | TF.js | ~10 MB | local | **Oui** |
| **MagentaMusicRNN** (melody_rnn) | TF.js | ~12 MB | local | **Oui** |
| **MagentaMusicRNN** (attention_rnn) | TF.js | ~13 MB | local | **Oui** |
| **MagentaPerformanceRNN** | TF.js | ~15 MB | local | **Oui** |
| **MagentaMusicVAE** (mel_2bar_small) | TF.js | ~15 MB | local | **Oui** |
| **MagentaMusicVAE** (mel_4bar_med_q2) | TF.js | ~50 MB | local | Si chargement OK |
| **MagentaDrumRNN** (drum_kit_rnn) | TF.js | ~10 MB | local | **Oui** (couche rythmique) |
| **ONNX Music Transformer** (Huang 2018) | ONNX | ~80 MB | local | Si conversion praticable |
| **MusicGen-small** (Meta) | PyTorch (serveur) | ~300M params | **remote** | **Oui en phase 2 (extension)** |

Les variantes Magenta sont privilégiées au démarrage parce que les ports
TF.js officiels existent, ce qui élimine l'incertitude de portage.

### 5.6 Tier 2 — extension serveur (perspective)

Une fois le banc d'essai local terminé, **une seconde phase** explore
un adapter qui sollicite un modèle plus lourd hébergé sur un serveur
distant :

```
┌──────────────────┐  WebSocket  ┌──────────────────────────────────┐
│ Navigateur       │ ◀─────────▶ │ Serveur Python (FastAPI + GPU)   │
│ RemoteModelAdptr │   ~30–80    │ MusicGen / Pop Music Transformer │
│                  │   ms RTT    │ Inférence en streaming           │
└──────────────────┘             └──────────────────────────────────┘
```

**Hypothèse architecturale** : la latence réseau (RTT + inférence
serveur) reste sous le budget global (< 200 ms), au prix d'une
dépendance à une connexion stable.

**Contribution scientifique potentielle** : caractériser le compromis
*latence vs qualité* en comparant les meilleurs modèles locaux aux
meilleurs modèles distants, dans des conditions de mesure identiques.

Cette extension fait l'objet d'une **section « perspectives » du
mémoire** et peut donner lieu à un papier court séparé si le temps le
permet.

---

## 6. Mapping gestes → paramètres musicaux

Mapping *initial* heuristique (à raffiner par étude pilote) :

| Geste / feature gestuelle | Cible musicale | Type | Couche |
|---------------------------|----------------|------|--------|
| Hauteur main droite (Y) | Dynamique générale (vélocité) | continu | post-gen |
| Vitesse main droite | Tempo modulation (×0.8–×1.2) | continu | post-gen |
| Accélération main droite (jab) | Accent / sforzando ponctuel | événementiel | post-gen |
| Hauteur main gauche (Y) | Densité de notes | continu | IA hyperparam |
| Posture main gauche (ouverte/fermée) | Température (chaos) | continu | IA hyperparam |
| Écartement deux mains | Largeur spatiale stéréo | continu | post-gen |
| Pince index-pouce main gauche | Cue d'entrée d'une nouvelle voix | événementiel | post-gen |
| Pince index-pouce main droite | Cue de sortie / fermata | événementiel | post-gen |
| Trajet courbe de la main | Choix de gamme/mode | symbolique | IA hyperparam |

### Validation du mapping

**Étude pilote** (5–8 participants) avant l'étude principale : on
demande aux gens d'évoquer une émotion (joie, calme, tension, mystère),
on mesure si le mapping initial leur permet effectivement de l'évoquer.
Les gestes ignorés ou contre-intuitifs sont révisés *avant* la grande
étude.

**Alternative scientifique** : **Wekinator** (Fiebrink, 2011) pour
*apprendre* le mapping par démonstration. Plus original mais complique
l'étude comparative. **Décision à prendre avec les encadrants.**

---

## 7. Méthodologie d'évaluation

### 7.1 Phase 0 — Banc d'essai des modèles (avant l'étude utilisateur)

Voir Section 5.3. Livrable : un tableau récapitulatif publié dans le
mémoire et le code du banc d'essai sur le dépôt git.

### 7.2 Phase 1 — Étude utilisateur principale

**Design within-subject à 3 conditions** (ordre contrebalancé Latin
square) :

- **VR-Chef** : système gestuel + meilleur modèle local (issu du
  banc d'essai)
- **MIDI-IA** : mêmes paramètres mais 5 potards MIDI USB + même modèle IA
- **MIDI-Markov** : potards + chaîne de Markov (baseline procédurale)

Cette structure 3-conditions sépare **l'effet de la modalité** (geste vs
potards) de **l'effet de l'IA** (modèle élu vs Markov).

### 7.3 Tâches données aux participants

1. **Exploration libre** (5 min) — découverte
2. **Tâche d'évocation émotionnelle** (15 min) — quatre émotions cibles
   GEMS (joie, calme, tension, mystère). Audio enregistré pour
   évaluation par tiers.
3. **Tâche compositionnelle** (10 min) — *« composez une pièce courte
   accompagnant un coucher de soleil »*
4. **Questionnaire par condition**

### 7.4 Mesures quantitatives objectives (étude utilisateur)

| Mesure | Comment | Cible |
|--------|---------|-------|
| Latence bout-en-bout | Timestamp geste → audio rendu | < 100 ms |
| Stabilité du mapping | Écart-type signal pour un geste tenu | < 5 % |
| Précision tempo intentionnel | BPM détecté vs consigne | < 5 BPM erreur |
| Perplexité de la sortie MIDI | Corpus de validation | À comparer |
| Diversité (entropie) | 10 sec glissantes | À comparer |
| Taux d'engagement | Variation gestuelle / minute | Indicateur secondaire |

### 7.5 Mesures qualitatives (questionnaires)

| Échelle | Quoi | Quand |
|---------|------|-------|
| **NASA-TLX** | Charge cognitive | Après chaque condition |
| **GEMS-9** | Émotion ressentie | Après chaque condition |
| **Échelle d'agentivité** (Tapal et al. 2017) | Sentiment de contrôle | Après chaque condition |
| **Échelle expressivité musicale** (custom 5-item) | Sentiment d'expression | Après chaque condition |
| **IPQ — Igroup Presence Questionnaire** | Immersion | Après session |
| **Entretien semi-directif** (10 min) | Verbatims, codage thématique | Fin de session |

### 7.6 Phase 2 — Évaluation par tiers (test perceptuel)

Enregistrements audio des tâches d'évocation, présentés en paires A/B en
aveugle à **30+ auditeurs externes naïfs** (Prolific ou présentiel) :

- *« Quelle version évoque le mieux [émotion cible] ? »*
- *« Quelle version vous semble musicalement de meilleure qualité ? »*

Test du chi² sur les préférences, intervalle de confiance à 95 %.

### 7.7 Recrutement

- 20–25 participants pour l'étude principale
- Mélange équilibré : musiciens (>2 ans) et non-musiciens
- 18–40 ans, pas de handicap moteur des bras
- Consentement éclairé, données anonymisées, **conformité RGPD à
  vérifier dès le mois 1**

---

## 8. Travaux connexes — positionnement scientifique

### 8.1 Interfaces gestuelles pour la musique (NIME)

- Wessel, D. & Wright, M. (2002). *Problems and prospects for intimate
  musical control of computers.* CMJ.
- Bevilacqua, F. et al. (2010). *Continuous realtime gesture following
  and recognition.* IRCAM.
- Borchers, J. et al. (2004). *Personal Orchestra: a real-time
  audio/video system for interactive conducting.* Multimedia Systems.
- Lee, E. et al. (2006). *iSymphony.* CHI.

### 8.2 Apprentissage interactif pour la musique

- Fiebrink, R. (2011). *Real-time human interaction with supervised
  learning algorithms for music composition and performance.* Thèse,
  Princeton. **(Wekinator)**
- Françoise, J. & Bevilacqua, F. (2018). *Motion-sound mapping through
  interaction.* ACM TiiS.

### 8.3 Génération musicale par deep learning

- Huang, C-Z. et al. (2018). *Music Transformer.* ICLR 2019.
- Roberts, A. et al. (2018). *A hierarchical latent vector model for
  learning long-term structure in music* (MusicVAE). ICML.
- Engel, J. et al. (2017). *NSynth.* ICML.
- Copet, J. et al. (2023). *Simple and controllable music generation*
  (MusicGen). NeurIPS.
- Agostinelli, A. et al. (2023). *MusicLM.* arXiv.
- Briot, J-P. (2019). *Deep learning techniques for music generation —
  a survey.* Springer.

### 8.4 Co-création humain-IA musicale

- Huang, C-Z. et al. (2020). *AI Song Contest.* ISMIR.
- Louie, R. et al. (2020). *Novice-AI music co-creation via AI-steering
  tools for deep generative models.* CHI.

### 8.5 VR pour la musique

- Serafin, S. et al. (2016). *Virtual reality musical instruments.* CMJ.
- Çamcı, A. & Hamilton, R. (2020). *Audio-first VR.* JNMR.

### 8.6 Benchmarking de modèles musicaux (la contribution méthodologique)

Peu de travaux comparent systématiquement plusieurs modèles génératifs
musicaux dans des conditions navigateur temps réel. Les évaluations
existantes (souvent dans les papiers introduisant les modèles) sont
faites en conditions de laboratoire (GPU dédié, batch inference), ce
qui n'est pas représentatif de l'usage temps réel sur matériel
utilisateur final.

→ **Ce benchmark constitue donc une contribution méthodologique en soi**,
distincte de l'étude HCI sur le système chef d'orchestre.

**Mon positionnement** : la majorité des travaux NIME / IA musicale /
VR explorent ces sujets séparément. **L'intersection des trois reste
peu explorée**, et **aucun benchmark public** ne caractérise les
modèles disponibles dans le contexte spécifique de la VR navigateur
temps réel. C'est ma double contribution.

---

## 9. Calendrier — 6 mois

```
Mois 1  ─ Revue littérature détaillée (15-20 papiers)
        ─ Démarches éthiques + RGPD (à lancer immédiatement)
        ─ Implémentation de l'interface IMusicGeneratorAdapter
        ─ Implémentation des 2 premiers adapters
          (MarkovChain + MagentaMusicRNN basic_rnn)
        ─ Premier benchmark partiel (faisabilité)
        ─ Soumission du présent document de cadrage

Mois 2  ─ Implémentation des adapters restants (Magenta variants,
          PerformanceRNN, MusicVAE, DrumRNN, ONNX si pratique)
        ─ Banc d'essai complet sur MacBook M4 / Chrome
        ─ Publication du tableau de benchmark (livrable n°1)
        ─ Choix du modèle retenu pour l'étude utilisateur
        ─ Intégration WebXR hand tracking dans Babylon

Mois 3  ─ Implémentation `HandGestureN3D` (features de base)
        ─ Implémentation `AIComposerN3D` avec l'adapter retenu
        ─ Implémentation `GestureMapperN3D` avec matrice configurable
        ─ Premier mapping heuristique end-to-end
        ─ Raffinage de l'interface VR (visualisation, feedback)

Mois 4  ─ Étude pilote (5-8 personnes) : test du mapping, ajustements
        ─ Implémentation de la condition MIDI-potards
        ─ Pré-enregistrement du protocole expérimental sur OSF
          (gage de rigueur scientifique)
        ─ Recrutement des participants
        ─ Mise en place des questionnaires en ligne (Limesurvey)

Mois 5  ─ Étude utilisateur principale : 20-25 participants
        ─ Collecte des données : logs système + audio + questionnaires
        ─ Étude perceptuelle externe : 30+ auditeurs paires A/B
        ─ (En parallèle, prototype d'extension serveur RemoteAdapter)

Mois 6  ─ Analyse statistique (R ou Python)
        ─ Rédaction du mémoire (~50-80 pages)
        ─ Préparation de la soutenance
        ─ (Optionnel) Préparation d'un papier court pour NIME 2027
          ou d'un papier méthodologique sur le benchmark
```

### Points de rendez-vous proposés aux encadrants

- **Fin mois 1** : validation du cadrage scientifique (ce document)
- **Fin mois 2** : présentation du benchmark + modèle élu
- **Fin mois 3** : démo du système end-to-end
- **Fin mois 4** : protocole expérimental finalisé
- **Mi-mois 5** : point sur la collecte
- **Mois 6** : revue intermédiaire du mémoire

---

## 10. Risques identifiés et atténuations

| Risque | Probabilité | Impact | Atténuation |
|--------|-------------|--------|-------------|
| Tous les modèles candidats > 100 ms en navigateur | Faible | Élevé | Le banc d'essai au mois 2 le détecte tôt → bascule sur l'architecture serveur en plan B principal |
| Adapter d'un modèle particulier difficile à implémenter | Modéré | Faible | Le benchmark mentionne explicitement les modèles écartés et pourquoi → transparence scientifique |
| ONNX Music Transformer non portable au navigateur | Modéré | Faible | Marquer comme « benchmarké en local Python uniquement » → résultat encore exploitable |
| Tracking des mains imprécis | Modéré | Modéré | Quest 3 a un excellent tracking. Plan B : contrôleurs en fallback |
| Recrutement insuffisant | Modéré | Élevé | Démarrer mois 4. Plan B : N=15 reste interprétable |
| Mapping initial peu intuitif | Élevé | Modéré | Étude pilote au mois 4 précisément pour cela |
| Validation éthique tardive | Modéré | Élevé | Lancer dès le mois 1 en parallèle |
| Sur-ingénierie | Très élevé | Élevé | Discipline : un seul modèle élu pour l'étude (pas trois), un seul mapping. Le banc d'essai est *avant* l'étude, pas dedans |

---

## 11. Contributions scientifiques attendues

1. **Un benchmark public** de modèles génératifs musicaux en conditions
   navigateur temps réel, sur matériel standard (MacBook M4 / Chrome),
   reproductible via le code livré. **Première contribution
   méthodologique.**

2. **Un système fonctionnel et reproductible** — code open-source dans la
   continuité du projet Musical Multiverse VR, avec architecture
   *adapter* permettant l'ajout de futurs modèles sans modification du
   reste du code.

3. **Un mapping gestes → paramètres musicaux documenté et évalué**,
   utilisable comme point de départ pour des travaux ultérieurs.

4. **Une étude utilisateur quantitative** comparant trois modalités
   (geste-IA, potards-IA, potards-procédural) sur trois axes
   (expressivité, charge cognitive, qualité musicale perçue par tiers).

5. **Une architecture extensible local/distant** posée comme perspective
   de travaux futurs, avec un prototype `RemoteModelAdapter`
   fonctionnel en fin de PFE.

6. **Une discussion critique** sur où l'IA aide effectivement la création
   musicale par des non-musiciens, où elle ne fait pas de différence,
   et où elle gêne.

---

## 12. Ce que ce PFE n'est *pas*

- **Pas une contribution en deep learning musical** — j'utilise des
  modèles existants, je n'entraîne ni ne propose d'architecture.
- **Pas une étude clinique** — pas de population fragile, pas de
  prétention médicale ou thérapeutique.
- **Pas un produit grand public** — prototype de recherche.
- **Pas un test de toutes les approches possibles** — Approche A
  délibérément choisie, en écartant volontairement B (composition
  gestuelle directe) et C (orchestration multi-sections).
- **Pas un benchmark exhaustif de TOUS les modèles musicaux existants**
  — le benchmark cible les modèles compatibles avec une exécution
  temps réel navigateur. Les modèles uniquement cloud (Suno, Udio) ou
  uniquement batch (MusicLM API) sont mentionnés en limites mais non
  benchmarkés ici.

---

## 13. Questions posées aux encadrants

1. **Validez-vous la question de recherche principale et les trois
   hypothèses ?**
2. **Le principe d'un benchmark empirique au mois 2 avant le choix du
   modèle vous convient-il ?** (alternative : choisir Magenta directement
   et passer plus vite au système, mais perte d'argumentation)
3. **L'extension serveur (RemoteAdapter, tier 2) vous semble-t-elle un
   bon « bonus » ou une distraction ?** Si bonus, je la mets en mois 5
   en parallèle de l'étude utilisateur.
4. **Le design d'étude 3-conditions vous semble-t-il robuste, ou
   préférez-vous 2-conditions plus simple ?**
5. **Mapping heuristique fixe ou mapping appris par Wekinator ?**
   (le second est plus original mais complique l'étude)
6. **Quels comités d'éthique et délais administratifs dois-je
   anticiper ?**

---

## Annexe A — Spécification de l'interface `IMusicGeneratorAdapter`

```typescript
/**
 * Représente un événement MIDI émis par un générateur.
 */
interface MidiEvent {
    type: 'note-on' | 'note-off' | 'cc' | 'tempo';
    note?: number;       // 0-127, MIDI pitch
    velocity?: number;   // 0-127
    channel?: number;    // 0-15
    deltaMs: number;     // temps depuis l'événement précédent
}

/**
 * Spécification d'un hyperparamètre exposé par le modèle.
 * Sert à la fois au mapping (UI) et au benchmark.
 */
interface HyperparamSpec {
    name: string;
    min: number;
    max: number;
    default: number;
    description: string;
}

/**
 * Statistiques de performance, remplies au fil des appels.
 */
interface AdapterStats {
    callCount: number;
    avgInferenceMs: number;
    p50InferenceMs: number;
    p95InferenceMs: number;
    p99InferenceMs: number;
    memHeapBytes: number;
    failureCount: number;
}

/**
 * Interface commune à tous les modèles génératifs candidats.
 */
interface IMusicGeneratorAdapter {
    /** Identifiant unique (pour les logs et le benchmark). */
    readonly id: string;

    /** Nom lisible (pour l'UI). */
    readonly displayName: string;

    /** Où s'exécute le modèle. */
    readonly tier: 'local-browser' | 'remote-server';

    /** Capacités déclarées. */
    readonly capabilities: {
        streaming: boolean;
        hyperparameters: HyperparamSpec[];
        inputModality: 'midi-context' | 'text-prompt' | 'audio-seed';
        outputModality: 'midi-events' | 'audio-pcm';
    };

    /** Statistiques de performance (remplies au fil de l'eau). */
    readonly stats: AdapterStats;

    /** Charge le modèle (téléchargement, init GPU, etc.). */
    init(opts?: { progressCallback?: (frac: number) => void }): Promise<void>;

    /** Modifie un hyperparamètre. Appelable à tout moment. */
    setHyperparameter(name: string, value: number): void;

    /**
     * Demande la génération de la prochaine fenêtre d'événements.
     * `context` : les derniers événements émis (pour le contexte).
     * `dt` : durée à générer (en ms).
     */
    requestNext(context: MidiEvent[], dt: number): Promise<MidiEvent[]>;

    /** Libère les ressources (modèle, GPU, sockets, etc.). */
    dispose(): Promise<void>;
}
```

---

## Annexe B — Configuration de benchmark proposée

```yaml
# benchmark.config.yml — versionné dans le repo
platform:
  os: macOS Sonoma 14.x
  hardware: MacBook Pro M4, 16/24 GB RAM
  browser: Chrome stable (version notée à chaque run)
  network: WiFi désactivé sauf pour RemoteAdapter
  power: secteur, mode performance

protocol:
  warmup_notes: 100        # ignorées dans les stats
  measurement_notes: 1000  # comptées
  temperature_sweep: [0.5, 0.8, 1.0, 1.2, 1.5]
  repeats: 3               # pour la variance
  initial_context: "scale_c_major_8bars.mid"
  
output:
  csv: bench_results.csv
  midi_samples_dir: ./bench_outputs/
  plots: ./bench_plots/
```

---

*Yassine — Document de cadrage, version 2 (benchmark + adapter).*
*Pour discussion lors de notre prochaine réunion.*
