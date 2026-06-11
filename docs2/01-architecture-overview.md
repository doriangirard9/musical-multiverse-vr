# 01 — Architecture overview

## What is this app?

`musical-multiverse-vr` is a **collaborative VR music sandbox**.
Multiple players join a shared 3D room (in a browser, with or without a
VR headset), spawn instruments and effects (audio nodes), wire them
together with virtual cables, and play music — together, in real time,
with everyone seeing everyone else's hands and edits.

The application is a single-page web app built with these technologies:

| Concern | Technology |
|---|---|
| 3D rendering | [Babylon.js](https://www.babylonjs.com/) v8 (+ `@babylonjs/gui`, `@babylonjs/loaders`, `@babylonjs/materials`, `@babylonjs/inspector`) |
| Physics (drum kit) | [Babylon Havok](https://github.com/BabylonJS/havok) |
| VR | WebXR via Babylon's `WebXRDefaultExperience` |
| Audio | Web Audio API + Babylon's `AudioEngineV2` |
| Audio plugins | [WebAudioModules (WAM) v2](https://www.webaudiomodules.com/) — both first-party (built-in) and dynamically loaded WAMs |
| Multiplayer state | [Yjs](https://github.com/yjs/yjs) CRDT |
| Multiplayer transport | [y-webrtc](https://github.com/yjs/y-webrtc) — peer-to-peer with a small signaling server |
| 3D plugin authoring | [`wam3dgenerator`](https://github.com/Jempasam/3d_wam_editor) (Jempasam) — generates 3D GUIs from a WAM descriptor |
| Build | [Vite](https://vitejs.dev/) 6, TypeScript 5.8, ES2022 |
| Misc | [tone.js](https://tonejs.github.io/) (used by some instruments), `uuid`, `ws` |

## Runtime layers (high-level)

```
┌────────────────────────────────────────────────────────────────────┐
│                       Browser / WebXR runtime                      │
└────────────────────────────────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ 3D scene layer │    │  Audio graph layer │    │  Network layer     │
│ Babylon.js     │    │  Web Audio + WAM   │    │  Yjs CRDT + WebRTC │
│ (SceneManager, │    │  (Node3DInstance,  │    │  (NetworkManager,  │
│  XRManager,    │    │   *N3DConnectable, │    │   SyncManager,     │
│  UIManager)    │    │   automation/,     │    │   PeerToPeer-      │
│                │    │   functionseq.)    │    │   Manager)         │
└────────────────┘    └────────────────────┘    └────────────────────┘
        ▲                         ▲                         ▲
        └────────────┬────────────┴─────────────┬───────────┘
                     │                          │
              ┌──────┴───────┐          ┌───────┴────────┐
              │ Event buses  │          │ Plugin contract │
              │ (BaseEvent-  │          │ (Node3D.d.ts +  │
              │  Bus<T>)     │          │  factories)     │
              └──────────────┘          └─────────────────┘
```

The three layers communicate **through small, well-defined seams**:

- **Scene ↔ Audio**: a `Node3DInstance` owns both a `Node3DGUI` (Babylon
  meshes) *and* a `Node3D` (audio implementation). The two are pinned
  together by a single instance object — see chapter
  [03](03-node3d-system.md).
- **Audio ↔ Network**: every `Node3D` exposes its mutable state as
  string keys (`getStateKeys()`, `getState(key)`, `setState(key,val)`).
  The `SyncManager` writes that state to a Yjs map; remote peers replay
  it through `setState`. See chapter [05](05-networking-and-sync.md).
- **Scene ↔ Network**: player avatars (head + hands) are sent as
  `PlayerState` snapshots through `NetworkEventBus`, throttled and
  delta-compressed. Remote `Player` instances interpolate to smooth
  motion. See chapter [02](02-app-core.md) and
  [05](05-networking-and-sync.md).
- **Inputs ↔ behaviors**: WebXR controllers and the keyboard funnel
  through `XRControllerManager` → `InputManager`, whose `Observable`s
  feed the behaviors attached to meshes. See chapter
  [06](06-xr-input-and-behaviors.md).

Cross-cutting, every subsystem talks through one of the **six typed
event buses**: `AudioEventBus`, `NetworkEventBus`, `MenuEventBus`,
`UIEventBus`, `IOEventBus`, plus the `Synchronized` interface for
state sync. Chapter [02](02-app-core.md) lists every event on every bus.

## The four connection protocols

A novel piece of this codebase is that **wires between Node3Ds carry
four different kinds of payload**, each with its own color and contract:

| Protocol | Color | Carries | Used by |
|---|---|---|---|
| **Audio** | red `#FF0000` | `AudioNode` connections | OscillatorN3D → SpeakerN3D, etc. |
| **MIDI** | magenta `#BB3388` | `WamNode.connectEvents()` calls (note on/off) | LivePiano → Synth, Sequencer → DrumKit |
| **Automation** | dark grey `#515252` | normalized `0..1` parameter values | Knob / GazeController → any parameter |
| **Sync** | yellow `#fff700` | timing / tempo cascades | Sequencer → Sequencer for beat alignment |

Every parameter in the system is **also** an automation input — that
is, a knob on an oscillator can be wired to from a knob on another
node, or from a gaze controller, or a voice-volume controller. This
"everything is automatable" property is implemented by
`Node3DInstance` registering each parameter as both a draggable knob
*and* an `AutomationN3DConnectable.Input` connectable. See chapter
[03](03-node3d-system.md).

## Top-level singleton dependency map

```
                         NewApp.start()
                              │
   ┌────────────┬─────────────┼─────────────┬─────────────────┐
   ▼            ▼             ▼             ▼                 ▼
SceneManager  UIManager  XRManager   Node3dManager    PlayerManager
   │             │             │             │                 │
   │             │       ┌─────┴─────┐ Node3DBuilder            │
   │             │       │           │       │                  │
   │             │   XRInput-     XRController-  N3DShared      │
   │             │   Manager     Manager         │              │
   │             │       │           │     WamInitializer       │
   │             │       └─────┬─────┘                          │
   │             │             │                                │
   │             │       InputManager                           │
   │             │             │                                │
   ▼             ▼             ▼                                ▼
NetworkManager  ConnectionManager (iomanager)        AppOrchestrator
   │                            │                              ▲
   ├─── PeerToPeerManager       │                              │
   ├─── PlayerNetwork           │                              │
   ├─── Node3DNetwork           │     wires every event bus ───┘
   └─── VisualNetwork           │
                                │
                              Serialization (lazy singleton)
                                │
                          AudioEventBus, NetworkEventBus,
                          MenuEventBus, UIEventBus, IOEventBus
```

Read this top-to-bottom: nothing below depends on anything above being
*absent*. Everything below depends on its parents being initialized.
The order is enforced in [`NewApp.start()`](../src/app/NewApp.ts) and
described in detail in [02 §Boot order](02-app-core.md#boot-sequence).

## The "Refactoring" namespace

Every runtime file lives under `src/`. The name is
historical: this directory was the new, cleaned-up rewrite that replaced
older code, and the rewrite stuck. **Treat `` as "the
codebase".** It is the current code, type-safe, modular, and the only
one wired into [`src/index.ts`](../src/index.ts).

When you add new files, add them under `src/` and follow
the existing folder taxonomy:

- `app/` — top-level singletons and bootstrap, plus `Serialization`
- `eventBus/` — typed event buses
- `node3d/` — the plugin contract and runtime
  - `instance/` — runtime instance classes
  - `tools/` — helpers exposed to plugin authors via `context.tools`
  - `subs/` — concrete instruments
    - `automation/` — automation source controllers (gaze, voice, position…)
    - `note_generator/` — MIDI generators (keyboards, harp, drumpads)
    - `functionsequencer/` — JS-scriptable live-coding sequencer
    - `drumkit/` — physical XR drum kit (Havok)
    - `PianoRoll/` — grid-based MIDI editor
    - `maracas/`, `speaker/`, `debug/` — single-instrument folders
- `network/` — multiplayer (Yjs + y-webrtc + `PeerToPeerManager`)
- `xr/` — WebXR and inputs
- `behaviours/` — Babylon `Behavior<T>` implementations
- `menus/` — 3D menus (`HandMenu`, `SimpleMenu`)
- `world/` — non-instrument scene objects (shops, stands, previewers)
  - `menu/` — the new 2D-on-plane shop UI (`ShopPanel`)
- `visual/` — visual-only meshes (cables, ropes)
- `wamExtensions/` — globally registered extensions to the WAM standard
- `shared/`, `utils/`, `iomanager/` — small support folders

## Build & dev workflow

### Layout in the repo root

```
.
├── index.html                  # mounts <canvas id="renderCanvas">
├── src/
│   ├── index.ts                # entry point (filters logs, bootstraps NewApp)
│   └──             # all runtime code (see above)
├── public/                     # static assets (drum kit .glb, etc.)
├── server-config/
│   ├── server.js               # Express server: WAM config endpoints
│   └── public/{coreConfig,wamsConfig}/  # JSON configs for plugins
├── localhost.{key,crt,csr}     # self-signed certs for local HTTPS (WebXR requires HTTPS)
├── docker-compose.yml          # client + server stack
├── Dockerfile-app              # client container
├── package.json                # vite, babylon, yjs, tone, uuid, ...
├── vite.config.js              # ES2022, HTTPS via the localhost certs, wasm assets
├── tsconfig.json
└── docs/                       # (you are here)
```

### Running it locally

```bash
# 1. Install deps
npm i

# 2. Run the WAM-config server (terminal 1)
cd server-config
node server.js                # listens on :3000

# 3. Run the client (terminal 2)
npm run dev                   # vite dev server with HTTPS via localhost.{key,crt}
```

WebXR requires HTTPS — that's why the dev server uses self-signed certs
(`localhost.crt` / `localhost.key`, configured in
[`vite.config.js`](../vite.config.js)). Accept the browser warning the
first time.

The client also expects the config server to be reachable. The default
URL it hits is `http://${window.location.hostname}:3000/wamsConfig/...` — see
[`Node3DBuilder.ts`](../src/app/Node3DBuilder.ts).

### Docker

`docker-compose.yml` brings up both client and server in containers.

### Important Vite tweaks

[`vite.config.js`](../vite.config.js) has a few non-default settings
that matter:

- `target: "es2022"` everywhere — top-level `await`, native classes,
  `import.meta`, etc.
- `optimizeDeps.exclude: ['@babylonjs/havok']` — Havok ships a `.wasm`
  that Vite must not pre-bundle.
- `assetsInclude: ['**/*.wasm']` — treat wasm as a static asset.
- `worker: { format: 'es' }` — required by Yjs and some WAM plugins
  that ship ES-module workers.
- `server.host: true` — exposes the dev server to the local network so
  a Quest can hit your laptop.

### The `index.html`

Two important elements:

- `<canvas id="renderCanvas">` — Babylon mounts here.
- `<div id="log">` — a fixed bottom panel where some logs appear; useful
  when you don't have a console (e.g. inside a Quest browser).

## Debug shortcuts

While running on a desktop, `NewApp` registers these keys (see
[NewApp.ts](../src/app/NewApp.ts)):

| Key | Action |
|---|---|
| `P` | Prompt for a Node3D `kind` and create it at `(0, 0, 5)` |
| `I` | Toggle the Babylon Inspector |
| `L` | Serialize the nearest Node3D (and its connected sub-graph) to JSON; logs to console |
| `M` | Prompt for a JSON graph string and load it back |
| `U` | (in `SceneManager`) toggle inspector — same idea |

In VR, the **right A button** opens/closes the
[`ShopPanel`](07-menus-and-world.md#shoppanel), and the **left X
button** toggles
[`ControlsUI`](02-app-core.md#controlsui-controlsuits) (the per-button
labels).

## Where to go next

- If you want the **boot sequence in detail**, read
  [02 — App core](02-app-core.md).
- If you want to know what a **Node3D actually is**, read
  [03 — Node3D system](03-node3d-system.md).
- If you want to **see all the existing instruments**, jump to
  [04 — Instruments catalog](04-instruments-catalog.md).
- If you want to understand **multiplayer**, read
  [05 — Networking & sync](05-networking-and-sync.md).
- If you want to **add an interaction**, read
  [06 — XR input & behaviors](06-xr-input-and-behaviors.md).
- If you want to **add a menu**, read [07 — Menus & world](07-menus-and-world.md).
- If you want to know what **patterns are used and why**, read
  [08 — Patterns & conventions](08-patterns-and-conventions.md).
- If you want **a recipe**, read [09 — Contributor guide](09-contributor-guide.md).
- If you want **a flat index of every file**, read
  [10 — File reference](10-file-reference.md).
