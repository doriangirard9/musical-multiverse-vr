# Quickref : les systèmes de `src/app/`

Aide-mémoire de navigation. Le détail vit dans les fichiers `01-*` à `10-*`.

## Principes (README)

- **Faible couplage** : une fonctionnalité = un sous-dossier de `src/`, piloté par un système dédié dans `src/app/`. Les systèmes communiquent par observers et événements, pas par références directes.
- **Pas de WebXR dans le code applicatif** : tout passe par `InputManager` et le système de caméra. L'app doit tourner hors XR.
- **Aucun import dans les Node3D** : ni moteur, ni BabylonJS. Un `Node3D` n'accède qu'au `Context` reçu en paramètre, ce qui permet de le compiler en JS standalone et de le charger par URL. Une capacité manquante s'ajoute au `Context`, pas en dépendance directe.
- **Injection de dépendances** : les systèmes reçoivent leurs dépendances à l'initialisation. Les `getInstance()` existent mais servent uniquement au câblage dans `App.start`.

## Noyau

| Fichier | Rôle |
| --- | --- |
| `App.ts` | Point d'entrée. `start()` initialise tous les systèmes dans l'ordre et rapporte la progression via `onProgress`. Gère aussi le wake lock écran. |
| `AppOrchestrator.ts` | Amorce les bus d'événements (`NetworkEventBus`, `IOEventBus`). |
| `SceneManager.ts` | Scènes BabylonJS et renderer, y compris l'utility layer. |
| `UIManager.ts` | Expose la `AdvancedDynamicTexture` GUI partagée. |
| `TargetManager.ts` | Détermine l'objet actuellement pointé par chaque contrôleur et notifie les changements de cible. |
| `PlayerManager.ts` | État du joueur local, envoyé au réseau de façon throttlée quand le changement est significatif. |
| `WamInitializer.ts` | Host group WAM et instanciation d'un `WebAudioModule` depuis une URL. |
| `BabylonsJSFix.ts` | Patchs de comportements BabylonJS mal implémentés (notamment `Node.removeBehavior`). |
| `MicrophoneSystem.ts` | Capture micro, modes `open_mic` / `push_to_talk`, niveau d'entrée, `onStateChanged`. |

## `node3d/` : le graphe musical

| Fichier | Rôle |
| --- | --- |
| `Node3DBuilder.ts` | Mappe un nom de kind vers une `Node3DFactory`. Ajouter un Node3D passe par `FACTORY_KINDS` et `createFactories`. Fournit aussi thumbnails et impostors. |
| `Node3dManager.ts` | Ajoute les nodes au monde et au réseau, et en tient le registre. La création elle-même appartient au builder. |
| `ConnectionManager.ts` | Connexion de deux connectables : écoute les événements IO, affiche l'aperçu pendant la sélection, crée la connexion réseau au relâchement. |
| `Serialization.ts` | Sauvegarde et rechargement d'un graphe (nodes + connexions), avec option d'inclure les nodes connectés. |
| `WamTransportManager.ts` | État de transport WAM : play/stop, tempo, signature. |
| `AudioDestinationSystem.ts` | `AudioWorldSystem` : spatialisation, destination audio globale, chaîne de filtres ordonnée. |

## `menu/`

| Fichier | Rôle |
| --- | --- |
| `MenuSystem.ts` | Un seul menu ouvert à la fois. Ferme et dispose le précédent. |
| `ShopMenuSystem.ts` | Menu d'ajout de Node3D dans la scène (bouton `Y`). Filtrable par `allowedKinds` en mode tutoriel. |
| `HandMenuSystem.ts` | Menu attaché à la main gauche : objet pointé + actions globales (play/stop, shop). |
| `BarMenuSystem.ts` | Menu en barre billboardée au-dessus de chaque `Node3DInstance`. Configuration dans `createMenuConfig`, menus 3D complexes dans `createMenu`. |
| `ContextMenuSystem.ts` | Menu contextuel d'un node sélectionné (bouton `B`) (suppression, etc.), avec surbrillance du node. |
| `ControlsUISystem.ts` | Labels 3D d'aide posés près de chaque bouton des contrôleurs virtuels. Désactivé : son initialisation est commentée dans `App.start`, le bouton `X` servant désormais au menu de main. |

## `social/`

| Fichier | Rôle |
| --- | --- |
| `AvatarSystem.ts` | Avatars animés des autres joueurs, synchronisés via `NetworkManager` / `SyncManager`. Masque les avatars trop proches. |
| `DrawingSystem.ts` | Dessin 3D : possède les courbes `Curve3D` synchronisées et les traits (`startStroke`), alimentés par l’outil « Pencil ». Création possible depuis un path SVG. |
| `VoiceChatSystem.ts` | Voix en pair à pair, pilotée par le flag `voiceEnabled` de l'awareness réseau. |

## `feedback/`

| Fichier | Rôle |
| --- | --- |
| `HapticContactSystem.ts` | Vibration au contact pointeur/mesh, plus des pulses synchronisés sur le beat. |
| `ParameterJaugeSystem.ts` | Jauges reflétant la valeur normalisée des paramètres WAM d'un node. |

## `hand/`

| Fichier | Rôle |
| --- | --- |
| `ToolSystem.ts` | Possède les deux mains (`ToolSlot` de `src/tool/`) et leur menu de sélection : `X` ouvre celui de la main gauche, `A` celui de la main droite. Les types d’outils vivent dans `src/tool/`, enregistrés dans `ToolRegistry`. L’outil « Pointer » porte le visuel de pointeur local, l’outil « Pencil » dessine à la gâchette via `DrawingSystem`. |

## `visual/`

| Fichier | Rôle |
| --- | --- |
| `VisualEffectSystem.ts` | Effets visuels par node, branchés sur des analysers audio des connectables. Système autonome depuis le découpage de `Node3DInstance`. |

## Ordre d'initialisation dans `App.start`

`SceneManager` → `AudioContext` + audio engine → `UIManager` → `XRManager` ou `NonXRManager` → `InputManager` → `MenuSystem` → `Node3dManager` → `PlayerManager` → `NetworkManager` → `ConnectionManager` → `AppOrchestrator` → démarrage du rendu → (`DrawingSystem`, `AvatarSystem`, `ShopMenuSystem`, `TargetManager`, `HapticContactSystem`, `AudioWorldSystem` en parallèle) → `MicrophoneSystem` → `VoiceChatSystem` → (`ToolSystem`, `HandMenuSystem`, `ContextMenuSystem`, `ParameterJaugeSystem` en parallèle) → `BarMenuSystem`.
