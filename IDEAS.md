# IDEAS

Le carnet d'idées du projet. Rien ici n'est décidé ni commencé. Chaque idée dit ce qu'elle
apporte comme décision de jeu et sur quel élément existant elle se branche. La grille de
lecture, le vocabulaire et les règles R1 à R7 sont dans `IDEAS_GUIDE.md`.

Les huit familles extensibles, pour situer chaque idée : Tool, Node3D, Protocole de connexion,
Instrument behavior, Node3DParameter, Menu, Effect, Music generator.

La section 0 nomme les capacités manquantes, une lettre chacune ; toute idée qui en dépend
renvoie à la lettre. Les thèmes 1 à 9 groupent les idées par sujet. Une idée est `### N.M`, et
les renvois se font par numéro. La dernière section dit ce qui est refusé et pourquoi, pour ne
pas le regénérer.

---

## 0. Socles manquants

La moitié des idées repose sur des capacités que le projet n'a pas. Elles passent avant le
reste de l'ordre d'attaque.

**A. Une vue du monde pour les nodes.** Le `Node3DContext` ne donne que `getPosition()` et
`getPlayerPosition()`. Aucun node ne peut lister les autres nodes, leurs positions, les
connexions ou les joueurs. Toute idée « par proximité », « par voisinage » ou « selon la salle »
portée par un node en dépend. À ajouter au contexte, en lecture seule. Ce qui est porté par un
outil n'en dépend pas : la main calcule (R3).

**B. Une autorité par node.** La logique d'un Node3D tourne sur chaque client et seul l'état
par clés est synchronisé ; rien ne désigne un client comme référence. `ElectroballsN3D` en est
l'exemple : zéro état, donc chaque joueur voit des balles différentes. Trois réponses possibles,
dans cet ordre de préférence : un mouvement **analytique** recalculé partout depuis un état à
clé (`{impulsion, t0}`, `{vitesse, t0}`, une graine) est identique sans autorité et sans socle ;
sinon le dernier client qui a touché fait autorité et pousse l'état ; sinon l'idée est assumée
locale et dite comme telle. Les fluides et l'aléa non semé restent bloqués sur B.

**C. Le lien porte un scalaire.** Une connexion, c'est `input.connectAsInput()` puis
`output.connectAsOutput(obj)`, avec un `AudioNode.connect` ou un `WamNode` direct : rien ne peut
se glisser sur le câble. Décidé : le lien porte **un seul scalaire, fixé par son protocole**, et
rien d'autre. Audio, un gain ; midi, une transposition ; automation, un facteur ; sync, un
décalage en mesures. `N3DConnectionInstance` porte un état `param`, un `GainNode` s'insère pour
l'audio, un relais pour le midi, ce qui supprime le `connectEvents` direct entre WamNodes et
touche donc tous les nodes midi. Refactor lourd mais borné, à faire avant tout opérateur pour ne
rien écrire deux fois. C'est ce qui rend le graphe mixable : aujourd'hui trois sources demandent
trois gains. Tout le reste passe par un module posé entre deux ports, jamais par le lien (R4).

**D. Un transport pour l'audio enregistré.** L'état d'un node est du JSON passé par yjs. Tout ce
qui déplace de l'audio enregistré d'un joueur à un autre demande un canal binaire à part. C'est
un problème de transport, pas de format.

**E. Une unité sur l'automation, et un hook de lecture.** L'automation est normalisée : la sortie
ne connaît que la plage du premier paramètre branché, donc rien ne peut « sortir une fréquence ».
Ajouter une unité optionnelle au paramètre (`hz`, `midi_note`, `seconds`, `ratio`, `db`) : un
émetteur qui la connaît sort une valeur exacte, sinon il retombe sur le comportement actuel.
Une sortie automation doit aussi connaître le node receveur, pas seulement son
`AutomationInputInfo`, et chaque protocole doit exposer un hook de lecture de ce qui circule.
Par ricochet, l'oscillateur passe d'une fréquence linéaire 130..230 Hz à une plage musicale
logarithmique, sinon rien ne se teste.

**F. Une base opérateur.** Un bloc minuscule à une entrée, une sortie et un réglage optionnel,
fabriqué par une fonction. Remplace `AutomationToolN3D`, mixeur inachevé. Dix opérateurs pour un
fichier, et le préalable de tout le thème 5.

**G. Une entrée midi écoutante.** Un node non-WAM qui veut lire du midi se fabrique aujourd'hui
un faux WamNode (NoteBox) ou intercepte `scheduleEvents` (les effets). En faire un connectable
officiel, avec un `max_connections` réglable, partagé par NoteBox, les effets, les convertisseurs
et tout le routage midi du thème 6.

**H. Geler un node, et en exposer une tranche.** `freeze`/`unfreeze` (ou un état `frozen`
synchronisé) implémenté par tous les nodes, pour la glace (8.6) ; et une méthode par laquelle un
node expose une tranche de lui-même, une mesure ou une piste, pour le lève-cadre (7.6). Les deux
seuls ajouts à l'interface Node3D que le carnet demande.

**I. Créer un node avec un état initial, et un node qui possède un Interactor.**
`Node3dManager.addNode3d` n'accepte pas d'état de départ, ce que le miroir (1.12) et l'établi
(9.1) demandent. Et un Node3D ne crée pas d'`Interactor`, ce que le marteau (5.6) et les mains
fantômes (7.1) demandent. Deux petites capacités du contexte.

**J. Un port qui refuse un branchement, et qui le dit.** `connectAsInput()` fabrique toujours
l'objet de lien ; rien ne permet à un port de dire non, ni pourquoi. Tant qu'un refus n'est pas
exprimable, tout verrou se contourne et aucun pictogramme ne peut annoncer un échec à l'avance.
Petit socle, mais il touche le contrat de `Node3DConnectable` et la boucle de
`ConnectionManager.connect`, donc il se décide une fois pour toutes.

---

## 1. Porter, poser, câbler à la main

La piste principale. La manipulation du graphe passe presque entièrement par le PointerTool et
le ParameterTool : on attrape, on tire un câble, on règle. Une famille d'outils manipule le même
graphe avec une idée d'interaction différente chacun, comme la famille des baguettes le fait
déjà pour le jeu instrumental. Tous passent par les managers publics
(`ConnectionManager.connect`, `Node3dManager`, `VisualTube` d'aperçu) et aucun ne demande de
socle, sauf mention.

### 1.1 Tool Aimant
Un outil de déplacement qui câble en même temps : tant qu'un module est tenu, ses entrées et
sorties se branchent aux ports compatibles qui passent à portée, le plus proche d'abord, et se
débranchent quand on l'éloigne. Le câble se montre en train de se former avant de se fixer.
Lâcher fige ce qui est branché à cet instant, le squeeze inverse la polarité et repousse.
Second mode, le pinceau : trigger tenu sur une sortie, puis balayer le rayon branche chaque
entrée compatible traversée, rebalayer débranche. Viser au lieu de porter, même mécanique.
Décision de jeu : où je pose mes modules, pas quel port je vise. Le frein est la propolis (2.1),
sans laquelle rien de tout ça ne se livre.

### 1.2 Tool Harpon
Le rayon plante un harpon dans un port de sortie ; on recule la main, le câble se tend derrière
elle, et on l'accroche à une entrée à portée de bras. Au squeeze le harpon pend au bout d'un fil
et se balance avec le geste, pour atteindre un port sous, derrière ou hors du rayon.
Décision de jeu : câbler deux modules éloignés sans traverser la salle. Là où le pinceau (1.1)
vise plusieurs entrées près d'une sortie, le harpon vise une entrée loin d'une sortie.

### 1.3 Tool Curseur
Un curseur de fermeture éclair posé au bout de deux modules côte à côte et tiré le long de leur
bord : chaque paire de ports en vis-à-vis se branche au passage, dans l'ordre, et le curseur
bloque net là où deux ports ne vont pas ensemble, ce qui montre l'erreur à l'endroit exact.
Tiré en sens inverse il défait ce qu'il a fait, donc R7 est gratuite. La course se mesure en part
du bord parcouru, jamais en mètres.
Décision de jeu : aligner ses modules pour que le zip tombe juste, au lieu de viser douze ports.

### 1.4 Emboîtement, et le Tool Brique
Poser un module contre un autre le replace parallèle à lui, du côté où on l'a posé, et branche
ses entrées proches aux sorties de la face opposée : ils s'emboîtent, le câble existe mais le
tube est de longueur nulle. L'outil Brique emporte tout ce qui est emboîté de proche en proche ;
au squeeze il n'emporte que le module tenu. Décision de jeu : empiler, c'est chaîner, et un patch
se porte d'un bloc.
Décidé : l'emboîtement n'est pas un état, il se lit dans `Node3DGraph`. Deux modules sont
emboîtés quand ils sont parallèles, à une distance inférieure à une part de leur taille, et
reliés face à face. Rien n'est ajouté à l'hôte ni au node. On décroche en tirant, avec n'importe
quel outil.
Les opérateurs des thèmes 5 et 6 sont des demi-briques de petite taille, clipsées sur un port
plutôt que posées dans la salle : un opérateur devient un accessoire de port, et l'outil Brique
emporte l'hôte avec ses embouts.

### 1.5 Tool Mousqueton
Accrocher plusieurs modules à un même anneau tenu en main : ils se déplacent ensemble en gardant
leurs distances relatives, en ratios de la grappe, et décrocher l'anneau les rend indépendants.
Contrairement à l'emboîtement (1.4) rien n'est transformé, et la grappe n'existe que dans la main
qui la tient. Décision de jeu : je déplace un ensemble, pas un module.

### 1.6 Tool Laisse de patch
Le grab tire avec le module tout ce qui lui est câblé, les câbles faisant ressort, le patch
entier suivant en se déformant ; le trigger pousse ou attire à distance. Lit `Node3DGraph`,
intègre les positions, les pousse par l'état `position`. Le graphe devient une chose qu'on porte
et le câblage se lit physiquement. Coupure obligatoire aux nodes `consumer`, sinon la sortie
globale tire tout le monde, et raideur haute avec un nombre max de nodes tirés, sinon une méduse.
Refactor : exposer à un outil une façon de pousser la position d'une instance.

### 1.7 Tool Crayon-câble, et le rail
Un trait dessiné d'une sortie à une entrée crée le câble, et le tube suit le trait ; un trait qui
traverse un module en chemin le branche au passage, un trait qui bifurque fait deux câbles.
Un trait tracé seul est un rail : un module posé dessus ne se déplace que le long et glisse avec
l'élan qu'on lui donne, et sa position sur le rail sort une automation, donc le rail est un fader
géant dessiné. Décision de jeu : où passe le câble, donc le rangement, et le chemin devient une
chaîne de modules. Demande que `VisualTube` accepte un chemin au lieu de deux extrémités.

### 1.8 Tool Dérivation
Attraper un tube existant par le milieu et en tirer un nouveau : l'outil retrouve le port de
sortie par `ConnectionManager` et ouvre une connexion depuis lui. Décision de jeu : je branche
depuis le câble, sans retourner à la source.

### 1.9 Tool Adaptateur
Pointer une sortie d'un protocole et une entrée d'un autre : l'outil pose lui-même le bon
convertisseur (5.3), en embout (1.4) si possible, entre les deux. Secouer l'embout le retire.
Décision de jeu : brancher n'importe quoi sur n'importe quoi et écouter ce que l'outil a choisi.

### 1.10 Tool Empreinte
L'outil retire un module et garde sa place ouverte : les câbles qui y arrivaient restent
visibles, pendus à un fantôme, et poser un module dedans les reprend un à un dans l'ordre des
protocoles compatibles. Échanger un synthé contre un autre cesse de vouloir dire recâbler six
ports. C'est la réversibilité (R7) sous forme de lieu et non d'historique : la main qui retire
note les voisins et rejoue `ConnectionManager.connect`, l'empreinte est locale à l'outil et le
fantôme s'efface d'un geste.
Décision de jeu : remplacer une pièce d'un patch qui marche, au lieu de le refaire autour.

### 1.11 Tool Roque
L'outil vise deux modules et les permute : chacun prend la place de l'autre **et ses
connexions**, autant que les protocoles le permettent, le reste restant pendu comme un fantôme
d'empreinte (1.10). Refaire le geste remet tout en place, donc R7 est dans l'opération elle-même.
Comparer deux synthés à la même place, ou intervertir deux chaînes d'effets pour entendre l'ordre
inverse, cesse de vouloir dire douze rebranchements.
Décision de jeu : essayer l'autre ordre, au lieu de renoncer à l'essayer.

### 1.12 Tool Miroir
La main tient un plan ; un module attrapé et lâché à travers lui est dupliqué en symétrie, et le
câblage entre les modules déjà passés est recréé entre leurs copies. Une chaîne stéréo ou une
voix jumelle se fabrique en trois gestes ; à un seul module, c'est une pipette de réglages sans
menu. Les copies sont des nodes ordinaires, donc réversible. Demande I, et l'outil se souvient de
la correspondance original/copie tant qu'il vit.

### 1.13 Tool Fronde
Pose un module au loin plutôt que de le porter. Le module tenu est lancé, suit un arc et se pose
où il tombe ; l'état à clés porte `{impulsion, t0}` et chaque client rejoue la même formule sur
l'horloge sync, donc tout le monde voit le même vol sans autorité (B, voie analytique).
Décision de jeu : construire large sans traverser la salle, et accepter que la pose soit
approximative. Réversible par nature, un module posé se reprend.

### 1.14 Main d'échelle
Change la taille d'un module plutôt que sa position. Un séquenceur agrandi devient jouable au
corps entier, réduit il devient un composant qu'on range. Plus petit qu'il n'y paraît : l'état
`position` synchronise déjà `scale`, l'outil n'a qu'à le piloter.

### 1.15 Tool Toise
Le joueur écarte les mains une fois, et cet écart devient l'unité de sa session : portée de
l'aimant (1.1), taille à laquelle un module se pose, pas de la grille du plan (1.17), tout
s'exprime en multiples de l'étalon au lieu d'une valeur choisie par nous. C'est le seul endroit
où il reste un réglage, et il est pris sur le corps, ce que R5 demande partout sans que rien ne
le donne. Local et non synchronisé : un joueur qui travaille au bout des doigts et un autre au
corps entier ont chacun raison.
Décision de jeu : à quelle échelle je travaille, décidée une fois d'un geste plutôt que subie.

### 1.16 Régler le câble à la main
Le scalaire du lien (C) se règle sur le câble lui-même : saisi en son milieu et écarté il se
tend et la valeur monte, relâché il pend et elle tombe ; tiré comme une écoute, il se borde et se
choque. Gain pour l'audio, transposition pour le midi, facteur pour l'automation, décalage pour
le sync (6.15). La flèche est lue comme une part de la distance entre les deux ports, jamais en
mètres, donc un module déplacé garde son réglage. L'intérêt n'est pas le geste mais ce qu'il
laisse voir : le mix d'un patch se lit de loin à la forme des câbles, par tous les joueurs, là où
le même scalaire réglé au ParameterTool ne se voit pas. Ne donne aucune logique au lien (R4),
l'outil écrit l'état `param` que C lui donne.
Décision de jeu : doser trois sources en les regardant, plutôt qu'en les visant une à une.

### 1.17 Tool Plan de construction
Un fantôme translucide d'un patch connu, posé au sol par un outil qui le tient. On le remplit en
posant les modules aux emplacements indiqués, il s'anime quand il est complet. Un tutoriel qui
est un objet du monde, pas un panneau de texte. C'est l'outil qui vérifie les kinds et le
câblage ; le fantôme est local, ce qu'il pose est partagé comme tout module.

### 1.18 Posture
Trigger tenu sans bouger pendant un temps : l'outil passe en posture, et le geste suivant est le
lourd. ParameterTool en posture règle par cran entier, pointeur en posture déplace en snap,
crayon en posture trace droit. Local à l'outil, rien à synchroniser.
Décision de jeu : précis contre rapide, dans le même outil.

### 1.19 Paramètre boomerang
Mode du ParameterTool : on lance un paramètre vers une valeur, il y revient seul en une mesure.
Squeeze des deux mains, tous les paramètres pointés dans le cône partent ensemble.
Décision de jeu : un accent, pas un réglage. Le retour se décrit en parts de mesure, jamais en
secondes.

### 1.20 Tool Accordéon
Les deux mains écartées puis rapprochées replient la zone de jeu : les modules lointains arrivent
à portée sans déplacement, les distances relatives étant préservées. Aucun inconfort
vestibulaire, aucun snap turn.
Décidé : c'est une transformation locale de la vue du joueur, jamais un déplacement des nodes,
que l'état `position` synchroniserait à tout le monde.

---

## 2. Ce qui est permis, ce qui se voit

Le graphe se lit mal et ne dit rien de ce qu'un geste va faire. Ce thème couvre le verrou, le
refus annoncé, et tout ce qui rend audible ou visible l'état du câblage. Les effets lisent et ne
décident jamais.

### 2.1 Tool Propolis
Visé et pressé, un port est scellé d'une cire visible : il ne fuit plus (2.6) et refuse toute
connexion, y compris celles de l'aimant (1.1) et de la spore (9.5). Re-presser gratte la cire.
Décidé : c'est le seul verrou du carnet, par port et non par module, posé par un geste que les
autres voient. Un état `sealed` par port dans l'instance du node, synchronisé.
Décision de jeu : quelles entrées je laisse ouvertes aux branchements automatiques des autres.

### 2.2 Node3D Serrure
Un port d'entrée dont l'ouverture est réglée par une combinaison de goupilles, chacune un
paramètre synchronisé : il n'accepte un lien que d'une sortie dont la combinaison correspond.
Première réponse à « qui a le droit de brancher sur mon patch », réversible d'un geste puisque la
combinaison est un paramètre comme un autre. Une clé partielle, qui ne fait que les goupilles
communes, ouvre toute une famille de serrures d'un coup : c'est le vrai réglage du joueur, entre
tout ouvrir et tout fermer. Demande J.
Décision de jeu : à qui j'ouvre, et jusqu'où.

### 2.3 Tool Crochet
Ouvrir une serrure (2.2) sans en avoir la combinaison, en cherchant les goupilles une à une au
geste, en ratios du débattement : ça marche, mais c'est lent et ça s'entend, le crochetage sonne
fort et continu dans la scène tant qu'il dure. Personne n'est empêché, tout le monde est prévenu.
C'est ce qui sauve 2.2 de devenir un mur de permission : le verrou n'interdit pas, il coûte du
temps et de la discrétion.
Décision de jeu : forcer maintenant et se faire remarquer, ou demander la combinaison.

### 2.4 Effect Panneau
Un port qui refuserait le lien en cours d'approche l'annonce par le pictogramme qui dit pourquoi,
dans la grammaire des panneaux routiers : sens interdit pour une direction impossible, triangle
pour une serrure fermée (2.2), rond bleu pour le seul port qui accepte encore. Lecture seule,
local, calculé, aucun état. Ce qu'il rend lisible n'existe qu'une fois J fait.
Aucune décision en propre : c'est ce qui rend 1.3, 1.9 et 2.2 jouables sans essai et erreur.

### 2.5 Effect Cloué
Un module par lequel passe l'unique chemin d'une source vers une sortie ne peut pas être
débranché sans faire taire tout un pan du patch, et rien ne le dit avant. L'effet le marque, lui
et le câble en cause, et la marque disparaît dès qu'un second chemin existe. `VisualEffectSystem`
sait déjà dire le rôle d'un node et s'il est sur un chemin valide ; il lui manque de savoir si ce
chemin est le seul. Là où le panneau (2.4) annonce ce qu'un branchement va faire, celui-ci annonce
ce qu'un débranchement va défaire.

### 2.6 Les ports ouverts fuient
Une sortie audio non branchée laisse s'échapper une nappe spatialisée et atténuée depuis le port,
comme un tuyau qui goutte ; une sortie midi non branchée fait cliqueter le port à chaque note.
Local et sans socle : `createSpatialAudioOutput` existe, plus un `Effect` de filet qui s'écoule.
Décision de jeu : le graphe se lit à l'oreille, une sortie oubliée s'entend avant de se voir.

### 2.7 Tool Loupe
Approchée d'un objet, elle montre le détail invisible : notes exactes, spectre, contenu du câble.
Pointée sur un câble, elle affiche la valeur courante, l'unité, et pour le midi la dernière note,
ce qui est indispensable dès qu'il y a des convertisseurs. Une couche d'analyse qui ne pollue pas
la scène puisqu'il faut la sortir. Demande le hook de lecture par protocole de E.

### 2.8 Couleur égale hauteur, partout
Une seule loi dans tout le jeu : la note détermine la teinte, et particules, câbles, halos et
traits de crayon la suivent tous. Deux modules à l'unisson deviennent de la même couleur, donc
une consonance se repère à dix mètres et un battement n'a pas besoin d'être calculé. Unifie tout
le visuel existant, mais n'est universelle qu'avec E : la note est connue en midi, pas en audio.

### 2.9 Voir ce qui circule
Le câble automation est gris ; il prend une teinte selon l'unité du récepteur, et montre sa
valeur en vitesse ou en luminosité comme le midi montre déjà son flux de notes. Quelques lignes
une fois E en place, et sans elles un graphe plein de petits blocs gris est illisible.

### 2.10 Node3D Vitrail
Un panneau de verre coloré ; chaque note allume une facette selon sa hauteur, à la couleur de la
loi (2.8), avec l'intensité de sa vélocité, et la facette s'éteint avec un release réglable. Un
accord se lit de loin, sans son. Les visualiseurs existants sont tous audio, c'est le premier qui
lise du midi, donc après G. Node tagué `visualizer`, purement local.

### 2.11 Effect BeatGhost
Un double fantôme de l'objet qui le précède d'un temps. On voit arriver le coup avant de
l'entendre, et on peut jouer avec le fantôme pour taper juste. Réservé aux nodes qui connaissent
leur futur, donc les séquenceurs : un instrument live n'a rien à annoncer.

---

## 3. Jouer la matière

L'instrument et le module cessent d'être deux choses : un module se frotte, une peau se détend,
une frappe se prépare. Tout ce thème passe par des behaviours attachés au mesh
(`Aim`, `Activate`, `Hold`, `Strike`, `Pluck`, `Rub`, `Surface`) ou par des outils qui promènent
un `Interactor` ; l'instrument ne sait jamais quel outil le joue, et la force n'est jamais
plafonnée. Aucun socle, sauf mention.

### 3.1 Accorder et tirer au geste
Une cheville sur la harpe, deux mains qui tendent la peau du tambour : l'accord de tout
l'instrument est un `Node3DParameter` en rotation, synchronisé, réglé sur l'instrument lui-même,
et accorder cesse d'être un menu. Presser la peau pendant qu'elle sonne fait baisser la note, la
profondeur de `SurfaceBehavior` donnant la pression, ce qui donne le talking drum. Et un
`BendBehavior`, sur le modèle de `Hold`, fait du déplacement latéral de la main un pitch bend
continu que la harpe et le clavier live émettent en midi.

### 3.2 Batterie à zones et étouffement
Centre ou bord de la peau (`borderness`) choisit rim ou centre ; la main posée sur la cymbale
après le coup coupe la voix (`Hold`). Deux baguettes en alternance au-dessus d'une cadence font
un roulement continu dont la force est la cadence. Sur `DrumPlateKitN3D` seulement, `XRDrumKit` a
sa physique à part.

### 3.3 Behavior Farouche
Le mesh fuit quand la main s'approche trop vite : il faut l'approcher doucement pour en jouer, ce
qui produit naturellement du legato. Une contrainte de geste qui fabrique un style.
Décidé : la fuite est locale. Le mesh fuit la main de ce client et revient au repos ; les autres
joueurs le voient à sa place, sans quoi ce serait un module qui bouge seul sous la main d'un autre.

### 3.4 Behavior Chargé
Viser un mesh remplit une jauge visible ; la frappe qui suit a sa force multipliée par la charge,
et détourner le regard la vide. Décision de jeu : préparer un coup lourd ou jouer vite.

### 3.5 Behavior Tenue au pas
Tenir un mesh n'émet rien ; la note part au prochain pas de l'horloge sync du node, et relâcher
avant annule. Le behaviour lit le sync du node, jamais l'outil.
Décision de jeu : anticiper le temps au lieu de le frapper.

### 3.6 Behavior Fenêtre, et la corde à sauter
Une frappe n'est acceptée que dans une fenêtre autour du temps ; en dehors, rien ne sort, et pas
de note « faute », qui punirait celui qui joue. Premier usage : un Node3D Corde à sauter, une
corde qui tourne au tempo, déterministe depuis le sync, qu'on passe sans la toucher au bon moment.
Le behaviour vaut pour n'importe quel instrument séquencé.
Décision de jeu : le timing rendu physique.

### 3.7 Behavior Pyramide
Un mesh en couches empilées : une frappe douce ne joue que la couche du haut, une frappe forte
descend et ajoute celles du dessous, une par palier de force lu en part du geste ordinaire.
Décision de jeu : le voicing par la force, jamais plafonnée.

### 3.8 Behavior Meule
La matière ne sonne pas au contact mais au travail fourni : frotter ou frapper accumule, rien ne
sort avant que le cumul ne franchisse un seuil, puis tout sort d'un coup et le cumul retombe. Ce
qui est accumulé s'évapore lentement, donc lâcher trop tôt perd la charge. Le seuil est un
paramètre synchronisé, le cumul reste local. À côté de Chargé (3.4), qui prépare un coup au
regard : ici c'est la matière qui retient, pas la main.
Décision de jeu : insister sur une matière, ou changer de matière.

### 3.9 Ratchet frappé
Frapper un pas du PianoRoll fort le divise en deux notes, refrapper en quatre ; une frappe douce
refusionne. Un `StrikeBehavior` sur les cellules, joué avec n'importe quelle baguette, la force
en part du geste ordinaire choisissant diviser ou refondre. Réversible par le geste inverse.
Décision de jeu : le rythme se sculpte au coup, pas au menu.

### 3.10 Frotter l'effet
Les paramètres d'un effet répondent aux behaviours : frotter le filtre l'ouvre tant qu'on frotte
et il se referme après, frapper le delay envoie un burst de feedback, serrer le grab pendant le
geste fige la valeur. Demande une passerelle behaviour vers `setValue` temporaire, le paramètre
n'étant pas un behaviour aujourd'hui : refactor modéré, et la seule pièce technique du thème.
Décision de jeu : la distinction module/instrument s'efface, ce qui est le ton du projet.

### 3.11 Changer la façon de jouer un module
Le prochain contact de l'outil change la manière dont l'objet touché se joue : un pad frappé
devient un pad pincé. Un outil ne peut pas poser un behaviour sur un mesh étranger, puisqu'un
behaviour est attaché par le node avec son callback. Seule forme viable : le node déclare
lui-même ses façons alternatives d'être joué, une liste de behaviours nommés dans le contexte, et
l'outil bascule de l'une à l'autre.

### 3.12 La baguette qui s'allonge
Pincer le manche de la baguette tenue avec l'autre main et tirer change sa longueur. Longueur
égale portée, mais aussi masse : la vélocité publiée par l'`Interactor` est multipliée par la
longueur relative à celle de départ, un ratio, jamais des mètres (R5). Une seule baguette va du
toucher fin au coup de masse, et l'instrument ne sait rien.
Décision de jeu : régler l'outil sur soi plutôt que le module sur lui-même.

### 3.13 Tool Archet bulle
Un outil dont l'`Interactor` est une sphère qui grossit avec la vitesse de la main : lente, une
pointe qui touche une corde ; rapide, une boule qui en prend trois. L'inverse de la baguette, où
aller vite ne change que la force. Tout tient dans le rayon de l'interactor.
Décision de jeu : la précision se paie en lenteur.

### 3.14 Tool Pistolet à notes
Le rayon projette un `Interactor` qui vole en ligne droite à vitesse constante, active ce qu'il
touche avec la vélocité du tir, puis disparaît. Jouer un tambour à l'autre bout de la salle, ou
l'instrument que porte un autre joueur (3.18). L'interactor est local à l'outil comme tous les
interactors, seul le résultat sur l'instrument est synchronisé. Un vol d'une seconde au plus.

### 3.15 Tool Trébuchet
Arme d'abord, frappe ensuite. Le trigger tenu arme l'outil : la main recule, et ce qui compte est
l'amplitude du recul rapportée à la longueur du bras. Le relâchement lance l'`Interactor` tout
seul, avec la force armée, que la main soit immobile ou non. Là où Chargé (3.4) charge
l'instrument, ici c'est la main qui est chargée, donc tout instrument en profite sans rien savoir.
Décision de jeu : doser un coup à l'avance et le placer au bon temps.

### 3.16 Tool Tamponneuse
On tient un module comme avec le pointeur, mais l'outil porte un `Interactor` à la position du
module tenu : le cogner contre un instrument le frappe avec la vitesse de la main.
Décision de jeu : quel module me sert de maillet.

### 3.17 Node3D Marelle
Des dalles au sol, une note par dalle : celle sous le joueur joue. Le node lit
`getPlayerPosition`, ce qu'il a le droit de faire, et n'écrit `occupied[i]` que pour son propre
joueur, donc pas de B. Un séquenceur que le corps entier parcourt, à plusieurs.

### 3.18 Jouer à deux
Trois objets qui n'existent qu'à plusieurs, et aucun ne demande de permission. Le carrousel
tourne lentement sur lui-même, calé sur le transport, et seule la face tournée vers toi est
jouable : un tour de rôle géométrique, déterministe, sans règle imposée. Le chameau est un
instrument qui ne joue que porté, un joueur le tient et marche, l'autre en joue, le porteur
poussant la position et le joueur frappant. La baguette de chef fixe le tempo du transport pour
tous en battant la mesure en l'air, trigger tenu, les battements lus sur les inversions de
vitesse verticale ; `WamTransportManager.setTempo` est déjà synchronisé, et le rôle se prend au
dernier geste, la baguette de l'autre s'éteignant.

---

## 4. Contrôleurs : d'où vient la valeur

Le projet a l'AutomationController rotatif, le PositionCube, le GazeController, le
VoiceVolumeController et les plaques XY. Tous sont un objet qu'on règle du doigt. Ce thème
cherche des entrées dont la valeur vient d'ailleurs : la matière, le temps, le corps, le monde,
les autres joueurs. Toutes sortent une automation et se branchent sur n'importe quel paramètre.
Ce qui a un mouvement analytique ne demande pas B ; le reste suit la règle du dernier client qui
a touché.

### 4.1 Node3D Corps
Un Node3D à sorties automation qui lisent le corps du joueur : la hauteur du casque, l'écart des
mains avec un point milieu qu'on fixe en pinçant, l'orientation du poignet de la main qui ne joue
pas, le tremblement plutôt que la position, tenir immobile devenant une compétence, et le regard
patient, qui monte tant qu'on regarde et redescend dès qu'on détourne les yeux, une charge et non
une bascule comme le GazeController. Une vraie couche d'expressivité pour très peu de code.
Décidé : 100 % local. Sur chaque client c'est le casque de ce client qui pilote, et la valeur ne
passe pas par le réseau ; deux joueurs qui regardent le même node voient deux valeurs
différentes, et c'est voulu, c'est ce qui évite B. Le paramètre se verrouille par le câble comme
toute automation, aucune épingle à inventer.

### 4.2 Robinet et bassin
Un bassin dont le niveau est la sortie : un robinet le remplit à débit réglable, une bonde le
vide. La valeur ne se pose pas, elle se laisse monter, et corriger demande de l'anticipation.
Plein, le bassin déborde et l'excédent coule vers celui d'en dessous, donc deux ou trois bassins
empilés font une cascade d'automations à seuils lisibles à l'oeil. Fluide, donc B.
Décision de jeu : un contrôleur qui a de l'inertie et qu'on ne peut pas rattraper.

### 4.3 Mécaniques qui s'épuisent
Trois objets qui rendent une énergie reçue et s'arrêtent, tous analytiques depuis un état à clé,
donc sans B. Le sablier, retourné, sort une valeur qui descend de 1 à 0 en un temps réglable puis
s'arrête, et il faut le retourner pour relancer : une automation qui a une fin et qui demande de
la présence. La toupie, lancée à la main, sort sa vitesse, ralentit par frottement et finit par
tomber : le premier contrôleur dont la valeur dépend de la force du lancer. Le ressort, comprimé
à la main et bloqué, garde sa valeur, et déverrouillé revient au repos à sa vitesse propre :
tenir une valeur devient un effort, la lâcher un geste.
Chacun porte ou non une fusée-chaîne, le cône qui rattrape la perte de force : sans elle la
valeur meurt doucement, avec elle elle tient du début à la fin puis coupe net. Un paramètre à
deux valeurs, et une vraie alternative de jeu.

### 4.4 Node3D Trapèze
Une barre pendue ; la pousser (`Strike`) la fait osciller, et l'oscillation s'amortit toute
seule. Mouvement analytique depuis `{impulsion, t0}` à clé, identique partout sans B, et c'est le
modèle de tout 4.3. Sortie automation l'angle, sortie midi à chaque extrême. La longueur, un
paramètre, fixe la période, la poussée l'amplitude.
Décision de jeu : le tempo par la longueur, la vélocité par la poussée, un LFO dont le réglage
est une longueur visible dans la salle.

### 4.5 Node3D Jongle
Une coupe et des balles à behaviour `Hold` : lâcher une balle avec vitesse la lance, elle joue sa
note en retombant dans la coupe. Trajectoire analytique depuis `{vitesse, t0}` à clé.
Décision de jeu : la hauteur du lancer est le délai, et tenir trois balles en l'air est une
polyrythmie qu'on entretient au corps.

### 4.6 Node3D Plante
Une tige qui pousse tant qu'on la tient (`Hold`) et fane lentement dès qu'on lâche ; la sortie
est sa hauteur. Croissance de plus en plus rapide, déclin lent : le contrôleur qui fait sentir un
paramètre à `exponant` par une matière qui pousse elle-même exponentiellement. Différent du
ressort (4.3), qui tient sa valeur : ici elle ne se garde qu'en revenant. Demande B, version
minimale.

### 4.7 Node3D Baliste, le paramètre qui se tord
Un paramètre qu'on tord contre son rappel, et qui revient seul quand on lâche, en jouant son
retour. Plus il est tordu loin de son repos, plus le retour est long et sonore. Ce n'est pas un
objet posé dans le monde comme 4.3 : c'est le `Node3DParameter` lui-même qui gagne un repos et un
rappel, donc n'importe quel module en hérite en changeant un champ.
Décidé : le rappel est un facteur, pas une durée en secondes, pour rester une proportion de la
course du paramètre.

### 4.8 Node3D Voile
Sa sortie dépend de son orientation par rapport au câble qui l'alimente : face au flux, plein
gain mais instable ; de biais, moins mais propre. L'angle se calcule en local entre la rotation
du node, déjà synchronisée, et la direction de son port d'entrée, donc rien à ajouter au
contexte, et tout est en degrés. Plier la voile d'un cran, prendre un ris, réduit sa plage de
paramètre au lieu de sa valeur : bridée, elle ne va plus au bout de sa course, donc elle ne peut
plus saturer, et un cran se reprend.
Décision de jeu : orienter un module devient un réglage, et déplacer un voisin dérègle ce qui le
vise.

### 4.9 Petites entrées à geste
Quatre entrées minuscules qui manquent, chacune une manière de donner une valeur que le rotateur
existant ne donne pas. Le boulier, des rangées de perles dont la valeur est le nombre poussé à
droite, l'entrée à pas entier lisible de loin. La manivelle, rotative sans butée, qui sort une
vitesse signée, nulle dès qu'on lâche : la seule entrée qui exige l'effort continu. Le cordon à
tirer, dont l'impulsion a pour amplitude la vitesse du tir et qui se rembobine, donc interdit le
tir rapide. La pédale, un bloc à frapper à la baguette qui sort 1 tant qu'on appuie, et qui avec
l'aiguillage (5.2) fait une note à la main sans clavier.

### 4.10 Roue chromatique
Un disque de douze secteurs colorés selon la loi couleur égale hauteur (2.8). Tourner choisit la
note, et le module branché prend la couleur. Sur un oscillateur elle accorde, sur un delay en
secondes elle fait un delay harmonique, sur un paramètre sans unité elle vaut un cran sur douze.
Préférée à un clavier parce qu'elle enseigne la loi du monde au lieu d'ajouter un troisième
clavier. Demande E, y compris le receveur exposé, sans quoi la couleur vient du câble (2.9)
plutôt que du module.

### 4.11 Diapason
Frappé, il sort sa note tant qu'il vibre, et la vibration décroît. Le démonstrateur de l'unité :
branché sur un oscillateur il l'accorde, sur un delay il le règle à la période de la note.

### 4.12 Mètre ruban
Deux poignées, la sortie est leur distance. Deux joueurs peuvent en tenir un bout chacun : le
seul contrôleur qui se partage physiquement. Chaque poignée a son propriétaire et sa position
synchronisée, la distance se calcule des deux, donc c'est le cas où « le dernier qui a touché »
(B) ne suffit pas.

### 4.13 Capteurs du monde et des autres
Des entrées qui mesurent le lieu plutôt que la main, toutes dépendantes de A pour la vue du
monde, mais rendues localement par client donc sans B. La boussole pointe en permanence vers un
module choisi et sort l'angle, donc elle change quand l'un des deux bouge, et lie deux objets
distants sans câble. La proxémie sort la distance au joueur le plus proche : se rapprocher ouvre
un filtre, s'éloigner le referme, et jouer ensemble devient audible sans qu'on ait à le dire. Le
compteur de salle sort le nombre de joueurs présents, donc un patch sonne autrement à un qu'à
cinq.

### 4.14 Phonographe
Un disque qui grave le mouvement d'un contrôleur pendant qu'on le manipule, puis le rejoue en
boucle. Le sillon est visible : on voit la forme de son automation et on pose l'aiguille où l'on
veut. Repasser dessus en manipulant réenregistre cette portion seulement, un overdub
d'automation sans mode à activer. Le disque gravé est un objet : on le sort, on le donne, on le
pose sur un autre phonographe branché ailleurs, exactement comme le bocal (7.3) pour le midi ;
un seul concept, l'enregistrement-objet, deux protocoles, le même geste de sortie et de pose.
Enfin, il garde toujours les dernières secondes de ce qui passe sans qu'on ait rien armé, et
poser l'aiguille d'un coup sec fige cette fenêtre en sillon : on fige l'instant où c'était bien,
après l'avoir entendu.

### 4.15 Photocellule
Une sortie automation ajoutée aux Screens, qui lit la luminance d'une zone de l'image. Un shader
devient un LFO complexe, et le retour visuel vers son n'existe nulle part ailleurs. Une sortie du
Screen lui-même, pas un capteur externe qui lirait des pixels à chaque tick.

---

## 5. Opérateurs et convertisseurs

Aucun node ne fait passer un signal d'un protocole à l'autre, et rien ne combine deux
automations. Tout ce thème se construit sur la base opérateur (F) et, pour le midi, sur l'entrée
midi écoutante (G) ; ce sont des modules posés et câblés des deux côtés (R4), en briques qui se
clipsent sur un port (1.4). Mouvement et visuel ne sont pas des câbles : les convertir est
toujours un Node3D qui commence ou termine une chaîne.

### 5.1 Petits opérateurs d'automation
Cinq blocs à une entrée et une sortie, qui rendent tout le thème 4 combinable au lieu de
remplaçable : retard, inversion, moyenne qui adoucit les à-coups, pente qui sort la vitesse de
variation ou son cumul borné, et mélangeur qui fait un fondu entre deux entrées. La pente change
la nature d'un geste : branchée sur un filtre, elle ne l'ouvre que pendant qu'on tourne le
bouton, pas selon où il est, et l'intégrale fait d'un contrôleur à impulsion (4.9) une valeur qui
monte par paliers. La somme pondérée, elle, est déjà donnée par le scalaire de chaque câble (C).

### 5.2 Aiguillage à seuil
Bascule à une valeur montante, revient à une autre descendante, donc ne clignote jamais autour du
seuil. Petit, ennuyeux, indispensable. À hystérésis nulle c'est le comparateur, donc n'importe
quel contrôleur continu devient un déclencheur, ce qui manque aujourd'hui. Un seul bloc pour les
deux, et la sortie est au choix une automation ou du midi : front montant, note on ; front
descendant, note off.

### 5.3 Convertisseurs
Les passages d'un protocole à l'autre qui manquent le plus. Suiveur de note, midi vers
automation, qui sort la hauteur, la vélocité ou la note tenue : un clavier devient un contrôleur
et un séquenceur un LFO à marches. Suiveur d'enveloppe, audio vers automation, qui sort la force
ou la brillance du son entrant, donc le sidechain et le wah automatique. Phase d'horloge, sync
vers automation, une rampe de 0 à 1 par mesure ou par N mesures : le seul LFO calé sur le tempo,
et il n'y a aucun LFO aujourd'hui.

### 5.4 Quantiseur de gamme
Une valeur continue tombe sur la note la plus proche d'une gamme choisie, ce qui donne au cube et
à la plaque XY ce qui leur manque pour jouer juste. Deux autres formes du même bloc : un prisme
de verre posé dans le monde, qu'un rayon d'outil traverse et qui quantise ce que ce rayon joue,
l'outil testant lui-même l'intersection, donc aucun socle ; et une oreille à gamme, qui détecte
la hauteur d'une entrée audio câblée et la ramène sur la gamme en notes midi, donc une voix ou un
instrument du graphe produit une mélodie propre. `AudioSignal.pitch` existe déjà côté effets.
Décision de jeu : quelle gamme corrige ce que j'entends, et où je joue change ce que je joue.

### 5.5 Oreille
Détection de transitoires sur une entrée audio câblée : chaque coup, une note on dont la vélocité
est l'énergie du coup, à hauteur fixe réglable. N'importe quelle source audio devient un
déclencheur. Jamais sur le micro, qui sert au chat. Donne le note on que l'oreille à gamme (5.4)
complète par la hauteur.

### 5.6 Node3D Marteau
Un node qui possède un point de matière que l'automation déplace, et qui frappe ce qui se trouve
sur son trajet. De l'automation qui joue un instrument réel ferme la boucle du graphe. Demande I,
et c'est aussi le socle des mains fantômes (7.1) et du tracé joué (7.9).

### 5.7 Node3D Foehn
Tous les filtres du carnet n'ont qu'une sortie et jettent le reste ; celui-ci en a deux, ce qui
passe et ce qui a été retenu. En audio, le grave d'un côté, l'aigu de l'autre, et les deux se
rejouent séparément. En midi, les notes dans la gamme d'un côté, les fausses de l'autre, ce qui
rend le quantiseur (5.4) utilisable à l'envers. Un patch n'a plus besoin de dédoubler une source
pour la traiter en deux moitiés.
Décision de jeu : ce que je coupe, je décide où ça va plutôt que de le perdre.

---

## 6. Le temps, le routage, le tour de rôle

Les quatre câbles transportent tous un signal qui va d'une sortie vers une entrée, et aucun ne
transporte une autorisation ni un ordre de passage. Ce thème ajoute le tour de rôle, la priorité,
la phase, et des sources de tempo réglées au geste plutôt qu'au nombre. Presque tout attend G, et
les opérateurs F.

### 6.1 Node3D Distributeur
Une entrée midi, N sorties ; chaque événement qui entre prend la sortie suivante dans le tour, et
le tour courant est local et se recale sur le sync, donc rien à trancher côté autorité. Sans lui,
répartir une ligne sur plusieurs instruments demande de choisir à l'avance lequel joue quoi.
Décision de jeu : la polyphonie en instruments et non en voix, et l'ordre des instruments autour
du point de passage devient la composition.

### 6.2 Node3D Jeton
L'inverse du distributeur : N entrées et une sortie, une seule entrée ouverte à la fois, le jeton
passant à la suivante à la fin de la mesure, lue sur le sync, ou d'un bouton. Des sources câblées
dessus parlent chacune à son tour.
Décision de jeu : l'ordre du tour, c'est l'ordre des ports.

### 6.3 Node3D Tronçon
Un passe-midi qui limite ce qui peut passer, en deux réglages. Une entrée automation « feu » :
tant qu'une note est tenue en aval ou que le feu est rouge, l'entrée est refusée, donc une seule
note à la fois par tronçon. Et un plafond de débit : au-delà de tant d'événements par mesure, le
surplus tombe, ce qui rend jouable tout ce qui produit trop, à commencer par le nuage (6.10) et
l'écho (6.16). Trois lignes sur la base opérateur.
Décision de jeu : la polyphonie se règle par le routage, pas par un réglage de synthé, et on
choisit de brider la source ou juste avant l'instrument qui sature.

### 6.4 Node3D Cédez-le-passage
Deux entrées midi, une sortie, une règle de priorité : la voie prioritaire passe toujours,
l'autre ne passe que dans les trous. Une ligne d'accompagnement qui se tait dès que le thème
parle, sans que personne ne coupe rien à la main. La règle et la fenêtre d'attente sont des
paramètres.
Décision de jeu : laquelle de mes deux lignes est la principale, et de combien elle écrase
l'autre.

### 6.5 Node3D Pochoir
Une plaque percée posée entre deux ports midi : ne passe que ce qui tombe dans un trou. Les trous
ne sont pas un réglage de menu, ils se percent à la main sur la face du module, et leur position
dit quelle note et quel moment du cycle. Tourner la plaque décale tout le masque d'un même angle,
donc un décalage de phase obtenu en tournant un objet. Deux pochoirs en série donnent
l'intersection.
Décision de jeu : on dessine son filtre, et on le décale en le tournant.

### 6.6 Node3D Armure
N entrées, N sorties, et un paramètre qui choisit le motif de croisement plutôt que le câblage :
toile, chaque entrée alterne strictement d'une sortie à l'autre ; sergé, le croisement se décale
d'un cran à chaque mesure, ce qui fait glisser une voix en diagonale ; satin, un long flotté sur
une même sortie coupé par un croisement rare. Un routeur dont on règle la densité de croisement
au lieu de tirer N câbles.
Décision de jeu : choisir un motif de circulation, pas une route.

### 6.7 Node3D Vote
Plusieurs entrées midi ; une note ne sort que si au moins K entrées la jouent dans une courte
fenêtre. Le seul module qui exige que les joueurs s'accordent, et pas un mur de permission
puisque personne n'est bloqué et que chacun continue d'entendre sa propre entrée s'il la câble à
côté. Demande une entrée midi à `max_connections` supérieur à un.
Décision de jeu : jouer ce que l'autre va jouer.

### 6.8 Toboggan
Lisse tout contrôleur continu qui passe, CC, pitch bend, aftertouch : le passage d'une valeur à
l'autre prend un temps réglable, avec une courbe, et en mode note c'est un glissando entre deux
notes legato.
Décision de jeu : un séquenceur à marches devient une courbe, sans rien réécrire dedans.

### 6.9 Métronome de poche
Recale les notes entrantes sur la grille du transport, mais par un pourcentage réglable : à 100 %
c'est un quantiseur, à 30 % une note en retard n'est tirée que d'un tiers vers le temps. Entre
l'humain et la machine, un curseur au lieu d'un interrupteur, et le swing est le même bloc avec
un décalage sur les temps pairs. Calé sur `WamTransportManager`, pas sur le protocole sync, qui
ne transporte que des durées d'arrangement. Si le placement doit compter, c'est ce bloc dont le
pourcentage est écrit par la position du module, pas une capacité du node.

### 6.10 Node3D Nuage
Un générateur dont la densité et la forme des événements se choisissent par un type nommé plutôt
que par cinq réglages : le cirrus lâche des notes rares et fines, le cumulus les envoie par
paquets séparés de silences, le stratus tient une nappe continue, le nimbostratus ouvre l'averse.
Une énumération à la place d'un panneau de potentiomètres. La suite d'événements est tirée d'une
graine synchronisée et du temps du sync, donc identique pour tous sans B.
Décision de jeu : quel temps il fait sur cette ligne.

### 6.11 Node3D Foliot
Une barre horizontale qui oscille avec deux masses qui coulissent dessus, et une sortie sync :
écarter les masses ralentit le tempo, les rapprocher l'accélère. Le carnet n'a aucune source de
tempo réglée au geste, seulement des consommateurs d'horloge ; ici le tempo est un objet qu'on
voit battre de l'autre bout de la salle. La position d'une masse est une part de la demi-barre et
la période en découle par un ratio. Analytique depuis `{masses, impulsion, t0}`, donc pas de B,
et il faut le relancer d'une poussée quand il s'arrête, ce qui en fait aussi une mécanique qui
s'épuise (4.3).
Décision de jeu : accélérer le morceau en pinçant deux masses, devant tout le monde.

### 6.12 Node3D Volant d'inertie
Continue à tourner quand on le débranche et ralentit jusqu'à l'arrêt. Posé entre une horloge et
ce qu'elle mène, il fait qu'une coupure ne coupe pas net : la boucle s'éteint en traînant. Un
`{vitesse, t0}` et une décroissance analytique suffisent.
Décision de jeu : couper franc ou laisser mourir.

### 6.13 Node3D Régénérateur
Rend au cycle suivant ce que le cycle précédent a rejeté. Un délai dont la durée n'est pas en
secondes mais exactement d'une période du sync entrant : accélérer l'horloge resserre le renvoi
sans le décaler, ce qu'aucun delay en millisecondes ne fait quand le tempo change. Le `Container`
de timing donne déjà la période.

### 6.14 Node3D Quatre-temps
Quatre ports, un par temps du cycle sync : admission, compression, détente, échappement. Chacun
ne laisse passer que pendant son quart de mesure, et la vitesse du cycle vient du câble sync
entrant. Brancher n'est plus seulement dire où, mais quand.
Décision de jeu : répartir un patch sur les temps au lieu de tout empiler sur le premier.

### 6.15 Câble sync à décalage
Le scalaire du câble sync, fixé par C : un décalage en mesures. Deux séquenceurs sur le même
transport, l'un branché par un câble « plus une demi-mesure », font un canon sans module.
Décision de jeu : le décalage se lit sur le tube, pas dans un réglage. Se fait dans le refactor
de C, et se règle à la main par 1.16.

### 6.16 Écho midi, et le trampoline
Répète chaque note N fois avec un délai et une transposition par répétition, vélocité
décroissante : des arpèges en cascade qu'aucun delay audio ne donne. Sa forme jouée est une toile
sur laquelle les notes rebondissent visiblement, et frapper la toile (`Strike`) relance ou ajoute
un rebond avec la force du coup, la force de frappe faisant le nombre d'échos. Un `Strike` posé
sur le mesh de l'écho, pas un second node.

### 6.17 Érosion de gamme
Un opérateur midi branché sur sync qui, toutes les N mesures, remplace une note de sa gamme par
une voisine. Le patch dérive lentement d'une tonalité à l'autre sans que personne n'agisse : la
variation lente qui manque à un sandbox de boucles. C'est le seul dériveur du carnet, parce qu'on
le pose exprès et qu'on voit qu'il est là.

### 6.18 Node3D Retenue
Ce qui entre est retenu et monte un niveau visible, et ressort quand on le décide. Un seul node,
deux protocoles, deux modes de relâche. En midi les notes s'empilent, tenues, et une vanne
(bouton, local) ou une hauteur (paramètre) les relâche à tempo dans l'ordre reçu, ce qui rend une
phrase entière décalée ; ou bien, au-delà d'une capacité ou penché à la main (`Hold` puis
rotation), tout se renverse d'un coup, en accord ou en arpège. En audio, l'entrée à plusieurs
connexions, que l'aimant (1.1) branche aux modules qu'on approche, avale le son et le restitue
d'un coup quand on frappe la retenue : un delay dont l'instant de relâche est choisi à la main, le
buffer restant local à chaque client, donc pas de D. Le contraire de la glace (8.6) : ça
s'accumule au lieu de se figer.
Décision de jeu : retenir pour rendre au bon moment.

### 6.19 Node3D Bassin
Les notes midi qui entrent flottent en rond dans un bassin, rotation déterministe depuis le sync.
En sortir une à la main la joue sur la sortie midi ; les autres tournent en silence jusqu'à
s'effacer. Un quantiseur qu'on joue.
Décision de jeu : laquelle je pêche dans le flux, au lieu de tout laisser passer.

### 6.20 Node3D Transbordeur
Deux plots posés et une nacelle qui fait la navette : ce qui entre est chargé dedans, traverse à
vue et n'est délivré qu'à l'arrivée. C'est un retard, mais un retard qu'on voit venir et surtout
qu'on peut attraper, un outil interceptant la nacelle en route pour détourner, vider ou doubler
son chargement avant qu'elle n'accoste ; tous les delays du carnet sont instantanés à l'oeil. La
durée de traversée est un paramètre synchronisé, pas une distance, et l'écartement des plots ne
change que ce qu'on en voit. La prise au vol est celle de la nasse (7.7).
Décision de jeu : intervenir sur une phrase pendant qu'elle voyage, au lieu d'avant ou après.

### 6.21 Node3D Brique-pas
Un séquenceur sans grille : chaque pas est un petit module posé, qui porte une note et une durée.
Les briques s'enchaînent par emboîtement (1.4) et le sync entre par la première. Une brique posée
sur une autre fait un accord ; des briques en cercle autour d'un axe font un séquenceur
circulaire dont on change le rythme en poussant. Variante, la riposte : une brique qui ne joue
que si une note midi est entrée pendant le pas précédent, la fenêtre de parade, donc le
séquenceur répond au joueur au lieu de tourner seul.
Décision de jeu : la longueur de la séquence est physique, on l'allonge en posant.

### 6.22 Ports de retour
Pas de protocole neuf : des ports sortants sur les modules qui d'ordinaire ne font que recevoir.
Le sampler sort un trigger midi quand son échantillon finit ; câblé sur une nouvelle entrée « pas
suivant » du séquenceur, le rythme naît de la durée des sons et non de l'horloge. Le lien à
contre-courant sans toucher au modèle de lien.
Décision de jeu : le tempo, c'est la longueur du sample.

### 6.23 Node3D Levain
On lui donne une boucle midi, il la garde, et au bout de plusieurs mesures il en ressort une
variation, d'autant plus éloignée qu'on l'a laissé travailler longtemps. Non déterministe, donc
il faut B, ou la graine à clé partagée du nuage (6.10), qui est la même réponse.
Décision de jeu : poser tôt ce qu'on veut entendre tard.

---

## 7. Enregistrer, transporter, transformer un fragment

Boucler demande aujourd'hui de quitter l'instrument, et un fragment qui joue bien ne se déplace
pas. Ce thème fait de l'enregistrement un objet du monde qu'on porte, qu'on travaille et qu'on
repose ailleurs. Le concept commun est l'enregistrement-objet, déjà posé par le phonographe
(4.14) pour l'automation.

### 7.1 Mains fantômes
La plus grosse idée du carnet, et la plus chère. Un Node3D fantôme rejoue en boucle les points de
matière que le joueur vient de promener : ce qui est enregistré n'est ni un son ni un outil, mais
les `Interactor` que l'outil a menés dans le monde, position, direction et rayon à chaque tick.
Rejouer, c'est faire circuler des Interactors sur ces trajectoires dans
l'`InstrumentInteractionSystem`, qui rencontre les meshes exactement comme une vraie main : donc
changer l'instrument change le son de la boucle sans réenregistrer. Attraper le point de matière
du fantôme en cours de boucle et le guider modifie la trajectoire à cet endroit, donc on édite
une performance sans jamais voir de timeline. La trajectoire est un état synchronisé et le rejeu
est déterministe, donc pas de B ; le marteau (5.6) et son socle I sont le préalable.
Décision de jeu : on boucle une interprétation, pas un enregistrement.

### 7.2 Toucher deux fois
Tenir un instrument et serrer le grab commence à enregistrer ce qu'on y joue ; re-serrer boucle.
Le looper est dans l'instrument et non un module câblé : une boucle interne de `scheduleEvents`
sur sa sortie midi. Boucler sans quitter l'instrument.

### 7.3 Le bocal
La boucle enregistrée (7.2) sort de l'instrument sous forme d'un bocal posé à côté. Frotter le
bocal accélère ou ralentit la lecture, le secouer la brouille. La boucle devient une chose qu'on
manipule et qu'on donne, et c'est ce que l'enclume (7.5) travaille.

### 7.4 Empreinte du séquenceur
Un séquenceur qui a une entrée midi grave ce qu'il entend dans son pas courant et le rejoue au
cycle suivant : on écrit la boucle en jouant par-dessus. `SequencerN3D` n'a pas d'entrée midi,
donc après G.

### 7.5 L'enclume
On y pose un bocal (7.3) et on le frappe : chaque coup compresse la vélocité, un coup au bord
raccourcit les notes, pincer transpose. Le sound design comme forge, à coups. En midi tout est du
JSON, donc aucun transport à inventer, et c'est la version à faire d'abord. Le même objet sur un
sample compresse l'attaque, tronque au bord et étire à la pince, traitement offline d'un
`AudioBuffer` trivial en soi, mais le sample forgé doit voyager, donc D.

### 7.6 Tool Lève-cadre
Glisser une plaque dans un séquenceur ou un sampler et la retirer emporte une tranche, une mesure
ou une piste, comme un cadre de ruche ; posée ailleurs, la tranche devient un module autonome qui
joue cette mesure. Emporte de l'état, des notes et des pas, donc n'attend que la tranche exposée
de H, là où la pioche (7.8) emporte de l'audio et attend D.
Décision de jeu : réutiliser un fragment de pattern ailleurs sans le recopier.

### 7.7 Tool Nasse
Tenue ouverte contre un câble ou un port, elle capture les événements qui y passent pendant qu'on
la tient, et on repart avec la phrase dans la main, visible dedans ; rouverte ailleurs, elle
relâche ce qu'elle a pris, dans l'ordre et aux durées d'origine. La retenue (6.18) accumule et
rend sur place, l'empreinte (7.4) grave dans un séquenceur qui écoute ; aucun des deux ne
transporte. Rien de synchronisé, tout vit dans l'outil et meurt avec lui. Demande le hook de
lecture de E, et G pour le midi.
Décision de jeu : d'où je prélève une phrase, et sur quoi je la repose.

### 7.8 Tool Pioche
Frappe un module en marche et en détache un éclat qui reste dans la main : un petit cube
contenant les dernières secondes de ce qu'il jouait. Lâché ailleurs, l'éclat devient un Node3D
sampler qui le joue en boucle. Décision de jeu : prendre la matière là où elle est, au lieu de
repasser par la boutique. Dépend de D, les autres joueurs n'ayant pas enregistré la même fenêtre,
et l'outil doit tapper la sortie audio d'un node par son connectable, ce qu'aucun outil ne fait.

### 7.9 Tracé joué
Un tracé au crayon n'est pas transformé en module comme en 7.10, il est parcouru : un
`Interactor` glisse le long du trait, en boucle sur l'horloge sync, et frappe la matière qu'il
traverse, avec pour force la vitesse locale du parcours, lue en part de la longueur du tracé. Le
dessin devient un séquenceur dont la forme est le réglage, et il joue les instruments déjà posés
au lieu d'en fabriquer un ; un trait resserré resserre le rythme, un aller-retour donne un motif
pair. C'est le marteau (5.6) affranchi du tempo seul, donc il attend I comme lui.
Décision de jeu : où je fais passer la machine dans ce que j'ai déjà construit.

### 7.10 Sous-mode du crayon
Le trait dessiné devient de la matière, en trois formes qui partagent un seul chantier, sur le
modèle du magic : l'outil crée un node par trait, sans aucune écoute globale du `DrawingSystem`.
Chaque trait ouvert devient une corde pinçable, sa longueur donnant la hauteur et sa courbure le
timbre, un instrument dessiné à sa taille et à sa place, à plusieurs. Un trait fermé devient une
membrane frappable dont la surface donne la hauteur. Et un trait fermé lu le long de lui-même à
la vitesse du transport devient une automation, le phonographe (4.14) dessiné plutôt
qu'enregistré : la courbe qu'on voit est l'automation.

### 7.11 Le tissage comme partition
Une représentation de la musique qui n'est ni une grille de pas ni un piano roll. Les fils de
chaîne sont les voix, la navette passée à la main est le temps : chaque passage tisse une mesure,
et le tissu produit est la boucle, lisible comme un motif. Une déchirure dans le tissu fait un
silence, et recoudre à la main remplit le trou en reprenant les voix voisines.
Décision de jeu : on compose par un geste large et répété, pas en cochant des cases, et éditer
une boucle devient un geste de réparation.

---

## 8. Le lieu

Le monde est une salle unique et neutre, et l'acoustique est dans les modules plutôt que dans la
géométrie. Une zone est **une bulle dessinée, jamais un Node3D**, et c'est l'outil qui sait dans
quelle bulle est ce qu'il tient ou ce qu'il joue (R3).

### 8.1 Système de localisation du son
Préalable de 8.2 et 8.3, et un chantier à part. L'audio est un graphe, pas de l'espace : la seule
chose spatiale aujourd'hui est `createOutputNode`, qui pose un `PannerNode` par module dans
l'`AudioWorldSystem`. C'est là qu'il faut que les obstacles et les surfaces posés dans le monde
soient connus (A, côté système), et que l'occlusion et les réflexions entre chaque sortie et
l'auditeur soient appliquées par le système. Les nodes de ce thème deviennent alors des
déclarations de géométrie acoustique et non des traitements audio, et le rendu reste local par
client, ce qui est exactement ce qu'on veut : chacun entend depuis sa place.

### 8.2 Node3D Paroi, et l'occlusion
Une plaque qui renvoie le son avec un retard proportionnel à sa distance réelle : trois parois
font une salle, et bouger l'une change l'acoustique en direct, donc la réverbe devient de
l'architecture réglée au bras. Un trait lumineux court le long des surfaces que le son vient de
heurter, donc on voit la forme de la réverbe et on sait quoi déplacer. Symétriquement, un module
derrière un bloc s'entend étouffé, chacun depuis sa place, le bloc étant partagé et l'occlusion
calculée par client : se déplacer change le mix qu'on entend, ce qui donne enfin une raison de
marcher.

### 8.3 Ce qui joue derrière toi
Un module hors du champ de vision se signale par du son spatialisé plutôt que par du visuel, et
se tait quand on le regarde. Le monde pousse à se retourner et à écouter l'espace. Plus facile
qu'il n'y paraît : l'audio est rendu localement, donc c'est un traitement local légitime.

### 8.4 Bulle dessinée, et les biomes
Un contour au crayon délimite un milieu : ce qui est joué dedans passe par un effet. C'est la
seule forme de zone du carnet, testée par l'outil et jamais par le node, donc sans A. Chaque
bulle peut porter une gamme, et un instrument posé dedans est transposé par le scalaire de ses
câbles midi (C) tandis que ce qu'on y joue à la main est quantifié comme par le prisme (5.4) :
déménager un patch, c'est le transposer. Elle peut aussi porter un timbre, un paramètre `biome`
que la bulle écrit quand on y pose le module, un oscillateur sortant cristallin en bulle givre et
saturé en bulle forge ; à cheval sur deux bulles il joue les deux en fondu selon sa position,
réécrit à chaque déplacement par l'outil qui le porte, donc le crossfade devient un placement au
centimètre.

### 8.5 Coulisses
Un module mis en coulisse d'un geste ne s'entend plus que par celui qui l'y a mis : il prépare et
essaie un patch sans que la salle l'entende, et le fait entrer en scène d'un autre geste. Le seul
moyen d'expérimenter sans gêner les autres. Ni zone ni A : un état `backstage` synchronisé avec
l'id de son propriétaire, et comme le rendu audio est local, chaque client coupe lui-même la
sortie globale des modules en coulisse qui ne sont pas à lui. Les autres voient le module, voilé,
et savent à qui il est.

### 8.6 Bloc de glace
Posé sur un module, il l'arrête net mais garde son état visible, comme une photo, et on dégèle
d'un coup de marteau. Sert à la fois de pause, de sauvegarde locale et de gestion de charge.
« L'arrête net » n'existe pas, l'interface Node3D n'a pas de pause : c'est le socle H, et le coût
réel de l'idée. Deux options du même état : le bloc se pose tout seul par le temps sur un module
que personne n'a touché depuis longtemps, qui cesse de consommer ; et le même bloc posé sur toute
la salle d'un geste, levé de même, fait repartir tout le monde ensemble sur le sync, un vrai
départ collectif.

### 8.7 Le larsen comme mécanique
Aujourd'hui la saturation est un accident, et ce serait un meilleur danger assumé. Brancher une
sortie sur sa propre entrée fait monter un larsen qui devient visible avant d'être insupportable :
l'objet vibre, rougit, et finit par se couper tout seul, la connexion fautive débranchée et posée
au sol comme un câble tombé. La boucle est déjà possible, seul le même connectable est refusé, et
le larsen coûte la connexion, jamais le module.
Sa bonne face est le geste du guitariste : approcher un instrument d'un haut-parleur branché sur
lui fait durer sa note indéfiniment, s'éloigner la laisse mourir. L'ampli connaît ses sources par
ses connexions et lit la distance au node source, faisable si `Node3DGraph` expose les positions,
sans A complet.

---

## 9. Modules composés, modules greffés

Un patch qui grossit devient illisible, et rien ne permet de faire d'un groupe de modules une
seule pièce. Ce thème ajoute la fusion, le lien caché et la greffe.

### 9.1 Établi
Un socle à deux emplacements. Deux modules posés en sortent un seul, pré-câblé, plus compact,
avec les paramètres des deux réunis sur une face. Répond à un vrai problème, les patchs qui
deviennent illisibles. Réversible par le geste inverse sur le même établi, un module fusionné
reposé dessus et séparé à deux mains redevenant deux modules câblés comme avant, sans quoi
personne n'ose fusionner ; mais la fusion n'est défaisable que tant que la colle est fraîche, et
devient définitive passé un délai visible sur la pièce, ce qui donne à l'établi le seul moment de
tension qui lui manquait.
Un node est identifié par un `kind` string à l'ajout au réseau, donc un module fusionné est une
factory composite dont l'état sérialise deux kinds et deux états, et la réversibilité demande de
recréer deux nodes avec leur état (I) et leurs connexions externes : c'est ce travail-là qui est
gros.

### 9.2 Node3D Gaine, en deux moitiés
Deux modules jumeaux appariés par une clé d'état : ce qui entre dans l'un ressort de l'autre, N
ports de protocoles mêlés, un seul tronc visible entre eux. Quatre câbles traversent la salle en
un. Un paramètre ajoute un délai proportionnel à la distance entre les deux moitiés, par un
`DelayNode` dont le temps suit la distance, donc la distance devient une valeur musicale. Pas de
protocole neuf, mais un lien caché à représenter et à lire par le rôle dans le graphe.
Décision de jeu : le rangement du graphe.

### 9.3 Node3D Polypore
Ne se pose pas au sol mais **sur un autre module**, et lit sa sortie sans câble, par le seul fait
d'être greffé. Reprend l'emboîtement (1.4) mais côté lecture : un écouteur parasite, pas un
opérateur inséré. Se retire en le décollant, donc réversible au geste près.
Décision de jeu : greffer sans rien rebrancher, quitte à encombrer le module hôte.

### 9.4 Node3D Décomposeur
Se nourrit de ce qui ne va nulle part. `VisualEffectSystem` sait déjà si un node est sur un
chemin valide vers une sortie ; le décomposeur lit ce rôle et convertit en automation le signal
des branches mortes autour de lui. Un patch abandonné cesse d'être du déchet et devient une
source de modulation.
Décision de jeu : laisser traîner des branches inutiles devient un choix, au lieu d'un désordre.

### 9.5 Node3D Spore
Un node à une entrée audio ou midi et une sortie midi. Il extrait les attaques de ce qu'on lui
branche et sort ce rythme en notes. Ce qui contamine, c'est sa sortie midi sous l'aimant (1.1) :
tout instrument approché avec l'aimant se branche et joue le motif avec son propre timbre,
l'éloigner le libère. Le motif extrait est un état synchronisé, une liste d'instants par mesure,
calculé par le client qui a branché l'entrée et non par tous.
Décision de jeu : un motif lancé dans un coin envahit ce qu'on approche, et seulement ça.
Condition : ne rien livrer sans la propolis (2.1), qui refuse le branchement automatique d'un
port.

---

## Ordre d'attaque suggéré

1. **Les socles**, dans cet ordre : E (unité, receveur exposé, hook de lecture), F (base
   opérateur), C (le scalaire du lien, avant tout opérateur pour ne rien écrire deux fois),
   G (entrée midi écoutante), puis A (vue du monde), puis B (autorité). D ne bloque que l'audio
   transporté (7.5 audio, 7.8). H, I et J se font avec la première idée qui les demande ; J est
   le moins cher et débloque à lui seul 2.2, 2.4 et le blocage du curseur 1.3.
2. **Ce qui ne dépend d'aucun socle.** La toise (1.15) et le curseur (1.3) d'abord, parce que
   l'aimant leur prend leur étalon et leur portée ; puis l'aimant (1.1) avec la propolis (2.1),
   qui ne se livrent pas l'un sans l'autre, le mousqueton (1.5) et l'empreinte (1.10) juste
   après, puis le roque (1.11), qui est l'empreinte à deux emplacements. Ensuite le Corps (4.1),
   les ports qui fuient (2.6), ce qui joue derrière toi (8.3), la main d'échelle (1.14), le
   BeatGhost (2.11), le phonographe (4.14), les coulisses (8.5), la baguette qui s'allonge
   (3.12), le nuage (6.10) qui ne tient qu'à sa graine, la voile (4.8), et la baliste (4.7) qui
   n'est qu'un champ de plus sur le paramètre.
3. **Les behaviours et les outils d'instrument**, tous sans socle : Farouche (3.3), Chargé (3.4),
   Tenue au pas (3.5), Fenêtre (3.6), Pyramide (3.7), Meule (3.8), le ratchet frappé (3.9),
   l'accord et le bend (3.1), la batterie à zones (3.2), puis les outils archet bulle (3.13),
   pistolet (3.14), trébuchet (3.15), tamponneuse (3.16), harpon (1.2), dérivation (1.8), posture
   (1.18), boomerang (1.19), le plan de construction (1.17), la marelle (3.17) et le jeu à deux
   (3.18).
4. **La voie analytique de B**, qui ne coûte rien : trapèze (4.4), jongle (4.5), fronde (1.13),
   foliot (6.11), volant (6.12), et les mécaniques qui s'épuisent (4.3) sur le modèle du trapèze.
5. **Après E** : couleur égale hauteur (2.8), la loupe (2.7), voir ce qui circule (2.9), la roue
   chromatique (4.10) et le diapason (4.11).
6. **Après F et C** : les petits opérateurs (5.1), l'aiguillage (5.2), les convertisseurs (5.3),
   le foehn (5.7), l'érosion (6.17), l'écho midi (6.16), puis les embouts et l'adaptateur (1.9).
   Le câble sync à décalage (6.15) et le réglage du câble à la main (1.16) se font dans le
   refactor de C. Les bulles (8.4) viennent après C pour la transposition.
7. **Après G** : la retenue (6.18), le bassin (6.19), le tronçon (6.3), la brique-pas et la
   riposte (6.21), le vote (6.7), le vitrail (2.10), le toboggan (6.8), le métronome de poche
   (6.9), l'empreinte du séquenceur (7.4), le jeton (6.2) et le distributeur (6.1), l'oreille
   (5.5) puis le quantiseur et l'oreille à gamme (5.4), le rond de circulation qu'est l'armure
   (6.6), le pochoir (6.5), le cédez-le-passage (6.4), le quatre-temps (6.14) et le régénérateur
   (6.13).
8. **Après A** : le système de localisation du son (8.1), puis la paroi et l'occlusion (8.2), et
   les capteurs du monde (4.13). La spore (9.5) passe par l'aimant et n'attend que lui.
9. **Après B** : le bassin à fluide (4.2), la plante (4.6), le mètre ruban (4.12), le levain
   (6.23) s'il ne se contente pas de la graine du nuage.
10. **Après les petits socles** : J donne la serrure (2.2), puis le crochet (2.3) qui la rend
    acceptable et le panneau (2.4) qui la rend lisible, avec le cloué (2.5) qui est le même calcul
    de graphe. H donne la glace (8.6) puis le lève-cadre (7.6). I donne le miroir (1.12) et
    l'établi (9.1), puis le marteau (5.6), le tracé joué (7.9) qui est le même Interactor mené par
    un dessin, et derrière eux les mains fantômes (7.1).
11. **Les refactors** : frotter l'effet (3.10), la laisse de patch (1.6), le Tool Brique (1.4)
    qui suit l'aimant et lit `Node3DGraph` comme la laisse, le polypore (9.3) qui reprend son
    emboîtement, et le sous-mode du crayon en un seul chantier (7.10) avec le rail et le
    crayon-câble (1.7).
12. **En dernier** : le bocal (7.3) et le looper interne (7.2) avant l'enclume (7.5), la pioche
    (7.8) avec D, la nasse (7.7) puis le transbordeur (6.20) qui lui emprunte la prise au vol, la
    gaine (9.2), le décomposeur (9.4), le tissage (7.11), le larsen (8.7), l'accordéon (1.20).

---

## Ce qui est refusé, et pourquoi

Une vingtaine de passes de brainstorming ont produit plusieurs centaines de directions, dont la
plupart ont été écartées pour les mêmes raisons, toujours les mêmes. Les motifs valent mieux que
la liste : une idée nouvelle qui tombe dans l'un d'eux est déjà jugée.

**Les murs de permission.** Tout ce qui empêche un joueur d'agir : rôles distribués, témoin ou
signature qui donne seul le droit de régler le tempo, barrière autour d'un module, quorum,
module dont la perte fait taire la salle. Le seul verrou gardé est la propolis (2.1), par port et
visible ; la serrure (2.2) n'est acceptable que parce que le crochet (2.3) la contourne au prix
du temps et du bruit.

**Punir celui qui joue.** Usure, endurance, corvée d'entretien, dette, ressource de geste,
mousse sonore, note « faute » hors temps, module qui recule quand on le frappe fort, vibrato de
fatigue, zone qui ralentit la main. Le projet est un sandbox : la contrainte fabrique un style
(Farouche 3.3, la fenêtre 3.6), elle ne sanctionne pas.

**Un module qui change sans que les autres voient pourquoi.** Dérive par oubli, serrure qui se
referme seule, sirocco qui dégrade une zone, torche qui rend muet, piston qui déplace le module
d'un autre. Le seul dériveur gardé se pose exprès et se voit (6.17).

**Détruire un patch partagé sur accident.** Effondrement, larsen qui brise le module, démolition.
Le larsen (8.7) coûte la connexion, pas le module.

**Une aide à la lecture sans décision.** Tamis de câbles, manche à air, panneau qui nomme la
salle, profondeur dans le graphe en couleur, paramètre qui chante sa valeur, aide-alignement,
peigne à câbles. Les deux seuls visuels sans décision gardés le sont parce qu'ils rendent
jouables des gestes faits à l'aveugle : le panneau (2.4) et le cloué (2.5).

**Un réglage de plus déguisé en idée.** Tempo relatif, oeillet qui augmente `max_connections`,
rosace de voicing, goupille de mute, case de couleur d'un pas sur deux, refroidissement, régime
en unité que E couvre déjà. Sans décision de jeu, ce n'est pas une idée (R6).

**Une propriété posée sur le lien.** Velcro, agrafe, cintreuse, câble qui s'use, câble à longueur
maximale, poise qui résiste au secouage. Le lien porte un scalaire fixé par son protocole (C) et
rien d'autre ; tout le reste est un module posé entre deux ports (R4).

**Un node qui en crée ou en bouge un autre.** Ruche qui essaime, germination, piston. Aucune API
pour ça, et la spore (9.5) fait déjà le pari de la contagion par le graphe.

**Une simulation non déterministe sans autorité.** Cirque de puces, ruche d'aléa autour de chaque
note, graine qui pousse, toboggan à bille, balle de note, pluie qui joue les instruments. Soit le
mouvement est analytique depuis un état à clé (B, voie analytique), soit l'idée est abandonnée.

**Ce qui suppose un monde que le projet n'a pas.** Filon, fossile, écho de caverne, étal et troc,
photomètre : une mémoire entre sessions, un terrain à creuser, des objets rares ou une lumière
dynamique, dont rien n'existe. Le monde est une salle unique et l'état vit dans un doc yjs.

**Ce qui touche au micro.** Souffle dans l'entonnoir, détection de hauteur sur la voix. Le micro
sert au voice chat ; la même analyse sur une entrée audio câblée est gardée (5.4, 5.5).

**Un troisième clavier, un piano roll de plus, une partition sans format.** Piano sélecteur,
pupitre, tableau noir des notes récentes. La roue chromatique (4.10) enseigne la loi du monde, le
PianoRoll est déjà le séquenceur visible par tous, et le tissage (7.11) est la seule autre
représentation gardée parce qu'elle n'est pas une grille.
