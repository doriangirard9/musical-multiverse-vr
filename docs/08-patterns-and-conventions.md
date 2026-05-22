# 08 — Patterns & conventions

This chapter is the cross-cutting view: **what design patterns appear
again and again**, **what TypeScript techniques are used**, and **what
naming/code conventions** the codebase follows. After reading this you
should be able to recognise an idiomatic addition vs a foreign one.

## The patterns at a glance

| Pattern | Where it shows up |
|---|---|
| Singleton | All app-wide managers (chapter [02 §Singleton discipline](02-app-core.md#singleton-discipline)) |
| Factory | [`Node3DBuilder`](../src/Refactoring/app/Node3DBuilder.ts), `Node3DFactory<G, T>` for plugins |
| Strategy | [`GridStrategy`](../src/Refactoring/node3d/subs/PianoRoll/grid/GridStrategy.ts) (PianoRoll layouts), the four connection protocols (Audio / MIDI / Automation / Sync) |
| Builder / Composite | `Node3DInstance` constructing parameter, button, connectable instances; the `BoundingBox` + `HoldableBehaviour` + `FullHoldBehaviour` stack |
| Observer / typed Event Bus | [`BaseEventBus<T>`](../src/Refactoring/eventBus/BaseEventBus.ts), Babylon `Observable<T>` everywhere |
| Mediator | [`AppOrchestrator`](../src/Refactoring/app/AppOrchestrator.ts), [`iomanager/ConnectionManager`](../src/Refactoring/iomanager/ConnectionManager.ts) |
| Template Method | The `Synchronized` contract (`initSync` / `askStates` / `setState`) |
| Adapter | [`ButtonInput`](../src/Refactoring/xr/inputs/ButtonInput.ts) bridging XR + keyboard, [`ControllerInput`](../src/Refactoring/xr/inputs/ControllerInput.ts) bridging XR + mouse + keyboard |
| Behavior composition | Babylon `Behavior<T>` chained via constructor injection (`HoldableBehaviour` → `FullHoldBehaviour` → `MoveHoldBehaviour`/`RotateHoldBehaviour`) |
| Registry | [`SyncManager<T, D>`](../src/Refactoring/network/sync/SyncManager.ts) — generic id→instance store with CRDT mirroring |
| Decorator-by-callback | Mesh action triggers register inline closures rather than separate handler classes — see `N3DConnectableInstance`, `N3DButtonInstance` |
| LOD / Impostor | [`N3DPreviewer`](../src/Refactoring/world/N3DPreviewer.ts) swaps a billboard for the real GUI based on camera distance |

The rest of the chapter unpacks the most distinctive ones.

---

## Singleton (with explicit two-phase init)

Almost every class in `app/` follows the same shape:

```typescript
export class FooManager {
    private static _instance: FooManager | null = null
    private constructor(/* args */) { ... }

    public static initialize(/* args */): void {           // explicit init
        FooManager._instance = new FooManager(/* args */)
    }

    public static getInstance(): FooManager {              // safe accessor
        if (!FooManager._instance)
            throw new Error("FooManager not initialized. Call initialize() first.")
        return FooManager._instance
    }
}
```

Three properties:

1. **Private constructor** — `new FooManager()` is a compile error
   outside the class.
2. **Lazy `_instance`** — null until set. `getInstance()` throws if
   not initialized rather than silently constructing one.
3. **Two-phase init** — boot order is enforced by `await`s in
   `NewApp.start()`. Once the boot completes, `getInstance()` is
   synchronous and ubiquitous.

Variants:

- **Lazy first-call init** — `WamInitializer.getInstance(audioCtx?)` and
  `Serialization.getInstance()` build the instance on the first call.
  Used when the dependency graph forces it.
- **Renamed to `get()`** — `NewApp.get()` is the only short form.
  Probably for readability at the call site (`NewApp.get().controlsUI`
  reads better than `getInstance()`).
- **`Instance` getter** — `XRControllerManager.Instance` (capital I)
  uses a getter rather than a method. One-off; the rest of the
  codebase uses the method form.

**Don't construct managers manually** outside `initialize`. If you
need a multi-instance variant, either: (a) make the underlying
class non-singleton and wrap a singleton manager around it (like
`Node3dManager` wrapping `Node3DBuilder`), or (b) move the per-instance
state into a different class.

---

## Factory (the `Node3DFactory<G, T>` plugin contract)

`export const FooN3DFactory: Node3DFactory<...>` is **the** way new
instruments register themselves. The factory is a value, not a class —
you don't `new` it. See chapter
[03 §Plugin contract](03-node3d-system.md#the-plugin-contract-declarations).

The factory has four fields (`label`, `description`, `tags`,
`createGUI`, `create`) — that's the entire public contract. A
contributor adding a new instrument touches only these and the two
classes they instantiate (`Node3DGUI`, `Node3D`).

The host's
[`Node3DBuilder`](../src/Refactoring/app/Node3DBuilder.ts) is itself a
factory of factories, dispatching by `kind` string. It's the only
place that "knows" the registered builtins.

For the variant that takes constructor arguments (e.g.
`HarpN3DFactory(count: number)`), you define a class that implements
`Node3DFactory<G, T>` and create static instances on it
(`HarpN3DFactory.DEFAULT`, `HarpN3DFactory.LARGE`).

---

## Strategy

Two clear examples:

### `GridStrategy` for PianoRoll

The 16-column note grid in `PianoRoll3d.ts` doesn't know whether
it's a piano or a drum machine. It asks a `GridStrategy` for the row
count, row labels, MIDI numbers, and colours. Two strategies ship
([Piano88Strategy.ts](../src/Refactoring/node3d/subs/PianoRoll/grid/Piano88Strategy.ts),
[DrumPadsStrategy.ts](../src/Refactoring/node3d/subs/PianoRoll/grid/DrumPadsStrategy.ts)).
Adding a new layout (e.g. "guitar", "modal scale") = implement
`GridStrategy`, no editor changes.

### Four connection protocols

Audio / MIDI / Automation / Sync connectables all implement the same
`Node3DConnectable` interface but with different "connection object"
shapes. The host doesn't care which protocol — it routes the same
sequence (`connectAsInput` → `connectAsOutput`) regardless. Adding a
new protocol (e.g. a "video stream" connectable, or a "string of
text" connectable) = define a new namespace in `tools/connectable/`
that implements `Node3DConnectable`, and re-export it from
[`tools/index.ts`](../src/Refactoring/node3d/tools/index.ts).

---

## Observer / Event Bus

Two flavours of observer in this codebase:

### Babylon `Observable<T>`

The hot path. Used everywhere:
[`InputManager.onTriggerChange`](../src/Refactoring/xr/inputs/InputManager.ts),
[`HoldableBehaviour.onMoveObservable`](../src/Refactoring/behaviours/boundingBox/HoldableBehaviour.ts),
[`PointerInput.onMove`](../src/Refactoring/xr/inputs/PointerInput.ts), etc.

Idioms:
- Public field `readonly someObs = new Observable<EventType>()`
- Subscribe with `someObs.add(callback)`, returns an `Observer` you
  call `.remove()` on later (or `someObs.remove(observer)`).
- Notify with `someObs.notifyObservers(event)`.

### The typed event bus (`BaseEventBus<T>`)

The cool path. A small typed pub/sub
([source](../src/Refactoring/eventBus/BaseEventBus.ts)):

```typescript
export class BaseEventBus<T extends object> {
    private listeners: Map<keyof T, Function[]> = new Map()

    emit<K extends keyof T>(event: K, payload: T[K]): void { ... }
    on<K extends keyof T>(event: K, callback: (payload: T[K]) => void): () => void { ... }
    off<K extends keyof T>(event: K, callback: (payload: T[K]) => void): void { ... }
}
```

Six concrete buses extend it (Audio / Network / Menu / UI / IO /
NetworkEvent), each with its own `Payload` type. The `<K extends
keyof T>` generic at every call site is what makes adding a new event
trivially type-safe: extend the payload type, and TypeScript points
at every emit/on call that needs a new branch.

`on()` returns its own unsubscribe function (line 27) — the
recommended idiom is:

```typescript
const unsubscribe = bus.on('AUDIO_NODE_CREATED', payload => { ... })
// later:
unsubscribe()
```

When to use which:

- **Babylon Observables** for tight per-frame stuff (input, render
  loop, mesh transforms). Lots of callers, few-event types per object.
- **Event buses** for cross-system events (UI ↔ audio ↔ network).
  The "spine" of the app — see chapter
  [02 §Event buses](02-app-core.md#event-buses) for the full catalog.

---

## Mediator

[`AppOrchestrator`](../src/Refactoring/app/AppOrchestrator.ts) is the
canonical example: it holds no state, just listens to the menu bus
and dispatches into managers. If a new "the user did X, the system
should respond by Y" wiring crosses subsystems, this is the file to
add it to.

[`iomanager/ConnectionManager`](../src/Refactoring/iomanager/ConnectionManager.ts)
is a domain-specific mediator for one specific gesture (the
"drag-from-port-to-port" wire-up). State machine of three states (idle
/ dragging / connected) on top of three event types (`down` / `up` /
`out`).

---

## Template Method (`Synchronized`)

The `Synchronized` interface
([source](../src/Refactoring/network/sync/Synchronized.ts)) is a
classic template method:

- The host calls `initSync(id, set_state, remove_state)` to give you
  the broadcast handles.
- The host calls `askStates()` — you respond by calling `set_state`
  for each initial key.
- When state changes locally, you call `set_state(key)` — the host
  fetches the value via `getState(key)` and broadcasts.
- When a remote peer changes state, the host calls
  `setState(key, value)` on you.
- The host calls `disposeSync()` to teach you to detach.

Three classes implement it:
[`Node3DInstance`](../src/Refactoring/node3d/instance/Node3DInstance.ts),
[`N3DConnectionInstance`](../src/Refactoring/node3d/instance/N3DConnectionInstance.ts),
[`VisualTube`](../src/Refactoring/visual/VisualTube.ts).

If you write a new Synchronized class, follow the same template — and
expose a `static getSyncManager(scene, doc, ...)` factory (the
codebase's convention) to build the registry.

---

## Adapter (input unification)

[`ButtonInput`](../src/Refactoring/xr/inputs/ButtonInput.ts) is an
adapter that gives keyboard and XR-button events the same observable
surface (`onChange / onDown / onUp / onTouch / onUntouch`). The
keyboard side has no `touch` concept, but the abstract event always
has a `touched` boolean — for keyboard it just mirrors `pressed`.

[`ControllerInput`](../src/Refactoring/xr/inputs/ControllerInput.ts)
goes further: same interface for XR controllers, mouse-driven
"screen controller", and per-hand keyboard fallback (left = QDZS,
right = arrows). Behaviors written against `ControllerInput` work in
all three contexts without modification.

This is what makes desktop development feasible — `npm run dev` with
no headset plugged in still gives you a working keyboard +
mouse-mapped left and right "controllers."

---

## Behavior composition (Babylon `Behavior<T>`)

Babylon's `Behavior<T>` is `{ name, init, attach, detach }` — a
pluggable component that can be added to a `TransformNode` or
`AbstractMesh`. The codebase uses it heavily:

```
Mesh
 ├─ ShakeBehavior           ← composes InputGrabBehavior internally
 │   └─ InputGrabBehavior
 ├─ HoldableBehaviour       ← creates FullHoldBehaviour on grab
 │   └─ InputGrabBehavior   (under the hood)
 │   └─ FullHoldBehaviour
 │       └─ MoveHoldBehaviour   (when not squeezing)
 │       └─ RotateHoldBehaviour (when squeezing)
 └─ InputHoverBehavior      ← independent hover hook
```

A behavior holds a reference to its target mesh in `attach`, sets up
its observables, and detaches cleanly in `detach` (or when the mesh
is disposed). Behaviors compose by **adding more behaviors to the
target** rather than by deriving classes — `HoldableBehaviour.grab()`
calls `target.addBehavior(new FullHoldBehaviour(pointer))`.

Three rules of thumb:

1. **A behavior should be re-attachable**. `detach` must perfectly
   undo `attach`, so you can `.removeBehavior()` and add a new one
   with no leftover observers or meshes.
2. **One behavior per concern**. Don't roll grab + hover + drop into
   one class — compose them.
3. **Hold the target reference yourself**. Babylon's `Behavior<T>`
   gives you the target in `attach(target)`; cache it in a private
   field for use in observable callbacks.

Plugins (Node3Ds) **don't normally write their own Babylon
`Behavior<T>` classes** — they consume the existing primitives via
`context.addToBoundingBox(mesh)` (which sets up grab/move/rotate),
parameter creation (which sets up `SixDofDragBehavior`), and so on.
Writing a new behavior is the right thing only when you need a new
*kind* of input gesture.

---

## Registry (`SyncManager<T, D>`)

`SyncManager` deserves its own callout because it's both a generic
data structure (id → instance) and a CRDT bridge. See chapter
[05 §SyncManager](05-networking-and-sync.md#the-generic-syncmanagert-d)
for the full anatomy.

The interesting design choice is that the **same class** handles
both the "I added an instance locally" path and the "a remote peer
added an instance" path. The local path goes through `add(id,
instance, data)`; the remote path goes through `add_from_network`
(triggered by a Yjs map observer). They both end up with the same
`instances`, `reverse_instances`, observers, and side effects —
the API user doesn't have to know which side they're on.

That symmetry is also what lets `Serialization.load`
([Serialization.ts](../src/Refactoring/app/Serialization.ts)) work:
it just calls `Node3dManager.createNode3d` for each saved node, the
spawn flows through the local `add` path, and remote peers see the
same nodes via their `add_from_network` path. No custom
"replay-to-network" code needed.

---

## TypeScript techniques

### Generic event payloads

[`BaseEventBus<T extends object>`](../src/Refactoring/eventBus/BaseEventBus.ts):

```typescript
emit<K extends keyof T>(event: K, payload: T[K]): void
on<K extends keyof T>(event: K, callback: (payload: T[K]) => void): () => void
```

Every concrete bus declares its payload as a type alias and TypeScript
checks every call site. Adding a new event = one line edit to the
payload type.

Same trick on `SyncManager<T, D>`:
- `T extends Synchronized` constrains the instance to support sync.
- `D extends SyncSerializable | undefined = undefined` makes the
  data parameter optional with a sensible default.

### Declaration files (`.d.ts`) for plugin contracts

[`Node3D.d.ts`](../src/Refactoring/node3d/Node3D.d.ts),
[`Node3DContext.d.ts`](../src/Refactoring/node3d/Node3DContext.d.ts),
etc. are pure TypeScript declaration files — no runtime code, just
interfaces. The actual implementations live in `instance/`. This
split is what makes the plugin contract a *contract*: a plugin
author imports only the `.d.ts` interfaces, can't accidentally
depend on host implementation details.

### Dynamic `import(/* @vite-ignore */ url)`

[`WamInitializer.initWamInstance`](../src/Refactoring/app/WamInitializer.ts)
and `Node3DBuilder` use `import(/* @vite-ignore */ wamUrl)` to load
WAM bundles at runtime from URLs Vite can't see at build time. The
`@vite-ignore` comment tells Vite "don't try to resolve this URL —
trust me, it'll work at runtime."

### `Map`-based registries with reverse lookups

`SyncManager` keeps both `instances: Map<string, T>` and
`reverse_instances: Map<T, string>`. So `getId(instance)` is O(1).
Same in `Node3DInstance.parameters / buttons / connectables` —
keyed by string id, but you can iterate to find by reference if
needed.

### `Promise.race` for timeouts

[`utils.ts:withTimeout`](../src/Refactoring/utils/utils.ts) — race
the actual work against a `setTimeout`-driven promise. If `fallback`
is provided, resolve to it on timeout; otherwise reject. Used in
`XRManager` to avoid hanging on a missing controller and in
`SyncManager.get()` to bound the wait for a remote-arriving instance.

### Observable lifetime tied to `Node`

[`utils.ts:usingWith(node, observer)`](../src/Refactoring/utils/utils.ts)
attaches an observer's lifetime to a Babylon `Node`'s
`onDisposeObservable` — when the node disposes, the observer's
`.remove()` runs automatically. Used by
[`GazeControllerN3D`](../src/Refactoring/node3d/subs/automation/GazeControllerN3D.ts)
to detach its gaze listener cleanly.

For the more general case, the
[`Node3DContext.observe(observable, observer)`](../src/Refactoring/node3d/Node3DContext.d.ts)
method does the same thing for plugins — every observer registered
through `context.observe(...)` is automatically removed when the
Node3D disposes (see
[Node3DInstance.ts:192-196](../src/Refactoring/node3d/instance/Node3DInstance.ts)).

### `@ts-ignore` and `@ts-nocheck`

Used sparingly and only at necessary boundaries:

- `@ts-ignore` over WebXR controller type assertions (the WebXR API
  in TypeScript has a few `null`-might-be-defined edge cases).
- `@ts-nocheck` at the top of
  [`TemplateN3D.ts`](../src/Refactoring/node3d/subs/TemplateN3D.ts) so
  the (intentionally empty) skeleton compiles. The comment above it
  says to remove the directive when you copy the file.

Don't add new `@ts-ignore` / `@ts-nocheck` casually — the codebase
otherwise compiles cleanly.

---

## Naming & file conventions

### Folders

```
src/Refactoring/
    app/           singletons, bootstrap
    eventBus/      typed pub/sub
    node3d/        plugin contract + runtime + instruments
        instance/      runtime classes (host side)
            utils/         per-instance helpers (Highlighter, Text, MenuManager)
        tools/         exposed to plugins via context.tools
            connectable/  the four connection protocols
            utils/         host-internal helpers
        subs/          concrete instruments — one folder per multi-file family
    network/       Yjs + WebRTC + sync
        sync/          generic SyncManager
    xr/            WebXR session + input
        inputs/        unified input layer
            tools/         input-derived behaviors
    behaviours/    domain-specific Babylon Behaviors
        boundingBox/  the drag/move/rotate stack
    menus/         3D menus (HandMenu, SimpleMenu)
    world/         non-instrument scene objects
        menu/          ShopPanel
        shop/          dormant 3D-shop classes
        ground/        WaveGround / WaveSimulator / ReactiveBlockGround
        soundwave/     SoundwaveEmitter
    visual/        VisualTube, VisualRope
    iomanager/     ConnectionManager (the wire-drawing one)
    wamExtensions/ extensions installed on window.WAMExtensions
        notes/
        patterns/
    shared/        SharedTypes
    utils/         general helpers (utils, atlas, async, auto_dispose)
```

### File names

- `*.d.ts` — declaration only, no runtime. Used for plugin contracts.
- `*Manager.ts` — singleton orchestrator.
- `*N3D.ts` — a concrete instrument (Node3D).
- `*N3DGUI`, `*N3D`, `*N3DFactory` — the three classes a single
  instrument exports. Always together, always in the same file (or
  same folder for multi-file ones like PianoRoll, DrumKit).
- `N3D*Instance.ts` — host-side runtime wrappers
  (`N3DConnectableInstance`, `N3DParameterInstance`, etc.).
- `Input*.ts` / `*Input.ts` — input layer types.
- `*Behavior.ts` / `*Behaviour.ts` — Babylon `Behavior<T>`
  implementations. Both spellings exist (`ShakeBehavior` vs
  `HoldableBehaviour`); not consistent. Match the existing file's
  spelling when editing one.

### Class member style

- `private` over `protected` — most classes don't expect to be
  subclassed.
- `private static readonly DEBUG_LOG = false` — opt-in per-class
  debug logging. Toggle to `true` to trace.
- `_underscore` prefix on private members, especially when the public
  one is the same name without (`_scene` private, `getScene()`
  public). Not 100% consistent.
- `readonly` on most public fields that aren't expected to be mutated.

### Imports

- `import * as B from "@babylonjs/core"` is common — Babylon has too
  many exports to enumerate. The convention is `B` for `@babylonjs/core`,
  `GUI` for `@babylonjs/gui`, `T` for the destructured `tools` from
  `Node3DContext`.
- `.ts` extensions in import paths — e.g.
  `from "./SceneManager.ts"`. Required by the project's TypeScript +
  Vite setup.

### Comments

- French comments are common (the project originated at
  Université Côte d'Azur). Don't translate them when editing — match
  the surrounding language.
- `TODO:` markers are kept around as known issues. Two specific ones
  to know about:
  - [AudioOutputN3D.ts:55](../src/Refactoring/node3d/subs/AudioOutputN3D.ts) and
    [SpeakerN3D.ts:145](../src/Refactoring/node3d/subs/speaker/SpeakerN3D.ts)
    note that `audioCtx.listener` is global and shouldn't be
    written from a Node3D.
  - [PlayerNetwork.ts:11](../src/Refactoring/network/PlayerNetwork.ts)
    notes that `PlayerNetwork` should be ported to use `SyncManager`.

### `console.log` policy

[`src/index.ts:5-12`](../src/index.ts) patches `console.log` to drop
single-number logs (the wam3dgenerator memory-allocation noise).
Single-number logs from your code will also disappear silently — if
you need to log a number, wrap it in an object: `console.log({n})`.

---

## Common idioms to copy

### "Scene-bound singleton resource"

Lazy-create a mesh template and stash it on the scene to avoid
recomputation. See [`AsyncLoading.store`](../src/Refactoring/world/AsyncLoading.ts):

```typescript
store<T>(obj: any, name: string, factory: () => T): T {
    if (obj[name]) return obj[name]
    const value = factory()
    obj[name] = value
    return value
}
```

Used to lazy-build the spinner and cross meshes once per scene.

### "Debounced rebuild"

Multiple events arrive; coalesce into one rebuild. See
[`Node3DInstance.updateBoundingBox`](../src/Refactoring/node3d/instance/Node3DInstance.ts)
or [`VisualTube.set`](../src/Refactoring/visual/VisualTube.ts) — if
already pending, skip; otherwise schedule a `setTimeout(..., 0|10|20)`
and clear the flag in the callback.

### "Disposable returning a `{ remove(): void }`"

Subscribe-style functions return an object with `.remove()` rather
than a bare cleanup function. See `ButtonInput.setPressInterval`
([line 51](../src/Refactoring/xr/inputs/ButtonInput.ts)),
`InputVisualPointer.CreateSimple`
([line 72](../src/Refactoring/xr/inputs/tools/InputVisualPointer.ts)),
etc. The shape is uniform across the codebase, which lets utilities
like `usingWith` work universally.

### "Boundary serialization"

Plain JSON at every network boundary. `Position3D` (a plain object
with x, y, z) is the wire format; `Vector3` (with methods) is the
runtime form. Convert at the seam:

```typescript
// outgoing
const state = { position: vector3.asArray(), rotation: quaternion.asArray() }

// incoming
position.fromArray(state.position)
rotation.fromArray(state.rotation)
```

`Vector3.asArray() / fromArray()` are Babylon helpers.

---

## Where to go next

- The **end-to-end recipes** that put these patterns to work are in
  [09 — Contributor guide](09-contributor-guide.md).
- A **flat index** of every file appears in
  [10 — File reference](10-file-reference.md).
