# 10 — File reference

Every `.ts` and `.d.ts` file in `src/` gets one entry, grouped by
folder. Each entry has:

- a one-line responsibility,
- a pointer to the chapter that covers it (so you can dig deeper).

For TypeScript declaration files (`.d.ts`), the chapter pointer is the
plugin contract chapter — those files are pure type definitions.

If you ⌘-F for a class name and find an entry, the linked chapter has
the in-depth explanation.

---

## Top level

| File | Responsibility | Chapter |
|---|---|---|
| [`src/index.ts`](../src/index.ts) | Entry point. Patches `console.log` to drop spammy single-number logs from `wam3dgenerator`, waits for DOM ready, constructs `NewApp` and `await`s `start()` | [02](02-app-core.md#entry-point-srcindexts) |

## `src/`

| File | Responsibility | Chapter |
|---|---|---|
| [`Wam3DNode.ts`](../src/Wam3DNode.ts) | Older bridge predating the `Node3D` system, wrapping `wam3dgenerator`. Used as reference; the live path is [`Wam3DGeneratorN3D`](../src/node3d/subs/Wam3DGeneratorN3D.ts) | [04 §Wam3DGenerator](04-instruments-catalog.md#wam3dgeneratorn3d) |

## `src/app/` — bootstrap & singletons

| File | Responsibility | Chapter |
|---|---|---|
| [`NewApp.ts`](../src/app/NewApp.ts) | The bootstrap class. `start()` runs the boot sequence; key bindings (P/I/L/M); A-button toggles `ShopPanel` | [02 §Boot sequence](02-app-core.md#boot-sequence) |
| [`AppOrchestrator.ts`](../src/app/AppOrchestrator.ts) | Mediator between event buses. Listens to `MenuEventBus.CREATE_AUDIO_NODE` and dispatches to `Node3dManager` | [02 §AppOrchestrator](02-app-core.md#apporchestrator-apporchestratorts) |
| [`SceneManager.ts`](../src/app/SceneManager.ts) | Owns Babylon `Engine`, `Scene`, `ShadowGenerator`, ground, walls, Havok physics, `WaveGround`, `SoundwaveEmitter`. Per-frame loop calls `NetworkManager.updatePlayers` | [02 §SceneManager](02-app-core.md#scenemanager-scenemanagerts) |
| [`UIManager.ts`](../src/app/UIManager.ts) | Facade over Babylon's `AdvancedDynamicTexture` and `GUI3DManager`. Owns `MessageManager` | [02 §UIManager](02-app-core.md#uimanager-uimanagerts) |
| [`MessageManager.ts`](../src/app/MessageManager.ts) | Floating message plane in front of the XR camera | [02 §MessageManager](02-app-core.md#messagemanager-messagemanagerts) |
| [`ControlsUI.ts`](../src/app/ControlsUI.ts) | 3D button labels pinned to actual controller mesh components, with hierarchy introspection across multiple controller models | [02 §ControlsUI](02-app-core.md#controlsui-controlsuits) |
| [`Node3dManager.ts`](../src/app/Node3dManager.ts) | The Node3D factory front-of-house. `createNode3d(kind, position, id?)` parallel-builds the impostor and the real node, wraps with `AsyncLoading` spinner | [02 §Node3dManager](02-app-core.md#node3dmanager-node3dmanagerts) |
| [`Node3DBuilder.ts`](../src/app/Node3DBuilder.ts) | Factory dispatcher: maps `kind` strings to factories. Handles `desc:`, `external:`, `wam3d-`, `add-` prefixes plus hardcoded builtins. Caches factories and thumbnails into a shared atlas | [02 §Node3DBuilder](02-app-core.md#node3dbuilder-node3dbuilderts) |
| [`PlayerManager.ts`](../src/app/PlayerManager.ts) | Owns local player UUID; throttled (50ms, 1cm/1°) broadcaster of head + hand positions over `NetworkEventBus.PLAYER_STATE_UPDATED` | [02 §PlayerManager](02-app-core.md#playermanager-playermanagerts) |
| [`Player.ts`](../src/app/Player.ts) | Remote player avatar — head sphere with eyes, body capsule, two hand spheres. Linear interpolation toward `_targetState` | [02 §Player](02-app-core.md#player-playerts) |
| [`WamInitializer.ts`](../src/app/WamInitializer.ts) | WAM host bootstrap. Lazy singleton; provides `getHostGroupId()` and `initWamInstance(url)` (dynamic `import` with `@vite-ignore`) | [02 §WamInitializer](02-app-core.md#waminitializer-waminitializerts) |
| [`Serialization.ts`](../src/app/Serialization.ts) | Save/load Node3D graphs as plain JSON. Backs the L/M debug keys | [02 §Serialization](02-app-core.md#serialization-serializationts) |

## `src/eventBus/` — typed pub/sub

| File | Responsibility | Chapter |
|---|---|---|
| [`BaseEventBus.ts`](../src/eventBus/BaseEventBus.ts) | Generic typed `BaseEventBus<T extends object>` with `emit / on / off / getAllEventTypes` | [02 §BaseEventBus](02-app-core.md#baseeventbust-baseeventbusts) |
| [`AudioEventBus.ts`](../src/eventBus/AudioEventBus.ts) | Singleton bus carrying `AUDIO_NODE_*`, `PARAM_CHANGE`, `POSITION_CHANGE`, `CONNECT_NODES`, `DISCONNECT_NODES` | [02 §AudioEventBus](02-app-core.md#audioeventbus-audioeventbusts) |
| [`IOEventBus.ts`](../src/eventBus/IOEventBus.ts) | Singleton bus carrying `IO_CONNECT` (the wire-drawing gesture) | [02 §IOEventBus](02-app-core.md#ioeventbus-ioeventbusts) |
| [`MenuEventBus.ts`](../src/eventBus/MenuEventBus.ts) | Singleton bus carrying `CREATE_AUDIO_NODE`, `OPEN_MENU`/`CLOSE_MENU`, etc. Emitted by `ShopPanel`, listened to by `AppOrchestrator` | [02 §MenuEventBus](02-app-core.md#menueventbus-menueventbusts) |
| [`UIEventBus.ts`](../src/eventBus/UIEventBus.ts) | Singleton bus, currently with empty payload — reserved | [02 §UIEventBus](02-app-core.md#uieventbus-uieventbusts) |
| [`NetworkEventBus.ts`](../src/eventBus/NetworkEventBus.ts) | Singleton bus carrying `PLAYER_ADDED`, `PLAYER_DELETED`, `PLAYER_STATE_UPDATED` | [02 §NetworkEventBus](02-app-core.md#networkeventbus-networkeventbusts) |

## `src/node3d/` — plugin contract (declarations)

| File | Responsibility | Chapter |
|---|---|---|
| [`Node3D.d.ts`](../src/node3d/Node3D.d.ts) | Core interfaces: `Node3D`, `Node3DGUI`, `Node3DFactory<G,T>`, `Serializable`. Also defines the documented coordinate system and tag vocabulary | [03 §Node3D.d.ts](03-node3d-system.md#node3ddts-source) |
| [`Node3DContext.d.ts`](../src/node3d/Node3DContext.d.ts) | The plugin-host API surface a Node3D talks to: `audioCtx`, `audioEngine`, `groupId`, `tools`, `createParameter / createButton / createConnectable / addToBoundingBox / openMenu / showMessage / sendSignal / getPlayerPosition / getPosition / delete / notifyStateChange / observe` | [03 §Node3DContext.d.ts](03-node3d-system.md#node3dcontextdts-source) |
| [`Node3DGUIContext.d.ts`](../src/node3d/Node3DGUIContext.d.ts) | The GUI-only context (no audio): scene + shared materials + babylon namespace + tools + highlight callbacks | [03 §Node3DGUIContext.d.ts](03-node3d-system.md#node3dguicontextdts-source) |
| [`Node3DConnectable.d.ts`](../src/node3d/Node3DConnectable.d.ts) | Port contract: `id, meshes, type, direction, color, max_connections?, label, connectAsInput / connectAsOutput / disconnectAsInput / disconnectAsOutput` | [03 §Node3DConnectable.d.ts](03-node3d-system.md#node3dconnectabledts-source) |
| [`Node3DParameter.d.ts`](../src/node3d/Node3DParameter.d.ts) | Parameter contract: id, meshes, `notSynced?`, `setValue / getValue / getStepCount / stringify / getLabel / fromOffset?` (custom drag mapping) | [03 §Node3DParameter.d.ts](03-node3d-system.md#node3dparameterdts-source) |
| [`Node3DButton.d.ts`](../src/node3d/Node3DButton.d.ts) | Button contract: id, meshes, label, color, `supportSwipe?`, press/release | [03 §Node3DButton.d.ts](03-node3d-system.md#node3dbuttondts-source) |

## `src/node3d/instance/` — host-side runtime

| File | Responsibility | Chapter |
|---|---|---|
| [`Node3DInstance.ts`](../src/node3d/instance/Node3DInstance.ts) | The central runtime class. One per spawned plugin. Implements `Synchronized`. Builds the bounding box, attaches `ShakeBehavior` (shake-to-delete), wires the plugin's `Node3DContext`. Handles the `position`, `delete`, and `node3d_parameter_*` state keys; delegates the rest to the plugin's `node.{getState,setState}` | [03 §Node3DInstance](03-node3d-system.md#node3dinstance-source) |
| [`N3DShared.ts`](../src/node3d/instance/N3DShared.ts) | The shared resource bag passed to every Node3D: scene, shadow generator, audio context/engine, WAM group ID, `HighlightLayer`, `UtilityLayerRenderer`, the five shared materials (mat/shiny/metal/light/transparent), the menu manager | [03 §N3DShared](03-node3d-system.md#n3dshared-source) |
| [`N3DConnectableInstance.ts`](../src/node3d/instance/N3DConnectableInstance.ts) | Wraps a `Node3DConnectable` config with Babylon `ActionManager` triggers (hover/pick down/up/out). Emits `IOEventBus.IO_CONNECT` events | [03 §N3DConnectableInstance](03-node3d-system.md#n3dconnectableinstance) |
| [`N3DConnectionInstance.ts`](../src/node3d/instance/N3DConnectionInstance.ts) | A live wire between two ports. Validates direction/type/`max_connections`. Implements `Synchronized` so connections survive joins/leaves. Has a `ShakeBehavior` for shake-to-delete | [03 §N3DConnectionInstance](03-node3d-system.md#n3dconnectioninstance) |
| [`N3DParameterInstance.ts`](../src/node3d/instance/N3DParameterInstance.ts) | Wraps a `Node3DParameter` config with `SixDofDragBehavior` for value mapping (Y delta → `[0..1]`, quantized to step count). Manages floating `N3DText` label and highlight | [03 §N3DParameterInstance](03-node3d-system.md#n3dparameterinstance) |
| [`N3DButtonInstance.ts`](../src/node3d/instance/N3DButtonInstance.ts) | Wraps a `Node3DButton` config with pick triggers. Adds the swipe gesture (`supportSwipe`) for piano keys | [03 §N3DButtonInstance](03-node3d-system.md#n3dbuttoninstance) |

## `src/node3d/instance/utils/` — instance helpers

| File | Responsibility | Chapter |
|---|---|---|
| [`N3DHighlighter.ts`](../src/node3d/instance/utils/N3DHighlighter.ts) | Per-instance bookkeeper around the global `HighlightLayer` — remembers which meshes *this* instance highlighted, so dispose is clean | [03 §N3DHighlighter](03-node3d-system.md#n3dhighlighter-source) |
| [`N3DText.ts`](../src/node3d/instance/utils/N3DText.ts) | A small floating, billboarded text plane backed by `AdvancedDynamicTexture`. Used by parameters and buttons for value labels | [03 §N3DText](03-node3d-system.md#n3dtext) |
| [`N3DRendering.ts`](../src/node3d/instance/utils/N3DRendering.ts) | `static renderThumbnail` — builds an offscreen scene, runs only `factory.createGUI`, renders to a `RenderTargetTexture`. `static textureToImageURL` reads pixels into a 2D canvas → data URL | [03 §N3DRendering](03-node3d-system.md#n3drendering) |
| [`N3DMenuManager.ts`](../src/node3d/instance/utils/N3DMenuManager.ts) | Coordinated 3D menus across all Node3D instances. `N3DMenuManager` (one per app) tracks the active menu; `N3DMenuInstance` (one per node) closes the previous active menu when it opens its own. Backed by `SimpleMenu` | [03 §N3DMenuManager](03-node3d-system.md#n3dmenumanager-and-n3dmenuinstance) |

## `src/node3d/tools/` — exposed to plugins via `context.tools`

| File | Responsibility | Chapter |
|---|---|---|
| [`tools/index.ts`](../src/node3d/tools/index.ts) | Re-exports the four connectable namespaces + `MeshUtils` + `StateUtils`. Plugins receive this whole module as `context.tools` | [03 §Connection protocols](03-node3d-system.md#connection-protocols) |
| [`tools/connectable/AudioN3DConnectable.ts`](../src/node3d/tools/connectable/AudioN3DConnectable.ts) | The `audio` protocol. Five classes: `Input`, `DynamicInput`, `Output`, `ListOutput`, `DynamicOutput`. Connection object is `AudioN3DConnection` with `subscribe(observer: (old, now) => void)` | [03 §Audio](03-node3d-system.md#audio--audionn3dconnectable-source) |
| [`tools/connectable/MidiN3DConnectable.ts`](../src/node3d/tools/connectable/MidiN3DConnectable.ts) | The `midi` protocol. Same five classes as audio but typed for `WamNode`. On connect, calls `wamNode.connectEvents(...)` and `WAMExtensions.notes.addMapping(...)` | [03 §MIDI](03-node3d-system.md#midi--midin3dconnectable-source) |
| [`tools/connectable/AutomationN3DConnectable.ts`](../src/node3d/tools/connectable/AutomationN3DConnectable.ts) | The `automation` protocol. Three classes: `Input` (max_connections=1), `MultiInput` (aggregates), `Output` (stores a value, pushes to all inputs) | [03 §Automation](03-node3d-system.md#automation--automationn3dconnectable-source) |
| [`tools/connectable/SyncN3DConnectable.ts`](../src/node3d/tools/connectable/SyncN3DConnectable.ts) | The `sync` protocol — sequencer timing alignment via `Container` graphs and `sendUp`/`sendDown` cascades | [03 §Sync](03-node3d-system.md#sync--syncn3dconnectable-source) |
| [`tools/utils/MeshUtils.ts`](../src/node3d/tools/utils/MeshUtils.ts) | `setColor(mesh, color4)` and `setAllVerticesData(mesh, kind, data)` — vertex-color tinting that doesn't allocate a new material | [03 §MeshUtils](03-node3d-system.md#meshutils-source) |
| [`tools/utils/StateUtils.ts`](../src/node3d/tools/utils/StateUtils.ts) | `getCompleteState(node)` and `setCompleteState(node, state)` — bulk Promise.all over `getState/setState` | [03 §StateUtils](03-node3d-system.md#stateutils-source) |
| [`tools/utils/NodeCompUtils.ts`](../src/node3d/tools/utils/NodeCompUtils.ts) | Host-internal recursive `highlight / unhighlight` against the highlight layer. Plugins use the `context.highlight(...)` callback instead | [03 §NodeCompUtils](03-node3d-system.md#nodecomputils-host-internal) |
| [`tools/utils/RandomUtils.ts`](../src/node3d/tools/utils/RandomUtils.ts) | `randomID(complexity = 8)` — short hex string from `Math.random()`. Used for Node3D IDs when none provided. Not a UUID | [03 §RandomUtils](03-node3d-system.md#randomutils-host-internal) |

## `src/node3d/world/`

| File | Responsibility | Chapter |
|---|---|---|
| [`world/Player.ts`](../src/node3d/world/Player.ts) | A second `Player` class living under the node3d tree. Older variant; the live one is [`app/Player.ts`](../src/app/Player.ts) | (legacy — see [02 §Player](02-app-core.md#player-playerts)) |

## `src/node3d/subs/` — concrete instruments

### Top-level subs

| File | Responsibility | Chapter |
|---|---|---|
| [`OscillatorN3D.ts`](../src/node3d/subs/OscillatorN3D.ts) | A simple sine-wave oscillator. Audio output, one frequency knob (130–230 Hz). `oscillator` kind | [04 §OscillatorN3D](04-instruments-catalog.md#oscillatorn3d) |
| [`AudioOutputN3D.ts`](../src/node3d/subs/AudioOutputN3D.ts) | A simple HRTF panner sink. Reference implementation; the live `audiooutput` kind is `SpeakerN3D` instead | [04 §AudioOutputN3D](04-instruments-catalog.md#audiooutputn3d) |
| [`SequencerN3D.ts`](../src/node3d/subs/SequencerN3D.ts) | 12-step × 12-note grid sequencer with Sync I/O. `sequencer` kind | [04 §SequencerN3D](04-instruments-catalog.md#sequencern3d-12x12) |
| [`NoteBoxN3D.ts`](../src/node3d/subs/NoteBoxN3D.ts) | MIDI loop recorder/replayer with 4×4 pads and stacked sample capsules. State key `"all"`. `notesbox` kind | [04 §NoteBoxN3D](04-instruments-catalog.md#noteboxn3d) |
| [`Wam3DGeneratorN3D.ts`](../src/node3d/subs/Wam3DGeneratorN3D.ts) | Generic bridge to any WAM with a wam3dgenerator descriptor. `wam3d-`, `add-`, `desc:`, `external:` kinds, plus server-fetched configs | [04 §Wam3DGeneratorN3D](04-instruments-catalog.md#wam3dgeneratorn3d) |
| [`AutomationToolN3D.ts`](../src/node3d/subs/AutomationToolN3D.ts) | (unregistered) Despite the file name, exports two "Simple/Large Harp" factories. Defines a mixer mode array (Average/Max/Min) but is unfinished | [04 §AutomationToolN3D](04-instruments-catalog.md#automationtooln3d-harp-variant) |
| [`drumSampler.ts`](../src/node3d/subs/drumSampler.ts) | (unregistered) `WamSamplerN3D` — bridge to the Burns Audio drum-sampler WAM. Used as a class for `XRDrumKit` rather than spawned directly | [04 §WamSamplerN3D](04-instruments-catalog.md#wamsamplern3d--drumsampler) |
| [`TemplateN3D.ts`](../src/node3d/subs/TemplateN3D.ts) | The boilerplate to copy when starting a new instrument. Has `@ts-nocheck` until you fill it in | [03 §The canonical Hello world](03-node3d-system.md#the-canonical-hello-world--templaten3dts) |

### `subs/PianoRoll/`

| File | Responsibility | Chapter |
|---|---|---|
| [`PianoRoll/PianoRoll3d.ts`](../src/node3d/subs/PianoRoll/PianoRoll3d.ts) | The big editor (~2400 lines). 16-column thin-instance grid, playhead, record button, transport buttons, scroll arrows. MIDI in/out + Sync in/out | [04 §PianoRoll](04-instruments-catalog.md#pianoroll) |
| [`PianoRoll/PianoRollSettingsMenu.ts`](../src/node3d/subs/PianoRoll/PianoRollSettingsMenu.ts) | In-world settings panel for switching grid strategy and other options | [04 §PianoRoll](04-instruments-catalog.md#pianoroll) |
| [`PianoRoll/WamTransportManager.ts`](../src/node3d/subs/PianoRoll/WamTransportManager.ts) | Shared singleton tracking tempo / play state. Registers WAM nodes that need transport messages. Used by the `HandMenu`'s Start/Stop and by `WamSamplerN3D` | [04 §PianoRoll](04-instruments-catalog.md#pianoroll), [07 §HandMenu](07-menus-and-world.md#handmenu) |
| [`PianoRoll/grid/GridStrategy.ts`](../src/node3d/subs/PianoRoll/grid/GridStrategy.ts) | The interface for grid layout strategies. `getRowCount / getLabelForRow / isBlackRow / getMidiForRow / ...` | [04 §The Strategy pattern](04-instruments-catalog.md#the-strategy-pattern-for-grid-layouts) |
| [`PianoRoll/grid/Piano88Strategy.ts`](../src/node3d/subs/PianoRoll/grid/Piano88Strategy.ts) | 88 piano keys (A0–C8) with note→MIDI parser | [04 §The Strategy pattern](04-instruments-catalog.md#the-strategy-pattern-for-grid-layouts) |
| [`PianoRoll/grid/DrumPadsStrategy.ts`](../src/node3d/subs/PianoRoll/grid/DrumPadsStrategy.ts) | 11 drum pads with hardcoded MIDI mapping (kick=36, snare=38, ...) | [04 §The Strategy pattern](04-instruments-catalog.md#the-strategy-pattern-for-grid-layouts) |

### `subs/drumkit/` — XR physics drum kit

| File | Responsibility | Chapter |
|---|---|---|
| [`drumkit/DrumKitN3D.ts`](../src/node3d/subs/drumkit/DrumKitN3D.ts) | The Node3D wrapper. Gates on `SceneManager.isPhysicsReady()`, instantiates `XRDrumKit`. Single MIDI output. `drumkit` kind | [04 §DrumKitN3D](04-instruments-catalog.md#drumkitn3d) |
| [`drumkit/RandomDrumPlayer.ts`](../src/node3d/subs/drumkit/RandomDrumPlayer.ts) | Test utility — picks a random drum and hits it. Used during development | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRDrumKit.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRDrumKit.ts) | The orchestrator. Loads the .glb, spawns drums, cymbals, hi-hat, two `XRDrumstick`, the throne. Owns the `wamInstance` (Burns drumsampler) | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRDrumKitConfig.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRDrumKitConfig.ts) | The big config: model paths, MIDI keys/durations, physics min/max velocity + curve + debounce, haptic intensity range | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRDrumstick.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRDrumstick.ts) | One per hand. Owns a physics aggregate that follows the controller; `getVelocity() → {linear, angular}` | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/CollisionGroups.ts`](../src/node3d/subs/drumkit/XRDrumKit/CollisionGroups.ts) | Bitmask constants: `NONE=0`, `DRUMSTICK=1`, `DRUM=2`, `CYMBAL=4` | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/CollisionUtils.ts`](../src/node3d/subs/drumkit/XRDrumKit/CollisionUtils.ts) | The hot path: `calculateHitVelocity` (linear+angular, normalize+power curve, MIDI [1..127]), `checkDebounce`, `triggerHapticFeedback`, `scheduleSound`, `isDownwardHit`, `findDrumstickIndex`, `isCollisionWithTrigger` | [04 §How a hit becomes sound](04-instruments-catalog.md#how-a-hit-becomes-sound) |
| [`drumkit/XRDrumKit/AnimationUtils.ts`](../src/node3d/subs/drumkit/XRDrumKit/AnimationUtils.ts) | Helpers for the on-hit visual animations | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/ThroneController.ts`](../src/node3d/subs/drumkit/XRDrumKit/ThroneController.ts) | Detects when the user "sits" on the drum stool; locks/unlocks position | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/ThroneUI.ts`](../src/node3d/subs/drumkit/XRDrumKit/ThroneUI.ts) | The "Sit / Stand" prompt floating near the throne | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRLogger.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRLogger.ts) | A custom logger that draws debug text in the world. Currently disabled in `XRDrumKit.ts` | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRDrumComponent/XRDrumComponent.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRDrumComponent.ts) | 15-line abstract base for all drum components | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRDrumComponent/XRDrum.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRDrum.ts) | A drum head (kick/snare/toms). Single trigger; snare also has a separate `rimshot` MIDI key (37) | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRDrumComponent/XRCymbal.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRCymbal.ts) | A cymbal disc. Uses `durations.cymbals` envelope | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRDrumComponent/XRHiHat.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRHiHat.ts) | Hi-hat with open (46) / closed (42) MIDI states | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |
| [`drumkit/XRDrumKit/XRDrumComponent/XRDrumComponentLogger.ts`](../src/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRDrumComponentLogger.ts) | Per-component logger | [04 §XRDrumKit subsystem](04-instruments-catalog.md#xrdrumkit-subsystem) |

### `subs/automation/` — automation source controllers

| File | Responsibility | Chapter |
|---|---|---|
| [`automation/AutomationControllerN3D.ts`](../src/node3d/subs/automation/AutomationControllerN3D.ts) | Knob + automation output. Knob delegates labels/units to the connected target. `automation_controller` kind | [04 §AutomationControllerN3D](04-instruments-catalog.md#automationcontrollern3d) |
| [`automation/PositionCubeN3D.ts`](../src/node3d/subs/automation/PositionCubeN3D.ts) | Transparent cube with a 3D cursor; emits X/Y/Z automation outputs. Two presets `DEFAULT` (1.5) / `LARGE` (2.5). `the_cube` kind | [04 §PositionCubeN3D](04-instruments-catalog.md#positioncuben3d) |
| [`automation/GazeControllerN3D.ts`](../src/node3d/subs/automation/GazeControllerN3D.ts) | Eye sphere: emits `enabledValue` when looked at, `disabledValue` otherwise. `gaze` kind | [04 §GazeControllerN3D](04-instruments-catalog.md#gazecontrollern3d) |
| [`automation/VoiceVolumeControllerN3D.ts`](../src/node3d/subs/automation/VoiceVolumeControllerN3D.ts) | Microphone-driven controller. Two outputs: voice volume + voice pitch. Uses `getUserMedia` and a `frequencyData` analyser. `voice` kind | [04 §VoiceVolumeControllerN3D](04-instruments-catalog.md#voicevolumecontrollern3d) |
| [`automation/ElectroballsN3D.ts`](../src/node3d/subs/automation/ElectroballsN3D.ts) | (unregistered) Stub — GUI exists but the audio class doesn't drive any behavior yet | [04 §ElectroballsN3D](04-instruments-catalog.md#electroballsn3d) |

### `subs/note_generator/` — MIDI generators

| File | Responsibility | Chapter |
|---|---|---|
| [`note_generator/LivePianoN3D.ts`](../src/node3d/subs/note_generator/LivePianoN3D.ts) | 49-key (MIDI 36–84) keyboard with white/black layout. `livepiano` kind | [04 §LivePianoN3D](04-instruments-catalog.md#livepianon3d) |
| [`note_generator/HarpN3D.ts`](../src/node3d/subs/note_generator/HarpN3D.ts) | Configurable-string harp with pluck-strength automation. `HarpN3DFactory.DEFAULT` (10 strings, `harp` kind) and `LARGE` (20 strings, `large_harp` kind) | [04 §HarpN3D](04-instruments-catalog.md#harpn3d) |
| [`note_generator/HyperKeyboardN3D.ts`](../src/node3d/subs/note_generator/HyperKeyboardN3D.ts) | 3D `(x, y, z)` grid of keys with multi-controller press support. `HyperKeyboardN3DFactory.SMALL`. `hyperkeyboard` kind | [04 §HyperKeyboardN3D](04-instruments-catalog.md#hyperkeyboardn3d) |
| [`note_generator/DrumPlateKitN3D.ts`](../src/node3d/subs/note_generator/DrumPlateKitN3D.ts) | Drum plate kit — independently-aimed disc plates with strike animation. `DrumPlateKitN3DFactory.SMALL`. `drumplatekit` kind | [04 §DrumPlateKitN3D](04-instruments-catalog.md#drumplatekit-n3d) |

### `subs/maracas/` and `subs/speaker/`

| File | Responsibility | Chapter |
|---|---|---|
| [`maracas/MaracasN3D.ts`](../src/node3d/subs/maracas/MaracasN3D.ts) | Shake instrument: a draggable `rotation` knob fires a MIDI note on each direction reversal. `maracas` kind | [04 §MaracasN3D](04-instruments-catalog.md#maracasn3d) |
| [`speaker/SpeakerN3D.ts`](../src/node3d/subs/speaker/SpeakerN3D.ts) | The default audio sink. 3D speaker model with a translucent falloff sphere. Two backends (`SpeakerN3D` via Babylon `audioEngine`, `SpeakerPannerNodeN3D` via raw `PannerNode`); the panner one runs the audio analyser that fires `context.sendSignal` ripples. `audiooutput` kind | [04 §SpeakerN3D](04-instruments-catalog.md#speakern3d) |

### `subs/functionsequencer/` — JavaScript live-coding sequencer (work-in-progress)

| File | Responsibility | Chapter |
|---|---|---|
| [`functionsequencer/FunctionSequencerN3D.ts`](../src/node3d/subs/functionsequencer/FunctionSequencerN3D.ts) | The Node3D wrapper. Has a `DEFAULT_SCRIPT` showing the API. Currently has compile errors and is commented out of `Node3DBuilder` | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |
| [`functionsequencer/ScriptExecutor.ts`](../src/node3d/subs/functionsequencer/ScriptExecutor.ts) | Compiles user script via `new Function('api', 'ui', 'tonal', code)`. **Not a real sandbox** — don't run untrusted scripts | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |
| [`functionsequencer/MidiEventManager.ts`](../src/node3d/subs/functionsequencer/MidiEventManager.ts) | Buffers and dispatches MIDI events to downstream WAM nodes | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |
| [`functionsequencer/UIRenderer3D.ts`](../src/node3d/subs/functionsequencer/UIRenderer3D.ts) | Renders the `RemoteUI` tree as Babylon meshes (`Knob` = cylinder, `Slider` = bar, `Toggle` = box, etc.) | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |
| [`functionsequencer/api/FunctionAPI.ts`](../src/node3d/subs/functionsequencer/api/FunctionAPI.ts) | Defines `FunctionSequencer`, `FunctionAPI`, `ParameterDefinition`, `NoteDefinition`. PPQN constant `= 96` | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |
| [`functionsequencer/api/FunctionKernel.ts`](../src/node3d/subs/functionsequencer/api/FunctionKernel.ts) | Interface for the kernel that the API talks to. Implementation is `FunctionKernelImpl` (referenced from `FunctionSequencerN3D.ts` but file not yet present) | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |
| [`functionsequencer/api/RemoteUI.ts`](../src/node3d/subs/functionsequencer/api/RemoteUI.ts) | The `RemoteUI` element types and `RemoteUIBuilder` (`Row / Col / Knob / Slider / Toggle / Action / Label / Select / Highlight`) | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |
| [`functionsequencer/wam/FunctionSequencerNode.ts`](../src/node3d/subs/functionsequencer/wam/FunctionSequencerNode.ts) | 4-line stub. Expected to host the WAM node implementation | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |
| [`functionsequencer/wam/FunctionSequencerProcessor.ts`](../src/node3d/subs/functionsequencer/wam/FunctionSequencerProcessor.ts) | The AudioWorklet processor that calls `onTick` from the audio thread | [04 §FunctionSequencer](04-instruments-catalog.md#functionsequencer-the-live-coding-instrument) |

### `subs/debug/`

| File | Responsibility | Chapter |
|---|---|---|
| [`debug/SyncDebugN3D.ts`](../src/node3d/subs/debug/SyncDebugN3D.ts) | Diagnostic node for the Sync protocol — three parameter spheres show `start`/`duration`/`total`. `sync_debug` kind | [04 §SyncDebugN3D](04-instruments-catalog.md#syncdebugn3d) |

## `src/network/` — multiplayer

| File | Responsibility | Chapter |
|---|---|---|
| [`NetworkManager.ts`](../src/network/NetworkManager.ts) | The multiplayer facade. Owns the `Y.Doc`, `PeerToPeerManager`, `PlayerNetwork`, `Node3DNetwork`, `VisualNetwork`. Room name = `"WamJamParty" + document.location.hash` | [05 §NetworkManager](05-networking-and-sync.md#networkmanager-networkmanagerts) |
| [`PeerToPeerManager.ts`](../src/network/PeerToPeerManager.ts) | WebRTC + Yjs awareness. Hardcoded signaling at `https://wamjamparty.i3s.univ-cotedazur.fr/rtc`. 15-second heartbeat. Maps WebRTC peer IDs to player IDs and emits `PLAYER_ADDED`/`PLAYER_DELETED` | [05 §PeerToPeerManager](05-networking-and-sync.md#peertopeermanager-peertopeermanagerts) |
| [`PlayerNetwork.ts`](../src/network/PlayerNetwork.ts) | Avatar sync via the `'players'` Y.Map. Per-frame interpolation of remote `Player` instances. Has a TODO to migrate to `SyncManager` | [05 §PlayerNetwork](05-networking-and-sync.md#playernetwork-playernetworkts) |
| [`Node3DNetwork.ts`](../src/network/Node3DNetwork.ts) | Holds the `nodes` and `connections` `SyncManager`s built from `Node3DInstance.getSyncManager` and `N3DConnectionInstance.getSyncManager`. Also exports `Node3DGraphDescription` | [05 §Node3DNetwork](05-networking-and-sync.md#node3dnetwork-node3dnetworkts) |
| [`VisualNetwork.ts`](../src/network/VisualNetwork.ts) | Holds the `tubes` `SyncManager` for `VisualTube` | [05 §VisualNetwork](05-networking-and-sync.md#visualnetwork-visualnetworkts) |
| [`types.ts`](../src/network/types.ts) | `PlayerState` — the wire format for avatars (id, position, direction, leftHandPosition, rightHandPosition, all plain `{x, y, z}`) | [05 §types.ts](05-networking-and-sync.md#typests-typests) |

## `src/network/sync/` — generic CRDT registry

| File | Responsibility | Chapter |
|---|---|---|
| [`sync/SyncManager.ts`](../src/network/sync/SyncManager.ts) | The generic registry-of-Synchronized-objects. ~440 lines. Handles add/remove (local + remote), state changes (debounced), `await get(id, timeout?)` | [05 §SyncManager](05-networking-and-sync.md#the-generic-syncmanagert-d) |
| [`sync/Synchronized.ts`](../src/network/sync/Synchronized.ts) | The interface implemented by `Node3DInstance`, `N3DConnectionInstance`, `VisualTube`. `initSync / disposeSync / askStates / getState / setState / removeState` | [05 §Synchronized interface](05-networking-and-sync.md#synchronized-interface) |
| [`sync/SyncSerializable.ts`](../src/network/sync/SyncSerializable.ts) | The recursive JSON-serializable type alias used by every sync state value | [05 §SyncSerializable](05-networking-and-sync.md#syncserializable) |
| [`sync/test/SyncBlock.ts`](../src/network/sync/test/SyncBlock.ts) | (legacy reference) | (was used as a tutorial; now superseded by `VisualTube` as the smallest example) |
| [`sync/test/SyncLink.ts`](../src/network/sync/test/SyncLink.ts) | (legacy reference) | (was used as a tutorial; now superseded by `VisualTube`) |

## `src/xr/` — WebXR session

| File | Responsibility | Chapter |
|---|---|---|
| [`XRManager.ts`](../src/xr/XRManager.ts) | Singleton wrapping `WebXRDefaultExperience`. Disables teleport + near-interaction, sets the swapped stick mapping (left = translate, right = rotate), creates the `HandMenu` on left-controller availability | [06 §XRManager](06-xr-input-and-behaviors.md#xrmanager-xrmanagerts) |
| [`XRInputManager.ts`](../src/xr/XRInputManager.ts) | Polls for controllers; on add/remove forwards to `XRControllerManager` | [06 §XRInputManager](06-xr-input-and-behaviors.md#xrinputmanager-xrinputmanagerts) |
| [`XRControllerManager.ts`](../src/xr/XRControllerManager.ts) | Parallel utility singleton holding controller state and named-listener subscriptions, plus haptic feedback. Used directly by `XRDrumKit` for haptics | [06 §XRControllerManager](06-xr-input-and-behaviors.md#xrcontrollermanager-xrcontrollermanagerts) |
| [`types.ts`](../src/xr/types.ts) | XR-related type shorthands | [06](06-xr-input-and-behaviors.md) |

## `src/xr/inputs/` — unified input layer

| File | Responsibility | Chapter |
|---|---|---|
| [`inputs/InputManager.ts`](../src/xr/inputs/InputManager.ts) | The single source of input truth. Singleton built by `XRManager.init()`. Exposes `x/y/a/b_button`, `left/right/screen` `ControllerInput`s, `head` `AbstractPointerInput`, plus aggregate observables (`onTriggerDown`, `onSqueezeChange`, `onEnterTarget`, etc.) and reference-counted `pointedMeshes` | [06 §InputManager](06-xr-input-and-behaviors.md#the-inputmanager--the-single-source-of-input-truth) |
| [`inputs/ControllerInput.ts`](../src/xr/inputs/ControllerInput.ts) | One per hand (or `screen`). Aggregates `trigger`, `squeeze`, `thumbstick`, `pointer` plus `onPressableChange`. Has `_registerXRObserver` and `_registerDocumentObserver` (keyboard fallback) | [06 §ControllerInput](06-xr-input-and-behaviors.md#controllerinput) |
| [`inputs/AbstractPointerInput.ts`](../src/xr/inputs/AbstractPointerInput.ts) | Base for `PointerInput`. Used as `head` (camera-derived pointer) | [06 §PointerInput](06-xr-input-and-behaviors.md#pointerinput--abstractpointerinput) |
| [`inputs/PointerInput.ts`](../src/xr/inputs/PointerInput.ts) | Per-controller pointer. `origin / forward / up / right / target / targetMesh / hit / onMove / onNewTarget` | [06 §PointerInput](06-xr-input-and-behaviors.md#pointerinput--abstractpointerinput) |
| [`inputs/ButtonInput.ts`](../src/xr/inputs/ButtonInput.ts) | One per face button (X/Y/A/B). `onChange / onDown / onUp / onTouch / onUntouch` plus `setPressInterval(ms, cb)` for repeat-while-held. Both XR and keyboard | [06 §ButtonInput](06-xr-input-and-behaviors.md#buttoninput-buttoninputts) |
| [`inputs/PressableInput.ts`](../src/xr/inputs/PressableInput.ts) | Analog input (trigger, squeeze). Has continuous `value: number` plus `onChange / onDown / onUp` | [06 §PressableInput](06-xr-input-and-behaviors.md#pressableinput) |
| [`inputs/AxisInput.ts`](../src/xr/inputs/AxisInput.ts) | 2D axis (thumbstick). `value: {x, y}` + `on_change`. `_registerMouseWheelObserver` for keyboard-only dev | [06 §AxisInput](06-xr-input-and-behaviors.md#axisinput) |
| [`inputs/KeyboardInputs.ts`](../src/xr/inputs/KeyboardInputs.ts) | Utility wrappers around `document` keydown/keyup events used by the input primitives | [06](06-xr-input-and-behaviors.md) |
| [`inputs/InputCapability.ts`](../src/xr/inputs/InputCapability.ts) | A toggleable gate. `InputManager.movement` is one — `lock()`/`unlock()` to disable XR-stick movement during e.g. a drag | [06](06-xr-input-and-behaviors.md) |

## `src/xr/inputs/tools/` — input-derived behaviors

| File | Responsibility | Chapter |
|---|---|---|
| [`tools/InputGrabBehavior.ts`](../src/xr/inputs/tools/InputGrabBehavior.ts) | "Trigger pressed while pointing at this mesh" gesture. `onDown(pointer) / onUp(pointer) / onMove?(pointer)` callbacks. The foundation for hold/drop/shake | [06 §InputGrabBehavior](06-xr-input-and-behaviors.md#inputgrabbehavior-inputgrabbehaviorts) |
| [`tools/InputDropBehavior.ts`](../src/xr/inputs/tools/InputDropBehavior.ts) | Mirror of `InputGrabBehavior` — fires `onDrop` when a controller releases the trigger over this mesh while holding something else | [06 §InputDropBehavior](06-xr-input-and-behaviors.md#inputdropbehavior) |
| [`tools/InputHoverBehavior.ts`](../src/xr/inputs/tools/InputHoverBehavior.ts) | `onEnter(pointer) / onExit(pointer)` driven by `InputManager.onEnterTarget / onExitTarget` for this specific mesh | [06 §InputHoverBehavior](06-xr-input-and-behaviors.md#inputhoverbehavior) |
| [`tools/InputPressBehavior.ts`](../src/xr/inputs/tools/InputPressBehavior.ts) | Like `InputGrabBehavior` but doesn't require the trigger to be pressed *on* the target — tracks any controller's trigger | [06 §InputPressBehavior](06-xr-input-and-behaviors.md#inputpressbehavior) |
| [`tools/InputMultiPressBehavior.ts`](../src/xr/inputs/tools/InputMultiPressBehavior.ts) | Multi-controller version of `InputPressBehavior`. Used by `HyperKeyboardN3D` so two hands can press different keys | [06 §InputMultiPressBehavior](06-xr-input-and-behaviors.md#inputmultipressbehavior) |
| [`tools/InputVisualPointer.ts`](../src/xr/inputs/tools/InputVisualPointer.ts) | The visual laser line + dot for a controller. Thickens with trigger/squeeze press count | [06 §InputVisualPointer](06-xr-input-and-behaviors.md#inputvisualpointer-inputvisualpointerts) |

## `src/behaviours/` — domain behaviours

| File | Responsibility | Chapter |
|---|---|---|
| [`ShakeBehavior.ts`](../src/behaviours/ShakeBehavior.ts) | Detects shaking by counting direction reversals in pointer-derived position. `on_start / on_shake(power, counter) / on_stop / on_pick / on_drop`. Backs the shake-to-delete gesture | [06 §ShakeBehavior](06-xr-input-and-behaviors.md#shakebehavior-shakebehaviorts) |
| [`GazeBehavior.ts`](../src/behaviours/GazeBehavior.ts) | State machine `IDLE → GAZING → ACTIVATED` based on a camera ray-cast. `onGazeStart / onGazeActivated / onGazeStop / onCustomCheck`. Activation delay 1500ms by default | [06 §GazeBehavior](06-xr-input-and-behaviors.md#gazebehavior-gazebehaviorts) |
| [`boundingBox/BoundingBox.ts`](../src/behaviours/boundingBox/BoundingBox.ts) | The draggable wrapper around a Node3D. Builds a slightly larger box, parents the target under it, attaches `HoldableBehaviour` + `InputHoverBehavior`. Visibility 0/0.2/0.5 for idle/hover/held | [06 §BoundingBox](06-xr-input-and-behaviors.md#boundingbox-boundingboxts) |
| [`boundingBox/HoldableBehaviour.ts`](../src/behaviours/boundingBox/HoldableBehaviour.ts) | "This mesh is grabbable". Layered on `InputGrabBehavior`. `onGrabObservable / onReleaseObservable / onMoveObservable / onRotateObservable`. Constructs a `FullHoldBehaviour` on grab | [06 §HoldableBehaviour](06-xr-input-and-behaviors.md#holdablebehaviour-holdablebehaviourts) |
| [`boundingBox/FullHoldBehaviour.ts`](../src/behaviours/boundingBox/FullHoldBehaviour.ts) | Switches between `MoveHoldBehaviour` (squeeze released) and `RotateHoldBehaviour` (squeeze pressed) | [06 §FullHoldBehaviour](06-xr-input-and-behaviors.md#fullholdbehaviour-fullholdbehaviourts) |
| [`boundingBox/MoveHoldBehaviour.ts`](../src/behaviours/boundingBox/MoveHoldBehaviour.ts) | While held, position tracks the controller's pointer ray. Left thumbstick controls forward/back distance | [06 §MoveHoldBehaviour](06-xr-input-and-behaviors.md#moveholdbehaviour-and-rotateholdbehaviour) |
| [`boundingBox/RotateHoldBehaviour.ts`](../src/behaviours/boundingBox/RotateHoldBehaviour.ts) | While held, rotation tracks the controller's aim direction | [06 §RotateHoldBehaviour](06-xr-input-and-behaviors.md#moveholdbehaviour-and-rotateholdbehaviour) |

## `src/menus/` — 3D menus

| File | Responsibility | Chapter |
|---|---|---|
| [`SimpleMenu.ts`](../src/menus/SimpleMenu.ts) | Generic 3D menu — wraps Babylon `NearMenu` + `TouchHolographicButton` with a `MenuConfig` `{label, buttons:[{label, icon?, action}]}` | [07 §SimpleMenu](07-menus-and-world.md#simplemenu-simplemenuts) |
| [`HandMenu.ts`](../src/menus/HandMenu.ts) | Small box parented to the left controller. Gaze + alignment activates a `SimpleMenu` with Start/Stop transport buttons (via `WamTransportManager`) | [07 §HandMenu](07-menus-and-world.md#handmenu) |

## `src/world/` — non-instrument scene objects

| File | Responsibility | Chapter |
|---|---|---|
| [`N3DPreviewer.ts`](../src/world/N3DPreviewer.ts) | Non-persisted, non-synced node3D preview that, when dragged far enough, **becomes** a real `Node3DInstance`. Distance-based LOD swaps GUI for a billboard impostor at >5 units | [07 §N3DPreviewer](07-menus-and-world.md#n3dpreviewer-n3dpreviewerts) |
| [`Node3DStand.ts`](../src/world/Node3DStand.ts) | A wooden stand `.glb` with an `N3DPreviewer` on top, plus a `createStandCollection` helper for laying out four stands in a row | [07 §Node3DStand](07-menus-and-world.md#node3dstand-node3dstandts) |
| [`ScrollWall.ts`](../src/world/ScrollWall.ts) | A scrollable wall of stands. Currently unused on this branch, kept as a reference | [07 §ScrollWall](07-menus-and-world.md#scrollwall-scrollwallts) |
| [`AsyncLoading.ts`](../src/world/AsyncLoading.ts) | The loading spinner mesh shown by `Node3dManager.createNode3d` while the spawn promise resolves. Falls back to a red cross on rejection | [07 §AsyncLoading](07-menus-and-world.md#asyncloading-asyncloadingts) |
| [`menu/ShopPanel.ts`](../src/world/menu/ShopPanel.ts) | The active shop UI on this branch. A 2D panel projected onto a 3D plane: top-bar categories + sub-categories, body grid + clipboard sidebar. Toggled by the right-controller A button | [07 §ShopPanel](07-menus-and-world.md#shoppanel-shoppanelts) |
| [`shop/N3DShop.ts`](../src/world/shop/N3DShop.ts) | The dormant 3D physical-shop alternative. Loads a music-shop building model and arranges previewers on shelves | [07 §N3DShop](07-menus-and-world.md#n3dshop-dormant-n3dshopts) |
| [`shop/N3DShopCamera.ts`](../src/world/shop/N3DShopCamera.ts) | Third-person camera that follows the user through the shop building | [07 §N3DShop](07-menus-and-world.md#n3dshop-dormant-n3dshopts) |
| [`shop/N3DShopPreviewer.ts`](../src/world/shop/N3DShopPreviewer.ts) | An instrument preview placed on a shop shelf | [07 §N3DShop](07-menus-and-world.md#n3dshop-dormant-n3dshopts) |
| [`ground/WaveGround.ts`](../src/world/ground/WaveGround.ts) | The animated 30×30 cell floor. `put(x, y, dx, dy, color)` injects a ripple, `update()` ticks the simulation, `putWorldSpace(...)` is what `context.sendSignal` calls | [07 §WaveGround](07-menus-and-world.md#waveground-wavegroundts) |
| [`ground/WaveSimulator.ts`](../src/world/ground/WaveSimulator.ts) | The pure simulation — amplitudes + RGB on a 2D grid, propagation step. No Babylon meshes; can be unit-tested | [07 §WaveSimulator](07-menus-and-world.md#wavesimulator-wavesimulatorts) |
| [`ground/ReactiveBlockGround.ts`](../src/world/ground/ReactiveBlockGround.ts) | Alternative ground style — blocks that pop up reactively. Currently unused | [07 §ReactiveBlockGround](07-menus-and-world.md#reactiveblockground-reactiveblockgroundts) |
| [`soundwave/SoundwaveEmitter.ts`](../src/world/soundwave/SoundwaveEmitter.ts) | Spawns expanding circular ripple meshes from `(x, z)` with a colour. Created by `SceneManager` and called by Node3D plugins via `context.sendSignal(...)` | [07 §SoundwaveEmitter](07-menus-and-world.md#soundwaveemitter-soundwaveemitterts) |

## `src/visual/`

| File | Responsibility | Chapter |
|---|---|---|
| [`VisualTube.ts`](../src/visual/VisualTube.ts) | The standalone, network-synced cable mesh used as a preview line during wire-drawing. `Synchronized` with `position` and `color` keys | [07 §VisualTube](07-menus-and-world.md#visualtube-visualtubets) |
| [`VisualRope.ts`](../src/visual/VisualRope.ts) | A rope variant with multiple segments. Currently unused | [07 §VisualRope](07-menus-and-world.md#visualrope-visualropets) |

## `src/iomanager/`

| File | Responsibility | Chapter |
|---|---|---|
| [`ConnectionManager.ts`](../src/iomanager/ConnectionManager.ts) | Listens for `IOEventBus.IO_CONNECT` events and implements the click-output → drag → release-on-input wire-drawing gesture. Spawns a network-synced `VisualTube` as preview, calls `N3DConnectionInstance.set` to commit. **Different class** from any other "ConnectionManager" — there's no longer a network-side one | [07 §iomanager](07-menus-and-world.md#iomanagerconnectionmanager--the-wire-drawing-logic) |

## `src/wamExtensions/` — globally registered WAM extensions

| File | Responsibility | Chapter |
|---|---|---|
| [`WAMExtensions.ts`](../src/wamExtensions/WAMExtensions.ts) | Type declarations for `window.WAMExtensions` — adds `notes` and `patterns` extensions beyond the WAM standard | [02 §WamInitializer](02-app-core.md#waminitializer-waminitializerts) |
| [`notes/NoteExtension.ts`](../src/wamExtensions/notes/NoteExtension.ts) | Lets MIDI source plugins advertise their note list to receivers (e.g. so a piano roll knows which notes a synth supports). `MidiN3DConnectable.Output` calls `addMapping` on connect | [02 §WamInitializer](02-app-core.md#waminitializer-waminitializerts), [03 §MIDI](03-node3d-system.md#midi--midin3dconnectable-source) |
| [`patterns/PatternExtension.ts`](../src/wamExtensions/patterns/PatternExtension.ts) | Adds pattern-based control to WAM nodes (used by the PianoRoll and similar) | [02 §WamInitializer](02-app-core.md#waminitializer-waminitializerts) |

## `src/shared/`

| File | Responsibility | Chapter |
|---|---|---|
| [`SharedTypes.ts`](../src/shared/SharedTypes.ts) | `MenuConfig`, `Position3D`, `NodeTransform` — small shared types | [02 §SharedTypes](02-app-core.md#sharedtypests-sharedtypests) |

## `src/utils/`

| File | Responsibility | Chapter |
|---|---|---|
| [`utils.ts`](../src/utils/utils.ts) | `withTimeout` (`Promise.race` + `setTimeout`), `parallel` (run several async fns concurrently), `usingWith` (auto-detach an observer when its node disposes) | [02 §utils](02-app-core.md#utilsts-utilsts) |
| [`async.ts`](../src/utils/async.ts) | `PromiseChain` and other async helpers used by `N3DPreviewer` | [07 §N3DPreviewer](07-menus-and-world.md#n3dpreviewer-n3dpreviewerts) |
| [`atlas.ts`](../src/utils/atlas.ts) | `TextureAtlas` — packs many textures into one and returns UV slots. Used by `Node3DBuilder.atlas` for the thumbnail atlas | [02 §Node3DBuilder](02-app-core.md#node3dbuilder-node3dbuilderts) |
| [`auto_dispose.ts`](../src/utils/auto_dispose.ts) | `AutoDispose<T>` — a lazy singleton that auto-disposes after N ms of disuse. Used by `Node3DBuilder.renderer` (the offscreen thumbnail renderer) so it's only kept alive while in use | [02 §Node3DBuilder](02-app-core.md#node3dbuilder-node3dbuilderts) |
| [`call_aggregator.ts`](../src/utils/call_aggregator.ts) | Small utility that batches several calls into one | (used internally) |
| [`route.ts`](../src/utils/route.ts) | Routing helpers (likely for the WAM-config server fetches) | (used internally) |
| [`xml_builder.ts`](../src/utils/xml_builder.ts) | A small XML/HTML builder utility | (used internally — possibly for WAM config or DOM-building helpers) |

---

## How to use this index

- **Looking for a specific class**: ⌘-F by class name. Files are
  named after their main exported class.
- **Looking for "where does X happen"**: scan the responsibility
  column. Each entry is one sentence, written so the keywords are
  recognisable.
- **Looking for a concept**: jump to the chapter linked in the
  rightmost column. The chapter has the in-depth narrative.

If a file is **not** listed here, it was added after this doc was
written. The closest entry is probably the folder it lives in — start
there.
