# 02 — App core

This chapter covers the bootstrapping skeleton: the entry point, the
singleton managers under `src/app/`, the typed event-bus
spine under `src/eventBus/`, and the `Serialization`
save/load system. Everything below this chapter (the Node3D plugin
layer, networking, XR, menus) sits on top of these pieces.

## Files covered

| Folder | Files |
|---|---|
| `src/` | [`index.ts`](../src/index.ts) |
| `src/app/` | [`NewApp.ts`](../src/app/NewApp.ts), [`AppOrchestrator.ts`](../src/app/AppOrchestrator.ts), [`SceneManager.ts`](../src/app/SceneManager.ts), [`UIManager.ts`](../src/app/UIManager.ts), [`MessageManager.ts`](../src/app/MessageManager.ts), [`ControlsUI.ts`](../src/app/ControlsUI.ts), [`Node3dManager.ts`](../src/app/Node3dManager.ts), [`Node3DBuilder.ts`](../src/app/Node3DBuilder.ts), [`PlayerManager.ts`](../src/app/PlayerManager.ts), [`Player.ts`](../src/app/Player.ts), [`WamInitializer.ts`](../src/app/WamInitializer.ts), [`Serialization.ts`](../src/app/Serialization.ts) |
| `src/eventBus/` | [`BaseEventBus.ts`](../src/eventBus/BaseEventBus.ts), [`AudioEventBus.ts`](../src/eventBus/AudioEventBus.ts), [`IOEventBus.ts`](../src/eventBus/IOEventBus.ts), [`MenuEventBus.ts`](../src/eventBus/MenuEventBus.ts), [`UIEventBus.ts`](../src/eventBus/UIEventBus.ts), [`NetworkEventBus.ts`](../src/eventBus/NetworkEventBus.ts) |
| `src/shared/` | [`SharedTypes.ts`](../src/shared/SharedTypes.ts) |
| `src/utils/` | [`utils.ts`](../src/utils/utils.ts) |

---

## Entry point: `src/index.ts`

[src/index.ts](../src/index.ts) does three things:

1. **Patch `console.log`** (lines 5–12) to drop logs that consist of a
   single number — a workaround for the spammy memory-allocation logs
   emitted by the [`wam3dgenerator`](https://github.com/Jempasam/3d_wam_editor)
   dependency.
2. **Wait for `DOMContentLoaded`-like event** (lines 43–44) — uses
   `document.readyState === "complete"` for already-loaded pages, falls
   back to a `load` listener.
3. **Construct and `start()` `NewApp`** (lines 33–41), wrapped in
   `try/catch` so any boot error gets logged loudly.

There's also an in-source documentation block in French (lines 14–28)
that summarizes the two key abstractions: **Node3D** (plugin contract)
and **Synchronized / SyncManager** (network sync).

---

## Boot sequence

[`NewApp`](../src/app/NewApp.ts) is the bootstrap class. It
is itself a singleton — `NewApp.get()` returns the running instance —
but the construction is done in `index.ts` (`new NewApp()`).

> **Naming**: this branch uses `NewApp.get()` (line 28). Older branches
> used `getInstance()`. The other managers in `app/` still use
> `getInstance()` — only `NewApp` is shorter.

The full `start()` sequence in
[NewApp.ts:33–245](../src/app/NewApp.ts):

```
 1. NewApp.instance = this                              // (line 34)
 2. SceneManager.initialize()                           // Babylon Engine, scene, ground, walls, Havok, WaveGround, SoundwaveEmitter
 3. const audioContext = new AudioContext()
 4. await first user click → audioContext.resume()      // browser autoplay rule
 5. audioEngine = await CreateAudioEngineAsync(...)     // Babylon AudioEngineV2
 6. await audioEngine.unlockAsync()
 7. UIManager.initialize()                              // GUI3DManager + AdvancedDynamicTexture
 8. await XRManager.getInstance().init(scene, engine)   // WebXR session bootstrap
 9. await Node3dManager.initialize(ctx, engine)         // builds N3DShared, fetches WAM list
10. PlayerManager.initialize()                          // local player, throttled state broadcast
11. NetworkManager.initialize()                         // Yjs doc, PeerToPeer + sub-networks
12. ConnectionManager.initialize()                      // iomanager — wire-drawing logic
13. await AppOrchestrator.initialize()                  // wires every event bus
14. SceneManager.getInstance().start()                  // engine.runRenderLoop + per-frame player update
15. controlsUI = new ControlsUI()                       // 3D button labels on the controllers
16. InputManager.x_button.onChange → controlsUI.toggle()
17. window keydown handlers (P, I, L, M debug shortcuts)
18. InputManager.a_button.onDown → toggle ShopPanel
19. InputVisualPointer.CreateSimple(...) for left/right pointers
```

> **XR vs Node3dManager order**: on this branch, `XRManager.init()`
> happens **before** `Node3dManager.initialize()` (lines 58 vs 60),
> because `MessageManager` (built by `UIManager`) reads
> `XRManager.getInstance().xrHelper.baseExperience.camera` and would
> crash if the helper wasn't initialized. If you reorder anything,
> watch for that constraint.

Step 4 is **critical** — browsers block audio output until a user
gesture, so the boot deliberately *pauses* on the click event. If you
ever see "Audio context is suspended" in console, this is why.

The order is enforced by `await`s, but **also by the `getInstance()`
discipline** — each manager throws on `getInstance()` if `initialize()`
hasn't been called yet (see e.g.
[Node3dManager.ts:27-30](../src/app/Node3dManager.ts)). This
turns missed initialization into an immediate hard error rather than
silent corruption.

---

## Singleton discipline

Almost every class in `app/` follows the same shape:

```typescript
export class FooManager {
    private static _instance: FooManager | null = null;
    private constructor(/* ... */) { /* ... */ }

    public static initialize(/* args */) {
        FooManager._instance = new FooManager(/* args */);
    }

    public static getInstance(): FooManager {
        if (!FooManager._instance)
            throw new Error("FooManager not initialized. Call initialize() first.");
        return FooManager._instance;
    }
}
```

Three things make this idiomatic in this codebase:

1. **Private constructor** — constructing one outside `initialize()` is
   a compile error.
2. **Lazy `_instance`** — null until set, throws on access. No
   silent default singletons.
3. **Two-phase init** — `initialize()` is sometimes `async`, so it's
   separated from `getInstance()` so callers can `await` boot once and
   then synchronously `getInstance()` everywhere else.

`WamInitializer` and `Serialization` are exceptions — they're lazy:
the *first* call to `getInstance()` constructs the instance.

---

## Per-class reference

### `NewApp` ([NewApp.ts](../src/app/NewApp.ts))

The bootstrap class.

| Member | Where | What |
|---|---|---|
| `private static instance` | line 26 | The singleton handle |
| `static get()` | 28 | Throws if `start()` hasn't run — note the short name |
| `async start()` | 33 | The boot sequence above |
| `private controlsUI?: ControlsUI` | 21 | Held so it can be `toggle()`d on X-button |

**Why it exists:** to be the single owner of the boot order. Anything
that needs *all* the singletons up before it can run lives here.

The two big chunks of commented-out code at the bottom
([NewApp.ts:152-244](../src/app/NewApp.ts)) are a previewer
spawn loop and a two-shop test scene — useful as reference when you
need to spawn a lot of instruments from JS, but kept out of the live
code path.

#### Debug keyboard shortcuts (NewApp.ts:90-135)

| Key | Action |
|---|---|
| `P` | Prompt for a Node3D `kind`, spawn at `(0, 0, 5)` via `Node3dManager.createNode3d` |
| `I` | Toggle the Babylon Inspector |
| `L` | Find the Node3D nearest to the local player, serialize it (with its connected sub-graph) via `Serialization.save`, log the JSON |
| `M` | Prompt for a JSON graph string, parse it, call `Serialization.load` — spawns the saved nodes |
| `Q` | (commented out) — was a thumbnail dump |
| `U` | (in `SceneManager`) toggle inspector — same idea as `I` |

A on the right controller toggles the [`ShopPanel`](07-menus-and-world.md#shoppanel)
(NewApp.ts:139-145). X on the left toggles [`ControlsUI`](#controlsui-controlsuits)
visibility (NewApp.ts:82-86).

### `AppOrchestrator` ([AppOrchestrator.ts](../src/app/AppOrchestrator.ts))

The **mediator** between event buses. It owns no state of its own — it
just listens on one bus and calls into a manager (often emitting on
another bus).

| Method | Line | What |
|---|---|---|
| `static async initialize()` | 25 | Construct singleton, instantiate every event bus, register listeners |
| `static getInstance()` | 38 | Throws if not initialized |
| `private onMenuEvent()` | 43 | Subscribes to `MenuEventBus.CREATE_AUDIO_NODE` → `Node3dManager.createNode3d(kind, Vector3(0,0,5), nodeId)`; on `string` error result, surfaces it via `UIManager.showMessage` |
| `private onAudioEvent()` | 56 | Currently empty stubs for `AUDIO_NODE_CREATED` / `AUDIO_NODE_LOADED` (placeholders for future cross-cutting reactions) |
| `private debugLogEvents()` | 61 | Helper (not called by default) — wires every event from every bus to a `console.log`. Useful when adding a new bus |

`initialize()` *also* calls `IOEventBus.getInstance()` at line 33 just
to construct it, even though `AppOrchestrator` doesn't store the
reference — so that other code can call `getInstance()` later without
a "first-call" race.

> **Note**: `CREATE_AUDIO_NODE` events spawn the new node at the
> hardcoded position `Vector3(0, 0, 5)` (line 46). The
> [`ShopPanel`](07-menus-and-world.md#shoppanel) doesn't yet pass a
> "spawn at this position" payload — it goes through this fixed path.

### `SceneManager` ([SceneManager.ts](../src/app/SceneManager.ts))

Owns the Babylon `Engine`, `Scene`, `ShadowGenerator`, ground, walls,
physics, and two world objects: `WaveGround` (an animated 30×30 grid
floor) and `SoundwaveEmitter` (a circular ripple emitter).

| Method | Line | What |
|---|---|---|
| `static initialize()` | 65 | Reads `document.getElementById('renderCanvas')` and constructs |
| `static getInstance()` | 70 | Throws if not initialized |
| `start()` | 75 | `engine.runRenderLoop(scene.render)` and per-frame `NetworkManager.updatePlayers(deltaTime)` |
| `getScene()` | 91 | Returns the Babylon `Scene` |
| `getWaveGround()` | 95 | The live `WaveGround` instance — its `.put(x, y, ...)` injects ripples |
| `getShadowGenerator()` | 99 | Returns the directional-light shadow generator (1024×1024, transparency) |
| `getSoundwaveEmitter()` | 103 | Returns the singleton emitter — instruments call into this to generate visual ripples |
| `private async initializePhysics()` | 110 | Loads Havok wasm, enables physics with gravity (0,-9.8,0), aggregates ground as static box |
| `isPhysicsReady()` | 131 | Boolean — physics init is async, so ask before using |
| `private initializeShadowGenerator()` | 136 | Creates a directional light at (0,60,0), intensity 0.2 |
| `private createGround()` | 147 | Creates `SoundwaveEmitter`, `WaveGround` (with a 200ms random-ripple loop and a 50ms update tick), the invisible 100×1×100 ground box, four invisible walls, and two hemispheric lights |

The `U` keydown listener (lines 44–52) toggles `@babylonjs/inspector`
on the live scene — the same effect as `I` in `NewApp`, kept for
historical reasons.

The constructor *also* installs a guard (lines 55–62) that intercepts
`B.EngineStore.LastCreatedScene` — if any code accidentally relies on
that global, an error is logged. Always pass the scene explicitly.

**Gotchas:**
- Physics is initialized **asynchronously** in the constructor and not
  awaited by `start()`. If you spawn a physics-using object very early
  in the boot, gate it on `isPhysicsReady()`.
- The ground itself is `isVisible = false`. The visible floor you see
  is the `WaveGround` mesh sitting just above it.

### `UIManager` ([UIManager.ts](../src/app/UIManager.ts))

A facade over Babylon's two GUI APIs:

- `GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", undefined, scene)` —
  flat 2D overlay (used by `MessageManager`)
- `GUI.GUI3DManager` — manager for in-world 3D controls
  (`controlScaling = 0.5`)

It also owns a `MessageManager` (the comment on line 24 notes this
should ultimately become a singleton too).

> **Note**: the audio-event listeners (`AUDIO_NODE_CREATED`,
> `AUDIO_NODE_LOADED`, `AUDIO_NODE_ERROR`) that previously surfaced
> "Loading..." and error toasts are commented out
> ([UIManager.ts:42-44](../src/app/UIManager.ts)) — there's
> a comment "Plus de message sur l'écran" ("no more on-screen
> messages"). If you re-enable them, also re-enable the corresponding
> reaction in `Node3dManager` (currently it does emit them).

| Method | Line | What |
|---|---|---|
| `static initialize()` | 31 | Pulls scene from `SceneManager` |
| `static getInstance()` | 35 | Throws if not initialized |
| `getGui()` / `getGui3DManager()` | 47 / 51 | Accessors |
| `showMessage(msg, duration)` / `hideMessage()` | 55 / 59 | Forward to `MessageManager` |

### `MessageManager` ([MessageManager.ts](../src/app/MessageManager.ts))

The transient HUD message system. **Not a singleton** — owned by
`UIManager`. There's a `// CHANGER MESSAGE MANAGER EN SINGLETON` TODO
in [UIManager.ts:24](../src/app/UIManager.ts).

| Method | Line | What |
|---|---|---|
| `showMessage(text, duration?)` | 17 | Creates a 4×2 plane in front of the XR camera with `BILLBOARDMODE_ALL`, big white centered text. `duration` in ms; `0` means sticky |
| `hideMessage()` | 62 | Disposes plane, texture, and the per-frame observer |
| `private _positionMessageInFrontOfCamera` | 77 | Sets `position = camera.getFrontPosition(2)` and registers the per-frame updater |
| `private _updateMessagePosition` | 95 | Re-positions every frame so the message tracks the head |
| `private _removeMessagePlaneObserver` | 100 | Cleanup |

Reads the XR camera through `XRManager.getInstance().xrHelper.baseExperience.camera` —
so it only works correctly once XR is initialized. The boot order
guarantees that. The plane is set `isPickable = false` (line 25) so
it doesn't intercept controller picks.

### `ControlsUI` ([ControlsUI.ts](../src/app/ControlsUI.ts))

Optional HUD: a small text label floats next to each physical
controller button explaining what it does. It uses real-time mesh
introspection to find the actual button geometry inside the controller
model and pin the label to it.

The class lives in
[`src/app/ControlsUI.ts`](../src/app/ControlsUI.ts).
Highlights:

- **Per-controller labels** for `Y` (WAM 3D Shop), `X` (Hide/Show),
  Grip, Trigger, Stick on the left; `A` (Menu/OK), Grip, Trigger, Stick
  on the right.
- Each label is a `0.06 × 0.015` plane with `BILLBOARDMODE_ALL`,
  attached to a Babylon GUI 256×64 texture with a colored border.
- Recursive search through the WebXR controller model hierarchy by
  name pattern (`a-button`, `xr-standard-trigger`, `thumbstick`, etc.,
  with multiple aliases per button to cover Quest/Vive/Index naming).
  Falls back to the grip position if a component mesh isn't found.
- An optional `showDebugGrid` flag draws a 10cm wireframe coordinate
  cube at each grip with labelled corners — useful when fine-tuning
  per-controller offsets.

Wired up in [NewApp.ts:79-86](../src/app/NewApp.ts) so the
left-X button toggles label visibility.

**Why it's worth knowing:** if you change which buttons trigger what,
you'll want to update the strings in `_createLabels()` so the on-screen
hints match the actual bindings.

### `Node3dManager` ([Node3dManager.ts](../src/app/Node3dManager.ts))

The factory-front-of-house for the Node3D plugin system. Holds the
`AudioContext` + Babylon `AudioEngineV2`, owns a `Node3DBuilder`,
emits audio events, registers nodes with the network.

| Method | Line | What |
|---|---|---|
| `static async initialize(ctx, engine)` | 22 | Construct singleton, then `await builder.initialize()` (which builds `N3DShared` and fetches the WAM config list) |
| `static getInstance()` | 27 | Throws if not initialized |
| `async createNode3d(kind, position, id?)` | 32 | Generate ID if missing, emit `AUDIO_NODE_CREATED`, build factory + impostor + node in parallel, wrap with `AsyncLoading` spinner, set position, register with `NetworkManager.node3d.nodes`, emit `AUDIO_NODE_LOADED`; on failure emit `AUDIO_NODE_ERROR` and throw |
| `getAudioContext()` / `getAudioEngine()` | 76 / 80 | Accessors |
| `readonly builder: Node3DBuilder` | 12 | Public field — call `node3dManager.builder.getFactory(kind)` to introspect available kinds |

The signature on this branch is

```typescript
createNode3d(kind: string, position: Vector3, id?: string): Promise<Node3DInstance | null>
```

— **the position is required**. Older branches had a two-arg version;
all callers on this branch supply a position.

The implementation (lines 32–73) is interesting: it fires three async
phases concurrently and uses `AsyncLoading.create` to show a loading
spinner at the spawn position while everything resolves:

```
initfactory()    // pre-fetch the factory (warm cache)
spawn()          // builder.create + position + network.add
createImpostor() // small billboard mesh while spawn() runs
```

`Promise.allSettled([createImpostor, spawn])` (line 63) lets the
impostor be disposed cleanly whether spawn succeeds or fails.

### `Node3DBuilder` ([Node3DBuilder.ts](../src/app/Node3DBuilder.ts))

The actual factory. Resolves a *kind* string to a
`Node3DFactory<Node3DGUI, Node3D>`, with a per-instance cache.

| Member | Line | What |
|---|---|---|
| `FACTORY_KINDS: string[]` | 45 | The discoverable list. Hardcoded builtins + `wam3d-${k}` for every key in `wam3dgenerator.examples` + `add-${k}` for every entry in the server's `additionalConfigs.json`. After `initialize()`, server-loaded WAM IDs are *prepended* (line 245) |
| `private async parseFactory(code)` | 52 | Parses a JSON `Node3DConfig` (a `name` plus a `wam3d` initialization payload, or a legacy `bottom_color`-keyed payload) and returns a `Wam3DGeneratorN3DFactory.create(...)` factory |
| `private async createFactories(kind)` | 65 | The kind dispatcher — see table below |
| `getFactory(kind)` | 138 | Cached version of `createFactories`. Cache values are `Promise`s (so concurrent requests share a single fetch). On `null` result the cache entry is removed so a retry can run |
| `async create(kind)` | 157 | `getFactory(kind)`, then `instantiateNode3d(factory)`. Returns either a `Node3DInstance` or an error string |
| `getThumbnail(kind)` | 179 | Renders a thumbnail for the kind, caches it, packs it into the shared `TextureAtlas`. Used by `ShopPanel` and the `N3DPreviewer` impostor |
| `createImpostor(kind)` | 207 | Returns a small billboard plane sampling the atlas — used by `Node3dManager.createNode3d` while the real node spawns |
| `getShared()` | 222 | Returns the [`N3DShared`](../src/node3d/instance/N3DShared.ts) bag of resources |
| `async initialize()` | 229 | Builds `N3DShared`, then `GET ${WAM_CONFIGS_URL}/wamsConfig` and prepends the returned list to `FACTORY_KINDS` |
| `private async instantiateNode3d(factory)` | 251 | `new Node3DInstance(shared, factory); await instance.instantiate(); return instance` |
| `readonly atlas: TextureAtlas` | 171 | The shared 2048×2048 thumbnail atlas |

The `createFactories` dispatcher handles five sources, in order:

| Prefix / kind | Source | Example |
|---|---|---|
| `desc:<json>` | The JSON inline (after the colon) is parsed as a `Node3DConfig` and turned into a Wam3DGenerator factory | Used by the **P** key prompt |
| `external:<url>[#anchor]` | Dynamic ES-module import. If `#anchor` is set, picks that named export; else falls back to `default`. Validates that the imported object has `create`, `createGUI`, `label` | Lets you load a plugin from a remote URL |
| Hardcoded ID | Built-in factories — see the long `if(kind=="...")` chain (lines 87–106) | `audiooutput`, `oscillator`, `harp`, `gaze`, etc. — full list below |
| `wam3d-<k>` | A key in `wam3dgenerator.examples` | `wam3d-Flute`, `wam3d-Reverb`, ... |
| `add-<k>` | A key in `additionalConfigs.json` (fetched at module load, line 34) | `add-MyPlugin` |
| Anything else | `GET ${WAM_CONFIGS_URL}/wamsConfig/<kind>.json` from the server | `pro54michel`, etc. |

The full hardcoded-builtin list (lines 87–106):

| Kind | Factory |
|---|---|
| `audiooutput` | `SpeakerN3DFactory` |
| `sequencer` | `SequencerN3DFactory` |
| `oscillator` | `OscillatorN3DFactory` |
| `maracas` | `MaracasN3DFactory` |
| `livepiano` | `LivePianoN3DFactory` |
| `notesbox` | `NoteBoxN3DFactory` |
| `pianoroll` | `PianoRollN3DFactory` |
| `drumkit` | `DrumKitN3DFactory` |
| `hyperkeyboard` | `HyperKeyboardN3DFactory.SMALL` |
| `drumplatekit` | `DrumPlateKitN3DFactory.SMALL` |
| `automation_controller` | `AutomationControllerN3DFactory` |
| `the_cube` | `PositionCubeN3DFactory.DEFAULT` |
| `harp` | `HarpN3DFactory.DEFAULT` |
| `large_harp` | `HarpN3DFactory.LARGE` |
| `gaze` | `GazeControllerN3DFactory` |
| `voice` | `VoiceVolumeControllerN3DFactory` |
| `sync_debug` | `SyncDebugN3DFactory` |

(`function_sequencer` is commented out at line 103 — see chapter
[04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument).)

`WAM_CONFIGS_URL` (line 32) is `http://${window.location.hostname}:3000`
— so the WAM config server must be reachable on the current host. See
chapter [05 §Server](05-networking-and-sync.md#the-config-server).

### `PlayerManager` ([PlayerManager.ts](../src/app/PlayerManager.ts))

Owns the local player's identity and broadcasts their head/hand state
over the network — throttled and delta-compressed.

| Member | Line | What |
|---|---|---|
| `private readonly _id = v4()` | 11 | UUID v4 — never changes for a session |
| `UPDATE_INTERVAL = 50ms` | 16 | Cap of 20 broadcasts/sec |
| `POSITION_THRESHOLD = 0.01` | 19 | 1 cm — minimum movement to trigger an update |
| `ROTATION_THRESHOLD = 0.02` | 20 | ≈1° head/hand rotation |
| `private startUpdateLoop()` | 41 | Subscribes to `scene.onBeforeRenderObservable` and gates by elapsed time |
| `private _checkAndSendPlayerState()` | 59 | If the new state differs by more than the thresholds from the last sent state, emit `PLAYER_STATE_UPDATED` on `NetworkEventBus` and store a copy |
| `private hasSignificantChange(a, b)` | 77 | Position OR direction OR either hand position past the thresholds |
| `private getDistance(p1, p2)` | 98 | Plain Euclidean distance |
| `getPlayerState()` | 106 | Reads `InputManager.head.{origin,forward}` and `InputManager.{left,right}.pointer.origin`, applies hardcoded "wrist offset" |
| `getId()` | 135 | The UUID |

Note: `PlayerManager` reads the head and hand poses through
[`InputManager`](06-xr-input-and-behaviors.md#inputmanager) — not
directly off the XR helper. That's deliberate; `InputManager` provides
a single source of truth for poses across XR controllers, mouse, and
keyboard fallbacks.

The hand positions are derived from the controller pointer origin but
offset into a "wrist" position (lines 122–131):

```typescript
leftHandPosition  = pointer.origin + (+0.05, 0, -0.20)
rightHandPosition = pointer.origin + (-0.05, 0, -0.20)
```

If avatars look "wrong-handed", that's where to look.

### `Player` ([Player.ts](../src/app/Player.ts))

The remote player avatar — one instance per other player in the room.
**Not** a singleton.

| Method | Line | What |
|---|---|---|
| `constructor(id)` | 17 | Picks a random color, builds head/body/hands |
| `dispose()` | 25 | Disposes all four meshes |
| `private _createHead()` | 32 | 0.7-diameter sphere at (0,1.7,0) plus two black 0.1 eyes parented to it |
| `private _createBody()` | 57 | 0.4-radius, 1.4-height capsule at origin |
| `private _createHands()` | 65 | Two 0.2 spheres at (-1,1,0) and (1,1,0) |
| `setState(state)` | 81 | Stores the next interpolation target. On the very first call (or while still at the default "1.7" position) applies state immediately to avoid sliding from the spawn pose |
| `private _applyState(state)` | 94 | Hard-set head/body/hands, `head.lookAt(head + direction)` |
| `interpolateMovement(deltaTime)` | 108 | Lerp towards `_targetState` with `factor = min(deltaTime * 10, 1)` (≈10 Hz convergence) |

This is the only "non-manager" class in `app/`. It's owned by
`PlayerNetwork` (chapter [05](05-networking-and-sync.md)), which calls
`setState` on Yjs updates and `interpolateMovement` from the per-frame
loop in `SceneManager.start()`.

### `WamInitializer` ([WamInitializer.ts](../src/app/WamInitializer.ts))

The WAM host bootstrap. Different from the other singletons:

- `getInstance(audioCtx?)` is **lazy** — first call constructs.
- Two static fields cache the host group ID and (importantly) its
  pending promise so concurrent first-callers don't race.

| Method | Line | What |
|---|---|---|
| `static getInstance(audioCtx?)` | 19 | Lazy construct (the `audioCtx` arg is required on the first call; further calls ignore it) |
| `async getHostGroupId()` | 27 | Returns the cached `[id, sessionId]` tuple, or the pending init promise |
| `private async initializeHostGroupId()` | 37 | Triggered from constructor; ensures the in-flight promise is set |
| `async initWamInstance(wamUrl)` | 49 | `import(/* @vite-ignore */ wamUrl)` to dynamic-load the WAM bundle, then `WAM.createInstance(hostGroupId, audioCtx)` |
| `private async createHostGroupId()` | 54 | Calls `initializeWamHost(audioCtx)` from `@webaudiomodules/sdk` |
| `private _wamExtensionSetup()` | 58 | Installs `window.WAMExtensions = { notes: new NoteExtension(), patterns: new PatternExtension() }` so plugins that look it up at runtime find it |

`/* @vite-ignore */` (line 50) is essential: it tells Vite *not* to try
to resolve the URL at build time. WAM bundles live at runtime URLs
(remote or `public/`-served), so static analysis can't see them.

### `Serialization` ([Serialization.ts](../src/app/Serialization.ts))

A small singleton for **save/load of Node3D graphs** — the export
format behind the `L` and `M` debug keys.

| Method | Line | What |
|---|---|---|
| `static getInstance()` | 22 | Lazy singleton |
| `save(targetNodes, addConnected = true): Node3DGraphDescription` | 35 | Dump the targets (and, if `addConnected`, every node reachable through their connectables) into a plain-JSON description |
| `async load(description): Promise<Node3DInstance[]>` | 107 | Recreate the nodes (in parallel) and then their connections (in parallel), restoring positions, rotations, and per-node state |

The saved structure is `Node3DGraphDescription` (defined in
[`Node3DNetwork.ts`](../src/network/Node3DNetwork.ts)):

```typescript
{
  nodes: Array<{
    kind: string,                       // factory ID
    position: [x, y, z],
    rotation: [qx, qy, qz, qw],
    data: any                           // SyncManager state for the node
  }>,
  connections: Array<{
    from: number,                       // index into nodes[]
    to: number,                         // index into nodes[]
    fromConnectable: string,
    toConnectable: string
  }>
}
```

Important details:

- `save()` walks the graph through `connectables` (lines 44–51), so
  pulling on one node drags in everything wired to it.
- The `data` field is `network.nodes.getState(id)` — the same blob the
  `SyncManager` would push over the wire. Round-tripping save→load
  preserves parameter values, sequencer patterns, etc.
- `load()` calls `Node3dManager.createNode3d(kind, position)` for each
  node, then `node.boundingBoxMesh.position` and `rotationQuaternion`
  are forced to the saved values, then `network.nodes.setState(id, data)`
  hydrates the per-node state, then `updatePosition()` finalizes the
  bounding box.
- Connection wiring uses
  [`ConnectionManager.connect(from, to)`](../src/iomanager/ConnectionManager.ts)
  rather than directly poking the `N3DConnectionInstance` — so saved
  graphs go through the same validation as user-drawn cables.

This is the right hook to plug into if you want a "save room to file"
or "load preset on join" feature.

---

## Event buses

Six typed event buses, all extending the same generic base.

### `BaseEventBus<T>` ([BaseEventBus.ts](../src/eventBus/BaseEventBus.ts))

A small typed pub/sub. The whole class is 38 lines.

| Method | Line | What |
|---|---|---|
| `protected constructor()` | 6 | Subclasses call `super()` |
| `emit<K extends keyof T>(event, payload)` | 12 | Calls every registered callback with the payload, swallowing exceptions (logs them) so one buggy listener doesn't break the bus |
| `on<K extends keyof T>(event, cb)` | 23 | Registers; **returns an unsubscribe function** — store it if you'll need to remove later |
| `off(event, cb)` | 30 | Direct removal by reference |
| `getAllEventTypes()` | 35 | Debug helper — returns every event key with at least one registered listener |

The generic `T extends object` bound + `K extends keyof T` parameters
mean every emit/on call is checked against the bus's `Payload` type,
including the payload shape. Adding a new event is a one-line edit to
the payload type — TypeScript will then point you at every place that
needs to handle it.

### `AudioEventBus` ([AudioEventBus.ts](../src/eventBus/AudioEventBus.ts))

| Event | Payload | Emitted by | Listened by |
|---|---|---|---|
| `PARAM_CHANGE` | `{ nodeId, paramId, value, source: "user"\|"network" }` | (declared, not currently emitted) | — |
| `POSITION_CHANGE` | `{ nodeId, position, rotation, source }` | (declared, not currently emitted) | — |
| `AUDIO_NODE_CREATED` | `{ nodeId, kind }` | `Node3dManager.createNode3d` | (UIManager listener is commented out) |
| `AUDIO_NODE_LOADED` | `{ nodeId, kind, instance }` | `Node3dManager.createNode3d` (success) | (commented out) |
| `AUDIO_NODE_ERROR` | `{ nodeId, kind, error_message }` | `Node3dManager.createNode3d` (failure) | (commented out) |
| `CONNECT_NODES` | `{ sourceId, targetId, isSrcMidi, source }` | (declared) | — |
| `DISCONNECT_NODES` | `{ sourceId, targetId, source }` | (declared) | — |

The latter four are reserved/forward-looking (the actual connect/
disconnect happens via `IOEventBus` + `iomanager/ConnectionManager`,
see chapter [07](07-menus-and-world.md)).

### `IOEventBus` ([IOEventBus.ts](../src/eventBus/IOEventBus.ts))

| Event | Payload | Emitted by | Listened by |
|---|---|---|---|
| `IO_CONNECT` | `{ pickType: 'down'\|'up'\|'out', pointer: PointerInput, connectable: N3DConnectableInstance }` | `N3DConnectableInstance` (Babylon `ActionManager` triggers) | `iomanager/ConnectionManager` |

This is the wire-drawing event. The `iomanager/ConnectionManager`
listens for `down`/`up`/`out` to start, end, or cancel a wire. Note the
payload includes the `PointerInput` so the listener can attach the
in-flight wire to the right hand.

### `MenuEventBus` ([MenuEventBus.ts](../src/eventBus/MenuEventBus.ts))

| Event | Payload | Emitted by | Listened by |
|---|---|---|---|
| `OPEN_MENU` | `{ menuId }` | (reserved) | — |
| `CLOSE_MENU` | `{ menuId }` | (reserved) | — |
| `CREATE_AUDIO_NODE` | `{ nodeId, name, kind }` | `ShopPanel` | `AppOrchestrator` → `Node3dManager.createNode3d` |
| `CREATE_AUDIO_OUTPUT` | `{ nodeId, name }` | (reserved) | — |
| `MAIN_MENU_DISABLE` | `{ disable }` | (reserved) | — |
| `MAIN_MENU_ENABLE` | `{ enable }` | (reserved) | — |

### `UIEventBus` ([UIEventBus.ts](../src/eventBus/UIEventBus.ts))

Currently the payload is `{}` — i.e. **no events defined yet**. The
bus is constructed and listeners can be registered, but in the current
code nothing emits anything. It's a reserved namespace for future
UI-cross-cutting events (e.g. modal open, toast, focus change).

### `NetworkEventBus` ([NetworkEventBus.ts](../src/eventBus/NetworkEventBus.ts))

| Event | Payload | Emitted by | Listened by |
|---|---|---|---|
| `PLAYER_ADDED` | `{ playerId }` | `PeerToPeerManager` (awareness change) | `PlayerNetwork` |
| `PLAYER_DELETED` | `{ playerId }` | `PeerToPeerManager` | `PlayerNetwork` |
| `PLAYER_STATE_UPDATED` | `{ playerState }` | `PlayerManager._checkAndSendPlayerState` | `PlayerNetwork` (writes to Y.Map) |

There are two extra event names declared in `NetworkEventType`
(`STORE_AUDIO_OUTPUT`, `REMOVE_AUDIO_OUTPUT`) that don't appear in the
payload type — they're reserved and not emittable today.

---

## Shared types and utilities

### `SharedTypes.ts` ([SharedTypes.ts](../src/shared/SharedTypes.ts))

Three small types:

```typescript
export interface MenuConfig {
    categories: { name: string; plugins: { name: string; kind: string }[] }[];
}
export interface Position3D { x: number; y: number; z: number; }
export interface NodeTransform { position: Position3D; rotation: Position3D; }
```

`Position3D` is the network-ready (plain JSON, no Babylon types)
coordinate. `NodeTransform` is used in event payloads. `MenuConfig` is
a legacy menu structure — the newer
[`ShopPanel`](../src/world/menu/ShopPanel.ts) uses its own
richer config.

### `utils.ts` ([utils.ts](../src/utils/utils.ts))

Three general-purpose helpers:

| Function | Line | What |
|---|---|---|
| `withTimeout<T>(promise, ms, fallback?, msg?)` | 10 | `Promise.race` against a `setTimeout`. If `fallback` is given, resolves to it on timeout; otherwise rejects with `Error(msg)` |
| `parallel<T>(...promises)` | 45 | Runs an array of `() => Promise<T>` concurrently and returns `Promise<T[]>`. The historical sample of this is the (currently commented-out) shop init in `NewApp` |
| `usingWith<T extends Node>(node, observer)` | 53 | Ties an observer's lifetime to a Babylon `Node`. When the node is disposed, `observer.remove()` runs automatically. Convenient for "I attached a listener to this node — clean it up with the node" |

---

## Putting it together: a worked example

When the user clicks an instrument in the `ShopPanel`:

```
[ShopPanel]
   │  emit("CREATE_AUDIO_NODE", { nodeId: uuid, name, kind:"oscillator" })
   ▼
[AppOrchestrator.onMenuEvent]                    ← registered in initialize()
   │  await Node3dManager.getInstance().createNode3d("oscillator", Vector3(0,0,5), nodeId)
   ▼
[Node3dManager.createNode3d]
   │  emit("AUDIO_NODE_CREATED", { nodeId, kind })
   │
   │  Promise.allSettled([
   │     createImpostor(),    // billboard with cached thumbnail at the spawn position
   │     spawn() {            // builder.create() + position + network.add
   │        const node = await builder.create("oscillator")
   │        node.boundingBoxMesh.setAbsolutePosition(position)
   │        await NetworkManager.node3d.nodes.add(nodeId, node, "oscillator")
   │            // → Yjs broadcast: every peer creates the same node
   │        emit("AUDIO_NODE_LOADED", { nodeId, kind, instance })
   │     }
   │  ])
   │
   │  AsyncLoading wraps both in a "loading…" spinner mesh at the spawn
   │  position. When `spawn` resolves, the impostor is disposed and the
   │  spinner is removed.
   ▼
done
```

This flow is the "happy path" template you'll see again and again in
the codebase.

---

## Where to go next

- The deep dive on what `Node3DInstance.instantiate()` actually
  does is in **[03 — Node3D system](03-node3d-system.md)**.
- The `SyncManager.add(...)` call's mechanics live in
  **[05 — Networking & sync](05-networking-and-sync.md)**.
- The events that fire on the XR side are in
  **[06 — XR input & behaviors](06-xr-input-and-behaviors.md)**.
- The shop UI driving the `CREATE_AUDIO_NODE` events is in
  **[07 — Menus & world](07-menus-and-world.md)**.
