# 06 — XR input & behaviors

This chapter covers the input pipeline (WebXR controllers, keyboard,
mouse) and the composable Babylon `Behavior<T>` classes that turn raw
inputs into interactions on meshes.

## Files covered

| Folder | Files |
|---|---|
| `xr/` | [`XRManager.ts`](../src/Refactoring/xr/XRManager.ts), [`XRInputManager.ts`](../src/Refactoring/xr/XRInputManager.ts), [`XRControllerManager.ts`](../src/Refactoring/xr/XRControllerManager.ts), [`types.ts`](../src/Refactoring/xr/types.ts) |
| `xr/inputs/` | [`InputManager.ts`](../src/Refactoring/xr/inputs/InputManager.ts), [`ControllerInput.ts`](../src/Refactoring/xr/inputs/ControllerInput.ts), [`AbstractPointerInput.ts`](../src/Refactoring/xr/inputs/AbstractPointerInput.ts), [`PointerInput.ts`](../src/Refactoring/xr/inputs/PointerInput.ts), [`ButtonInput.ts`](../src/Refactoring/xr/inputs/ButtonInput.ts), [`PressableInput.ts`](../src/Refactoring/xr/inputs/PressableInput.ts), [`AxisInput.ts`](../src/Refactoring/xr/inputs/AxisInput.ts), [`KeyboardInputs.ts`](../src/Refactoring/xr/inputs/KeyboardInputs.ts), [`InputCapability.ts`](../src/Refactoring/xr/inputs/InputCapability.ts) |
| `xr/inputs/tools/` | [`InputGrabBehavior.ts`](../src/Refactoring/xr/inputs/tools/InputGrabBehavior.ts), [`InputDropBehavior.ts`](../src/Refactoring/xr/inputs/tools/InputDropBehavior.ts), [`InputHoverBehavior.ts`](../src/Refactoring/xr/inputs/tools/InputHoverBehavior.ts), [`InputPressBehavior.ts`](../src/Refactoring/xr/inputs/tools/InputPressBehavior.ts), [`InputMultiPressBehavior.ts`](../src/Refactoring/xr/inputs/tools/InputMultiPressBehavior.ts), [`InputVisualPointer.ts`](../src/Refactoring/xr/inputs/tools/InputVisualPointer.ts) |
| `behaviours/` | [`ShakeBehavior.ts`](../src/Refactoring/behaviours/ShakeBehavior.ts), [`GazeBehavior.ts`](../src/Refactoring/behaviours/GazeBehavior.ts) |
| `behaviours/boundingBox/` | [`BoundingBox.ts`](../src/Refactoring/behaviours/boundingBox/BoundingBox.ts), [`HoldableBehaviour.ts`](../src/Refactoring/behaviours/boundingBox/HoldableBehaviour.ts), [`FullHoldBehaviour.ts`](../src/Refactoring/behaviours/boundingBox/FullHoldBehaviour.ts), [`MoveHoldBehaviour.ts`](../src/Refactoring/behaviours/boundingBox/MoveHoldBehaviour.ts), [`RotateHoldBehaviour.ts`](../src/Refactoring/behaviours/boundingBox/RotateHoldBehaviour.ts) |

---

## Big picture

```
   WebXR                Keyboard              Mouse
   controllers          (DOM events)          (DOM pointer events)
       │                    │                     │
       └────────────┬───────┴─────────┬───────────┘
                    │                 │
                    ▼                 ▼
              XRControllerManager   (DOM listeners)
                    │                 │
                    └────────┬────────┘
                             ▼
                       InputManager  ←── singleton
                             │
                ┌────────────┼─────────────┐
                ▼            ▼             ▼
         buttons (x,y,a,b)   left/right/screen   head
         (ButtonInput)       (ControllerInput)   (AbstractPointerInput)
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
            trigger,           thumbstick         pointer
            squeeze            (AxisInput)        (PointerInput)
            (PressableInput)
                             │
                             ▼
                     Behaviors attached to meshes
                     - InputGrabBehavior
                     - InputHoverBehavior
                     - InputPressBehavior
                     - InputMultiPressBehavior
                     - InputDropBehavior
                             │
                             ▼
              Higher-level domain behaviors
              - HoldableBehaviour ──▶ FullHoldBehaviour ──▶ MoveHoldBehaviour
                                                       └──▶ RotateHoldBehaviour
              - ShakeBehavior
              - GazeBehavior
              - BoundingBox (uses HoldableBehaviour + InputHoverBehavior)
```

The InputManager is the single point of fan-out. Everything below it
is a pure consumer of the `Observable`s it exposes.

---

## XR session lifecycle

### `XRManager` ([XRManager.ts](../src/Refactoring/xr/XRManager.ts))

Singleton wrapper around `WebXRDefaultExperience`.

| Method | Line | What |
|---|---|---|
| `static getInstance()` | 23 | Lazy singleton (no `initialize()` step — first call constructs) |
| `async init(scene, audioEngine)` | 33 | Creates the XR experience, wires `InputManager`, `XRInputManager`, attaches WebXR audio listener, listens to state changes |
| `private async _getWebXRExperience()` | 155 | Checks `IsSessionSupportedAsync('immersive-vr')`; if so, `scene.createDefaultXRExperienceAsync({uiOptions: {sessionMode: 'immersive-vr'}})` |
| `private _initXRFeatures()` | 168 | Disables `TELEPORTATION` and `WebXRNearInteraction` (for performance — particularly for the XRDrumKit). Calls `setMovement(["rotation","translation"])` |
| `setMovement(features)` | 175 | Configures `WebXRFeatureName.MOVEMENT` with the **swapped** stick mapping: left stick = translate, right stick = rotate |
| `private async _initControllersAfterXREntry()` | 110 | After entering XR, polls for controllers and creates the `HandMenu` once the left controller is ready |
| `private _createHandMenu()` | 146 | `new HandMenu()` — see chapter [07](07-menus-and-world.md) |

#### State machine (lines 55–102)

The Babylon WebXR helper goes through four states. `XRManager` reacts:

| State | Reaction |
|---|---|
| `ENTERING_XR` | Just logs |
| `IN_XR` | Force gravity for 10 frames so the user falls onto the ground rather than spawning floating; trigger controller init + hand-menu creation |
| `EXITING_XR` | Dispose hand menu, clear flags |
| `NOT_IN_XR` | Same cleanup |

Camera config (lines 51–53):
```typescript
camera.checkCollisions = true
camera.applyGravity = true
camera.ellipsoid = new Vector3(1, 1, 1)
```

So the player has a 1×1×1 collision capsule and gets pulled down by
gravity onto whatever has `checkCollisions`.

#### Stick mapping

Worth noting because it's non-default. From
[XRManager.ts:179-209](../src/Refactoring/xr/XRManager.ts):

```
left stick  → translation (move world-relative)
right stick → rotation (yaw + pitch)
```

`movementOrientationFollowsViewerPose: true` means "moving forward
moves you in the direction your *head* is facing," not the
controller's. Movement speed is `0.2`, rotation speed `0.3`.

### `XRInputManager` ([XRInputManager.ts](../src/Refactoring/xr/XRInputManager.ts))

Detects controller add/remove and forwards to `XRControllerManager`.

| Method | Line | What |
|---|---|---|
| `_setupControllerListeners()` | 29 | Subscribes to `onControllerAddedObservable` and `onControllerRemovedObservable`. On add, waits for `onMotionControllerInitObservable` then calls `_updateLeftController` / `_updateRightController` |
| `async initControllers()` | 55 | Polls for controllers — needed because controllers can come up after the XR session does. 200ms polling, 5-second timeout fallback. Returns a `Promise<void>` |
| `private _updateLeftController(controller)` | 142 | Stores the reference; tells `XRControllerManager` the input source |
| `private _updateRightController(controller)` | 151 | Same for right |
| `logRegisteredListeners()` | 160 | Debug helper |

The polling in `initControllers` is awkward but necessary — Quest, in
particular, can take a couple of seconds after `IN_XR` before the
motion controllers report any components.

### `XRControllerManager` ([XRControllerManager.ts](../src/Refactoring/xr/XRControllerManager.ts))

A separate singleton (`Instance`) holding controller state and
"button listener" subscriptions, plus haptic feedback helpers. The
`InputManager` itself doesn't reference it directly — it bypasses
this class and goes straight to the WebXR motion controllers — but
the `XRDrumKit` does use `triggerHapticFeedback`. Treat
`XRControllerManager` as a parallel utility for code that wants
manual button-listener subscription rather than going through
`InputManager`'s observables.

---

## The `InputManager` — the single source of input truth

[`InputManager.ts`](../src/Refactoring/xr/inputs/InputManager.ts) is
the most-used class in the codebase outside Babylon itself. Every
behavior, every menu, every instrument that needs input goes through
it.

### Boot

`XRManager.init()` calls `InputManager.create(xrHelper, scene)` at
line 44 of `XRManager.ts`. After that,
`InputManager.getInstance()` works everywhere.

### What it exposes

| Field | Type | What |
|---|---|---|
| `x_button, y_button, a_button, b_button` | `ButtonInput` | The four face buttons. Have `onChange / onDown / onUp / onTouch / onUntouch` observables |
| `on_button_change` | `Observable<ButtonInputEvent>` | Fires for any of the four |
| `left, right, screen` | `ControllerInput` | The two XR controllers + the "fake" screen controller (driven by mouse + WASD) |
| `head` | `AbstractPointerInput` | A pointer derived from the camera forward — used by `GazeControllerN3D` and similar |
| `controllers` (getter) | `[left, right, screen]` | Array form |
| `onTriggerChange / onTriggerDown / onTriggerUp` | `Observable<PressableInputEvent>` | Aggregate trigger events across all controllers |
| `onSqueezeChange / onSqueezeDown / onSqueezeUp` | `Observable<PressableInputEvent>` | Aggregate squeeze events |
| `onPressableChange` | `Observable<PressableInputEvent>` | Trigger OR squeeze |
| `onThumbstickChange` | `Observable<AxisInputEvent>` | Aggregate thumbstick |
| `onNewtarget` | `Observable<PointerInput>` | Fires when *any* pointer's target mesh changed |
| `onEnterTarget` / `onExitTarget` | `Observable<{target, pointer}>` | Reference-counted: `onEnterTarget` fires once when the first pointer starts pointing at a mesh; `onExitTarget` fires when the last one stops |
| `pointedMeshes` | `AbstractMesh[]` | Currently-pointed meshes (any controller) |
| `movement` | `InputCapability` | Capability gate for the movement system — used by behaviors that disable movement during drag |

### Three input sources, one API

The big idea: the same `ControllerInput` interface backs:

- **Real XR controllers** (`left`, `right`) — registered via
  `_registerXRObserver(controller, scene)` in `_registerXR()`.
- **The mouse + WASD keyboard** (`screen`) — the
  "screen controller" (handedness `"none"`) registered with
  `_registerDocumentObserver(scene, mouseLeftButton=0, mouseRightButton=2, ...)`.
- **The keyboard** as a per-hand fallback — `left` registers
  `q,d,z,s` keys (line 173) and `right` registers
  `arrowleft,arrowright,arrowup,arrowdown` (line 179). So you can
  develop on a desktop without controllers.

Each `ControllerInput` exposes `trigger`, `squeeze`, `thumbstick`, and
`pointer`. All four kinds of input have keyboard fallbacks.

### Per-frame "pointed mesh" reference counting

[`InputManager.ts:119-140`](../src/Refactoring/xr/inputs/InputManager.ts):
when a controller's pointer changes target, the manager increments a
counter on the new target and decrements on the old. `onEnterTarget`
fires when the counter goes from 0 to 1, `onExitTarget` fires when it
goes back to 0. This lets behaviors implement "any controller is
hovering" without keeping their own per-controller state.

---

## Input primitives

### `ButtonInput` ([ButtonInput.ts](../src/Refactoring/xr/inputs/ButtonInput.ts))

A discrete button (X, Y, A, B).

| Member | Line | What |
|---|---|---|
| `onChange / onDown / onUp / onTouch / onUntouch` | 17–29 | The five observables |
| `isPressed() / isTouched()` | 35 / 41 | Synchronous accessors |
| `setPressInterval(interval, on_tick, on_press?, on_release?)` | 51 | Set up a "fire `on_tick` every N ms while held" callback. Returns a `{remove()}` handle |
| `_registerXRObserver(motionController)` | 103 | Wires to `motionController.getComponent(this.name).onButtonStateChangedObservable` |
| `_registerDocumentObserver()` | 113 | Wires to `keydown` / `keyup` / `blur` events (the `blur` listener releases on tab-switch so a key doesn't get stuck pressed) |

### `PressableInput`

Same pattern as `ButtonInput`, but for analog inputs (trigger, squeeze).
Has `onChange / onDown / onUp` plus a continuous `value: number`.

### `AxisInput`

For thumbsticks. Has 2D state, a `value: {x, y}` and an `on_change`
observable. `_registerMouseWheelObserver()` lets the mouse wheel
double as a thumbstick Y for keyboard-only dev.

### `ControllerInput`

Aggregates one trigger + one squeeze + one thumbstick + one pointer
under a single object. The `side: "left" | "right" | "none"` property
identifies which physical hand it represents (or `"none"` for the
screen one).

### `PointerInput` / `AbstractPointerInput`

Represents a 3D ray + the mesh it's hitting. Used both for the
controllers' aim ray and the head's gaze ray.

| Field | What |
|---|---|
| `origin: Vector3` | Ray origin |
| `forward: Vector3` | Ray direction |
| `up`, `right` | Orthonormal basis |
| `target: Vector3` | The hit point in world space |
| `targetMesh: AbstractMesh \| null` | The picked mesh |
| `previousMesh` | Held during transitions |
| `hit: boolean` | Whether the ray hit anything |
| `onMove: Observable<PointerInput>` | Per-frame movement |
| `onNewTarget: Observable<{previousMesh, targetMesh, ...}>` | Fires when the picked mesh changes |
| `controller: ControllerInput` | (on `PointerInput`) the parent controller |

### `KeyboardInputs`

Module of utility wrappers around `document.addEventListener("keydown"|"keyup", ...)`
that the other inputs use internally.

### `InputCapability`

A simple toggleable gate. `InputManager.movement` is one of these. A
behavior can call `movement.lock()` to temporarily disable XR-stick
movement (e.g. while you're rotating an instrument with your stick),
and `movement.unlock()` to release.

---

## The `xr/inputs/tools/` behaviours

These are small `Behavior<AbstractMesh>` building blocks built on top
of `InputManager`. They are not domain-specific — they don't know
anything about Node3D or audio. They translate raw inputs into
gestures on a single mesh.

### `InputGrabBehavior` ([InputGrabBehavior.ts](../src/Refactoring/xr/inputs/tools/InputGrabBehavior.ts))

The fundamental "trigger pressed while pointing at this mesh"
gesture. Constructor:

```typescript
new InputGrabBehavior(
    onDown:  (pointer: PointerInput) => void,
    onUp:    (pointer: PointerInput) => void,
    onMove?: (pointer: PointerInput) => void,
)
```

- On `InputManager.onTriggerDown`: if the pressing controller's
  pointer is currently aimed at this mesh, `grabbed = pointer` and
  call `onDown`. If `onMove` is given, also subscribes to
  `pointer.onMove`.
- On `InputManager.onTriggerUp`: if the grabbing pointer matches,
  call `onUp` and unsubscribe.
- `detach()` calls `onUp` if still grabbed — important so resources
  don't leak when the mesh is destroyed mid-grab.

This is the foundation for hold/drop/shake.

### `InputHoverBehavior`

`onEnter(pointer) / onExit(pointer)` callbacks driven by
`InputManager.onEnterTarget / onExitTarget` for this specific mesh.
Used by `BoundingBox` to flash the box translucent when you hover.

### `InputPressBehavior`

A simpler form of `InputGrabBehavior` that does not require the
trigger to be pressed *on* the target — it tracks any controller
pressing the trigger anywhere, with two callbacks:
`onPress(controller)` and `onRelease(controller)`.

Used by `PositionCubeN3D` (the cube wants the cursor to follow the
controller as long as the trigger is held, even outside the cube).

### `InputMultiPressBehavior`

Multi-controller version. Tracks all controllers pressing
simultaneously. Used by `HyperKeyboardN3D` so two hands can press
different keys.

### `InputDropBehavior`

The mirror of `InputGrabBehavior` — fires `onDrop` when a controller
that was holding *something else* releases the trigger while
pointing at the target. Used for "drag from shop, release over a
slot" interactions.

### `InputVisualPointer` ([InputVisualPointer.ts](../src/Refactoring/xr/inputs/tools/InputVisualPointer.ts))

Not a `Behavior` — a free-standing visual companion to a
`PointerInput`. Renders a thin cylinder (the laser line) and a small
sphere (the dot at the hit point) that follows the pointer.

| Method | Line | What |
|---|---|---|
| `constructor(pointer, line, point)` | 11 | Subscribes to `pointer.onMove` and to the controller's trigger/squeeze |
| `static CreateSimple(scene, pointer)` | 72 | Convenience: builds the line + point meshes itself, returns a handle with `.remove()` |
| `remove()` | 68 | Tears down all observers |

The cool detail: the line **gets thicker as you press** the trigger or
squeeze (lines 47–53). `press_count` accumulates 1 for each press
event, scales `line.scaling.{x,z}` by `1 + press_count*0.5`. So holding
both buttons makes the line twice as thick.

[`NewApp.ts:148-149`](../src/Refactoring/app/NewApp.ts) creates one
of these for each hand at app start.

---

## The `behaviours/` package — domain interactions

Composed on top of the `xr/inputs/tools/` primitives. These do know
about scene-level concepts (player position, camera, etc.).

### `BoundingBox` ([BoundingBox.ts](../src/Refactoring/behaviours/boundingBox/BoundingBox.ts))

The draggable box that wraps every Node3D. **Not a `Behavior`** — it's
a class that *uses* `HoldableBehaviour` and `InputHoverBehavior`.

| Step | Line | What |
|---|---|---|
| Build a box mesh slightly larger than the target | 21–25 | `extendSize.{x,y,z} * 2 + 0.01/0.1` |
| Reparent the target under the box | 26 | So dragging the box drags the target |
| Position in front of the player | 32 | `positionBoundingBoxInFrontOfPlayer()` — uses `PlayerManager.getPlayerState()` to spawn 5 units ahead, slightly tilted |
| Attach `HoldableBehaviour` | 39–42 | `onMoveObservable` and `onRotateObservable` both fire `on_move()` callback |
| Attach `InputHoverBehavior` | 54 | Toggles `boundingBox.visibility` between 0 (idle), 0.2 (hover), 0.5 (held) |
| Listen to grab/release | 64–71 | Same visibility logic |

The bounding-box mesh gets `visibility = 0` by default — you only see
it when you're hovering or holding. When `Node3DInstance` attaches a
`ShakeBehavior` on top, the same box also doubles as the
shake-to-delete trigger (chapter [03 §Bounding box](03-node3d-system.md#the-bounding-box-and-shake-to-delete)).

### `HoldableBehaviour` ([HoldableBehaviour.ts](../src/Refactoring/behaviours/boundingBox/HoldableBehaviour.ts))

The wrapper that says "this mesh is grabbable". Layered on top of
`InputGrabBehavior`.

| Member | Line | What |
|---|---|---|
| `onMoveObservable / onRotateObservable / onGrabObservable / onReleaseObservable` | 17–20 | Four observables to plug into |
| `isDragging` (getter) | 24 | Synchronous "are we currently held" |
| `attach(target)` | 32 | Adds an `InputGrabBehavior` whose `onDown` calls `this.grab(pointer)`, `onUp` calls `this.release()` |
| `grab(pointer)` | 52 | Adds a `FullHoldBehaviour(pointer)` to the moved target. The hold behavior's `on_move` and `on_rotate` callbacks fan out to the observables here |
| `release()` | 64 | Removes the `FullHoldBehaviour` |

Constructor takes an optional `moved?: TransformNode` — if provided,
the hold behavior is attached to *that* instead of the target. This
lets you grab one mesh but move another (e.g. grab a handle, move a
group).

### `FullHoldBehaviour` ([FullHoldBehaviour.ts](../src/Refactoring/behaviours/boundingBox/FullHoldBehaviour.ts))

A meta-behavior that switches between `MoveHoldBehaviour` and
`RotateHoldBehaviour` based on whether the squeeze button is held.

```
trigger held + squeeze released → MoveHoldBehaviour active (translation + rotation that follows the controller's aim)
trigger held + squeeze pressed  → RotateHoldBehaviour active (free rotation, no translation)
```

The transition (lines 65–84) is symmetric: on each `update()`, if the
existing behavior is the wrong kind, remove it and add the right one.
The `on_move` / `on_rotate` callbacks bubble up to whoever owns the
`FullHoldBehaviour` (in practice, `HoldableBehaviour`).

### `MoveHoldBehaviour` and `RotateHoldBehaviour`

Not read line-by-line for this chapter, but the names tell most of the
story:

- `MoveHoldBehaviour` — while the trigger is held, the target's
  position tracks the controller's pointer ray, with the left
  thumbstick controlling forward/back distance. The `on_move()`
  callback fires every frame.
- `RotateHoldBehaviour` — while held, the target's rotation tracks
  the controller's aim direction. The `on_rotate()` callback fires
  per frame.

Both lock `InputManager.movement` while active (so the user's stick
doesn't move them through the world while they're rotating an
instrument).

### `ShakeBehavior` ([ShakeBehavior.ts](../src/Refactoring/behaviours/ShakeBehavior.ts))

Detects a shaking gesture by counting direction reversals in the
held mesh's pointer-derived position.

| Member | Line | What |
|---|---|---|
| `on_start / on_shake / on_stop / on_pick / on_drop` | 13–33 | Five callbacks |
| `shake_threshold = 3` | 38 | Minimum `shake_power` for "shaking" |
| `attach(target)` | 73 | Adds an `InputGrabBehavior` |
| `onGrab()` | 78 | Starts a 400ms `setInterval` that decays `shake_power` by 10% each tick. While power exceeds threshold, fires `on_shake(power, counter)` |
| `onMove(pointer)` | 98 | Computes a sliding `position` 5 units ahead of the controller. If the delta direction reverses (`Vector3.Dot(delta, last_delta) < -0.2`) and the previous segment was at least 10cm long, increment `shake_power` |
| `onUp()` | 118 | Reset shake power, clear interval |

This is what backs the "shake-to-delete" gesture
([Node3DInstance.ts:241-249](../src/Refactoring/node3d/instance/Node3DInstance.ts) and
[N3DConnectionInstance.ts:38-53](../src/Refactoring/node3d/instance/N3DConnectionInstance.ts)).

### `GazeBehavior` ([GazeBehavior.ts](../src/Refactoring/behaviours/GazeBehavior.ts))

Fire callbacks when the user *looks at* a mesh for a configurable
amount of time. State machine `IDLE → GAZING → ACTIVATED`:

| Property | Line | What |
|---|---|---|
| `onGazeStart / onGazeActivated / onGazeStop` | 21–23 | The three transitions |
| `onCustomCheck() => boolean` | 24 | Optional extra predicate — for example, the `HandMenu` requires the controller to be pointing at the player as well |
| `activationDelay = 1500` | 29 | ms to hold gaze before `ACTIVATED` |
| `checkInterval = 100` | 33 | Ray-cast frequency |
| `attach(target)` | 65 | Adds an `onBeforeRenderObservable` that does the state machine — every `checkInterval` ms, runs `_performCheck` (a `scene.pickWithRay(camera.getForwardRay())` against the attached mesh) |

Used by [`GazeControllerN3D`](04-instruments-catalog.md#gazecontrollern3d).
The `HandMenu` (chapter [07](07-menus-and-world.md#handmenu)) also
implements gaze activation but, at the time of writing, does so
inline without using this `GazeBehavior` class.

---

## Putting it together

Three worked examples.

### Example 1: shake an oscillator to delete it

```
1. User presses controller trigger while pointing at the oscillator's bounding box
   → InputGrabBehavior (inside ShakeBehavior, attached by Node3DInstance)
     fires onDown → ShakeBehavior.onGrab(pointer)
   → ShakeBehavior starts its 400ms decay interval, on_pick() fires
     (Node3DInstance: tube.visibility = 0.8 — well, that's the wire version;
      for the bbox the shake handler sets visibility differently)
2. User shakes the controller
   → pointer.onMove fires, ShakeBehavior.onMove computes deltas
   → Each direction reversal beyond 10cm bumps shake_power
   → When power > 3, on_start() turns the bbox red (Node3DInstance:
     MeshUtils.setColor(boundingBox, Color3.Red().toColor4()))
   → on_shake(power, counter) fires every interval tick
3. After ≥5 shake counts:
   → Node3DInstance subscribes to on_shake at line 247:
     if (counter > 5) NetworkManager.node3d.nodes.remove(this)
   → SyncManager.remove triggers dispose, broadcasts deletion to peers
4. User releases trigger
   → InputGrabBehavior.onUp → ShakeBehavior.onUp
   → on_stop() turns the bbox back white
```

### Example 2: drag a knob

```
1. User presses controller trigger while pointing at the knob mesh
   → ActionManager OnPickDownTrigger fires (registered by N3DParameterInstance)
   → N3DParameterInstance starts a SixDofDragBehavior session
2. User moves the controller
   → SixDofDragBehavior fires onDragObservable with the position delta
   → Y-axis delta is mapped to a value change in [0..1]
   → param.config.setValue(newValue)
   → context.notifyStateChange("param_id")
   → SyncManager.send_changes batches and broadcasts
3. Release
   → SixDofDragBehavior fires onDragEnd
   → Highlight removed, text label hidden
```

(`N3DParameterInstance` uses Babylon's built-in `SixDofDragBehavior`
rather than `InputGrabBehavior`, because it needs the per-frame delta
and Babylon already provides that.)

### Example 3: gaze at the GazeControllerN3D's eye

```
1. User looks at the eye sphere
   → InputManager.head pointer raycasts every frame against pickable meshes
   → head.onNewTarget fires with targetMesh = eye sphere
   → GazeControllerN3D listens to head.onNewTarget directly
     (not via GazeBehavior — see GazeControllerN3D.ts:152-166)
2. State changes:
   → isGaze = true
   → output.value = enabledValue
   → eye sphere material set to green
3. The output value flows to every connected automation input
   → AutomationN3DConnectable.Output.value setter pushes via
     senders.forEach(sender => sender.sender(v))
   → Each connected parameter sees v and calls setValue(v)
4. User looks away → isGaze=false → output.value=disabledValue → eye sphere red
```

---

## Where to go next

- The **3D menus** and the shop UI (which use these behaviors
  + `InputManager.head` for hand-attached UI) are in
  [07 — Menus & world](07-menus-and-world.md).
- The **shake-to-delete** wiring (which uses `ShakeBehavior`) is
  detailed in [03 §Node3DInstance](03-node3d-system.md#node3dinstance-source).
- The full recipe for a **new behavior** is in
  [09 §3](09-contributor-guide.md#3-add-a-new-behavior).
