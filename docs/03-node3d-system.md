# 03 — The Node3D system

This chapter describes the **plugin contract** that every instrument
and effect in the app implements, and the **runtime layer** that turns
a plugin into a living object in the 3D scene.

If you are going to build a new instrument, this chapter and chapter
[09](09-contributor-guide.md) are the two you must read.

## Files covered

| Folder | Files |
|---|---|
| `node3d/` (declarations) | [`Node3D.d.ts`](../src/Refactoring/node3d/Node3D.d.ts), [`Node3DButton.d.ts`](../src/Refactoring/node3d/Node3DButton.d.ts), [`Node3DConnectable.d.ts`](../src/Refactoring/node3d/Node3DConnectable.d.ts), [`Node3DContext.d.ts`](../src/Refactoring/node3d/Node3DContext.d.ts), [`Node3DGUIContext.d.ts`](../src/Refactoring/node3d/Node3DGUIContext.d.ts), [`Node3DParameter.d.ts`](../src/Refactoring/node3d/Node3DParameter.d.ts) |
| `node3d/instance/` | [`Node3DInstance.ts`](../src/Refactoring/node3d/instance/Node3DInstance.ts), [`N3DConnectableInstance.ts`](../src/Refactoring/node3d/instance/N3DConnectableInstance.ts), [`N3DConnectionInstance.ts`](../src/Refactoring/node3d/instance/N3DConnectionInstance.ts), [`N3DParameterInstance.ts`](../src/Refactoring/node3d/instance/N3DParameterInstance.ts), [`N3DButtonInstance.ts`](../src/Refactoring/node3d/instance/N3DButtonInstance.ts), [`N3DShared.ts`](../src/Refactoring/node3d/instance/N3DShared.ts) |
| `node3d/instance/utils/` | [`N3DHighlighter.ts`](../src/Refactoring/node3d/instance/utils/N3DHighlighter.ts), [`N3DText.ts`](../src/Refactoring/node3d/instance/utils/N3DText.ts), [`N3DRendering.ts`](../src/Refactoring/node3d/instance/utils/N3DRendering.ts), [`N3DMenuManager.ts`](../src/Refactoring/node3d/instance/utils/N3DMenuManager.ts) |
| `node3d/tools/` | [`index.ts`](../src/Refactoring/node3d/tools/index.ts), connectables (`AudioN3DConnectable`, `MidiN3DConnectable`, `AutomationN3DConnectable`, `SyncN3DConnectable`), utils (`MeshUtils`, `NodeCompUtils`, `RandomUtils`, `StateUtils`) |

The actual concrete instruments under `node3d/subs/` live in chapter
[04](04-instruments-catalog.md).

---

## Mental model

A **Node3D** in this codebase is a triple:

```
  Node3DGUI    +    Node3D    +    Node3DFactory
  (visuals)        (audio)        (constructor)
```

- **`Node3DGUI`** — Babylon meshes inside a unit-1 cube (the `worldSize`
  field scales it). Has a `dispose()` method but **no audio code**.
  This separation lets the host render thumbnails of instruments
  without booting an audio context — see
  [`N3DRendering`](../src/Refactoring/node3d/instance/utils/N3DRendering.ts).
- **`Node3D`** — the audio implementation. Owns Web Audio nodes / WAM
  instances. Exposes mutable state via `getState(key)` /
  `setState(key, value)` for network sync.
- **`Node3DFactory<G, T>`** — a small object with a `label`, a
  `description`, `tags`, and two methods: `createGUI` (just the
  visuals) and `create` (which receives the GUI and produces the audio
  Node3D). Factories are values, not classes — you `export const`
  them.

The host (this codebase, in `Node3DInstance`) wires the three together
at runtime by passing in a **`Node3DContext`** — the host's side of the
plugin contract.

```
                ┌───── plugin author writes ─────┐
                ▼                                 ▼
       export class FooN3DGUI implements Node3DGUI { ... }
       export class FooN3D    implements Node3D     { ... }
       export const FooN3DFactory: Node3DFactory<...> = { label, tags, createGUI, create }
                ▲
                │
                │ host registers / instantiates
                │
       ┌────────┴───────────┐
       │   Node3DInstance   │
       │   - holds the GUI  │
       │   - holds the N3D  │
       │   - hosts a context│
       │   - registers in   │
       │     SyncManager    │
       │   - draws bounding │
       │     box / shake    │
       └────────────────────┘
```

---

## The plugin contract (declarations)

### `Node3D.d.ts` ([source](../src/Refactoring/node3d/Node3D.d.ts))

Declares three interfaces and one type alias.

#### `type Serializable`

```typescript
type Serializable = { [key: string]: Serializable }
                  | Serializable[]
                  | string | number | boolean | null
```

Every value sent across `setState` / `getState` must be serializable to
plain JSON — that is, anything Yjs can store. No `Vector3`, no
`AudioNode`, no `Map`. Convert at the boundaries.

#### `interface Node3DGUI` (lines 17–29)

```typescript
interface Node3DGUI {
    worldSize: number          // scaling factor (the GUI is meant to fit in a 1×1×1 box)
    root: TransformNode        // the parent transform of all GUI meshes
    dispose(): Promise<void>
}
```

The GUI lives in a normalized cube documented at the top of the file
(lines 10–15):

- `x ∈ [-0.5, 0.5]` — left → right
- `y ∈ [-0.5, 0.5]` — back → forward
- `z ∈ [-0.5, 0.5]` — bottom → top
- `(0, 0, 0)` is the GUI center

`worldSize` is multiplied by `Node3DInstance.SIZE_MULTIPLIER` (0.2) at
runtime to yield the in-world size. So a GUI built to fit `1×1×1` ends
up as `0.2×0.2×0.2` in the scene by default.

#### `interface Node3D` (lines 36–74)

```typescript
interface Node3D {
    setState(key: string, state: Serializable | undefined): Promise<void>
    getState(key: string): Promise<Serializable | void>
    getStateKeys(): string[]
    dispose(): Promise<void>
}
```

Three concepts to understand:

- **State is partial.** A node can split its state into multiple keys
  ("frequency", "waveform", "preset", ...) and only re-broadcast the
  ones that changed. This is how the Yjs map is kept small.
- **State is async** because some plugins (like WAMs) only know their
  values via `await wam.getState()`. The async-ness is part of the
  contract.
- `getStateKeys()` returns the canonical list. The host iterates this
  on first sync (see
  [`Node3DInstance.askStates`](../src/Refactoring/node3d/instance/Node3DInstance.ts)
  at line 280).

#### `interface Node3DFactory<G extends Node3DGUI, T extends Node3D>` (lines 81–126)

```typescript
interface Node3DFactory<G extends Node3DGUI, T extends Node3D> {
    label: string
    description: string
    tags: string[]              // see vocabulary below
    createGUI(context: Node3DGUIContext): Promise<G>
    create(context: Node3DContext, gui: G): Promise<T>
}
```

The `tags` field has a **standard vocabulary** (singular, lowercase,
underscores, no accents). From
[Node3D.d.ts:97-110](../src/Refactoring/node3d/Node3D.d.ts):

| Tag | Meaning |
|---|---|
| `instrument` | Takes MIDI in, makes audio out |
| `live_instrument` | Real-time generator (e.g. keyboard) |
| `controller` | Real-time *automation* generator (e.g. control pad). Doesn't make sound directly |
| `generator` | Produces sound or MIDI without input |
| `effect` | Audio/MIDI in → audio/MIDI out |
| `consumer` | Takes audio/MIDI in, produces nothing |
| `midi` | Has MIDI ports |
| `audio` | Has audio ports |
| `automation` | Has automation ports |

The `ShopPanel` categorizes plugins by these tags.

The split between `createGUI` and `create` matters: `createGUI` runs
without an audio context, so the host can render a plugin's thumbnail
into a separate offscreen scene before it's ever instantiated for real
(see [`N3DRendering.renderThumbnail`](../src/Refactoring/node3d/instance/utils/N3DRendering.ts)).

### `Node3DGUIContext.d.ts` ([source](../src/Refactoring/node3d/Node3DGUIContext.d.ts))

The host-provided argument to `createGUI`. **No audio.**

| Field | Type | What |
|---|---|---|
| `tools` | `typeof import("./tools")` | Re-exported helpers (see "Tools" section below) |
| `babylon` | `typeof BABYLON` | The whole `@babylonjs/core` namespace, so plugins don't need their own import |
| `scene` | `BABYLON.Scene` | The live Babylon scene to add meshes to |
| `materialMat` | `StandardMaterial` | Shared "matte" material (specularColor = black, alphaCutOff 0.5) |
| `materialShiny` | `StandardMaterial` | Shared "shiny" material (specularColor = white) |
| `materialMetal` | `StandardMaterial` | Shared "metal" material (white specular, roughness 0.2) |
| `materialLight` | `StandardMaterial` | Shared "light" material (emissive white) |
| `materialTransparent` | `StandardMaterial` | Shared dithered transparency (uses a noise texture as opacity, alpha cutoff 0.2) |
| `highlight(node, color)` | function | Add highlight outline (uses host's `HighlightLayer`) |
| `unhighlight(node)` | function | Remove |

Sharing materials across all plugins keeps draw calls and texture state
under control, and gives the world a consistent visual style.

### `Node3DContext.d.ts` ([source](../src/Refactoring/node3d/Node3DContext.d.ts))

The host-provided argument to `create`. The full plugin-host API.

| Field / method | Line | Purpose |
|---|---|---|
| `readonly tools` | 21 | Same export as in `GUIContext` |
| `readonly audioCtx: AudioContext` | 26 | Web Audio context |
| `readonly audioEngine: AudioEngineV2` | 31 | Babylon's audio engine wrapper |
| `readonly groupId: string` | 36 | The WAM host group ID — pass this to `WAM.createInstance` |
| `setLabel(label)` | 45 | Update the node's display name |
| `createParameter(info)` | 55 | Register a draggable knob/slider |
| `removeParameter(id)` | 61 | Tear it down |
| `createButton(info)` | 71 | Register a clickable button |
| `removeButton(id)` | 77 | Tear it down |
| `createConnectable(info)` | 87 | Register an input/output port |
| `removeConnectable(id)` | 93 | Tear it down |
| `addToBoundingBox(mesh)` | 103 | Add a mesh to the drag-to-move box |
| `removeFromBoundingBox(mesh)` | 109 | Remove |
| `openMenu(choices)` | 120 | Show a button list to the user |
| `closeMenu()` | 125 | Close the menu we opened |
| `showMessage(message)` | 130 | Transient HUD text |
| `sendSignal(position, r, g, b)` | 137 | Emit a colored ripple in the `WaveGround` and a circular wave in the `SoundwaveEmitter`. Used by speakers/synths to render audio activity visually |
| `getPlayerPosition()` | 146 | `{position, rotation}` of the user's head |
| `getPosition()` | 160 | `{position, rotation}` of the node's bounding box |
| `delete()` | 155 | Remove this node from the scene |
| `notifyStateChange(key)` | 171 | "I changed `key`, please broadcast it" |
| `observe(observable, observer)` | 182 | Register an observer that's automatically detached when the node disposes |

The host fulfils all of this from inside
[`Node3DInstance.instantiate()`](../src/Refactoring/node3d/instance/Node3DInstance.ts) —
see "Instance layer" below. `observe()` is the correct way to add
per-frame logic from inside a plugin: don't manually attach to
`scene.onBeforeRenderObservable`, because the host won't auto-detach
your observer on dispose.

### `Node3DConnectable.d.ts` ([source](../src/Refactoring/node3d/Node3DConnectable.d.ts))

The contract for an audio/MIDI/automation/sync port. You almost never
implement this directly — you use one of the four protocol helpers in
`tools/`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unique per node |
| `meshes` | `AbstractMesh[]` | What the user clicks/drags to wire |
| `type` | `string \| Symbol` | `"audio"`, `"midi"`, `"automation"`, `"sync"` — must match for a connection to be allowed |
| `direction` | `'input' \| 'output' \| 'bidirectional'` | Direction enforcement |
| `label` | `string` | Shown in tooltips / error messages |
| `color` | `Color3` | Highlight color when hovered |
| `max_connections?` | `number` | Optional cap |
| `connectAsInput()` | method | Returns a "connection" object that the output side will receive |
| `connectAsOutput(connection)` | method | Receives the input side's "connection" object — does the actual wiring |
| `disconnectAsInput(connection)` | method | Mirror of `connectAsInput` |
| `disconnectAsOutput(connection)` | method | Mirror of `connectAsOutput` |

The protocol is **symmetric and protocol-specific**: the input side
exposes a "connection" handle, and the output side subscribes to it.
The shape of that handle differs by type (e.g.
`AudioN3DConnection` vs `MidiN3DConnection` vs the automation
`AutomationInputInfo`). See "Tools" below for each protocol's
specifics.

### `Node3DParameter.d.ts` ([source](../src/Refactoring/node3d/Node3DParameter.d.ts))

The contract for a draggable parameter knob.

| Field | What |
|---|---|
| `id` | unique |
| `meshes` | the draggable mesh(es) |
| `notSynced?` | If `true`, this parameter is **not** auto-synced over the network. Default is synced |
| `setValue(v: number)` | called by host with `v ∈ [0,1]` |
| `getValue()` | host reads back current normalized value |
| `getStepCount()` | discrete steps (`2` = toggle, `>1` = quantized to `1/(n-1)`) |
| `stringify(v: number)` | format for the floating label, e.g. `"230 Hz"` |
| `getLabel()` | parameter name |
| `fromOffset?(positionOffset, directionOffset)` | optional custom drag-to-value mapping. Default is "vertical drag of a point 1 unit ahead of the controller". Override for horizontal sliders, rotary knobs, etc. |

Always use a normalized `[0..1]` range for `setValue`. Map to the
underlying domain (Hz, dB, MIDI note, etc.) inside your implementation.
That makes the UI generic.

> **Big deal**: every parameter you register is **also** automatically
> exposed as an `AutomationN3DConnectable.Input` connectable, so any
> automation source can drive it. You get this for free; see
> [Node3DInstance.ts:103-115](../src/Refactoring/node3d/instance/Node3DInstance.ts).

### `Node3DButton.d.ts` ([source](../src/Refactoring/node3d/Node3DButton.d.ts))

```typescript
interface Node3DButton {
    id: string
    meshes: AbstractMesh[]
    label: string
    color: Color3
    supportSwipe?: boolean    // ← see below
    press(): void
    release(): void
}
```

`supportSwipe` (line 36) is the magic that makes pianos and drum pads
playable: when set, the button presses on `pointer-over while pressed`
and releases on `pointer-out while pressed`. So you can run a finger
across keys and they all fire in turn. Without it, you have to lift
the trigger between every press.

---

## The instance layer

The instance layer is the host's implementation of the plugin contract
— the runtime that turns a factory into a living object.

### `Node3DInstance` ([source](../src/Refactoring/node3d/instance/Node3DInstance.ts))

The central runtime class. One per spawned plugin. Implements
[`Synchronized`](../src/Refactoring/network/sync/Synchronized.ts) so it
can be tracked by the network's `SyncManager`.

| Member | Where | What |
|---|---|---|
| `static SIZE_MULTIPLIER = 0.2` | line 36 | Scale applied on top of `gui.worldSize` |
| `static CONNECTION_SIZE_MULTIPLIER = 0.1` | 37 | Scale of the visible cable mesh |
| `private gui: Node3DGUI` | 44 | The plugin's visuals |
| `private node: Node3D` | 45 | The plugin's audio implementation |
| `parameters: Map<string, N3DParameterInstance>` | 46 | Public — keyed by `id` |
| `buttons: Map<string, N3DButtonInstance>` | 47 | Public |
| `connectables: Map<string, N3DConnectableInstance>` | 48 | Public |
| `private root_transform: TransformNode` | 49 | Parented under `bounding_mesh` (so dragging the bbox moves the whole node) |
| `private observers: Set<Observer<any>>` | 52 | All observers registered through `context.observe(...)` so they can be cleaned up at dispose |
| `on_dispose: () => void` | 53 | Hook used by the SyncManager to remove on dispose |
| `async instantiate()` | 55 | The big constructor — see below |
| `boundingBoxMesh` getter | 207 | The drag-target mesh |
| `private updateBoundingBox()` | 262 | Debounces rebuild via `setTimeout(..., 0)` |
| `private updateBoundingBoxNow()` | 209 | Recomputes bbox from `boxes`, recreates the box mesh, attaches a `ShakeBehavior` for shake-to-delete |
| `initSync` / `disposeSync` / `askStates` / `getState` / `setState` / `removeState` | 276–322 | The `Synchronized` contract — see chapter [05](05-networking-and-sync.md) |
| `updatePosition()` | 315 | Forces a re-broadcast of `"position"` — used by `Serialization.load` |
| `async dispose()` | 326 | Disposes everything in reverse order; emits a `"delete"` state to remote peers |
| `static getSyncManager(scene, doc, audioManager, messages)` | 344 | Builds the `SyncManager<Node3DInstance, string>` (the third type arg is the `kind` carried alongside) |

#### What `instantiate()` actually does

Lines 55–199 walk this script:

1. Pull shared resources (`scene`, `highlightLayer`, `utilityLayer`,
   `babylon`, `tools`) from `N3DShared`.
2. Allocate per-instance helpers: a `N3DHighlighter`, a `N3DMenuInstance`.
3. Create two transform nodes: `root_transform` (the outer one — gets
   reparented under the bounding box later) and `gui_root_transform`
   (the inner one that gets scaled by `worldSize * 0.2`).
4. `await node_factory.createGUI(...)` with a `Node3DGUIContext` wrapping
   the shared materials and a closure-bound highlight pair.
5. Reparent and scale: `gui.root.parent = gui_root_transform`,
   `gui_root_transform.scaling.setAll(worldSize * 0.2)`.
6. `await node_factory.create(context, gui)` where the `context` is a
   freshly-built object literal — every method on `Node3DContext` is
   wired here. Notable methods:
   - `createParameter`: creates an `N3DParameterInstance` *and* a
     dual `AutomationN3DConnectable.Input` (so the param can be
     automated). Both are stored in the maps.
   - `createConnectable`: wraps the user's port in
     `N3DConnectableInstance`, which handles hover/pick events.
   - `createButton`: wraps in `N3DButtonInstance`.
   - `addToBoundingBox(mesh)`: pushes onto `boxes[]` and triggers
     `updateBoundingBox()`.
   - `getPlayerPosition()`: queries `XRManager` for the live VR camera
     pose; returns zeros if XR isn't ready.
   - `delete()`: calls `instance.dispose()`.
   - `notifyStateChange(key)`: calls `instance.set_state(key)` — the
     callback the SyncManager installed via `initSync`.
   - `sendSignal(pos, r, g, b)`: forwards to `WaveGround.putWorldSpace`
     and `SoundwaveEmitter.spawn` for visual feedback.
   - `observe(observable, observer)`: adds the observer and tracks it in
     `instance.observers` so it can be torn down on dispose.

Everything that follows in the file (the bounding box, shake-to-delete,
sync) is host-side.

#### The bounding box and shake-to-delete

When a plugin calls `context.addToBoundingBox(mesh)`, the host
recomputes a single merged AABB
([Node3DInstance.ts:209-260](../src/Refactoring/node3d/instance/Node3DInstance.ts))
and creates a `BoundingBox` (chapter [06 §Behaviors](06-xr-input-and-behaviors.md))
attached to a low-visibility (0.1) mesh. Crucial side effects:

- `this.root_transform.parent = this.bounding_mesh` — so dragging the
  bbox drags the whole node.
- `this.set_state("position")` is called, and `bounding_box.on_move`
  re-emits it, so position is broadcast across the network.
- A `ShakeBehavior` is attached to the bbox: while the user shakes,
  the box turns red and after 5 shake-counts (line 248)
  `NetworkManager.node3d.nodes.remove(this)` is called — i.e. **shake
  to delete**.

#### State sync

Three classes of keys are first-class:

- `"position"` — host-managed; payload is
  `{position: number[], rotation: number[]}`. Set on bbox creation,
  re-set on `bounding_box.on_move`.
- `"delete"` — sentinel. Setting it from the network triggers
  `dispose()` on the local instance.
- `"node3d_parameter_<id>"` — host-managed; the auto-sync of every
  draggable parameter, unless it's marked `notSynced`. The value is
  the raw `[0..1]` from `param.config.getValue()` (line 294). On
  `setState` it's pushed back through `param.config.setValue(value)`
  (line 310), which also triggers any automation connections.
- All other keys — delegated to `this.node.getState/setState` for the
  plugin to handle.

`askStates()` emits `"position"` plus everything the plugin reports
from `getStateKeys()` plus every synced parameter.

### `N3DShared` ([source](../src/Refactoring/node3d/instance/N3DShared.ts))

A bag of resources every Node3DInstance shares.

| Field | Where it comes from |
|---|---|
| `scene: Scene` | `SceneManager.getInstance().getScene()` |
| `shadowGenerator: ShadowGenerator` | `SceneManager.getInstance().getShadowGenerator()` |
| `audioContext: AudioContext` | created in `NewApp.start()` |
| `audioEngine: AudioEngineV2` | `Babylon.CreateAudioEngineAsync` |
| `groupId: string` | `WamInitializer.getHostGroupId()[0]` |
| `utilityLayer: UtilityLayerRenderer` | A separate render layer for floating UI (text, gizmos) so it doesn't z-fight with world meshes |
| `highlightLayer: HighlightLayer` | `new HighlightLayer(...)` (one shared layer) |
| `materialMat / materialShiny / materialMetal / materialLight / materialTransparent` | Created once, reused everywhere |
| `tools` | `import * as tools from "../tools"` |
| `babylon` | `import * as babylonjs from "@babylonjs/core"` |
| `menuManager: N3DMenuManager` | `new N3DMenuManager(UIManager.getInstance())` |

`materialTransparent` (lines 35–49) is unusual: it's loaded with a
noise PNG (`./utils/noise.png`) used as an alpha mask, so anything
using it gets a stippled transparent look. The `WaveGround` and a
couple of effect visuals use it.

Constructed once by [`Node3DBuilder.initialize()`](../src/Refactoring/app/Node3DBuilder.ts).

### `N3DConnectableInstance`

Wraps a plugin's `Node3DConnectable` config with Babylon
`ActionManager` triggers. **It does not perform the actual audio/MIDI
wiring** — that lives in the connectable protocol classes themselves.

For each mesh in `config.meshes` it registers five action triggers:

| Trigger | Effect |
|---|---|
| `OnPointerOverTrigger` | highlight the meshes (with `config.color`) |
| `OnPointerOutTrigger` | unhighlight |
| `OnLeftPickTrigger` | emit `IOEventBus.IO_CONNECT` with `pickType: "down"` |
| `OnPickUpTrigger` | emit `IO_CONNECT` with `pickType: "up"` |
| `OnPickOutTrigger` | emit `IO_CONNECT` with `pickType: "out"` |

The `iomanager/ConnectionManager` (chapter
[07](07-menus-and-world.md)) listens to those `IO_CONNECT` events and
implements the "click an output, drag, click an input" wire-up gesture.

Holds a `connections: Set<N3DConnectionInstance>` — populated by
`N3DConnectionInstance` so each port knows its live wires.

### `N3DConnectionInstance`

A single live wire between two `N3DConnectableInstance`s. **Also
synchronized** — connections survive joins/leaves.

Visual: a 6-sided cylinder (the tube) plus an optional cone (the arrow)
when the connection is unidirectional.

The validation cascade in `connect(cA, cB)`:

- not self-connect
- not already connected
- not over `max_connections`
- directions compatible (`bidirectional` matches anything; otherwise
  must be opposite)
- `cA.type === cB.type`

On success, the actual data wiring is symmetric:

```
const conn = input.config.connectAsInput()
output.config.connectAsOutput(conn)
```

`connectAsInput()` returns a "connection" object whose shape depends on
the protocol (see "Tools" below). `connectAsOutput()` subscribes to it,
typically by calling `conn.subscribe(callback)`.

Visual maintenance:

- The tube/arrow transform is recomputed when either endpoint mesh's
  world matrix changes (`onAfterWorldMatrixUpdateObservable`),
  debounced 20ms.
- A `ShakeBehavior` attached to the tube means **shake the wire to
  delete the connection**, with the tube fading proportional to shake
  power.
- Sync state lives under one key, `"connectables"`, with payload
  `{fromId, fromPortId, toId, toPortId}`. To rebuild a connection from
  the network, the instance `await`s the two endpoint nodes via
  `nodes.get(fromId)` (which is async with timeout — see chapter
  [05](05-networking-and-sync.md)) and calls `connect()`.

### `N3DParameterInstance`

Turns a draggable mesh into a parameter knob.

Key behaviors:

- A Babylon drag behavior is attached with movement and rotation
  disabled — only the *delta* is consumed.
- Drag delta is converted to a value with either the parameter's
  custom `fromOffset(positionOffset, directionOffset)` or the default
  "Y component of the projected position offset".
- Step quantization: if `getStepCount() <= 1`, fall back to a fine
  `0.001` step. If `=== 2`, the value is toggled directly on grab. Else
  quantized to `1/(stepCount-1)`.
- The visible label is a billboarded
  [`N3DText`](../src/Refactoring/node3d/instance/utils/N3DText.ts) plane
  showing `getLabel() + "\n" + stringify(getValue())`.
- Hover and drag highlight states stack via a small counter so
  multiple input sources can highlight the same parameter without
  fighting each other.

### `N3DButtonInstance`

Same pattern as `N3DParameterInstance` but simpler: hover/highlight,
text, and `OnPickDownTrigger → press()` /
`OnPickUpTrigger | OnPickOutTrigger → release()`.

When `config.supportSwipe` is set, additional `OnPointerOverTrigger`
and `OnPointerOutTrigger` handlers fire `press`/`release` based on
whether the pointer is currently down — that's how a piano keyboard
gets the swipe feel.

### Instance utilities

#### `N3DHighlighter` ([source](../src/Refactoring/node3d/instance/utils/N3DHighlighter.ts))

A per-instance bookkeeper around Babylon's shared `HighlightLayer`. Why:
the layer is global, but a Node3D needs to remove its own meshes from
the layer when it dies — the highlighter remembers which meshes *it*
added and removes only those.

#### `N3DText`

A small floating text plane with a Babylon GUI texture. Created hidden;
`set(value)`, `show()`, `hide()`, `updatePosition()`. The texture is
1024 wide × ~204 tall, font size 50 white with a black outline.

#### `N3DRendering`

Two static methods:

| Method | What |
|---|---|
| `static async renderThumbnail(scene, factory, size)` | Builds an offscreen `Scene`, `await factory.createGUI(...)` with a stub context, points a UniversalCamera at the GUI, renders once, returns the `RenderTargetTexture`. **No audio context required**, so this works for any factory regardless of audio state |
| `static async textureToImageURL(texture)` | Read pixels (handles both `Float32Array` and `Int32Array` formats), flip vertically into a 2D canvas, return `canvas.toDataURL()` |

Used by `Node3DBuilder.getThumbnail` to populate the thumbnail atlas
that the `ShopPanel` and the `Node3dManager` impostors sample from.

#### `N3DMenuManager` and `N3DMenuInstance`

Coordinated 3D menus across all Node3D instances.

- `N3DMenuManager` is created **once** as part of `N3DShared`. It
  tracks `activeInstance` — the only instance that may currently have
  a menu open.
- `N3DMenuInstance` is created **per Node3D**. When it opens a menu,
  it tells the manager to close the previous active one. The actual
  menu is a [`SimpleMenu`](../src/Refactoring/menus/SimpleMenu.ts)
  hosted by `UIManager`.

This is the implementation of `context.openMenu()` and
`context.showMessage()` in `Node3DContext`.

---

## Connection protocols

The `tools/` folder is exposed to plugins via `context.tools` (and the
same on `Node3DGUIContext`). Re-exported by
[`tools/index.ts`](../src/Refactoring/node3d/tools/index.ts):

```typescript
export * from "./connectable/AudioN3DConnectable"
export * from "./connectable/MidiN3DConnectable"
export * from "./connectable/AutomationN3DConnectable"
export * from "./connectable/SyncN3DConnectable"
export * from "./utils/MeshUtils"
export * from "./utils/StateUtils"
```

The four connection protocols all follow the same shape:

```
Input.connectAsInput()  →  protocol-specific Connection object
                                    │
                                    ▼
Output.connectAsOutput(conn) — subscribes to the Connection
```

The Connection object is the contract between input and output. Each
protocol uses a different shape.

### Audio — `AudioN3DConnectable` ([source](../src/Refactoring/node3d/tools/connectable/AudioN3DConnectable.ts))

A namespace exporting five classes plus a shared `Color = #00FF00`.

The protocol's `Connection` object is `AudioN3DConnection`:

```typescript
interface AudioN3DConnection {
    subscribe(observer: (old: AudioNode|null, now: AudioNode|null) => void): void
    unsubscribe(observer: (old: AudioNode|null, now: AudioNode|null) => void): void
}
```

Why an `(old, now)` pair? So dynamic inputs can swap their audio node
on the fly and outputs disconnect from the old one before connecting to
the new one — without rebuilding the wire.

| Class | Direction | When to use |
|---|---|---|
| `Input` | `input` | A fixed `AudioNode` destination — most common |
| `DynamicInput` | `input` | The `audioNode` may be replaced after construction (use the setter) |
| `Output` | `output` | Single fixed source `AudioNode`. `connectAsOutput` calls `subscribe` and the callback does `audioNode.connect(now)` / `disconnect(old)` |
| `ListOutput` | `output` | You want callbacks (`on_add`, `on_remove`) when downstream nodes (dis)connect — use this for mixers, sequencers |
| `DynamicOutput` | `output` | `extends ListOutput`. The source `audioNode` may swap |

The `Output.callback` (lines 127–130) is the critical line:

```typescript
private callback = (old, now) => {
    if (old) this.audioNode.disconnect(old)
    if (now) this.audioNode.connect(now)
}
```

That's the entire audio routing dance.

### MIDI — `MidiN3DConnectable` ([source](../src/Refactoring/node3d/tools/connectable/MidiN3DConnectable.ts))

Same five classes, typed against `WamNode`. Color `#33BB88`.

The output's `callback` does two things on connect:

```typescript
this.wamNode.connectEvents(now.instanceId)
window.WAMExtensions.notes?.addMapping(this.wamNode.instanceId, [now.instanceId])
```

The first is the WAM API for routing MIDI events. The second pokes the
notes extension so the receiving plugin can advertise note availability
to the source (e.g. a MIDI sequencer can know which notes a synth
supports).

### Automation — `AutomationN3DConnectable` ([source](../src/Refactoring/node3d/tools/connectable/AutomationN3DConnectable.ts))

Three classes plus shared `Color = #515252`. Used for parameter
automation (knob → knob, gaze → knob, voice volume → knob, etc.).

The protocol's connection object is `AutomationInputInfo`:

```typescript
interface AutomationInputInfo {
    id: any
    sender?(value: number): void          // call this to send values
    stringifier?(value: number): string   // for the label
    getStepCount?(): number
    getName?(): string
    remove?(): void                       // called on disconnect
}
```

| Class | Direction | When to use |
|---|---|---|
| `Input` | `input` | A single connection allowed (`max_connections = 1`). Wraps a `{setValue, stringify, getStepCount, getName, lock}` parameter object |
| `MultiInput` | `input` | Allows multiple connections; values are aggregated into an array passed to the parameter's `setValue(values: number[])`. Used when a single param can be the sum/min/max/etc. of several sources |
| `Output` | `output` | Stores a `value: number` and pushes it to all connected inputs via their `sender` |

`Input` example (auto-built for every parameter you register, see
[Node3DInstance.ts:103-115](../src/Refactoring/node3d/instance/Node3DInstance.ts)):

```typescript
new T.AutomationN3DConnectable.Input(
    `${info.id}_connectable`,
    info.meshes,
    "",
    {
        getName()       { return info.getLabel() },
        getStepCount()  { return info.getStepCount() },
        stringify(v)    { return info.stringify(v) },
        setValue(v)     { info.setValue(v) },
        lock(isLocked)  { },
    },
)
```

`Output` is what controllers (e.g. `GazeControllerN3D`) use:

```typescript
const out = new AutomationN3DConnectable.Output("out", [mesh], "Out", 0.5)
out.value = 0.7   // pushes 0.7 to every connected input automatically
```

### Sync — `SyncN3DConnectable` ([source](../src/Refactoring/node3d/tools/connectable/SyncN3DConnectable.ts))

Yellow `#fff700`. Used to chain sequencers so their playheads align.
The file's opening comment is *« Abandonne tout espoir toi qui entre
ici »* ("Abandon all hope, ye who enter here") — so the implementation
is intricate. Here's the conceptual model:

A `Container` represents one sequencer's timing. It holds:

- `_start` — when this sequencer's loop should begin (set by upstream)
- `_duration` — how long this sequencer's loop is (set by the
  sequencer itself)
- `_total` — the total duration of the entire connected chain (set by
  downstream cascading back up)
- `_tail_total` — intermediate tail length used when computing
  `_total`

Three message types cascade through the connected graph:

- `sendEnd` — sent **upstream** by an input when its end-time changes;
  re-broadcast until it reaches a sink, which converts it to
  `sendTailTotal`.
- `sendTailTotal` — sent **downstream**; re-broadcast until it reaches
  a source, which converts it to `sendTotal`.
- `sendTotal` — sent **upstream** with the final total length so every
  container ends up agreeing on the loop period.

If you connect two sequencers, their loops will lock to the same
period and one will follow the other. Each `Container` has `_next`
(downstream callbacks) and `_previous` (upstream callbacks) maps;
`Input` registers in `_previous`, `Output` registers in `_next`.

You probably won't write a new sync protocol from scratch — the only
two consumers today are the `SequencerN3D` and the `PianoRoll`. If you
want a new instrument to participate, copy the existing usage:

```typescript
this.sync = new T.SynxN3DConnectable.Container(loopDurationSeconds)
context.createConnectable(new T.SynxN3DConnectable.Input("syncIn",  [meshIn],  "Sync In",  this.sync))
context.createConnectable(new T.SynxN3DConnectable.Output("syncOut", [meshOut], "Sync Out", this.sync))
```

> **Spelling note**: the file's exported namespace is `SynxN3DConnectable`
> (with `x`, not `c`), but the file is `SyncN3DConnectable.ts`.
> Existing instruments use `T.SynxN3DConnectable.*`.

### Connection summary

| Protocol | Color | Connection object | Output→Input wiring |
|---|---|---|---|
| `audio` | `#00FF00` | `AudioN3DConnection.subscribe((old, now) => …)` | `audioNode.connect(now)` / `disconnect(old)` |
| `midi` | `#33BB88` | `MidiN3DConnection.subscribe((old, now) => …)` | `wamNode.connectEvents(now.instanceId)` + WAM notes mapping |
| `automation` | `#515252` | `AutomationInputInfo.sender(value)` | Output stores `value`; pushes to every input's `sender` |
| `sync` | `#fff700` | `SyncN3DConnection.registerCallback(msg => …)` + a shared `Container` | `Container._next/_previous` maps; messages cascade |

---

## Tool utilities

### `MeshUtils` ([source](../src/Refactoring/node3d/tools/utils/MeshUtils.ts))

Two static helpers:

- `setAllVerticesData(mesh, kind, data)` — broadcasts a vertex
  attribute to every vertex.
- `setColor(mesh, color: Color4)` — `setAllVerticesData(mesh,
  VertexBuffer.ColorKind, color.asArray())`. Writes vertex colors —
  works regardless of the material in use.

Used inside the host (e.g. shake-to-delete colors the bbox red) and
inside plugins (to color connection tubes, knob bodies, etc.).

### `StateUtils` ([source](../src/Refactoring/node3d/tools/utils/StateUtils.ts))

Bulk get/set for plugins that prefer a single object:

```typescript
const state = await StateUtils.getCompleteState(node)
// → { freq: 0.42, waveform: "sine", ... }

await StateUtils.setCompleteState(node, state)
```

Internally just `Promise.all` over `getState` / `setState`.

### `NodeCompUtils` (host-internal)

`highlight(layer, node, color)` and `unhighlight(layer, node)` —
recursive add/remove from the highlight layer. Plugins use the host's
`context.highlight(...)` callback instead of touching this directly.
**Not** re-exported through `tools`.

### `RandomUtils` (host-internal)

`randomID(complexity = 8)` — 8-hex-digit string concatenated from
`Math.random()` values. Used by `Node3dManager` for node IDs when
none is provided. Not a UUID — collision odds are ~1 in 4 billion at
default complexity, fine for in-session uniqueness.

---

## The canonical "Hello world" — `TemplateN3D.ts`

[`src/Refactoring/node3d/subs/TemplateN3D.ts`](../src/Refactoring/node3d/subs/TemplateN3D.ts)
is the skeleton meant to be copied. Pseudo-code:

```typescript
// 1) The GUI class. No audio code here.
export class TemplateN3DGUI implements Node3DGUI {
    root: TransformNode;
    worldSize = 1;

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context;
        this.root = new B.TransformNode("TemplateN3D Root", context.scene);
        // Build meshes here. Use shared materials from context.
    }

    dispose(): Promise<void> { return Promise.resolve(); }
}

// 2) The audio class. Receives the GUI as a constructor arg.
export class TemplateN3D implements Node3D {
    constructor(context: Node3DContext, private gui: TemplateN3DGUI) {
        const { tools: T, audioCtx } = context;
        // Build AudioNodes / WAMs.
        // context.createParameter({ id, meshes, getLabel, getValue, setValue,
        //                            getStepCount, stringify });
        // context.createConnectable(new T.AudioN3DConnectable.Output(...));
        // context.createButton({ id, meshes, label, color, press, release });
        // context.addToBoundingBox(this.gui.root);  // make the body draggable
    }

    dispose(): Promise<void> { return Promise.resolve(); }

    // 3) State sync — list mutable keys, then implement get/set per key.
    getStateKeys(): string[] { return []; }
    getState(key: string): Promise<Serializable | void> { return Promise.resolve(undefined); }
    setState(key: string, state: Serializable | undefined): Promise<void> { return Promise.resolve(undefined); }
}

// 4) The factory. Export const, not class.
export const TemplateN3DFactory: Node3DFactory<TemplateN3DGUI, TemplateN3D> = {
    label: "CHANGE ME",
    description: "CHANGE ME",
    tags: ["CHANGE", "ME"],
    createGUI: async (ctx) => new TemplateN3DGUI(ctx),
    create:    async (ctx, gui) => new TemplateN3D(ctx, gui),
};
```

The full recipe for wiring it into the app is in
[09 §1](09-contributor-guide.md#1-add-a-new-instrument-node3d).

---

## Lifecycle summary

```
factory.createGUI(guiContext)                   ← no audio
   │
   ▼
factory.create(context, gui)                    ← receives gui, builds audio,
   │                                              registers params/buttons/connectables
   │
   ▼
context.createConnectable(...)                  ← host builds N3DConnectableInstance,
   │                                              attaches ActionManager triggers
   ▼
context.createParameter(...)                    ← host builds N3DParameterInstance,
   │                                              also registers an AutomationN3DConnectable.Input
   ▼
context.addToBoundingBox(mesh)                  ← host computes AABB, creates bbox mesh,
   │                                              attaches ShakeBehavior, parents root
   ▼
SyncManager.add(id, instance, kind)             ← host walks node.getStateKeys() and the parameters,
   │                                              pushes each to Yjs; remote peers spawn the
   │                                              same node via factory.create
   ▼
[user interactions]
   ├─ drag a knob → setValue() → notifyStateChange(key) → set_state(key) →
   │                 SyncManager.send_changes() → Y.Map → remote peers
   ├─ wire two ports → IOEventBus → iomanager/ConnectionManager →
   │                    new N3DConnectionInstance → connect protocols
   └─ shake the bbox → ShakeBehavior.on_shake(time>5) →
                        NetworkManager.node3d.nodes.remove(this) →
                        instance.dispose() → "delete" state → remote peers also dispose
```

---

## Where to go next

- See the **catalog of every concrete instrument** in
  [04 — Instruments](04-instruments-catalog.md).
- See **how state actually traverses the network** in
  [05 — Networking & sync](05-networking-and-sync.md).
- See the **interaction primitives** (drag/hold/shake) in
  [06 — XR input & behaviors](06-xr-input-and-behaviors.md).
- The full recipe for creating a new instrument is in
  [09 §1](09-contributor-guide.md#1-add-a-new-instrument-node3d).
