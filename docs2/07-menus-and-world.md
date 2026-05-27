# 07 — Menus & world

This chapter covers the in-world UI (menus, shop, previewers, stands)
and the visual scene objects that aren't instruments themselves
(connection tubes/ropes, the wave-ground, the soundwave emitter, the
async-loading spinner). Plus the small `iomanager/ConnectionManager`
that turns "the user grabbed two ports" into "a wire exists in the
shared graph."

## Files covered

| Folder | Files |
|---|---|
| `menus/` | [`HandMenu.ts`](../src/menus/HandMenu.ts), [`SimpleMenu.ts`](../src/menus/SimpleMenu.ts) |
| `world/` | [`N3DPreviewer.ts`](../src/world/N3DPreviewer.ts), [`Node3DStand.ts`](../src/world/Node3DStand.ts), [`ScrollWall.ts`](../src/world/ScrollWall.ts), [`AsyncLoading.ts`](../src/world/AsyncLoading.ts) |
| `world/menu/` | [`ShopPanel.ts`](../src/world/menu/ShopPanel.ts) |
| `world/shop/` | [`N3DShop.ts`](../src/world/shop/N3DShop.ts), [`N3DShopCamera.ts`](../src/world/shop/N3DShopCamera.ts), [`N3DShopPreviewer.ts`](../src/world/shop/N3DShopPreviewer.ts) |
| `world/ground/` | [`WaveGround.ts`](../src/world/ground/WaveGround.ts), [`WaveSimulator.ts`](../src/world/ground/WaveSimulator.ts), [`ReactiveBlockGround.ts`](../src/world/ground/ReactiveBlockGround.ts) |
| `world/soundwave/` | [`SoundwaveEmitter.ts`](../src/world/soundwave/SoundwaveEmitter.ts) |
| `visual/` | [`VisualTube.ts`](../src/visual/VisualTube.ts), [`VisualRope.ts`](../src/visual/VisualRope.ts) |
| `iomanager/` | [`ConnectionManager.ts`](../src/iomanager/ConnectionManager.ts) |

> **What's gone**: older branches had `AbstractMenu`, `MainMenu`,
> `Menu2`, `NodeMenu`. They've been replaced by `world/menu/ShopPanel`
> for the master shop UI and `menus/SimpleMenu` for everything else.
> If you came from another branch and miss them, look for `ShopPanel`
> as the spiritual successor to `MainMenu`.

---

## Menus

The `menus/` folder is small on this branch — just `SimpleMenu` (the
generic 3D-menu primitive) and `HandMenu` (the always-attached
left-controller transport menu). The big shop UI lives under
`world/menu/`.

### `SimpleMenu` ([SimpleMenu.ts](../src/menus/SimpleMenu.ts))

A thin wrapper around Babylon's `NearMenu` + `TouchHolographicButton`.
The whole class is 87 lines.

```typescript
interface MenuConfig {
    label: string
    buttons: { label: string; icon?: TransformNode; action: () => void }[]
}

class SimpleMenu {
    constructor(name: string, guiManager: GUI3DManager)
    setConfig(config: MenuConfig): void
    addButton(button: MenuConfig['buttons'][0]): void
    removeButton(index: number): void
    clear(): void
    get menuNode(): NearMenu          // expose the underlying NearMenu for tweaks
    dispose(): void
}
```

The `NearMenu` comes with a default `FollowBehavior`. Constructor
forces `defaultDistance = minimumDistance = maximumDistance = 3.5`
(lines 33–36) — so the menu sits exactly 3.5 units in front of the
camera, no closer, no further.

Used by:
- `HandMenu`'s gaze-activated transport menu (see below)
- Per-Node3D menus opened through
  [`N3DMenuInstance.openMenu`](../src/node3d/instance/utils/N3DMenuManager.ts)
  (the implementation of `Node3DContext.openMenu`)

### `HandMenu` ([HandMenu.ts](../src/menus/HandMenu.ts))

A small cube parented to the **left controller** that spawns a
gaze-activated `SimpleMenu` with Start/Stop transport buttons.

The full lifecycle:

| Step | Line | What |
|---|---|---|
| Build a 0.05×0.005×0.10 box parented to the left controller | 30–37 | `attachToLeftController()` then offsets Y +0.02, Z -0.05 |
| `gazeBehavior.activationDelay = 500` | 40 | Half-second hold to activate |
| `onCustomCheck` predicate | 42–67 | Compute the controller's local +Z direction in world space, dot-product with the camera direction. If `> 0.3`, the controller is roughly facing the player — only then does gaze count. Stops the menu from popping up when the user is holding the controller naturally |
| `onGazeActivated` | 69+ | Builds a `SimpleMenu("gaze-menu", ...)` with two buttons: **Start** → `WamTransportManager.start()`, **Stop** → `WamTransportManager.stop()` |

`WamTransportManager` is a separate singleton in
[`subs/PianoRoll/`](../src/node3d/subs/PianoRoll/WamTransportManager.ts)
that all WAM nodes register against to receive `wam-transport`
messages — start/stop of the global transport state. The HandMenu is
the front-end for it.

`HandMenu` is constructed by
[`XRManager._createHandMenu()`](../src/xr/XRManager.ts)
once the left controller is detected. On `EXITING_XR` /
`NOT_IN_XR`, `XRManager` disposes it and the cleanup detaches every
observer.

> **Note**: `HandMenu` uses `GazeBehavior` (the class from chapter
> [06](06-xr-input-and-behaviors.md#gazebehavior-gazebehaviorts)),
> not the head-pointer raycast. The `GazeBehavior` itself does the
> raycast — `onCustomCheck` only adds the "controller faces the
> player" gate.

---

## The shop / world UI

Two separate "shop" implementations co-exist:

1. **`world/menu/ShopPanel.ts`** — a 2D panel projected onto a 3D
   plane. Clipboard-aware. **Currently the active one** (it's what
   the right-controller `A` button toggles in `NewApp`).
2. **`world/shop/N3DShop.ts`** — a 3D physical shop, with a building
   model and a `N3DShopCamera`. **Currently dormant** — its
   instantiation in `NewApp.start` is wrapped in a comment block.
   Kept as future work / reference.

### `ShopPanel` ([ShopPanel.ts](../src/world/menu/ShopPanel.ts))

A 2×1m plane in 3D space, with a 1024×512 `AdvancedDynamicTexture` on
it. The texture renders a flat 2D UI: top bar with category +
sub-category buttons, body with a 4-column scrollable item grid and a
"clipboard" panel on the side.

```
┌────────────────────────────────────────────────┐
│  [Audio]  [MIDI]  [Automation]  [Other]  [...] │ ← top bar (categories)
│  [Generator] [Effect] [Instrument] [...]       │ ← sub-categories
├──────────────────────────────────┬─────────────┤
│  [Osc] [LivePiano] [Maracas] ...│ Clipboard   │
│  [Harp] [Sequencer] [PianoRoll] │             │
│  [Speaker] [...]                │ (matched    │
│                                  │  items)    │
│                                  │             │
└──────────────────────────────────┴─────────────┘
```

Item thumbnails come from `Node3DBuilder.getThumbnail(kind)` (see
chapter [02 §Node3DBuilder](02-app-core.md#node3dbuilder-node3dbuilderts))
— a small offscreen render of the GUI is cached into a
`TextureAtlas`, and each "item" button samples a UV slot from that
atlas. So you get real 3D thumbnails that match what you'll spawn.

Layout machinery (lines 31–83):

- `setItems(kinds)` — replace the right-side grid with the given list
  of kinds.
- `setSubMenu(selection, submenus)` — replace the second top-bar row
  with sub-category buttons, switching to the first option's items.
- `setMenu(selection, menus)` — replace the top-bar buttons. Picks
  the first option of the first sub-menu by default.

Categories are built from `factory.tags` — every tag becomes a
candidate category. The "menus → submenus → items" tree is computed
in the IIFE at line 110+ (not pasted here) by walking
`Node3DBuilder.FACTORY_KINDS`, fetching each factory's tags, and
binning them.

When the user clicks an item button, the panel emits
`MenuEventBus.CREATE_AUDIO_NODE` — see chapter
[02 §AppOrchestrator](02-app-core.md#apporchestrator-apporchestratorts).

The panel is toggled by the **right controller A button** at
[NewApp.ts:139-145](../src/app/NewApp.ts):

```typescript
InputManager.getInstance().a_button.onDown.add(()=>{
    if(!shopPanel){
        shopPanel = new ShopPanel(scene, ...utilityLayer.utilityLayerScene)
        shopPanel.makeFollow()
    }
    else shopPanel.toggle()
})
```

It renders into the `utilityLayer.utilityLayerScene` (a separate
overlay scene managed by `N3DShared`) so it doesn't z-fight with
world meshes.

### `N3DShop` (dormant) ([N3DShop.ts](../src/world/shop/N3DShop.ts))

The "physical building" shop. Loads a `.glb` model (a music shop
building) and arranges `N3DShopPreviewer` instances on its shelves.
Used to be activated in `NewApp.start` to spawn one large shop at
`(0, -1.5, 20)` and a smaller menu shop at `(0, -1.5, 60)` triggered
by the **left Y button**, but the entire block (lines 179–244 in
`NewApp.ts`) is commented out on this branch.

Three classes work together:

- `N3DShop` — the orchestrator. Has zones (`"camera"`, `"default"`),
  `BASE_OPTIONS`, and `BASE_SHOP_MODEL_URL` / `LARGE_SHOP_MODEL_URL`
  pointing at `.glb` files.
- `N3DShopCamera` — a third-person camera that follows the user
  through the shop.
- `N3DShopPreviewer` — a single instrument display in the shop,
  similar to `N3DPreviewer` but with shop-specific positioning.

Reactivate by uncommenting the parallel block at
[NewApp.ts:179-244](../src/app/NewApp.ts) — the assets
(`.glb` files) are still in `world/shop/`.

### `N3DPreviewer` ([N3DPreviewer.ts](../src/world/N3DPreviewer.ts))

A non-persisted, non-synced node3D preview that, when dragged far
enough, **becomes** a real `Node3DInstance`.

Construction (lines 30–37): just a `TransformNode` and stored args.
Most of the work is in `initialize()`:

| Step | Line | What |
|---|---|---|
| Look up the factory via `node3DManager.builder.getFactory(kind)` | 41 | Throws if not found |
| Build an impostor (the small thumbnail billboard) | 45 | `node3DManager.builder.createImpostor(kind)` |
| Create a per-instance `N3DHighlighter` | 50 | Doesn't share with the rest of the scene |
| `await factory.createGUI({...highlighter.binded(), ...shared})` | 51 | The full GUI, but disabled at start |
| Create a 1.1-unit hitbox box (or scaled up to `worldSize * SIZE_MULTIPLIER` if `inWorldSize`) | 57–60 | The clickable surface |
| Build a multi-line text label using `N3DText` | 63–68 | Shows label + description + tags |
| Attach `HoldableBehaviour` to the hitbox | 74–75 | When grabbed, kicks off a "pulse" animation |
| `onGrabObservable`: pulse animation | 77–85 | A tiny `setTimeout` loop that scales the hitbox up to `worldSize` over time while held |
| `onReleaseObservable`: spawn or no-op | 87–107 | If `dragDistance > 2 * hitbox.boundingBox.x`, **call `node3DManager.createNode3d(kind, position)`** with the released position; then reset the hitbox to origin. Otherwise just snap back |
| `InputHoverBehavior` adds green highlight + shows the text | 109–121 | Hover feedback |
| Distance-based LOD | 123–133 | Every 100ms, if the camera is more than 5 units away, swap the GUI for the cheap impostor billboard. Closer than that, show the real GUI |

Useful callbacks for callers:
- `on_start_drag()` — pulse begins
- `on_drop(node3d)` — successful spawn
- `on_no_drop()` — released too close

### `Node3DStand` ([Node3DStand.ts](../src/world/Node3DStand.ts))

A wooden stand `.glb` with a `N3DPreviewer` on top. Combines
`stand.glb` + a previewer placed at the model's `placement` mesh.

| Step | Line | What |
|---|---|---|
| Import `stand.glb` | 25 | Returns the imported root |
| Find children "stand" and "placement" | 26–27 | The visible stand mesh and an empty marker for the previewer position |
| Create + initialize an `N3DPreviewer` | 29–30 | |
| Position the previewer at the placement marker | 32–35 | Copy position, rotation, quaternion |
| Reparent the stand mesh to `this.root` | 37 | |
| Dispose the placement marker and the import root | 39–40 | We only kept the stand mesh and the previewer |

Plus a helper `createStandCollection(shared, node3DManager)` (lines
52–67) that builds four hardcoded stands — `livepiano`, `maracas`,
`audiooutput`, `oscillator` — laid out alternating left and right
along the X axis. Used as a quick "tutorial / starter island" for new
players. Currently not wired into `NewApp` (see the commented-out
block).

### `ScrollWall` ([ScrollWall.ts](../src/world/ScrollWall.ts))

A scrollable wall of stands. Not currently wired into the app on this
branch but kept as a reference. If you want a "wall of every
instrument" UI, this is the file to revive.

### `AsyncLoading` ([AsyncLoading.ts](../src/world/AsyncLoading.ts))

The little spinner that shows up when a Node3D is being created.

Exported as an object with three methods:

| Method | What |
|---|---|
| `create(scene, promise)` | Returns `{ root, promise }`. The root has a spinning instanced mesh until `promise` resolves. On resolve, the mesh is disposed and the result is returned. On reject, a red cross briefly replaces the spinner for 5 seconds, then disappears, and `null` is returned |
| `getLoading(scene)` | Lazy-creates a circle-of-points polygon mesh used as the spinner template. Cached on the scene |
| `getCross(scene)` | Lazy-creates a red X polygon mesh used for errors. Cached on the scene |

The spinner is a `CreatePolygon` from a 28-point profile that draws a
notched circle; the cross is a 12-point X. Both are baked into a
shared parent mesh, then `createInstance()`'d when used — so spawning
the spinner is essentially free.

`Node3dManager.createNode3d` wraps the spawn promise in
`AsyncLoading.create` so you see the spinner at the spawn position
while the factory is fetched and the node initializes — see
[Node3dManager.ts:69](../src/app/Node3dManager.ts).

---

## Visual ground & soundwaves

### `WaveGround` ([WaveGround.ts](../src/world/ground/WaveGround.ts))

The animated floor. A 30×30 grid of cells where each cell stores
amplitude/RGB; when an instrument plays, it can "punch" the grid at a
position with a colour, producing a propagating ripple.

`SceneManager._createGround` (chapter [02](02-app-core.md#scenemanager-scenemanagerts))
creates one of these and runs it:

- `setInterval(() => waveGround.update(), 50)` ticks the simulation.
- `setInterval(() => waveGround.put(rand, rand, rand, rand, rand), 200)`
  injects random ripples for ambience.

Instruments inject ripples through
`Node3DContext.sendSignal(position, r, g, b)`
([Node3DInstance.ts:166-169](../src/node3d/instance/Node3DInstance.ts)),
which calls `waveGround.putWorldSpace(...)`. `SpeakerN3D` does this
on every audible "bounce" of the analyser (see chapter
[04 §SpeakerN3D](04-instruments-catalog.md#speakern3d)).

### `WaveSimulator` ([WaveSimulator.ts](../src/world/ground/WaveSimulator.ts))

The pure simulation logic for `WaveGround` — keeps amplitudes and
RGB on a 2D grid, runs the propagation step. No Babylon meshes.
Separated out so the simulation can be unit-tested without a scene.

### `ReactiveBlockGround` ([ReactiveBlockGround.ts](../src/world/ground/ReactiveBlockGround.ts))

An alternative ground style — blocks that pop up reactively to
audio. Not currently used by `SceneManager` but kept as an option.

### `SoundwaveEmitter` ([SoundwaveEmitter.ts](../src/world/soundwave/SoundwaveEmitter.ts))

The other half of the visual feedback: when a node calls
`sendSignal(position, r, g, b)`, the emitter spawns a circular ripple
mesh that expands outward from `(position.x, position.z)` with the
colour `(r, g, b)`, then fades. Created in `SceneManager` at line 155:

```typescript
this.soundwaveEmitter = new SoundwaveEmitter(this.scene, -2 + 0.5 + 0.1, 80)
```

— y position just above the ground, max radius 80 units.

---

## Connection visuals

### `VisualTube` ([VisualTube.ts](../src/visual/VisualTube.ts))

The visual cable mesh. `N3DConnectionInstance` builds its own tube
internally for the actual audio/MIDI wires (see chapter
[03](03-node3d-system.md#n3dconnectioninstance)), but `VisualTube` is
the **standalone, network-synced** version used for:

1. The **preview tube** the user sees while dragging a connection
   from a port. Created by `iomanager/ConnectionManager` on `IO_CONNECT`
   `pickType: "down"`, follows the pointer, disposed on `up` or
   `out`.
2. Future "decorative" tubes (currently only the preview path uses
   it).

| Member | Line | What |
|---|---|---|
| `tube`, `arrow` | 14, 15 | The cylinder + cone meshes |
| `set(a, b)` | 53 | Debounced 10ms — recomputes tube/arrow transforms from a→b. Tube takes `totalLength - arrowLength`, arrow takes the rest. Tube is rotated so its Y axis aligns with `b - a` (`Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, ...)`)|
| `move(a, b)` | 88 | Public API. Calls `set` and broadcasts the new `position` state |
| `setColor(color: Color4)` | 93 | Vertex-color both meshes, broadcast `color` state |
| `dispose()` | 99 | Tear down |
| `initSync / disposeSync / askStates / setState / getState / removeState` | 109–141 | The `Synchronized` contract |
| `static getSyncManager(scene, doc)` | 148 | Builds the `SyncManager<VisualTube>` used by `VisualNetwork` |

State keys: `"position"` (an array of two `[x,y,z]` arrays) and
`"color"` (an `[r,g,b,a]` array).

The class also accepts an optional `onMesh: (mesh) => void` callback
to lazily configure the meshes — `iomanager/ConnectionManager` uses it
to set the preview tube's `isPickable = false` so the user can't
accidentally click their own preview line.

### `VisualRope` ([VisualRope.ts](../src/visual/VisualRope.ts))

A rope variant with multiple segments — used for visualising chains
or curved cables. Currently unused on this branch but kept for future
work.

---

## `iomanager/ConnectionManager` — the wire-drawing logic

Despite the name, this is **not** the same `ConnectionManager` as the
one in [`network/`](../src/network/) on older branches.
That older one no longer exists. This one is a different class
entirely: it listens for `IOEventBus.IO_CONNECT` events and
implements the "click an output, drag to an input, release to connect"
gesture.

| Member | Line | What |
|---|---|---|
| `currentPort: N3DConnectableInstance \| null` | 12 | The port the user clicked |
| `disposePreview: (() => void) \| null` | 18 | Cleanup for the in-flight preview tube |
| `static initialize()` / `getInstance()` | 28 / 32 | Standard singleton |
| `private onIOEvent()` | 38 | Subscribe to `IOEventBus.IO_CONNECT` |
| `private connectHandler({pickType, pointer, connectable})` | 52 | The state machine — see below |
| `connect(nodeA, nodeB, id?)` | 89 | Public API to programmatically wire two ports — used by `Serialization.load` to restore saved graphs |

### The wire-drawing state machine

```
state: idle  (currentPort = null)
   │
   │ user trigger-down on a port
   ▼
state: dragging
   - currentPort = the picked port
   - spawn a VisualTube via NetworkManager.visual.tubes.add(...)
     (so other peers see the preview line too)
   - color it the same as currentPort
   - on every pointer.onMove, set tube endpoints to (currentPort.mesh.absolutePosition, pointer.target)
   │
   ├── user trigger-up on another port
   │     ▼
   │   call this.connect(currentPort, otherPort)
   │     - new N3DConnectionInstance(scene, nodes, connections, ui)
   │     - connection.set(currentPort, otherPort)   // does the validation cascade
   │     - if !connection.isConnecting (validation failed), connection.dispose()
   │     - otherwise NetworkManager.node3d.connections.add(...) so all peers see it
   │   _cancelAndResetConnection()  ← also disposes the preview
   │     ▼
   │   state: idle
   │
   └── user trigger-up off any port (pickType === "out")
         ▼
       _cancelAndResetConnection()  ← disposes preview, clears currentPort
         ▼
       state: idle
```

The neat bit: the preview tube goes through `NetworkManager.visual.tubes`
([line 65](../src/iomanager/ConnectionManager.ts)), so
**other players see your preview line too** while you drag. When you
release without connecting, the `disposePreview()` removes it from the
shared map, which propagates to peers.

---

## Where to go next

- The **plugin contract** that `N3DPreviewer` stamps out instances of
  is [03 — Node3D system](03-node3d-system.md).
- The **automation/gaze/voice** controllers that use `InputManager.head`
  (the same mechanism that powers `HandMenu`'s gaze) are in
  [04 — Instruments](04-instruments-catalog.md#automation-controllers).
- The **save/load** system that uses
  `iomanager/ConnectionManager.connect` is
  [02 §Serialization](02-app-core.md#serialization-serializationts).
