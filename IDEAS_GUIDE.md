# IDEAS_GUIDE

Consignes pour lire, trier, reformuler et implémenter les idées de `IDEAS.md`.
Ce fichier dit ce que sont les familles de contenu du projet, quel vocabulaire employer pour en parler,
et quelles règles une idée doit respecter avant d'être considérée comme faisable.

`IDEAS.md` est le carnet ; ce fichier est la grille de lecture. Une idée qui ne rentre dans
aucune famille décrite ici n'est pas une idée pour ce projet, ou demande un socle nouveau à
nommer en tant que tel (voir la section 0 de `IDEAS.md`).

---

## 1. Vocabulaire : famille, type et instance de contenu

Tout ce qui est extensible dans le projet existe à trois niveaux : la **famille**, le **type**,
l'**instance**. Le vocabulaire est fixé ici, et toute idée doit dire à quel niveau elle parle.

### La famille

Une **famille** est une catégorie de contenu que l'hôte sait accueillir : elle est définie par
un **contrat** (une interface que tout type de la famille implémente), un **registre** (où les
types sont déclarés) et un **cycle de vie** (qui instancie, qui dispose). Il y a huit familles :
Tool, Node3D, Protocole de connexion, Instrument behavior, Node3DParameter, Menu, Effect,
Music generator.

Une famille n'est pas du contenu : on n'ajoute pas « un Node3D » quand on ajoute une famille,
on ajoute la possibilité qu'il existe des Node3D. Ajouter une famille est un changement de
l'hôte, rare, à décider comme un socle (section 0 de `IDEAS.md`). Ajouter un type est le
travail ordinaire d'une idée.

Une famille répond à : *quel contrat, quel registre, qui instancie, qu'est-ce qui est
synchronisé pour tous ses membres.*

### Le type (kind)

Un **type** est une entrée de catalogue : une description statique, enregistrée une fois au
chargement, partagée par tout le monde, sans état. Il sait **créer** des instances mais n'en
est pas une. Dans le code, un type est une constante exportée (`POINTER_TOOL_KIND`), un objet
`Node3DFactory`, une entrée de `EffectRegistry`, une chaîne de protocole (`"audio"`).

Un type répond à : *qu'est-ce que c'est, comment ça se nomme, comment on en fabrique un.*

### L'instance

Une **instance** est un exemplaire vivant, créé à partir d'un type par l'hôte, avec une
position dans le monde ou une main qui la tient, un état propre, et une fin de vie
(`dispose`). Dans le code : un `Tool` dans une main, un `Node3DInstance` posé dans la scène,
une `N3DConnectionInstance` entre deux ports, un `Effect` monté sur un mesh.

Une instance répond à : *où est-il, dans quel état, à qui appartient-il, quand disparaît-il.*

### La correspondance par famille

| famille | contrat | type (catalogue) | instance (vivante) | qui instancie |
| --- | --- | --- | --- | --- |
| Tool | `ToolKind` + `Tool` | `ToolKind` (`#KINDS` de `ToolSystem`) | `Tool`, un par main | `ToolSlot` |
| Node3D | `Node3DFactory` + `Node3D` + `Node3DGUI` | `Node3DFactory`, identifié par un `kind` string (`FACTORY_KINDS`) | `Node3DInstance` (gui + node + ports) | `Node3dManager.addNode3d` |
| Protocole de connexion | `Node3DConnectable` | protocole : `Node3DConnectable.type` (`"audio"`, `"midi"`, `"automation"`, sync, `"node3d"`) | un `Node3DConnectable` est un **port** d'une instance ; une `N3DConnectionInstance` est un **lien** entre deux ports | `ConnectionManager.connect` |
| Instrument behavior | `Behavior` babylon sur `InstrumentInteractionSystem` | classe de `src/instrument/behavior` (`StrikeBehavior`, `HoldBehavior`...) | un behaviour attaché à un mesh d'une instance de Node3D | le Node3D, dans `create` |
| Node3DParameter | `Node3DParameter` | interface `Node3DParameter` | `N3DParameterInstance`, synchronisé par clé | `context.createParameter` |
| Effect | `Effect` + factory `(ctx, params)` | id enregistré dans `EffectRegistry` | `Effect` monté par un `EffectSystem` sur un mesh, piloté par un `EffectProfile` | `VisualEffectSystem` |
| Menu | `BlocksMenu` | un constructeur de menu | un menu ouvert pour une main | `MenuManager` |
| Music generator | celui de Node3D | une factory de Node3D taguée `generator` | une instance de Node3D | idem Node3D |

### Trois niveaux pour les connexions, pas deux

La connexion est la seule famille à trois étages, et c'est là que le vocabulaire glisse le
plus souvent :

- le **protocole** : le `type` string, sa couleur, la forme de l'objet que `connectAsInput`
  retourne. C'est le type de contenu. Il y en a cinq : audio, midi, automation, sync, node3d.
- le **port** (connectable) : une entrée ou une sortie d'une instance de Node3D, avec son mesh,
  sa direction, son `max_connections`. Il appartient à l'instance de node.
- le **lien** (connection) : une paire (port de sortie, port d'entrée), synchronisée comme deux
  ids de node et deux ids de port.

Dire « un nouveau connectable » est ambigu : préciser *nouveau protocole*, *nouveau port sur
tel node*, ou *nouveau lien*.

---

## 2. Les familles, une par une

### 2.1 Node3D

Un module posé dans le monde : une GUI 3D (`Node3DGUI`) dans un cube unité de `[-0.5, 0.5]`
mis à l'échelle par `worldSize`, et une logique (`Node3D`) qui expose des paramètres, des
boutons et des ports par son `Node3DContext`. Il est synchronisé **par clés d'état** :
`setState(key)` / `getState(key)` / `notifyStateChange(key)`, en JSON, à travers yjs.

Ce qu'un Node3D **peut** faire : créer ses ports, paramètres et boutons ; ouvrir un menu ;
émettre un signal coloré ; créer une sortie audio spatialisée ; ajouter un filtre global ;
équiper une main d'un outil ; lire sa position et celle du joueur.

Ce qu'un Node3D **ne peut pas** faire aujourd'hui (socles A et B de `IDEAS.md`) :

- voir les autres nodes, leurs positions, leurs connexions, les autres joueurs, **sauf ceux qui
  sont cablés sur un de ses ports `node3d`** : ceux-là, il les voit entièrement par leur
  `Node3DHandle` (voir 2.1.2 et 2.4). C'est la porte de sortie du socle A : une idée « le node
  voit ses voisins » qui accepte de dire « ses voisins sont ceux qu'on lui a branchés » ne dépend
  plus de A du tout ;
- être l'autorité d'une simulation : sa logique tourne sur chaque client, seul l'état par clés
  est partagé. Une simulation non déterministe (fluide, pendule, aléa) diverge d'un client à
  l'autre sans règle d'autorité.

Un type de Node3D est une `Node3DFactory` : `label`, `description`, `tags` (singulier,
minuscules, anglais, `_`), `createGUI`, `create`. Les tags standards sont documentés dans
`Node3D.d.ts` ; un node porte tous ceux qui s'appliquent. Les tags disent aussi ce que le node est
pour le joueur, et cinq rôles reviennent assez souvent pour mériter chacun sa règle propre.

#### 2.1.1 Node3D instrument (`instrument`, `live_instrument`, `controller`)

Un module qu'on joue à la main plutôt qu'on ne règle. `HyperKeyboardN3D` en est le patron : une
grille de meshes, chacun portant un behaviour d'instrument (2.3), et des sorties midi ou
automation. Ce qui le définit n'est pas de faire du son (un instrument peut n'émettre que du
midi vers un autre node) mais que **le geste est l'entrée** : la matière, la surface, la
disposition des touches sont la vraie interface, pas un paramètre.

Trois règles qui lui sont propres. Sa disposition est un choix de jeu à part entière : un clavier
en cube à trois axes n'est pas un clavier en ligne, et l'idée doit dire ce que l'axe supplémentaire
porte (octave, timbre, voix). Il reçoit une **force** et une **vélocité**, jamais un type d'outil
(2.3), donc la même surface se joue au doigt, à la baguette ou au rayon sans un cas de plus. Et ce
qu'il produit sort par un port, ce qui le rend branchable : un instrument qui fabrique lui-même son
son au lieu de le sortir en midi se coupe de tout le reste du graphe.

#### 2.1.2 Node3D de gestion (`holder`)

Un module dont la matière première est **d'autres modules**. Il porte un ou plusieurs ports du
protocole `node3d` (2.4) ; on lui câble des nodes, et il reçoit sur chacun un `Node3DHandle` :
position, taille, paramètres, ports, câbles, clonage, suppression. `PlaqueN3D` (une planche qui
emmène ce qu'on pose dessus) et `RandomizerN3D` (un bouton qui retire les câbles entre les nodes
gérés et les redistribue au hasard) sont les deux exemples.

C'est la seule famille de node qui agit sur le graphe, donc la seule où R7 (réversibilité) mord
vraiment. Ses règles : ce qui n'est pas câblé n'est **pas** touché, ce qui permet de secouer un
patch de l'intérieur sans le débrancher du reste ; les câbles `node3d` eux-mêmes sont de la
structure, pas du signal, et un gestionnaire ne les défait ni ne les redistribue, sinon il se
détruit lui-même ; l'action se fait **sur un pair seulement**, celui qui a pressé le bouton, et
c'est l'état ordinaire des nodes touchés qui la propage, jamais le gestionnaire (sinon chaque pair
tire son propre hasard). Un même node câblé deux fois donne deux poignées : c'est l'`id` réseau
qui dit qu'il n'y en a qu'un. Et la poignée meurt avec le câble, avec le node tenu ou avec le
gestionnaire, indifféremment : `detach` est appelé une fois, quelle que soit la cause, rien ne se
compte à la main.

Une idée de gestionnaire se formule presque toujours pareil : *quelle opération sur un ensemble de
modules vaut la peine d'être un objet qu'on tient*. Ranger, cloner en grille, figer, échanger deux
modules, enregistrer un état et le rappeler, contraindre les paramètres les uns aux autres.

#### 2.1.3 Les trois autres rôles

Générateur (`generator`, produit sans entrée), effet (`effect`, transforme entre une entrée et une
sortie), consommateur (`consumer`, sortie audio, visualiseur, enregistreur). Ils n'ont pas de règle
propre au-delà de celles du Node3D ; ils comptent surtout parce que `VisualEffectSystem` choisit le
profil visuel d'un node d'après ce rôle déduit du graphe (2.6).

### 2.2 Tool

Ce qu'une main tient. Un type est un `ToolKind` (`label`, `description`, `tags`, `create`) ;
l'instance est un `Tool` qui, à sa construction, lie ses inputs et crée ses meshes à partir de
son `ToolContext`, et libère tout dans `dispose`. **Une seule instance par main**, jamais
synchronisée, jamais vue par les autres joueurs comme telle.

Un tool demande explicitement les interactions ordinaires du monde qu'il veut, une par une :
`pointer`, `parameters`, `buttons`, `hitboxes`, `connections`. Elles sont éteintes par défaut.
`pointer` est le socle des quatre autres. Il peut aussi filtrer ce que son pointeur touche
(`pickFilters`).

Un tool agit sur le graphe **par les managers publics** (`ConnectionManager.connect`,
`Node3dManager`, `VisualTube` d'aperçu), jamais par un accès direct aux internes d'une instance.

Trois groupes de types. Les **outils d'application** (tag `tool` : pointeur, paramètre, crayon)
manipulent le graphe et l'interface. Les **outils d'instrument** (baguettes, archet, fléau,
épée...) portent un `Interactor` et ne servent qu'à jouer la matière (2.3). Les **outils de
geste** (`MagicTool`, crâne, blob) lisent un mouvement entier de la main et en tirent un acte :
ils n'ont pas de pointeur ordinaire mais une analyse à eux, et tombent tous sous R5.

L'outil est le point d'entrée le moins cher du projet : une seule instance par main, rien de
synchronisé, rien à déclarer aux autres joueurs, et l'accès aux managers publics. Une idée qui
tient dans un outil comme dans un node s'écrit comme un outil (R3).

### 2.3 Instrument, et instrument interaction

Un instrument n'est pas une famille à part : c'est **un mesh d'un Node3D qui porte un ou
plusieurs behaviours** de `src/instrument/behavior`. Un tambour est un `StrikeBehavior` plus un
`SurfaceBehavior` sur le même mesh.

La chaîne est fixe :

1. un tool crée et déplace un `Interactor` (tête de baguette, bout de doigt, bout de rayon),
   par `InstrumentInteractionSystem`. Un Node3D n'en crée jamais ;
2. l'interactor publie ce qu'il vise (`aim`), touche (`touch`) et presse (`activate`), avec sa
   `velocity` en unités où 1 est le geste ordinaire ;
3. le behaviour attaché au mesh traduit ces événements en jeu instrumental
   (`onHit(force)`, `onHold`, `onPluck`, `onRub`...).

Les behaviours existants : `Aim`, `Activate`, `Hold`, `Strike`, `Pluck`, `Rub`, `Surface`.
Une nouvelle manière de jouer la matière est un **nouveau behaviour**, pas une modification du
système ni un cas spécial dans un tool. L'instrument ne sait jamais quel outil le joue.

Garanties à ne pas casser : visé avant touché, touché avant activé ; ce qui est imbriqué se
ferme en premier ; tout se ferme au `dispose`. La force n'est jamais plafonnée par le système,
c'est l'instrument qui décide quoi en faire.

### 2.4 Types de connexion (protocoles)

| protocole | `type` | transporte | objet de connexion |
| --- | --- | --- | --- |
| audio | `"audio"` | un `AudioNode` Web Audio | `subscribe/unsubscribe` sur les changements d'`AudioNode` |
| midi | `"midi"` | un `WamNode` (événements WAM) | `subscribe/unsubscribe` sur les changements de `WamNode` |
| automation | `"automation"` | des valeurs de paramètre (`AutomationParameterInfo`) | l'info du paramètre cible |
| sync | sync | un `Container` de timing (start, duration) qui cascade | `{input, output}` |
| node3d | `"node3d"` | un `Node3DHandle` sur le node à l'autre bout | la poignée elle-même, livrée à `attach` |

Le protocole `node3d` est à part, et c'est la seule exception à « le lien ne transporte pas du
contenu » : il ne transporte pas de signal du tout, il livre **une prise sur un module**. Le côté
entrée est fourni par l'hôte sur tout node, donc un node qui veut en tenir d'autres n'écrit que le
côté sortie (`Node3DN3DConnectable.Output`). Un câble `node3d` est de la **structure** : il ne
passe pas dans les mêmes idées que les quatre autres, il ne se mixe pas, il ne s'opère pas, et un
gestionnaire (2.1.2) l'ignore quand il retouche le graphe.

Un lien se fait en deux appels : `input.connectAsInput()` retourne un objet, passé à
`output.connectAsOutput(obj)`. La déconnexion suit l'ordre inverse. **Le lien n'a pas de
logique propre** (socle C) : filtrer, retarder, transposer se fait par un module posé entre
les deux, jamais par le lien lui-même. Ouvrir cette possibilité est un changement du modèle,
à décider comme tel, pas à glisser dans une idée.

Une nouvelle unité de signal (couleur, tonalité, distance, tension...) est soit un nouveau
protocole avec ses classes `Input`/`Output`, soit de l'automation avec une convention d'unité
(voir E et la roue chromatique 4.10 de `IDEAS.md`). La deuxième voie est à préférer tant que le contenu tient dans un
nombre.

### 2.5 Node3DParameter et Node3DButton

Un paramètre est une valeur numérique bornée (`min`, `max`, `exponant`, `step`), draggable,
**synchronisée**, et automatisable par un port automation. Un bouton est une action
**locale, non synchronisée** (`press`/`release`), faite pour déclencher une note. Ne pas mettre
d'état de patch dans un bouton ni d'action instantanée dans un paramètre.

### 2.6 Visual effects

Un effet est un module visuel monté sur un mesh, piloté chaque frame par un `AudioSignal`
dont tous les champs sont dans `[0, 1]` (`strength`, `tone`, `bass`, `flux`, `onset`,
`pitch`...). Le type est un id enregistré dans `EffectRegistry` avec une factory
`(ctx, params) => Effect` ; l'instance est un `Effect` (`update`, `stop`, `dispose`).

Les effets sont regroupés par `EffectProfile` (un id, une map `effectId → params`), et
`VisualEffectSystem` choisit le profil d'un node selon son **rôle dans le graphe**
(`source`, `effect`, `sink`, `standalone`, `visualizer`) et selon qu'il est sur un chemin
valide vers une sortie. Les tubes de connexion ont leurs propres profils.

Un effet est **purement visuel et local** : il ne modifie ni l'audio, ni l'état, ni le graphe,
et n'est pas synchronisé. Un effet qui gêne l'interaction (tremblement d'échelle, onde qui
grossit) se suspend quand `signal.pointed` est vrai.

### 2.7 Menu, Music generator

Un menu est une liste de choix ouverts pour une main (`context.openMenu`). Un music generator
n'est qu'un Node3D tagué `generator` (produit du son ou du midi sans entrée) ; il n'a pas
d'interface à part.


### 2.8 Tableau des types de contenu d'idée

Les huit familles disent ce que l'hôte sait accueillir. Ce tableau-ci dit ce qu'on **écrit**
concrètement quand on a une idée : c'est la liste dans laquelle une idée doit se ranger, et
l'entrée de `/idea-generation` pour ce projet. Chaque ligne est un type de contenu ; les colonnes
sont ce qu'il faut savoir avant d'écrire l'idée.

| type de contenu | exemple existant | ce que le joueur y fait | état | ce qu'il voit | coût |
| --- | --- | --- | --- | --- | --- |
| **Node3D instrument** (2.1.1) | `HyperKeyboardN3D`, `DrumPlateKitN3D`, maracas | frappe, tient, frotte, pince une matière ; la disposition est l'interface | synchro par clés ; le jeu lui-même est local et immédiat | lui-même, la force et la vélocité reçues | moyen (GUI + behaviours + sortie) |
| **Node3D générateur** | `OscillatorN3D`, `SequencerN3D`, `NoteBoxN3D` | règle, programme, déclenche ; produit sans entrée | synchro par clés (le motif, le tempo) | lui-même | moyen |
| **Node3D effet** | WAM 3D, filtres | insère entre deux modules, règle | synchro par clés | lui-même | faible si WAM, moyen sinon |
| **Node3D sortie / visualiseur** | `AudioOutputN3D`, `visualizer/` | écoute, regarde, place dans l'espace | souvent rien | lui-même, son signal audio | faible |
| **Node3D de gestion** (2.1.2) | `PlaqueN3D`, `RandomizerN3D` | câble des modules dessus, puis agit sur tout le paquet d'un geste | synchro par clés ; ce qu'il change est l'état des nodes tenus, poussé depuis un seul pair | **les nodes qu'on lui a câblés**, entièrement (frame, paramètres, ports, câbles, clone, delete) | moyen, mais R7 obligatoire |
| **Protocole de connexion** | audio, midi, automation, sync, node3d | branche un type de câble qui n'existait pas | le lien (deux ids de node, deux ids de port) | rien des deux bouts, sauf ce que l'objet de connexion porte | élevé : touche tous les nodes du protocole |
| **Port sur un node** | une sortie midi de plus | vise, branche, débranche | appartient à l'instance | rien des autres ports | très faible |
| **Tool d'application** | pointeur, paramètre, crayon | manipule le graphe, l'interface, l'espace | **aucun**, local à une main | ce que son pointeur touche, plus les managers publics | faible |
| **Tool d'instrument** | baguette, archet, fléau | joue la matière par un `Interactor` | aucun | ce que son interactor vise et touche | faible |
| **Tool de geste** | `MagicTool`, blob, crâne | dessine ou bouge, et l'analyse du mouvement décide | aucun | son propre tracé | moyen, plus un banc (R5) |
| **Instrument behavior** | `Strike`, `Pluck`, `Rub`, `Hold` | une nouvelle manière de jouer une surface | aucun | l'interactor qui le touche, jamais l'outil | faible |
| **Node3DParameter / Button** | slider, `BooleanN3DParameter` | règle (synchro) ou déclenche (local) | paramètre synchro, bouton local | rien | très faible |
| **Effect visuel** | `EffectRegistry` | ne fait rien, regarde | aucun, jamais synchro | l'`AudioSignal` du mesh, dans `[0,1]` | très faible |
| **Menu** | `BlocksMenu` | choisit | aucun | ce qu'on lui donne | très faible |

Lecture de la colonne **coût** : elle dit dans quel ordre attaquer (section 7, point 4), pas si
l'idée est bonne. La colonne **ce qu'il voit** est la réponse à R3, déjà écrite ; la colonne
**état** est la réponse à R2.

### 2.9 Amorces par type, pour la génération d'idées

Ce tableau est fait pour l'étape 1 de `/idea-generation` : les **mots à injecter** vont dans les
termes « liés au sujet » de `words.json`, et la **question génératrice** est la forme que doit
prendre l'idée une fois la combinaison trouvée. Le vocabulaire aléatoire, lui, reste étranger au
projet : ne pas le remplir avec cette colonne.

| type de contenu | verbes amorces | mots à injecter | question génératrice | piège propre |
| --- | --- | --- | --- | --- |
| Node3D instrument | frapper, pincer, frotter, souffler, tenir, glisser, empiler | touche, grille, corde, peau, anche, axe, octave, timbre, vélocité, résonance | quelle matière, et que dit chacun des trois axes ? | fabriquer son son au lieu de le sortir par un port |
| Node3D générateur | répéter, dériver, semer, compter, attendre | motif, graine, mesure, tempo, pas, boucle, hasard | qu'est-ce qui se programme à la main, qu'est-ce qui se tire ? | un aléa non semé casse la synchro (socle B) |
| Node3D effet | filtrer, retarder, plier, saturer, mélanger | gain, délai, spectre, seuil, enveloppe | pourquoi le poser dans l'espace plutôt que le régler dans un menu ? | mettre la logique dans le câble (socle C) |
| Node3D sortie | écouter, montrer, enregistrer, mesurer | haut-parleur, salle, distance, trace, niveau | que voit-on du son qu'on n'entendait pas ? | faire passer du PCM par l'état (socle D) |
| Node3D de gestion | ranger, figer, cloner, échanger, mémoriser, secouer | plaque, poignée, paquet, grille, verrou, rappel, ordre | quelle opération sur un ensemble de modules mérite d'être un objet qu'on tient ? | toucher ce qui n'est pas câblé, ou tirer le hasard sur chaque pair |
| Protocole de connexion | transporter, convertir, accorder | couleur, tension, distance, lumière, horloge | ce contenu tient-il dans un nombre ? alors c'est de l'automation avec une unité (socle E) | inventer un protocole pour ce qu'un scalaire porterait |
| Port sur un node | ouvrir, exposer, doubler | entrée, sortie, direction, limite | quel node gagne à exposer ce qu'il gardait pour lui ? | un port ne connaît pas les autres ports |
| Tool d'application | viser, saisir, couper, coller, étirer, trier | rayon, pince, loupe, aimant, règle, gomme | quelle manipulation du graphe est aujourd'hui pénible à deux mains ? | toucher les internes au lieu des managers |
| Tool d'instrument | frapper, gratter, caresser, lancer | baguette, archet, maillet, gant, souffle | quel geste physique manque pour jouer ce qui existe déjà ? | une condition « seulement avec cet outil » écrite dans l'instrument |
| Tool de geste | dessiner, répéter, tracer, effacer | spirale, boucle, symétrie, échelle, période | que peut-on lire d'un mouvement entier qu'un clic ne dit pas ? | une distance en mètres (R5) |
| Instrument behavior | maintenir, relâcher, glisser, gratter | contact, force, durée, surface, arête | quelle manière de toucher une surface n'a pas encore de nom ? | modifier le système au lieu d'ajouter un behaviour |
| Paramètre / bouton | régler, basculer, déclencher | plage, pas, exposant, unité | synchronisé ou instantané ? l'un des deux, jamais les deux | un toggle partagé est un paramètre, pas un bouton |
| Effect visuel | pulser, gonfler, teinter, trembler | grave, aigu, attaque, flux, halo | que rend visible l'audio qu'on ne voit pas ? | décider quelque chose depuis un effet |
| Menu | choisir, nommer, classer | liste, catégorie, tag, aperçu | quel choix est aujourd'hui caché ? | une option de plus sans décision de jeu (R6) |

Une idée sortie de `/idea-generation` n'est pas finie tant qu'elle n'a pas **une ligne de ces
tableaux** comme réponse à R1, puis un passage par R2 à R7.

---

## 3. Règles de conception d'une idée

Chaque idée retenue dans `IDEAS.md` doit pouvoir répondre à ces questions. Une idée qui n'y
répond pas n'est pas prête ; une idée qui y répond mal est à reformuler ou à écarter.

### R1. Nommer la famille, le type et le niveau

Dire d'abord quelle ligne du tableau 2.8 l'idée occupe, puis : *c'est un nouveau type de X*, ou *c'est un comportement de l'instance de X*,
ou *c'est une capacité de l'hôte que X n'a pas*. Une idée qui demande une famille nouvelle le dit comme un socle. Un titre d'idée porte la famille en préfixe
quand ce n'est pas évident (« Tool Loupe », « Node3D Paroi », « Effect Battement », « Holder Établi »,
« Behavior Farouche »).

### R2. Dire ce qui est état, et qui l'a

Pour chaque donnée que l'idée introduit : est-elle **synchronisée** (état par clé d'un
Node3D, lien, position), **locale** (tool, effet, bouton), ou **calculée** (rôle dans le
graphe, analyse audio) ? Si elle est synchronisée et non déterministe, **qui fait autorité** ?
Sans réponse, l'idée dépend du socle B.

### R3. Dire ce qu'elle voit

Un Node3D ne voit que lui-même et le joueur. Un tool voit ce que son pointeur touche et les
managers publics. Une idée « par proximité », « par voisinage », « selon la salle » dépend du
socle A si elle est portée par un node, et n'en dépend pas si elle est portée par un tool
(c'est la main qui calcule). Préférer le tool quand les deux sont possibles : c'est ce qui a
sauvé l'aimant (1.1). Troisième voie, souvent la meilleure pour un node : **faire câbler**. Un
port `node3d` livre une poignée complète sur chaque module branché (2.1.2), sans socle A, au prix
d'un geste explicite du joueur. Le voisinage devient un choix au lieu d'une distance, ce qui est
presque toujours une meilleure décision de jeu (R6).

### R4. Passer par le lien existant

Tout ce qui modifie un signal en transit est un **module** entre deux ports, pas une propriété
du lien (socle C). Tout ce qui transporte de l'audio enregistré entre joueurs est un problème
de **transport binaire** (socle D), à traiter une fois pour toutes, pas par idée.

### R5. Rien en mètres, rien en absolu, quand c'est un geste

Une idée fondée sur le geste (dessin, frappe, mouvement) se décrit en ratios, en parts du
tout, en angles, jamais en distances absolues : la même figure dessinée petite ou grande
doit donner le même résultat. C'est la règle du `MagicTool` (voir `CLAUDE.md`) et elle vaut
partout.

### R6. Une décision de jeu par idée

Chaque idée dit en une phrase quelle décision le joueur prend qu'il ne prenait pas avant
(« où je pose mes modules, pas quel port je vise »). Une idée qui n'ajoute qu'une option
de menu ou un réglage de plus n'a pas de décision de jeu et est écartée.

### R7. Réversibilité

Une action qui transforme le graphe (fusion, décomposition, verrou) dit comment on revient
en arrière. Sinon personne n'ose s'en servir.

---

## 4. Pièges à éviter

**Confondre type et instance.** Un `let` au niveau du module d'un fichier de tool est partagé
par les deux mains. Un état posé sur une `Node3DFactory` est partagé par tous les nodes de ce
kind, sur tous les clients. Tout état va dans l'instance.

**Oublier `dispose`.** Une seule instance vit par main, et un observer qui fuit continue
d'agir sous l'outil suivant. Un behaviour d'instrument non détaché continue de jouer sur un
mesh disposé. Tout ce qu'une instance crée, elle le libère.

**Mettre la logique de jeu dans un effet.** Les effets lisent, ne décident pas. Une idée où
« le glow déclenche la note » est une idée de behaviour ou de node, avec un effet en plus.

**Donner un état à un bouton.** Un bouton n'est pas synchronisé ; un toggle qui doit être
partagé est un paramètre à deux valeurs.

**Inventer un connectable qui se branche seul.** Un port ne connaît pas les autres ports.
Le branchement automatique est un comportement d'outil (la main qui tient calcule), ou un
socle A + B à construire d'abord.

**Faire tourner une simulation dans un Node3D sans autorité.** `ElectroballsN3D` en est le
contre-exemple : chaque joueur voit des balles différentes. Soit un client fait autorité et
pousse l'état, soit l'idée est assumée locale et dite comme telle.

**Faire passer de l'audio par l'état JSON.** Des secondes de PCM par yjs ne sont pas un
état, c'est un transport (socle D).

**Modifier le système d'interaction pour un instrument.** Une nouvelle manière de jouer est un
behaviour de plus. `Interactor` et `InstrumentInteractionSystem` ne savent rien de ce qu'ils
touchent, et c'est ce qui permet à tout outil de jouer tout instrument.

**Faire dépendre un instrument de l'outil qui le joue.** L'instrument reçoit une force et une
vélocité, jamais un type d'outil. Si une idée dit « seulement avec la baguette », c'est un
filtre de l'outil (`pickFilters`) ou un tag, pas une condition dans le behaviour.

**Un tool qui touche les internes.** Un tool passe par `ConnectionManager`, `Node3dManager`,
`ToolSystem.equip`. Lire ou écrire `Node3DInstance` directement rend l'outil dépendant d'un
détail que l'hôte peut changer.

**Décider dans un tool ce que le monde offre.** Les interactions ordinaires (`hitboxes`,
`connections`...) sont demandées par le tool, pas réimplémentées par lui.

**Calibrer sans casque.** Les seuils d'un geste se règlent sur un banc reproductible d'abord
(voir `magic.bench.mjs`), en headset ensuite. Une valeur trouvée « à la main » sans banc
n'est pas une valeur.

---

## 5. Structure de `IDEAS.md`

Le fichier est un carnet ordonné par sujet, pas une liste plate ni un journal des passes de
brainstorming. Sa forme est fixe :

```
# IDEAS
En-tête : ce qu'est le carnet, rappel des huit familles, comment se lisent les renvois.

## 0. Socles manquants
Les capacités que le projet n'a pas et dont plusieurs idées dépendent, nommées une fois
par une lettre (A, B, C...). Chaque idée y renvoie par sa lettre, jamais en réécrivant
le besoin.

## N. Thème
Un paragraphe qui dit la piste commune des idées du thème et pourquoi elle compte, plus
ce qui vaut pour toutes ses idées (le socle qu'elles partagent, la famille qu'elles
touchent) afin que chaque idée n'ait pas à le redire.

### N.M Idée
Un titre et un paragraphe, au format de la section 6.

...

## Ordre d'attaque suggéré
Liste numérotée : les socles d'abord, puis ce qui n'en dépend pas, puis ce qui se débloque
après chaque socle. Une idée y figure par son numéro.

## Ce qui est refusé, et pourquoi
Les motifs de refus, un paragraphe chacun, avec quelques exemples par motif et l'exception
gardée quand il y en a une. Des motifs, pas un inventaire : une idée nouvelle qui tombe
dans un motif est déjà jugée.
```

Règles sur la structure :

- **Un thème est un sujet**, jamais une session de travail. Une nouvelle passe de
  brainstorming ne crée pas de thème : chaque idée gardée va dans le thème dont elle parle,
  et si elle n'en a aucun, c'est un thème de sujet à ouvrir ou une idée à écarter.
- **Rien ne garde la trace de son histoire.** Une idée fondue dans une autre disparaît et son
  contenu est écrit dans celle qui reste ; on n'écrit pas d'où elle venait, ni ce qu'elle
  était avant, ni quelle passe l'a tranchée. Ce qui compte est l'état présent de l'idée.
- **Les numéros sont un index, pas une identité.** Une réorganisation renumérote, et les
  renvois sont mis à jour dans le même geste. Pas de trous laissés exprès. Un renvoi porte le
  nom autant que le numéro (« l'aimant (1.1) »), ce qui le rend réparable de mémoire.
- **Un socle est nommé une seule fois** dans la section 0. Une idée qui en découvre un nouveau
  l'ajoute là, avec la lettre suivante, et renvoie à la lettre.
- **Ce qui est décidé est marqué `Décidé :`** dans le paragraphe, et ne se rediscute pas sans
  dire pourquoi.
- **Deux idées qui se ramènent à un seul objet n'en font qu'une.** Un réglage, une variante ou
  un mode se disent dans le paragraphe de l'idée hôte, pas sous un numéro à part.
- **L'ordre d'attaque est réécrit à chaque passe** ; les idées ne sont retouchées que quand
  leur contenu change.

---

## 6. Forme d'une idée

Une idée est **un titre et un paragraphe**, rien d'autre. Pas de champs, pas de liste de
rubriques : les règles R1 à R7 sont une grille de lecture, pas un formulaire à remplir.

```
### N.M Titre, préfixé par la famille si ce n'est pas évident
Un seul paragraphe, court, au présent : ce que le joueur fait, ce que ça change pour lui, et
ce que ça demande au projet quand ce n'est pas trivial (un socle par sa lettre, un renvoi à
une autre idée par son numéro, une capacité qui manque). Ce qui est tranché s'écrit dans le
même paragraphe, en une phrase commençant par « Décidé : ».
```

Exemple :

```
### 1.14 Main d'échelle
Change la taille d'un module plutôt que sa position. Un séquenceur agrandi devient jouable
au corps entier, réduit il devient un composant qu'on range. Plus petit qu'il n'y paraît :
l'état `position` synchronise déjà `scale`, l'outil n'a qu'à le piloter.
```

Ce qui va dans le paragraphe : la décision de jeu, la famille si le titre ne la porte pas,
les socles (A, B, C, D) et les renvois. Ce qui n'y va pas : le détail d'implémentation, la
liste des fichiers, une analyse de l'état synchronisé. Si le paragraphe dépasse six ou sept
lignes, l'idée est soit deux idées, soit un socle à sortir en section 0.

Un thème (`## N.`) garde son paragraphe d'introduction, qui dit la piste commune et pourquoi
elle compte.

Une idée écartée disparaît du carnet ; seul son motif survit, en fin de fichier, et seulement
si ce motif n'y est pas déjà écrit.

---

## 7. Ordre de traitement

1. Lire la section 0 de `IDEAS.md` : les socles passent avant tout, dans l'ordre que donne
   l'ordre d'attaque.
2. Pour chaque idée, appliquer R1 à R7. Reformuler ce qui ne passe pas, écarter ce qui ne peut
   pas passer, avec motif.
3. Regrouper ce qui partage un socle ou une base (les opérateurs 5.1 et les convertisseurs 5.3
   sont une seule base, F).
4. Implémenter en commençant par la famille la plus locale possible : un tool avant un node, un
   behaviour avant un système, un effet en dernier.
5. Câbler aux endroits d'enregistrement : `#KINDS` de `ToolSystem`, `FACTORY_KINDS` et
   `createFactories` de `Node3DBuilder`, `EffectRegistry.register` et l'export dans
   `visual/effects/index.ts`, l'export dans `instrument/index.ts` et `tool/index.ts`.
6. Pas d'em dash dans les commentaires.
