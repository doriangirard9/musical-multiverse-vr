# musical-multiverse-vr

Server Url: https://musical-multiverse-vr.onrender.com/
Client Url: https://musical-multiverse-vr-1.onrender.com/

### Installation
```
npm i
```

### Run
Client
```
npm run dev
```
Server
```
cd server-config; node server.js
```

### Documentation
A contributor walkthrough of the codebase lives in [`docs/`](docs/README.md):
how the app boots, what every class does, the four wire protocols
(audio / MIDI / automation / sync), how multiplayer sync works, and
end-to-end recipes for adding new instruments, behaviors, and menus.

### Guide d'architecture
#### Low coupling
L'architecture limite le couplage entre les fonctionnalités afin de pouvoir facilement les activer, désactiver ou modifier indépendamment.

Chaque fonctionnalité possède son propre sous-dossier dans `src/` contenant ses classes et comportements. Sa gestion du cycle de vie et ses interactions avec les autres systèmes sont assurées par un système dédié dans `src/app/`.

Les systèmes évitent de se référencer directement et privilégient les observers ou événements pour communiquer.

#### Pas de couplage avec WebXR
Le code applicatif ne doit pas interagir directement avec WebXR. `InputManager` sert d'intermédiaire pour les entrées, de même que le système de caméra.

Cela permet notamment d'utiliser les fonctionnalités sans dépendre directement de WebXR.

#### Aucun import dans les Node3D
Les `Node3D` ne doivent importer ni le moteur ni BabylonJS. Ils accèdent à leurs fonctionnalités uniquement via le `Context` fourni en paramètre.

Cela permet de compiler un `Node3D` en JavaScript standalone, de l'héberger sur un serveur et de l'importer via son URL.

Si une fonctionnalité nécessaire n'est pas disponible dans le `Context`, elle peut être ajoutée comme dépendance, mais cela réduit l'indépendance du plugin. Dans l'idéal, les fonctionnalités génériques doivent être ajoutées à l'API du `Context`.

#### Injection de dépendances
On évite les `System.getInstance()` au profit de l'injection de dépendances.

Les dépendances sont fournies à l'objet lors de sa création plutôt que récupérées directement depuis des singletons. Cela réduit le couplage et facilite notamment les tests en permettant de remplacer facilement une dépendance par une autre implémentation.
