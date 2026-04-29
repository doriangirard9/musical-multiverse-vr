# 09 — Contributor guide

Recipes. If you've read chapters [01](01-architecture-overview.md) –
[08](08-patterns-and-conventions.md), this is the chapter that says
"now do."

## Contents

1. [Add a new instrument (Node3D)](#1-add-a-new-instrument-node3d)
2. [Add a new automation controller](#2-add-a-new-automation-controller)
3. [Add a new behavior](#3-add-a-new-behavior)
4. [Add a menu](#4-add-a-menu)
5. [Sync a new networked object](#5-sync-a-new-networked-object)
6. [Add a new event-bus channel or event](#6-add-a-new-event-bus-channel-or-event)
7. [Use the WAM bridge to expose a third-party WAM](#7-use-the-wam-bridge-to-expose-a-third-party-wam)
8. [Local development reminders](#8-local-development-reminders)

---

## 1. Add a new instrument (Node3D)

Goal: create a new playable thing that appears in the
`ShopPanel` and lives in the world.

### Step 1 — Copy the template

```bash
cp src/Refactoring/node3d/subs/TemplateN3D.ts \
   src/Refactoring/node3d/subs/MyInstrumentN3D.ts
```

The template (chapter [03 §The canonical Hello world](03-node3d-system.md#the-canonical-hello-world--templaten3dts))
has three classes — GUI, Node3D, Factory — and a `@ts-nocheck` comment
at the top to keep the empty skeleton compiling. **Remove the
`@ts-nocheck`** as soon as you start filling things in, otherwise
TypeScript won't help you.

### Step 2 — Build the GUI

`Node3DGUI` lives in a unit cube `[-0.5, 0.5]^3`:

```typescript
export class MyInstrumentN3DGUI implements Node3DGUI {
    root: TransformNode
    worldSize = 1                // multiplied by 0.2 in-world

    base!: AbstractMesh          // the body, draggable via bounding box
    audioOutput!: AbstractMesh   // the visible port mesh
    knob!: AbstractMesh          // the parameter mesh

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        this.root = new B.TransformNode("MyInstrument root", context.scene)

        this.base = B.CreateBox("body", { size: 1 }, context.scene)
        this.base.parent = this.root
        T.MeshUtils.setColor(this.base, new B.Color4(0.4, 0.4, 0.4, 1))
        this.base.material = context.materialMat

        this.audioOutput = B.CreateSphere("output", { diameter: 0.4 }, context.scene)
        this.audioOutput.parent = this.root
        this.audioOutput.position.set(0.7, 0, 0)
        T.MeshUtils.setColor(this.audioOutput, T.AudioN3DConnectable.Color.toColor4())

        this.knob = B.CreateSphere("knob", { diameter: 0.3 }, context.scene)
        this.knob.parent = this.root
        this.knob.position.set(0, 0.4, 0)
    }

    async dispose() { /* the host disposes meshes via the bounding box; nothing else to do */ }
}
```

Use the shared materials from `context.{materialMat, materialShiny,
materialMetal, materialLight, materialTransparent}` for visual
consistency. Use `T.MeshUtils.setColor(mesh, color4)` to tint without
allocating a new material.

### Step 3 — Build the audio class

```typescript
export class MyInstrumentN3D implements Node3D {
    private audionode: GainNode

    constructor(context: Node3DContext, gui: MyInstrumentN3DGUI) {
        const { tools: T, audioCtx } = context

        // 1) the body becomes the drag handle
        context.addToBoundingBox(gui.base)

        // 2) build the actual audio graph
        const osc = audioCtx.createOscillator()
        osc.frequency.value = 440
        osc.start()

        const gain = this.audionode = audioCtx.createGain()
        gain.gain.value = 0.5
        osc.connect(gain)

        // 3) expose the output port
        context.createConnectable(
            new T.AudioN3DConnectable.Output(
                "audioOut", [gui.audioOutput], "Audio Out", gain
            )
        )

        // 4) expose the knob as a parameter — and (free!) as an automation input
        context.createParameter({
            id: "gain",
            meshes: [gui.knob],
            getLabel:    () => "Gain",
            getStepCount:() => 100,
            getValue:    () => gain.gain.value,
            setValue:    v => {
                gain.gain.value = v
                gui.knob.scaling.setAll(0.5 + v * 0.5)
                context.notifyStateChange("gain")
            },
            stringify:   v => `${(v * 100).toFixed(0)}%`,
        })
    }

    // 5) state sync — your synced keys.  "gain" already auto-syncs via
    //    the host's node3d_parameter_gain machinery (chapter 03), so you
    //    typically don't need to list it here.  Use this for state that
    //    isn't a parameter.
    getStateKeys() { return [] }
    async getState(key: string) { /* return value or undefined */ }
    async setState(key: string, value: any) { /* apply */ }

    async dispose() {
        this.audionode.disconnect()
    }
}
```

Two things to remember:

- **Always** `context.addToBoundingBox(...)` something visible — without
  it, your instrument can't be moved.
- Parameters are auto-synced via the host's `node3d_parameter_<id>`
  key (chapter [03 §State sync](03-node3d-system.md#state-sync)).
  You only need `getStateKeys / getState / setState` for state that
  *isn't* in a parameter (e.g. the recorded sample buffer in
  [`NoteBoxN3D`](04-instruments-catalog.md#noteboxn3d)).

### Step 4 — Build the factory

```typescript
export const MyInstrumentN3DFactory: Node3DFactory<MyInstrumentN3DGUI, MyInstrumentN3D> = {
    label: "My Instrument",
    description: "What it does in one sentence",
    tags: ["audio", "generator", "synth"],   // see chapter 03 for the vocabulary
    createGUI: async (ctx)      => new MyInstrumentN3DGUI(ctx),
    create:    async (ctx, gui) => new MyInstrumentN3D(ctx, gui),
}
```

### Step 5 — Register in `Node3DBuilder`

[`src/Refactoring/app/Node3DBuilder.ts`](../src/Refactoring/app/Node3DBuilder.ts)

```typescript
// at the top, with the other instrument imports:
import { MyInstrumentN3DFactory } from "../node3d/subs/MyInstrumentN3D.ts"

// inside the FACTORY_KINDS array (line ~45):
FACTORY_KINDS = [
    "audiooutput", "oscillator", /* ... */, "myinstrument",
    /* keep the spread expressions at the end */
]

// inside createFactories (line ~87), add a case:
if (kind == "myinstrument") return MyInstrumentN3DFactory
```

### Step 6 — Test

```bash
cd server-config && node server.js   # if not already running
npm run dev                           # in another terminal
```

Open the client. In the browser's keyboard shortcut, press **P** and
enter `myinstrument`. Your instrument should spawn at `(0, 0, 5)`.

If you want it in the `ShopPanel`'s shop list too, that's automatic —
the panel reads `Node3DBuilder.FACTORY_KINDS` and groups by tags
(chapter [07 §ShopPanel](07-menus-and-world.md#shoppanel)). Verify the
right A button opens the panel and your instrument is in one of the
tag categories.

### Step 7 — Verify multiplayer

Open a second tab on the same URL — it'll join the same Yjs room
(based on URL hash). The first tab spawns your instrument; the
second tab should mirror it. Drag the knob in tab 1; the value
should sync to tab 2.

If something doesn't sync:
- Make sure your `setValue` calls `context.notifyStateChange("gain")`.
- Make sure `getStateKeys()` includes any non-parameter state.
- Check the console for sync warnings (e.g. "Instance not found
  when sending changes" — usually means you removed something
  while changes were pending).

---

## 2. Add a new automation controller

Same as a regular instrument, but the output is automation, not
audio/MIDI.

```typescript
import { AutomationN3DConnectable } from "../tools"

const output = new T.AutomationN3DConnectable.Output(
    "myAutomationOut",        // id
    [gui.outputMesh],         // mesh(es)
    "My Automation",          // label
    0.5                       // default value
)
context.createConnectable(output)

// Now, somewhere, set the value based on whatever input you're tracking:
output.value = computed_value      // pushes to all connected inputs automatically
```

Tags should include `controller` and `automation`:

```typescript
tags: ["automation", "controller", "my_thing"]
```

Existing examples to copy from
([04 §Automation controllers](04-instruments-catalog.md#automation-controllers)):

- **Knob-driven**: [`AutomationControllerN3D`](../src/Refactoring/node3d/subs/automation/AutomationControllerN3D.ts)
- **3D position**: [`PositionCubeN3D`](../src/Refactoring/node3d/subs/automation/PositionCubeN3D.ts)
- **Gaze-driven**: [`GazeControllerN3D`](../src/Refactoring/node3d/subs/automation/GazeControllerN3D.ts)
- **Microphone**: [`VoiceVolumeControllerN3D`](../src/Refactoring/node3d/subs/automation/VoiceVolumeControllerN3D.ts)

### MultiInput case

If you want a parameter that **aggregates** multiple incoming
automations (e.g. average of three sources), use
`AutomationN3DConnectable.MultiInput` instead of `Input`:

```typescript
new T.AutomationN3DConnectable.MultiInput(
    "myParam", [mesh], "My Param",
    {
        setValue(values: number[]) {           // <-- now an array
            const avg = values.reduce((a, b) => a + b, 0) / values.length
            // apply avg
        },
        stringify, getStepCount, getName, lock,
    },
    /*maxConnections=*/ 4
)
```

---

## 3. Add a new behavior

A "behavior" here is a Babylon `Behavior<AbstractMesh>` — a reusable
piece of mesh interaction. Examples in the codebase:
`ShakeBehavior`, `GazeBehavior`, `HoldableBehaviour`,
`InputGrabBehavior`. Add one when you have a new gesture that
multiple meshes might want.

### The contract

```typescript
import { Behavior, AbstractMesh } from "@babylonjs/core"

export class MyBehavior implements Behavior<AbstractMesh> {
    name = "MyBehavior"

    // hooks the host can listen to:
    on_thing: () => void = () => {}

    private target!: AbstractMesh
    private observers: { remove(): void }[] = []

    init(): void {}                       // called once when added; usually empty

    attach(target: AbstractMesh): void {
        this.target = target
        // hook up observers — see below
    }

    detach(): void {
        for (const o of this.observers) o.remove()
        this.observers.length = 0
    }
}
```

### Plug into `InputManager`

Most behaviors react to input. Reach for `InputManager.getInstance()`
and the right observable:

| Want | Use |
|---|---|
| Trigger pressed *while pointing at me* | `InputGrabBehavior` (chapter [06 §xr/inputs/tools](06-xr-input-and-behaviors.md#the-xrinputstools-behaviours)) |
| Trigger pressed *anywhere*, with controller info | `InputPressBehavior` |
| Multiple controllers at once | `InputMultiPressBehavior` |
| Pointer entering/exiting my mesh | `InputHoverBehavior` |
| Per-frame pointer movement | Subscribe to `InputManager.{left,right,screen}.pointer.onMove` |
| Specific button | `InputManager.{x,y,a,b}_button.{onDown,onUp,onChange}` |
| Trigger or squeeze pressed | `InputManager.onTriggerDown` / `onSqueezeDown` |

Compose existing behaviors when you can. `ShakeBehavior` doesn't
re-implement grab — it constructs an `InputGrabBehavior` and adds it
to the same target on `attach`:

```typescript
attach(target: AbstractMesh): void {
    this.target = target
    target.addBehavior(this.grab)   // grab is an InputGrabBehavior
}
```

### Test it

Attach to any mesh:

```typescript
mesh.addBehavior(new MyBehavior())
```

The simplest sanity check: spawn an `OscillatorN3D`, attach your
behavior to its `boundingBoxMesh`, and exercise it.

---

## 4. Add a menu

If you need a menu of buttons, you almost always want
[`SimpleMenu`](../src/Refactoring/menus/SimpleMenu.ts) — it's the
generic 3D menu in this codebase.

```typescript
import { SimpleMenu } from "../menus/SimpleMenu"
import { UIManager } from "../app/UIManager"

const menu = new SimpleMenu("my-menu", UIManager.getInstance().getGui3DManager())
menu.setConfig({
    label: "My Menu",
    buttons: [
        { label: "Do thing", action: () => doThing() },
        { label: "Do other thing", action: () => doOther() },
    ],
})
// menu sits 3.5 units in front of the camera and follows it
// menu.dispose() to remove
```

For **per-Node3D menus**, use the
[`Node3DContext.openMenu(choices)`](../src/Refactoring/node3d/Node3DContext.d.ts)
method from inside your instrument's audio class. The host handles
disposal automatically when the node is removed.

For **toggleable HUD-like UI**, look at
[`ControlsUI`](../src/Refactoring/app/ControlsUI.ts) (a HUD bound to
controllers) or
[`ShopPanel`](../src/Refactoring/world/menu/ShopPanel.ts) (a flat 2D
panel on a plane). Both demonstrate the "create on first toggle,
toggle visibility on subsequent presses" pattern that
[NewApp.ts:139-145](../src/Refactoring/app/NewApp.ts) uses.

---

## 5. Sync a new networked object

If you have something other than a Node3D, a connection, or a visual
tube that needs to sync between players, implement `Synchronized` and
build a `SyncManager` for it.

### Step 1 — Implement the contract

```typescript
import { Synchronized } from "../network/sync/Synchronized"
import { SyncSerializable } from "../network/sync/SyncSerializable"

export class MyThing implements Synchronized {

    private myValue = 42
    public on_dispose = () => {}             // host hook for SyncManager

    // remember broadcast handles for use later:
    private set_state: (key: string) => void = () => {}

    // 1) host hands you a way to broadcast changes
    async initSync(_id: string, set_state: (key: string) => void) {
        this.set_state = set_state
    }

    // 2) host says "send me everything you have, initially"
    askStates(): void {
        this.set_state("value")
        // ... one set_state(key) per state key
    }

    // 3) you produce the value for a key
    async getState(key: string): Promise<SyncSerializable> {
        if (key === "value") return this.myValue
        return null
    }

    // 4) you accept a value from a remote peer
    async setState(key: string, value: SyncSerializable) {
        if (key === "value") this.myValue = value as number
    }

    // 5) optional: host removed a key
    async removeState(_key: string) {}

    // 6) host stops syncing — detach
    disposeSync(): void {
        this.set_state = () => {}
    }

    // your normal API:
    setValue(v: number) {
        this.myValue = v
        this.set_state("value")              // ← broadcasts
    }
}
```

### Step 2 — Provide a `static getSyncManager(...)` factory

Codebase convention: every `Synchronized` class exposes one. Mimic
[`VisualTube.getSyncManager`](../src/Refactoring/visual/VisualTube.ts)
(the simplest example):

```typescript
import { SyncManager } from "../network/sync/SyncManager"
import { Doc } from "yjs"

export class MyThing implements Synchronized {
    /* ... as above ... */

    static getSyncManager(scene: Scene, doc: Doc) {
        const mgr: SyncManager<MyThing, undefined> = new SyncManager({
            name: "my_things",                            // unique Yjs key
            doc,
            async create()      { return new MyThing(scene) },
            async on_add(inst)  { inst.on_dispose = () => mgr.remove(inst) },
            async on_remove(inst) { inst.dispose() },
        })
        return mgr
    }
}
```

### Step 3 — Hold the SyncManager somewhere

Add a field to one of the `*Network` classes (or build a new one).
For example, if it's a visual thing, extend
[`VisualNetwork`](../src/Refactoring/network/VisualNetwork.ts):

```typescript
export class VisualNetwork {
    readonly tubes
    readonly myThings              // <-- new

    constructor(readonly doc: Y.Doc) {
        const scene = SceneManager.getInstance().getScene()
        this.tubes = VisualTube.getSyncManager(scene, doc)
        this.myThings = MyThing.getSyncManager(scene, doc)
    }
}
```

### Step 4 — Use it

```typescript
const thing = new MyThing(scene)
NetworkManager.getInstance().visual.myThings.add(uuid(), thing)
// now thing changes are auto-broadcast
// and remote peers see thing too
```

See chapter [05 §SyncManager](05-networking-and-sync.md#the-generic-syncmanagert-d)
for the full mechanics — especially the `D` type parameter if you
want to attach extra data per-instance.

---

## 6. Add a new event-bus channel or event

### Adding an event to an existing bus

Edit the payload type at the top of the bus file:

```typescript
// AudioEventBus.ts
export type AudioEventPayload = {
    /* existing */
    AUDIO_NODE_CREATED: { nodeId: string, kind: string }
    /* etc. */

    /* new: */
    MY_NEW_EVENT: { fooId: string, count: number }
}
```

That's it. TypeScript will now allow:

```typescript
AudioEventBus.getInstance().emit("MY_NEW_EVENT", { fooId: "x", count: 1 })
AudioEventBus.getInstance().on("MY_NEW_EVENT", payload => {
    payload.count   // typed as number
})
```

### Adding a whole new bus

Copy
[`UIEventBus.ts`](../src/Refactoring/eventBus/UIEventBus.ts) — it's
the smallest, with an empty payload — rename it, fill in the payload,
and `getInstance()` it from
[`AppOrchestrator.initialize`](../src/Refactoring/app/AppOrchestrator.ts)
so listeners can be wired during boot.

If your bus needs cross-system handling, register listeners in
`AppOrchestrator.onMyBusEvent()` (mimicking `onMenuEvent` and
`onAudioEvent`).

---

## 7. Use the WAM bridge to expose a third-party WAM

Two paths.

### From a JSON config

If your WAM has a wam3dgenerator-compatible JSON descriptor, drop it
in `server-config/public/wamsConfig/myplugin.json`:

```json
{
    "name": "MyPlugin",
    "wam3d": { /* WAMGuiInitCode shape */ }
}
```

It'll be auto-discovered by `Node3DBuilder.initialize()` (it does a
`GET /wamsConfig` to list the directory) and become the kind
`myplugin`. Spawn with **P → myplugin**.

### From an external URL

If you have a hosted WAM with a known URL, you can spawn it without
writing a config:

```
P → external:https://example.com/my-wam.js
```

`Node3DBuilder` (chapter [02 §Node3DBuilder](02-app-core.md#node3dbuilder-node3dbuilderts))
dynamically imports the URL and treats the default export as a
`Node3DFactory`. Use `external:.../wam.js#NamedExport` to pick a
named export.

### From inline JSON

For one-off testing:

```
P → desc:{"name":"Foo","wam3d":{...}}
```

`desc:` lets you paste raw config without a server round-trip.

---

## 8. Local development reminders

### Boot order

`NewApp.start()` is the only place to add new top-level singletons.
Be careful where in the sequence you add yours — see chapter
[02 §Boot sequence](02-app-core.md#boot-sequence). The constraints to
respect:

- `SceneManager.initialize()` must come first.
- The audio context must resume (on user click) before `audioEngine`
  is created.
- `XRManager.init()` must be before anything reading
  `xrHelper.baseExperience.camera` (e.g. `MessageManager`).
- `AppOrchestrator.initialize()` is last — it wires the event buses
  to managers.

### TypeScript

```bash
npx tsc --noEmit
```

The codebase compiles cleanly on this branch. Don't add
`@ts-ignore` / `@ts-nocheck` casually — the existing ones are at
necessary boundaries (WebXR null-safety, the `TemplateN3D` skeleton).

### Test multiplayer

The room name is derived from `document.location.hash`. To get two
players in the same room locally:

1. Open `https://localhost:5173/#test1` in tab 1.
2. Open `https://localhost:5173/#test1` in tab 2.

For peers across machines on the same LAN, use the IP address
instead of `localhost` (the dev server has `host: true`). HTTPS is
required for WebXR; the dev server uses the included
`localhost.{key,crt}` certs and you'll have to accept the warning
on each device.

### Helpful debug switches

A lot of files have `private static readonly DEBUG_LOG = false` at
the top of the class. Toggle to `true` to trace that subsystem. Don't
commit those toggled on.

To trace **all** event bus traffic at once, call
`AppOrchestrator.getInstance()` and then (manually, in DevTools) use
`(AppOrchestrator.getInstance() as any).debugLogEvents()` — the
private method exists for this purpose
([AppOrchestrator.ts:61](../src/Refactoring/app/AppOrchestrator.ts)).

### Spawn debug

| Key | What |
|---|---|
| `P` | Prompt for a kind, spawn at `(0, 0, 5)` |
| `I` | Toggle Babylon Inspector |
| `L` | Save nearest Node3D and its connected sub-graph as JSON to console |
| `M` | Prompt for JSON, load a saved graph |
| `U` | Toggle Babylon Inspector (alternative; in `SceneManager`) |
| Right-A | Toggle ShopPanel |
| Left-X | Toggle ControlsUI button labels |
| Left-Y | (used to open the dynamic shop — currently the menu shop is commented out, this binding does nothing on this branch) |

### When networking goes weird

- Open the y-webrtc devtools — Yjs has a Chrome extension that shows
  the doc state.
- Check `NetworkManager.getInstance().connection.getConnectedPlayers()`
  in DevTools to confirm peers are visible.
- The signaling endpoint is hardcoded in
  [`PeerToPeerManager.ts:8`](../src/Refactoring/network/PeerToPeerManager.ts).
  If it's down, peers can never find each other; spin up your own
  with `npx y-webrtc-signaling-server` and edit the constant.

### When audio goes silent

- Did you click the page after load? The audio context starts
  suspended.
- Did you wire to a `SpeakerN3D` or `AudioOutputN3D`? Without one,
  there's no `audioCtx.destination` connection.
- Check `audioCtx.state === "running"` in DevTools.
- Spatialization issue: the `AudioOutputN3D` and `SpeakerN3D` both
  write to `audioCtx.listener` — if you spawn two outputs, they
  fight. There's a TODO about this; for now, only spawn one.

---

## Where to go next

- Chapter [10 — File reference](10-file-reference.md) is the flat
  index of every `.ts` file. If you're looking for "where does X
  happen?", start there.
- All design rationale lives in
  [08 — Patterns & conventions](08-patterns-and-conventions.md).
