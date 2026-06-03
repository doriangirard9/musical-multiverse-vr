# Référence — Le Scheduler look-ahead & les paramètres du modèle

Document de référence (pour le mémoire et l'usage quotidien). Explique en
détail (1) le fonctionnement du `MidiLookaheadScheduler` et (2) tous les
paramètres exposés, leur rôle, leurs plages et valeurs.

---

## Partie 1 — Le MidiLookaheadScheduler

### 1.1 Le problème qu'il résout

Le modèle génère lentement (~100-150 ms par appel) et de façon irrégulière
(pics GC de TF.js jusqu'à ~300 ms). Mais la lecture audio doit être
**parfaitement régulière** (sample-accurate), sinon on entend des trous.

On ne peut donc pas "générer une note puis la jouer aussitôt" — la
moindre lenteur de génération ferait un trou audible. Il faut **découpler**
le moment de génération du moment de lecture.

### 1.2 Le principe : deux horloges

Pattern "A Tale of Two Clocks" (Chris Wilson, 2013).

| Horloge | Rôle | Précision |
|---------|------|-----------|
| `AudioContext.currentTime` | l'heure audio matérielle, avance en continu | échantillon (~0.02 ms) |
| `setInterval` (tick 25 ms) | la boucle JS qui fait le travail | grossière (~25 ms) |

La boucle grossière **programme à l'avance** des événements sur l'horloge
précise. Même si la boucle JS hoquette, les événements déjà programmés se
jouent à l'heure exacte.

### 1.3 Le buffer

Le scheduler garde une file `pending` de notes générées mais pas encore
jouées. Chaque entrée = `{ event, deltaMs }` où `deltaMs` est le temps
**musical relatif** depuis la note précédente (au tempo nominal).

**Pourquoi du temps relatif et pas absolu ?** Pour appliquer le tempo AU
MOMENT de jouer (drain) et non à la génération. Ainsi un changement de
tempo est immédiat : on recalcule le temps absolu de chaque note à la
volée. (Si on stockait des temps absolus figés, le tempo ne pourrait pas
changer les notes déjà en buffer.)

### 1.4 Le cycle de tick (toutes les 25 ms)

```
tick():
  now = clock()                          # heure audio actuelle

  # ─ 1. DRAIN ─ programmer les événements échus
  until = now + scheduleAheadSec         # fenêtre de 0.1 s
  tant que pending non vide ET headTimeSec < until:
     pe = pending.pop_front()
     programmer pe.event à headTimeSec    # via scheduleCallback
     headTimeSec += pending[0].deltaMs / 1000 / tempoScale   # tempo appliqué ICI

  # ─ 2. MESURER la profondeur de buffer
  bufferDepthSec = temps réel jusqu'à la fin du buffer
  si bufferDepthSec < scheduleAheadSec: lowBufferTicks++   # alerte

  # ─ 3. REMPLIR ─ générer si l'horizon n'est pas couvert
  si bufferDepthSec < horizonSec ET pas déjà en génération:
     generateMore()    # async, ne bloque pas le tick
```

- `headTimeSec` = l'heure audio absolue de la PROCHAINE note à jouer.
- On programme tout ce qui tombe dans les 100 ms à venir (`scheduleAheadSec`).
- `tempoScale` et `velocityScale` sont appliqués **au drain** → immédiats.

### 1.5 Le remplissage (génération)

```
generateMore():                          # gardé : une seule à la fois
  events = await adapter.requestNext(contextWindow, generationChunkMs)
  pour chaque ev dans events:
     pending.push({ ev, ev.deltaMs })
     si ev est note-on: contextWindow.push(ev)   # garder 16 dernières
```

- Gardé par un drapeau `generating` : jamais deux générations concurrentes.
- `contextWindow` = les 16 derniers note-on, passés à l'adapter comme
  contexte (pour que le RNN continue la mélodie de façon cohérente).
- **C'est ICI que le main thread bloque** (cf journal 2026-06-03) : à
  corriger via Web Worker.

### 1.6 Les métriques (SchedulerStats)

| Métrique | Sens | Cible |
|----------|------|-------|
| `lateEvents` | événements programmés DANS LE PASSÉ = glitch audible | **0** |
| `lowBufferTicks` | ticks où le buffer est tombé sous 0.1 s | bas |
| `bufferDepthSec` | profondeur courante du buffer (temps réel) | ≈ horizon |
| `generationCalls` | nombre d'appels de génération | — |
| `scheduledEvents` | événements programmés avec succès | — |

`lateEvents = 0` est LA preuve que le buffering masque les pics GC.

### 1.7 Les paramètres du scheduler

| Paramètre | Défaut | Plage | Rôle | Latence |
|-----------|--------|-------|------|---------|
| `horizonSec` | 0.5 s | 0.1–4.0 | combien de musique générer en avance. Plus grand = plus résistant au GC, mais hyperparamètres plus lents | structurel |
| `tempoScale` | 1.0 | 0.25–4.0 | vitesse de lecture. Appliqué au drain | **immédiat** |
| `velocityScale` | 1.0 | 0.0–2.0 | dynamique (volume des notes). Appliqué au drain | **immédiat** |
| `generationChunkMs` | 250 ms | — | durée musicale demandée à l'adapter par appel | interne |
| `scheduleAheadSec` | 0.1 s | — | fenêtre de programmation audio sample-accurate | interne |
| `tickMs` | 25 ms | — | période de la boucle | interne |
| `nominalBpm` | 120 | — | tempo supposé par le modèle | interne |

**Règle d'or dégagée** (run de validation) :
> horizon minimal viable ≈ p95 de latence du modèle sous charge.
> Sous charge, p95 ≈ 154 ms → horizon sûr ≈ 0.5 s (≈ 3× la marge).

---

## Partie 2 — Les paramètres du modèle (Magenta MusicRNN)

### 2.1 Le modèle : MusicRNN

Un réseau récurrent (LSTM) entraîné par Google Magenta sur des corpus de
mélodies. Son API centrale :

```
continueSequence(primer, steps, temperature, chordProgression?)
```

- `primer` : les notes de contexte (NoteSequence) à partir desquelles
  continuer. Chez nous = les 16 dernières notes jouées.
- `steps` : combien de pas de doubles-croches générer.
- `temperature` : aléa du tirage (voir ci-dessous).
- `chordProgression` : accords imposés (seulement pour `chord_pitches_improv`).

Trois checkpoints publics testés :

| Checkpoint | Description | Statut |
|------------|-------------|--------|
| `basic_rnn` | monophonique, gamme C, ~10 MB | OK |
| `melody_rnn` | mélodies plus structurées, ~12 MB | **retenu** |
| `chord_pitches_improv` | conditionné par accords, ~13 MB | OK (accord par défaut "C") |
| `attention_rnn` | — | absent du CDN public (404) |

### 2.2 Les hyperparamètres exposés (côté GÉNÉRATION — latence bufferisée)

Ces paramètres affectent ce que le modèle génère. Ils sont mappés depuis
les entrées d'automation 0..1 de l'AIComposerN3D. **Latence = horizon du
buffer** (~0.5 s) : un changement met ~0.5 s à devenir audible (normal, on
ne réécrit pas le futur déjà généré).

#### `temperature` — Température

- **Rôle** : contrôle l'aléa du tirage softmax (à quel point le modèle ose
  des notes improbables).
- **Plage** : 0.1 – 2.5. **Défaut** : 1.0.
- **Effet** :
  - `0.1–0.5` : très conservateur, répétitif, prévisible, tend à boucler
  - `1.0` : "naturel", équilibré (la température d'entraînement)
  - `1.5–2.5` : chaotique, surprenant, peut devenir atonal / aléatoire
- **C'est le potard créatif principal.** Câblé sur X de l'AudioPlaque.

#### `density` — Densité

- **Rôle** : combien de notes générer par appel. Chez nous, multiplie
  `stepsToGen` (`baseSteps × density/2`).
- **Plage** : 1 – 8. **Défaut** : 2.
- **Effet** :
  - bas : épars, aéré, silences
  - haut : dense, continu, virtuose
- **⚠ Coût de calcul** : density ↑ → générations plus longues ET plus
  fréquentes → plus de lag (cf journal 2026-06-03). À mapper avec
  prudence tant que l'inférence est sur le main thread.

#### `octaveCenter` — Octave centrale

- **Rôle** : hauteur MIDI médiane. Post-filtre les notes autour de cette
  valeur.
- **Plage** : 48 – 84. **Défaut** : 60 (= Do4 = Do central).
- **Effet** : 48 = registre grave, 84 = registre aigu.

#### `pitchRange` — Tessiture

- **Rôle** : étendue en demi-tons autour de l'octave centrale (post-filtre).
- **Plage** : 12 – 60. **Défaut** : 36.
- **Effet** : petit = notes resserrées dans une bande étroite ; grand =
  grands sauts mélodiques autorisés.

### 2.3 Les contrôles de lecture (côté SCHEDULER — latence immédiate)

Ces contrôles n'affectent PAS la génération, seulement la lecture du buffer.
Ils sont **immédiats**. Exposés comme potards de l'AIComposerN3D.

| Contrôle | Plage | Défaut | Rôle |
|----------|-------|--------|------|
| `tempo` (tempoScale) | 0.25×–3.0× | 1.0× | vitesse de lecture |
| `velocity` (velocityScale) | 0.0×–2.0× | 1.0× | dynamique (volume) |
| `horizon` (horizonSec) | 0.1–2.0 s | 0.5 s | profondeur du buffer |

### 2.4 La distinction CLÉ : deux familles, deux latences

```
PARAMÈTRES DE GÉNÉRATION (modèle)        CONTRÔLES DE LECTURE (scheduler)
température, densité,                     tempo, vélocité
octaveCenter, pitchRange
        │                                        │
        ▼                                        ▼
  affectent la génération FUTURE           appliqués au DRAIN
  latence = horizon (~0.5 s)               latence ≈ 0 (immédiat)
        │                                        │
   "main gauche" du chef                    "main droite" du chef
   (façonne le caractère)                   (articulation, dynamique)
```

C'est l'isomorphisme central du PFE : la double latence du système
correspond aux deux mains du chef d'orchestre. La main droite (baguette)
est immédiate ; la main gauche (façonnage) est anticipée.

---

## Annexe — Tableau récapitulatif de tous les réglages

| Réglage | Famille | Plage | Défaut | Latence | Câblage AIComposer |
|---------|---------|-------|--------|---------|--------------------|
| Température | génération | 0.1–2.5 | 1.0 | bufferisée | entrée automation |
| Densité | génération | 1–8 | 2 | bufferisée | entrée automation |
| Octave centrale | génération | 48–84 | 60 | bufferisée | (interne pour l'instant) |
| Tessiture | génération | 12–60 | 36 | bufferisée | (interne pour l'instant) |
| Tempo | lecture | 0.25×–3× | 1× | immédiate | potard |
| Vélocité | lecture | 0×–2× | 1× | immédiate | potard |
| Horizon | structurel | 0.1–2 s | 0.5 s | — | potard |
