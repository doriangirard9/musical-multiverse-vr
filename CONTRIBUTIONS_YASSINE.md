# Mes Contributions à Musical Multiverse VR

Ce document décrit les ajouts que j'ai apportés au projet Musical Multiverse VR :
deux nouveaux instruments d'automation 3D, un système de boids partagé, le
redimensionnement en temps réel, et plusieurs corrections (rendu du shop en VR,
projection du contrôleur sur la plaque, redémarrage propre du backend).

---

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Lancer le projet](#lancer-le-projet)
- [Tester en VR (Meta Quest 3)](#tester-en-vr-meta-quest-3)
- [Spawner mes instruments](#spawner-mes-instruments)
- [L'Audio Plaque](#laudio-plaque)
- [La Superformula](#la-superformula)
- [Le mode Boids](#le-mode-boids)
- [Le redimensionnement](#le-redimensionnement)
- [Patchs de démonstration](#patchs-de-démonstration)
- [Liste complète des sorties](#liste-complète-des-sorties)
- [Astuces](#astuces)
- [Fichiers que j'ai créés ou modifiés](#fichiers-que-jai-créés-ou-modifiés)

---

## Vue d'ensemble

J'ai conçu et intégré dans le projet quatre choses principales :

1. **Audio Plaque** — Un pavé tactile XY 2D. Une balle suit la projection du
   laser du contrôleur (ou de la souris) sur la surface, et les positions X / Y
   sont exposées comme sorties d'automation pour piloter n'importe quel
   paramètre WAM en temps réel.

2. **Superformula** — Un contrôleur basé sur la **superformule de Gielis**. Une
   balle parcourt en autonomie une courbe paramétrique modifiable en direct par
   six potards (`m`, `n1`, `n2`, `n3`, `scale`, `speed`). Le mouvement de la
   balle produit huit métriques d'automation différentes (position, rayon,
   vitesse, courbure, etc.).

3. **Mode Boids partagé** — Les deux instruments peuvent générer un essaim de
   boids (comportements *seek* + *separate*) qui chassent la balle.
   L'agrégation du swarm (centroïde, dispersion, alignement, vorticité) est
   exposée comme cinq sorties d'automation supplémentaires.

4. **Redimensionnement en temps réel** — Une poignée violette à un coin de
   chaque instrument permet de l'agrandir/rétrécir de **0.3× à 4×** en VR, avec
   synchronisation réseau. Cette plage couvre largement les anciens variants
   `Small` et `Large` qui ont donc été supprimés (une seule entrée par
   instrument dans le shop).

S'ajoutent à cela :
- Un correctif du shop en mode VR (les contrôleurs ne pouvaient pas le
  sélectionner car le panneau était dans la mauvaise scène Babylon).
- Une réécriture du système de projection laser→plaque pour que la balle suive
  exactement où le laser pointe.
- Un patch du `Makefile` qui tue le port `:3000` avant de relancer le backend
  (sans ça, une instance fantôme survit aux relances).

---

## Lancer le projet

### Pré-requis

- **Node.js** (j'utilise la version par défaut de npm)
- Un navigateur (Chrome de préférence)
- Optionnel : un Meta Quest 3 pour la VR immersive

### En une seule commande

```bash
make all
```

Cette commande :
1. Tue les éventuelles instances qui traînent sur les ports `:5179` (front)
   et `:3000` (back)
2. Lance le serveur backend (`server-config/server.js`) sur `:3000`
3. Lance Vite (front-end) sur `https://localhost:5179`
4. Attend que les deux soient prêts puis ouvre Chrome automatiquement

### Autres cibles

- `make dev` — Front-end seul
- `make server` — Backend seul
- `make clean` — Supprime les `node_modules`

---

## Tester en VR (Meta Quest 3)

Le projet supporte WebXR. Pour entrer en VR depuis le Quest 3 :

1. **Activer le mode développeur** sur le Quest via l'app Meta Quest mobile.
2. **Installer `adb`** sur le Mac : `brew install --cask android-platform-tools`.
3. **Connecter le Quest** au Mac en USB-C, accepter le débogage USB dans le casque.
4. **Créer les tunnels** :
   ```bash
   adb reverse tcp:5179 tcp:5179
   adb reverse tcp:3000 tcp:3000
   ```
5. Dans le navigateur Meta du Quest, aller à `https://localhost:5179`.
6. Accepter le certificat auto-signé (Avancé → Continuer vers localhost).
7. S'authentifier (ou choisir guest), entrer dans une session.
8. Cliquer sur le bouton VR en bas à droite du canvas pour entrer dans le casque.

---

## Spawner mes instruments

Une fois dans le monde 3D :

1. **Ouvrir le shop** — Appuyer sur le **bouton A** du contrôleur droit
   (touche `A` du clavier en mode souris). Un panneau apparaît devant moi.

2. **Naviguer vers la catégorie Automation** dans le shop.

3. **Mes deux entrées** :
   - `Audio Plaque` — Pavé tactile XY
   - `Superformula` — Courbe paramétrique de Gielis

   *Une seule taille par instrument :* le redimensionnement en temps réel
   (poignée violette, 0.3×–4×) couvre largement les anciens variants
   `Small` / `Large` qui ont été retirés.

4. **Cliquer (gâchette)** sur une vignette → l'instrument apparaît devant moi.

---

## L'Audio Plaque

Un pavé tactile XY qui transforme la position du laser en deux signaux
d'automation continus.

### Anatomie

```
       [boidToggle]                                     [audioIn]   [audioOut]
       [+ boid]
       [- boid]
                          ┌─────────────────────────┐
                          │                         │
                          │      grille sarcelle    │
                          │                         │
                          │      ●  balle rose      │
                          │                         │
                          │                         │
                          │                         │
                          └─────────────────────────┘
                                                              [redim. violet]
   [Position X]   [Position Y]
   [Centroid X][Centroid Y][Dispersion][Alignment][Vorticity]
```

- **Plaque centrale** — Grille sarcelle quadrillée. Surface de visée.
- **Balle rose lumineuse** — Suit la projection du laser. Halo translucide
  + animation de respiration.
- **Connecteurs verts** — Audio in (gauche, géodésique) / Audio out (droite,
  sphère). L'audio traverse l'instrument sans modification.
- **Connecteurs colorés** — Sorties d'automation (X = rouge, Y = bleu, etc.).
- **Poignée violette** (coin) — Glisser pour redimensionner.
- **Disque cyan/or** — Toggle du mode boids (cyan = off, or pulsé = on).
- **Disques vert/rouge** — Ajouter / retirer un boid.

### Comment l'utiliser

Pour piloter la balle :
- Pointer le laser sur la grille
- Maintenir la gâchette
- Déplacer le contrôleur — la balle suit le point exact où le laser frappe

Pour câbler une sortie à un paramètre WAM :
- Tirer un fil (gâchette enfoncée) depuis une sphère colorée vers un paramètre
  d'entrée d'un autre instrument
- Une sortie peut alimenter plusieurs paramètres (le fan-out est supporté)

---

## La Superformula

Un générateur paramétrique inspiré de la **superformule de Gielis** :

```
r(θ) = ( |cos(mθ/4)/a|^n2 + |sin(mθ/4)/b|^n3 )^(-1/n1)
```

Une balle parcourt en boucle la courbe ainsi décrite. Six potards modifient la
courbe en direct.

### Anatomie

```
       [boid -][boidToggle][boid +]            [redim. violet]
                          ┌─────────────────────────┐
   [m]                    │  tube cyan = la courbe  │   [scale]
   [n1]                   │   ●  balle (lecteur)    │
                          │   .....trainée rose     │   [speed]
   [n2]                   │                         │
   [n3]                   │                         │
                          └─────────────────────────┘
                                                            [audioIn][audioOut]
   [PosX][PosY][Rayon][ΔRayon][VitAng][Vitesse][Accél][Courb.]
   [Centroid X][Centroid Y][Dispersion][Alignment][Vorticity]
```

### Les six potards

- **Sphères or à gauche** (paramètres mathématiques) :
  - `m` (Pétales) — 1 à 20. Nombre de pointes/lobes de la forme.
  - `n1` (Netteté) — 0.1 à 10. Plus c'est petit, plus c'est pointu.
  - `n2` (Largeur) — 0.1 à 10. Asymétrie horizontale.
  - `n3` (Hauteur) — 0.1 à 10. Asymétrie verticale.

- **Sphères orange à droite** (paramètres de mouvement) :
  - `scale` (Taille) — 0.10 à 0.50. Amplitude de la courbe.
  - `speed` (Vitesse) — 0.10 à 6.00 rad/s. Vitesse de parcours.

### Formes à essayer

| `m` | `n1` | `n2` | `n3` | Résultat |
|-----|------|------|------|----------|
| 5 | 1.5 | 1.5 | 1.5 | Étoile à 5 branches (valeur par défaut) |
| 3 | 2 | 2 | 2 | Triangle arrondi |
| 7 | 0.5 | 1.5 | 1.5 | Étoile pointue |
| 2 | 4 | 0.5 | 0.5 | Forme d'œil ou de feuille |
| 12 | 1 | 1 | 1 | Fleur à 12 pétales |
| 4 | 0.3 | 0.3 | 0.3 | Cristal acéré |

### Comment l'utiliser

- Tirer un potard avec la gâchette pour modifier sa valeur. La courbe se
  reconstruit instantanément.
- Câbler les sorties d'automation aux paramètres d'un synthé pour que ses
  réglages bougent en suivant le mouvement de la balle sur la courbe.
- L'audio passe à travers (`in → out`) sans transformation : la Superformula
  est un **contrôleur**, pas un effet.

---

## Le mode Boids

Disponible sur l'Audio Plaque ET la Superformula. Active un essaim de petites
flèches cyan qui chassent la balle.

### Comportements

Chaque boid combine deux forces (portage du code p5.js du prototype original) :

- **Seek** (×1.0) — Se dirige vers la balle de l'instrument.
- **Separate** (×2.0) — S'écarte des autres boids dans un rayon de 0.08
  (espace local de l'instrument).

Le résultat : un swarm qui suit la balle sans s'agglutiner en un point.

### Activation et contrôle

1. **Cliquer le disque cyan/or** (en haut-gauche) — Bascule le mode on/off.
   Le bouton devient or et pulse quand le mode est actif.
2. **Cliquer le disque vert** — Ajoute un boid (max 30).
3. **Cliquer le disque rouge** — Retire un boid (min 0).

Le nombre par défaut est 5. Tester avec 10-20 pour un swarm plus visible.

### Les cinq sorties de métriques du swarm

Calculées à chaque image à partir de l'état complet de l'essaim. Toutes
normalisées entre 0 et 1 :

| Métrique | Couleur de la sphère | Sens musical |
|----------|---------------------|--------------|
| **Centroïde X** | Rose | Position moyenne horizontale |
| **Centroïde Y** | Cyan | Position moyenne verticale |
| **Dispersion** | Or | Boids serrés = 0, éparpillés = 1 |
| **Alignement** | Émeraude | Tous dans la même direction = 1, chaotique = 0 |
| **Vorticité** | Violet | Mouvement de rotation autour du centroïde |

Quand le mode boids est éteint, les boids ne bougent plus mais leur dernière
position est préservée → les sorties émettent les valeurs gelées.

### Mappings musicaux suggérés

- `boidAlignment → reverb size` — Vol unifié = grand espace, chaos = sec.
- `boidDispersion → distortion drive` — Boids serrés = propre, éparpillés = saturé.
- `boidVorticity → LFO depth` — Rotation = profondeur de modulation.
- `boidCentroidX/Y → cutoff/résonance` — Mouvement lent, agréable pour des pads.

---

## Le redimensionnement

Chaque instrument a une **poignée violette** dans un coin. Tirer dessus avec la
gâchette modifie l'échelle entre **0.3× et 4×** de la taille de spawn.

À l'échelle par défaut, l'instrument fait ~0.60 unité de large dans le monde.
La plage de resize couvre donc concrètement :

| Échelle | Taille mondiale | Commentaire |
|---------|-----------------|-------------|
| 0.3×    | ~0.18 unité     | Compact, tient dans un coin de la scène |
| 1.0×    | ~0.60 unité     | Par défaut |
| 2.0×    | ~1.20 unité     | Confortable pour la VR |
| 4.0×    | ~2.40 unité     | Mural, contrôle très fin |

- La taille est **synchronisée sur le réseau** (visible par les autres joueurs).
- L'opération est sûre : la BoundingBox externe se recalcule automatiquement
  après chaque drag (avec un *debounce* de 150 ms pour éviter le churn).
- Cette plage remplace les anciens variants `Small` / `Large` du shop, désormais
  retirés au profit d'une seule entrée par instrument.

---

## Patchs de démonstration

### Patch 1 — "Le Classique" (filtre balayé par la formule)

```
sequencer ──MIDI──► pro54michel ──audio──► superformula ──audio──► audiooutput
                          ▲    ▲    ▲
                          │    │    │
        superformula.posX─┘    │    │   (filter cutoff)
        superformula.radius────┘    │   (filter resonance)
        superformula.speed─────────┘    (LFO rate)
```

Spawner les quatre instruments. Tirer les fils. Lancer le sequencer (`m=5,
n1=1.5, scale=0.4, speed=1.5` pour la superformula). La forme en étoile fait
pulser le filtre à chaque pointe.

### Patch 2 — "Chaos boidsé"

```
sequencer → pro54michel → superformula → audiooutput
                  ▲   ▲   ▲
                  │   │   │
   boidVorticity ─┘   │   │   (distortion)
   boidAlignment ─────┘   │   (reverb size)
   boidDispersion ────────┘   (delay feedback)
```

Activer le mode boids sur la Superformula (15-20 boids). Le swarm module
les effets de manière émergente — plus le vol est unifié, plus la reverb est
large ; plus les boids sont serrés, moins il y a de saturation.

### Patch 3 — "Contrôle manuel à deux mains"

```
hyperkeyboard ──MIDI──► pro54michel ──audio──► audio_plaque ──audio──► audiooutput
                              ▲   ▲
                              │   │
            audio_plaque.X ───┘   │   (filter cutoff)
            audio_plaque.Y ───────┘   (resonance)
```

Une main joue du clavier, l'autre balaye la plaque pour façonner le timbre.

---

## Liste complète des sorties

### Audio Plaque — 9 sorties

| Nom | Type | Plage | Couleur |
|-----|------|-------|---------|
| Audio In | Audio | — | Vert |
| Audio Out | Audio | — | Vert |
| X Position | Automation | 0..1 | Rouge |
| Y Position | Automation | 0..1 | Bleu |
| Boid Centroid X | Automation | 0..1 | Rose |
| Boid Centroid Y | Automation | 0..1 | Cyan |
| Boid Dispersion | Automation | 0..1 | Or |
| Boid Alignment | Automation | 0..1 | Émeraude |
| Boid Vorticity | Automation | 0..1 | Violet |

### Superformula — 15 sorties

| Nom | Type | Plage | Couleur |
|-----|------|-------|---------|
| Audio In | Audio | — | Vert |
| Audio Out | Audio | — | Vert |
| Position X | Automation | 0..1 | Rouge |
| Position Y | Automation | 0..1 | Bleu |
| Ball Radius | Automation | 0..1 | Vert |
| Ball Radius Delta | Automation | 0..1 | Jaune |
| Angular Velocity | Automation | 0..1 | Orange |
| Ball Speed | Automation | 0..1 | Violet |
| Ball Acceleration | Automation | 0..1 | Magenta |
| Ball Curvature | Automation | 0..1 | Cyan |
| Boid Centroid X | Automation | 0..1 | Rose |
| Boid Centroid Y | Automation | 0..1 | Cyan |
| Boid Dispersion | Automation | 0..1 | Or |
| Boid Alignment | Automation | 0..1 | Émeraude |
| Boid Vorticity | Automation | 0..1 | Violet |

---

## Astuces

- **Une même sortie peut alimenter plusieurs paramètres.** Le système de
  connexions supporte le fan-out — tirer plusieurs fils depuis la même sphère.
- **Les sorties d'automation fonctionnent même sans audio.** Pas besoin de
  câbler l'audio in/out pour que les sorties X/Y fonctionnent.
- **Console (F12)** — J'ai ajouté des logs diagnostiques détaillés. Chaque
  spawn, grab, et tick (toutes les 500 ms) imprime les positions, valeurs de
  sortie, état des boids, etc.
- **La balle suit la projection du laser** sur la surface, pas la position de
  la main. Pointer précisément avec le laser.
- **Sauvegarder le projet** depuis le HUD pour retrouver son patch (positions
  des nœuds, valeurs des potards, taille, mode boids, nombre de boids).
- **Si le shop ne s'affiche pas** : appuyer sur **A** (contrôleur droit ou
  clavier). Le shop est toujours fermé au démarrage.

---

## Fichiers que j'ai créés ou modifiés

| Fichier | Rôle |
|---------|------|
| `src/Refactoring/node3d/subs/automation/AudioPlaqueN3D.ts` | Instrument plaque |
| `src/Refactoring/node3d/subs/automation/SuperformulaN3D.ts` | Instrument superformule |
| `src/Refactoring/behaviours/steering/Boid.ts` | Classes `Boid` + `BoidSwarm` partagées |
| `src/Refactoring/app/Node3DBuilder.ts` | Enregistrement des kinds `audio_plaque` et `superformula` |
| `src/Refactoring/world/menu/ShopPanel.ts` | Correctif : le panneau passe dans la scène principale pour être pickable en VR |
| `src/Refactoring/app/NewApp.ts` | Câblage du shop sur la bonne scène |
| `src/Refactoring/xr/menuConfig.json` | Entrée Superformula ajoutée, Swarm Theremin retirée |
| `Makefile` | Tue le port `:3000` dans `make all` + attend la disponibilité du backend |
| `CONTRIBUTIONS_YASSINE.md` | Le présent document |

L'architecture respecte le pattern Node3D existant : chaque instrument est
composé d'une classe **GUI** (visuels), d'une classe **logique** (audio +
automation + synchro), et d'une **factory** avec une seule instance statique
`DEFAULT`. Le redimensionnement en temps réel (0.3×–4×) remplace les anciens
variants statiques `SMALL` / `LARGE`. Toute la synchronisation réseau passe
par le système `getState` / `setState` du host (paramètres synchronisés
automatiquement à travers les peers).

> **Note historique :** un premier brouillon (`SwarmThereminN3DFactory`) avait
> été inclus comme test préliminaire avant la conception définitive. Il a été
> retiré du projet une fois la Plaque et la Superformula stabilisées.
