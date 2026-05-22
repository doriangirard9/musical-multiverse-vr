# 04 — Instruments catalog

This chapter is the tour through every concrete instrument, effect,
controller and tool under
[`src/Refactoring/node3d/subs/`](../src/Refactoring/node3d/subs/).
For the underlying contract, read [03 — Node3D system](03-node3d-system.md)
first.

## Contents

- [How to read this chapter](#how-to-read-this-chapter)
- [Generators (audio)](#generators-audio)
  - [OscillatorN3D](#oscillatorn3d)
- [Consumers (audio)](#consumers-audio)
  - [AudioOutputN3D](#audiooutputn3d)
  - [SpeakerN3D](#speakern3d)
- [MIDI live instruments](#midi-live-instruments)
  - [LivePianoN3D](#livepianon3d)
  - [HarpN3D](#harpn3d)
  - [HyperKeyboardN3D](#hyperkeyboardn3d)
  - [DrumPlateKitN3D](#drumplatekit-n3d)
  - [MaracasN3D](#maracasn3d)
  - [NoteBoxN3D](#noteboxn3d)
- [Sequencers](#sequencers)
  - [SequencerN3D (12×12)](#sequencern3d-12x12)
  - [PianoRoll](#pianoroll)
  - [FunctionSequencer (live coding)](#functionsequencer-the-live-coding-instrument)
- [Drum kit (XR physics)](#drum-kit-xr-physics)
  - [DrumKitN3D](#drumkitn3d)
  - [XRDrumKit subsystem](#xrdrumkit-subsystem)
- [Automation controllers](#automation-controllers)
  - [AutomationControllerN3D](#automationcontrollern3d)
  - [PositionCubeN3D](#positioncuben3d)
  - [GazeControllerN3D](#gazecontrollern3d)
  - [VoiceVolumeControllerN3D](#voicevolumecontrollern3d)
  - [ElectroballsN3D](#electroballsn3d)
- [WAM bridges](#wam-bridges)
  - [Wam3DGeneratorN3D](#wam3dgeneratorn3d)
  - [WamSamplerN3D / drumSampler](#wamsamplern3d--drumsampler)
- [Tools / debug](#tools--debug)
  - [AutomationToolN3D (Harp variant)](#automationtooln3d-harp-variant)
  - [SyncDebugN3D](#syncdebugn3d)
  - [TemplateN3D](#templaten3d)

---

## How to read this chapter

Each entry has the same fields:

| Field | What |
|---|---|
| **Kind** | The `kind` string accepted by [`Node3DBuilder.createFactories`](../src/Refactoring/app/Node3DBuilder.ts) |
| **Tags** | What `factory.tags` advertises |
| **File** | The implementation source |
| **GUI** | What you see in the world |
| **Audio graph** | What gets created in Web Audio / WAM |
| **Connectables** | The ports it exposes |
| **Parameters** | Knobs, buttons |
| **State keys** | What's network-synced via `getStateKeys()` |
| **Trick** | One sentence on the interesting bit |

If the kind is `(unregistered)`, the factory exists but isn't reachable
from `FACTORY_KINDS` in `Node3DBuilder.ts` — useful as a reference
implementation but not currently spawnable from the UI.

---

## Generators (audio)

### `OscillatorN3D`

| | |
|---|---|
| **Kind** | `oscillator` |
| **Tags** | `oscillator`, `audio`, `generator`, `sinus` |
| **File** | [`subs/OscillatorN3D.ts`](../src/Refactoring/node3d/subs/OscillatorN3D.ts) |

The smallest non-trivial Node3D — a great template for "I want to
build an audio source from a Web Audio node".

- **GUI** (lines 6–35): a 1×0.5×1 box, plus an output sphere (red,
  diameter 0.5, at +0.75 X) and a frequency-knob sphere
  (diameter 0.5, at +0.25 Y).
- **Audio graph** (line 47): a single `audioCtx.createOscillator()`
  started immediately at 130 Hz. No envelope, no gain — the panner
  / speaker downstream is responsible for spatialization and volume.
- **Connectables**: `audioOutput` —
  `T.AudioN3DConnectable.Output` wrapping the oscillator.
- **Parameters**: `frequency` — `[0..1]` mapped to `130..230 Hz`,
  10 steps. `setValue` also scales the knob mesh (line 61).
- **State keys**: `["frequency"]` — but the implementation's
  `getState/setState` are no-ops (lines 69–73). The auto-synced
  `node3d_parameter_frequency` key (see chapter
  [03 §State sync](03-node3d-system.md#state-sync)) handles
  persistence anyway.
- **Trick**: `setValue` calls `context.notifyStateChange("frequency")`
  even though the host already auto-syncs the parameter. Harmless,
  redundant — illustrates the explicit sync API.

---

## Consumers (audio)

### `AudioOutputN3D`

| | |
|---|---|
| **Kind** | (unregistered — `audiooutput` maps to `SpeakerN3DFactory` instead) |
| **Tags** | `audio`, `consumer`, `audio_output` |
| **File** | [`subs/AudioOutputN3D.ts`](../src/Refactoring/node3d/subs/AudioOutputN3D.ts) |

A simple HRTF-spatialized audio sink. Kept around as a reference; the
default `audiooutput` is the prettier `SpeakerN3D` instead.

- **Audio graph**: a single `PannerNode`
  (`HRTF`, `inverse` distance model, refDistance=1, maxDistance=100,
  rolloff=0.5) connected to `audioCtx.destination`.
- **Per-frame loop** (lines 57–88): a 50ms `setInterval` writes
  `panner.{positionXYZ, orientationXYZ}` and the global
  `audioCtx.listener.{positionXYZ, forwardXYZ, upXYZ}` from
  `context.getPosition()` and `context.getPlayerPosition()`. Z is
  flipped (Web Audio is right-handed, Babylon left-handed).
- **`setTargetAtTime(value, currentTime, 0.01)`** (line 86): smooths
  the AudioParam to avoid pops on fast head movement.
- **TODO** (line 55): the listener is global, so two AudioOutputs
  fight over it. The comment notes this should move out of the
  Node3D.

### `SpeakerN3D`

| | |
|---|---|
| **Kind** | `audiooutput` |
| **Tags** | `speaker`, `audio`, `consumer`, `audio_output` |
| **File** | [`subs/speaker/SpeakerN3D.ts`](../src/Refactoring/node3d/subs/speaker/SpeakerN3D.ts) |

The default speaker — a 3D model of a speaker plus a translucent
red "falloff sphere" of diameter 50 around it.

The factory dispatches to **two implementations** at line 235:

| `USE_AUDIO_ENGINE = false` (default) | `USE_AUDIO_ENGINE = true` |
|---|---|
| `SpeakerPannerNodeN3D` | `SpeakerN3D` |
| Same per-frame `PannerNode` loop as `AudioOutputN3D`, with `exponential` distance model, refDistance=5, maxDistance=200, rolloff=3 — tuned for VR | Uses Babylon `audioEngine.createSoundSourceAsync("speaker", node, { spatialMaxDistance: 25 })` and lets Babylon spatialize via `source.spatial.attach(gui.root)` |

The panner version (lines 107–218) also runs a **frequency analyser
visualizer**: an 32-bin FFT extracts low/mid/high band energies and,
on each "bounce" of the volume signal, fires
`context.sendSignal(position, R, G, B)` — which makes the
[`WaveGround`](../src/Refactoring/world/ground/WaveGround.ts) and
[`SoundwaveEmitter`](../src/Refactoring/world/soundwave/SoundwaveEmitter.ts)
ripple in time with the music.

- **Connectables**: `audioInput` (Audio input to the gain/panner).
- **Parameters**: none.
- **GUI assets**: a `speaker.glb` is `import`-loaded next to the source
  file.

---

## MIDI live instruments

### `LivePianoN3D`

| | |
|---|---|
| **Kind** | `livepiano` |
| **Tags** | (factory is exported but the `Node3DBuilder` mapping uses the file's defaults — see file) |
| **File** | [`subs/note_generator/LivePianoN3D.ts`](../src/Refactoring/node3d/subs/note_generator/LivePianoN3D.ts) |

A 49-key keyboard, MIDI 36–84 (C2 to C6).

- **GUI** (lines 30–84): builds a row of white keys plus inserted
  black keys at MIDI offsets {1, 3, 6, 8, 10}. White keys are
  `Color3.White()`, blacks `Color3.Black()`. Output sphere is
  `T.MidiN3DConnectable.OutputColor` (magenta).
- **Audio graph**: none. Pure MIDI generator.
- **Connectables**: `output` — `T.MidiN3DConnectable.ListOutput`.
- **Buttons**: 49 buttons, one per key. Each button on press
  schedules a `wam-midi` note-on; on release a note-off. Probably
  uses `Node3DButton.supportSwipe = true` so you can run a finger
  across the keys.
- **State keys**: usually empty — keyboard playing is ephemeral.

### `HarpN3D`

| | |
|---|---|
| **Kind** | `harp` (default 10 strings) / `large_harp` (20 strings) |
| **Tags** | (varies — the file has multiple variants) |
| **File** | [`subs/note_generator/HarpN3D.ts`](../src/Refactoring/node3d/subs/note_generator/HarpN3D.ts) |

A configurable-string harp. The factory is a class with two static
presets:

```typescript
HarpN3DFactory.DEFAULT  // 10 strings
HarpN3DFactory.LARGE    // 20 strings
```

- **GUI**: variable-width base, a "back" plate, N vertical white
  string-boxes, plus a MIDI output sphere, an automation output
  sphere (for "string pinch height"), and a "note selector" cube
  for choosing which note range the strings cover.
- **Connectables**: MIDI output (the plucked notes), automation
  output (the height/strength of the pluck).
- **Interaction**: `InputPressBehavior` on each string mesh — pinch
  the trigger near a string to pluck. The strength of the pluck is
  derived from speed and emitted on the automation output, so a
  downstream synth can modulate volume / brightness with how hard
  you pluck.

### `HyperKeyboardN3D`

| | |
|---|---|
| **Kind** | `hyperkeyboard` |
| **File** | [`subs/note_generator/HyperKeyboardN3D.ts`](../src/Refactoring/node3d/subs/note_generator/HyperKeyboardN3D.ts) |

A **3D grid of keys**, with configurable `(x, y, z)` dimensions. A
`HyperKeyboardN3DFactory.SMALL` static preset is mapped to the
`hyperkeyboard` kind.

- **GUI** (lines 12–87): builds `factory.x * factory.y * factory.z`
  unit-cube keys, arranged in a 3D grid sized to fit a 1×1×1 cube.
  The grid is sliced into rows along Y; each row of keys gets its
  own output (so you can route distinct columns to different synths).
- **Connectables**: `factory.y` outputs. By convention output[0] is
  MIDI, output[1] is automation, output[2] is automation — but the
  semantics of each row are the implementation's choice.
- **Interaction**: `InputHoverBehavior` + `InputMultiPressBehavior`
  (see chapter [06](06-xr-input-and-behaviors.md)). Multiple
  controllers can press different keys simultaneously.

### `DrumPlateKitN3D`

| | |
|---|---|
| **Kind** | `drumplatekit` |
| **File** | [`subs/note_generator/DrumPlateKitN3D.ts`](../src/Refactoring/node3d/subs/note_generator/DrumPlateKitN3D.ts) |

A simulated drum kit built from independently-aimed disc plates.
Each "plate" is a cylinder mesh on a tube/handle that can be
oriented and animated when struck.

- The `Plate` inner class (lines 20+) builds the per-plate mesh
  hierarchy: animation root, plate disc (metal material), handle box,
  vertical tube, and a small note-selector sphere.
- **Animation**: on hit, `startAnimation(strength, offset)` runs a
  `requestAnimationFrame` loop for `ANIMATION_DURATION = 200ms` that
  bobs and tilts the plate based on hit strength and the offset of
  the hit from the plate center.
- The factory has a static `DrumPlateKitN3DFactory.SMALL` mapped to
  `drumplatekit` in `Node3DBuilder`.

### `MaracasN3D`

| | |
|---|---|
| **Kind** | `maracas` |
| **Tags** | `maracas`, `midi`, `generator`, `live_instrument`, `shake` |
| **File** | [`subs/maracas/MaracasN3D.ts`](../src/Refactoring/node3d/subs/maracas/MaracasN3D.ts) |

The "shake to play" instrument. A `maracas.glb` model on a base.

- **GUI**: imported `.glb` mesh on a 1×0.2×1 base, with a magenta
  MIDI output sphere.
- **Connectables**: `midioutput` — `MidiN3DConnectable.ListOutput`.
- **Parameters**: `rotation` `[0..1]` — drag-controlled. Mapped to
  the maracas mesh's Y rotation: `(value - 0.5) * π - 3`.
- **Trick** (lines 71–88): when the rotation reverses direction
  (`last_offset * offset < 0`), it fires a MIDI note. The note
  number is `floor(10 + 100 * value)` — different shake angles
  produce different notes. Each shake schedules a note-on at `t`,
  another note-on with velocity 0 at `t+1s`, and a note-off at
  `t+1.1s` — quirky but it works.

### `NoteBoxN3D`

| | |
|---|---|
| **Kind** | `notesbox` |
| **Tags** | `notebox`, `midi`, `generator`, `live_instrument`, `recorder`, `player` |
| **File** | [`subs/NoteBoxN3D.ts`](../src/Refactoring/node3d/subs/NoteBoxN3D.ts) |

A MIDI loop recorder/replayer. **Both** a MIDI input (it acts like a
WAM node) and a MIDI output (broadcasts what it received and what
it replays).

- **GUI**: a 0.5-cube base with a 4×4 pad grid on top, a MIDI input
  sphere on the left, output sphere on the right, plus a stack of
  "sample capsules" on top — one per recorded sample, colored by HSV
  hue.
- **Audio graph**: none. The class hand-builds a `MockWamNode`
  (lines 197–245) that the input port is wired to. When the upstream
  WAM sends `scheduleEvents`, the mock receives them, **forwards
  them to the output's connections**, and **also records them** into
  the current sample.
- **Sampling logic** (lines 197–245):
  - A new sample starts when the gap between consecutive events
    exceeds `sampleThreshold = 2s`.
  - The previous sample's `duration = lastEventTime - startTime`.
  - Up to `maxSamples = 16`. Each created sample spawns a colored
    capsule above the box.
- **Pads**: 16 buttons (lines 152–184). On press, replay the
  corresponding sample (forward all stored events with relative
  timing).
- **State keys**: `["all"]` — saves/restores the entire recorded
  sample array.

---

## Sequencers

### `SequencerN3D` (12×12)

| | |
|---|---|
| **Kind** | `sequencer` |
| **Tags** | `sequencer`, `midi`, `generator`, `pattern` |
| **File** | [`subs/SequencerN3D.ts`](../src/Refactoring/node3d/subs/SequencerN3D.ts) |

A 12-step × 12-note grid sequencer using the Sync protocol so
multiple sequencers can chain.

- **GUI** (lines 12–127):
  - Blue base box.
  - Magenta MIDI output sphere on the right.
  - Yellow Sync input + output spheres flanking the base (only one
    color is used — the file uses
    `T.SynxN3DConnectable.InputColor` / `OutputColor` which are
    actually the same `Color` constant).
  - 12×12 grid of note pad boxes; pads colored white/black per
    musical octave (the `NODE_COLOR` array).
  - Octave selector cylinder on the left.
- **Sync**: a `SynxN3DConnectable.Container(5)` (5 second loop) is
  shared between input and output ports — chain two sequencers and
  they lock to the same period.
- **Tick loop** (lines 154–176): a `setInterval(..., 5)` reads
  `audioContext.currentTime % sync.total` to find the current step
  and fires note-on/note-off WAM MIDI events to every connected
  output. Pads are tinted **green** when active and **red** when
  the playhead is on them.
- **Parameters**: 144 toggle parameters (one per pad,
  `getStepCount() === 2`).
- **State keys**: empty — the per-pad parameters auto-sync via the
  host's `node3d_parameter_*` mechanism.

### `PianoRoll`

| | |
|---|---|
| **Kind** | `pianoroll` |
| **File** | [`subs/PianoRoll/PianoRoll3d.ts`](../src/Refactoring/node3d/subs/PianoRoll/PianoRoll3d.ts) (~2400 lines!) |
| Plus | [`PianoRollSettingsMenu.ts`](../src/Refactoring/node3d/subs/PianoRoll/PianoRollSettingsMenu.ts), [`WamTransportManager.ts`](../src/Refactoring/node3d/subs/PianoRoll/WamTransportManager.ts), [`grid/{GridStrategy,Piano88Strategy,DrumPadsStrategy}.ts`](../src/Refactoring/node3d/subs/PianoRoll/grid/) |

A grid-based MIDI editor. The big one in the codebase. Splits across
several files to stay manageable.

#### The Strategy pattern for grid layouts

The grid has a `GridStrategy` interface
([grid/GridStrategy.ts](../src/Refactoring/node3d/subs/PianoRoll/grid/GridStrategy.ts)):

```typescript
interface GridStrategy {
    getRowCount(): number
    getLabelForRow(row: number): string
    isBlackRow(row: number): boolean
    getMidiForRow(row: number): number | null
    getSuggestedVisibleRows?(): number
    getRowBaseColor?(row: number): B.Color3
    apply?(gui: any): void
    dispose?(gui: any): void
}
```

Two strategies ship today:

| Strategy | Rows | Notes |
|---|---|---|
| `Piano88Strategy` | 88 (A0–C8) | Black/white piano coloring; `noteToMidi` parser maps `"C4"` etc. to MIDI. Visible 20 rows |
| `DrumPadsStrategy` | 11 | Hardcoded drum pad mapping: Kick (36), Rimshot (37), Snare (38), Clap (39), Low Tom (41), CH (42), High Tom (43), OH (46), Mid Tom (47), Crash (49), Ride (51) |

Adding a new layout = implementing a new `GridStrategy` and choosing
it in the settings menu. No editor code changes needed.

#### Other PianoRoll pieces

- **`PianoRollSettingsMenu`** ([file](../src/Refactoring/node3d/subs/PianoRoll/PianoRollSettingsMenu.ts)) —
  in-world settings panel for switching the grid strategy and other options.
- **`WamTransportManager`** ([file](../src/Refactoring/node3d/subs/PianoRoll/WamTransportManager.ts)) —
  shared singleton that tracks tempo / play state and registers all WAM
  nodes that need transport messages. Also used by the (separate)
  WAM sampler bridge in `drumSampler.ts`.

#### What you'll find in `PianoRoll3d.ts`

(I won't re-document its 2400 lines here.) Highlights:

- **Color constants** at the top (lines 62–70): active/inactive
  cells, playing cell, "long playing" cell, hover, base mesh, etc.
- A grid of cells using **thin instances** for performance
  (16 columns × N rows where N comes from the strategy).
- A playhead, a record button, start/stop, scroll arrows
  (the user can pan a wider note range than the visible 20 rows).
- Connectables: MIDI input (recordable), MIDI output (playback),
  Sync input/output (so the playhead aligns with other sequencers).
- A `Pattern` data structure: `{ length, notes: [{tick, number,
  duration, velocity}] }` — the persistent format.

### `FunctionSequencer` (the live-coding instrument)

| | |
|---|---|
| **Kind** | `function_sequencer` (commented out at [Node3DBuilder.ts:103](../src/Refactoring/app/Node3DBuilder.ts) — currently unregistered) |
| **Tags** | `midi`, `sequencer`, `live_coding`, `generator`, `effect` |
| **File** | [`subs/functionsequencer/FunctionSequencerN3D.ts`](../src/Refactoring/node3d/subs/functionsequencer/FunctionSequencerN3D.ts) plus subfolder |

A **JavaScript sandbox** for live-coding sequencers. Write a class
with `init() / onTick() / onMidi() / ...` callbacks; the host runs
your code 96 times per beat (the WAM PPQN convention) and your
script emits MIDI events.

> **Status note**: The factory file has compilation issues (line 136
> has a half-written `RemoteUI.\nsetUI(){`) and the factory is
> commented out of `Node3DBuilder`. It's a work-in-progress. The API
> shape below is from the existing source — what works will work
> exactly like this, what doesn't is being fixed.

#### The user-facing API

A user script returns a `FunctionSequencer` instance — see
[`api/FunctionAPI.ts:12-58`](../src/Refactoring/node3d/subs/functionsequencer/api/FunctionAPI.ts):

```typescript
class MySequencer {
    init() { /* register parameters, build UI */ }
    onTick(ticks: number) { /* called 96× per beat */ }
    onMidi(bytes: number[]) { /* MIDI input */ }
    onTransportStart(transport: WamTransportData) { ... }
    onTransportStop(transport: WamTransportData) { ... }
    onAction(name: string) { /* button press */ }
    onStateChange(state: Record<string, any>) { /* sync */ }
    onCustomNoteList(noteList?: NoteDefinition[]) { ... }
}
```

The script is given two globals:

- **`api: FunctionAPI`** — `emitNote(channel, note, velocity, duration, startTime?)`,
  `emitMidiEvent(bytes, eventTime)`, `getCurrentTime()`,
  `registerParameters([...])`, `registerUI(rootElement)`,
  `getParams()`, etc.
- **`ui`** — a builder for procedural 3D UI. See `RemoteUI.ts`.
  `ui.Row`, `ui.Col`, `ui.Knob`, `ui.Slider`, `ui.Toggle`,
  `ui.Action`, `ui.Label`, `ui.Select`, `ui.Highlight`.

#### Subsystem files

| File | What |
|---|---|
| [`FunctionSequencerN3D.ts`](../src/Refactoring/node3d/subs/functionsequencer/FunctionSequencerN3D.ts) | The Node3D wrapper. Includes a `DEFAULT_SCRIPT` example showing the API |
| [`ScriptExecutor.ts`](../src/Refactoring/node3d/subs/functionsequencer/ScriptExecutor.ts) | Compiles the user script via `new Function('api', 'ui', 'tonal', code)`. **Not a real sandbox** — the script can still see `globalThis`, `import`, etc. Don't run untrusted code |
| [`MidiEventManager.ts`](../src/Refactoring/node3d/subs/functionsequencer/MidiEventManager.ts) | Buffers + dispatches MIDI events to downstream WAM nodes |
| [`UIRenderer3D.ts`](../src/Refactoring/node3d/subs/functionsequencer/UIRenderer3D.ts) | Renders the `RemoteUI` tree as Babylon meshes (Knob = cylinder, Slider = bar, Toggle = box, etc.) |
| [`api/FunctionAPI.ts`](../src/Refactoring/node3d/subs/functionsequencer/api/FunctionAPI.ts) | Defines `FunctionSequencer`, `FunctionAPI`, `ParameterDefinition`, `NoteDefinition`. PPQN constant `= 96` |
| [`api/FunctionKernel.ts`](../src/Refactoring/node3d/subs/functionsequencer/api/FunctionKernel.ts) | Interface for the kernel that the API talks to. Implementation is in `FunctionKernelImpl.ts` |
| [`api/RemoteUI.ts`](../src/Refactoring/node3d/subs/functionsequencer/api/RemoteUI.ts) | The `RemoteUI` element types and `RemoteUIBuilder` |
| [`wam/FunctionSequencerNode.ts`](../src/Refactoring/node3d/subs/functionsequencer/wam/FunctionSequencerNode.ts) | 4-line stub. The real WAM node is meant to live here |
| [`wam/FunctionSequencerProcessor.ts`](../src/Refactoring/node3d/subs/functionsequencer/wam/FunctionSequencerProcessor.ts) | The AudioWorkletProcessor that runs `onTick` from the audio thread |

If you want to ship this: finish `FunctionSequencerN3D.ts`'s GUI
class, hook the `FunctionKernelImpl` to the processor, and uncomment
the line in `Node3DBuilder.ts:103`.

---

## Drum kit (XR physics)

The most ambitious instrument in the codebase: a **physics-driven
drum kit** that you hit with two virtual drumsticks. Uses Havok physics
for collision detection, applies haptic feedback, and routes hits to a
Burns Audio drum sampler WAM.

### `DrumKitN3D`

| | |
|---|---|
| **Kind** | `drumkit` |
| **File** | [`subs/drumkit/DrumKitN3D.ts`](../src/Refactoring/node3d/subs/drumkit/DrumKitN3D.ts) |

The Node3D wrapper. Loads the drum kit GLB model, gates on
`SceneManager.isPhysicsReady()` (waits up to 5 seconds), instantiates
the underlying `XRDrumKit`, and exposes a single MIDI output sphere
that broadcasts every drum hit as a MIDI event.

- **GUI**: a 1.5×0.1 base plate plus a magenta MIDI output sphere
  at `(.83, -.05, 0)`. The drum kit itself is loaded by `XRDrumKit`.
- **Physics dependency**: at `initDrumKit()` (line 51) it polls
  `sceneManager.isPhysicsReady()` every 100ms up to 50 attempts,
  fetches the Havok plugin, computes the `eventMask` from
  `_hknp.EventType.{COLLISION_STARTED,COLLISION_CONTINUED,COLLISION_FINISHED}`,
  and constructs `new XRDrumKit(scene, eventMask, xr, hk, assetsManager)`.

### `XRDrumKit` subsystem

The folder
[`subs/drumkit/XRDrumKit/`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/)
holds the physics-driven drum logic. ~10 files.

| File | What |
|---|---|
| [`XRDrumKit.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumKit.ts) | The orchestrator. Loads the .glb, instantiates one `XRDrum` per drum head + `XRCymbal` per cymbal + one `XRHiHat`, two `XRDrumstick` (one per hand), `ThroneController` for sit/stand. Holds the `wamInstance` that plays the actual sounds |
| [`XRDrumKitConfig.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumKitConfig.ts) | The big config: `DRUMKIT_CONFIG.{model, midi.{keys,durations}, physics.{minVelocity,maxVelocity,velocityCurve,debounceMs}, velocity.{angularWeight}, haptics.{minIntensity,maxIntensity,duration}}` |
| [`XRDrumstick.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumstick.ts) | One per hand. Owns a physics aggregate that follows the controller, exposes `getVelocity() → {linear, angular}` |
| [`CollisionGroups.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/CollisionGroups.ts) | Bitmasks: `NONE=0`, `DRUMSTICK=1`, `DRUM=2`, `CYMBAL=4`. Used to filter physics events |
| [`CollisionUtils.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/CollisionUtils.ts) | `calculateHitVelocity`, `checkDebounce`, `triggerHapticFeedback`, `scheduleSound`, `isDownwardHit`, `findDrumstickIndex`, `isCollisionWithTrigger` — see below |
| [`AnimationUtils.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/AnimationUtils.ts) | Helpers for the on-hit visual animations |
| [`ThroneController.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/ThroneController.ts) | Detects when the user "sits" on the drum stool; locks/unlocks position |
| [`ThroneUI.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/ThroneUI.ts) | The "Sit / Stand" prompt floating near the throne |
| [`XRLogger.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRLogger.ts) | A custom logger that draws debug text in the world |
| [`RandomDrumPlayer.ts`](../src/Refactoring/node3d/subs/drumkit/RandomDrumPlayer.ts) | Test utility — picks a random drum and hits it, used during development |

Per-component implementations live in
[`XRDrumComponent/`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/):

| File | What |
|---|---|
| [`XRDrumComponent.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRDrumComponent.ts) | 15-line abstract base interface |
| [`XRDrum.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRDrum.ts) | A drum head (kick/snare/toms). Single trigger volume. Snare additionally has a separate `rimshot` MIDI key |
| [`XRCymbal.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRCymbal.ts) | A cymbal disc. Larger trigger volume, decays with a different `durations.cymbals` envelope |
| [`XRHiHat.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRHiHat.ts) | Hi-hat — has open/closed states, two MIDI keys (`closedHiHatKey=42`, `openHiHatKey=46`) |
| [`XRDrumComponentLogger.ts`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumComponent/XRDrumComponentLogger.ts) | Per-component logger |

#### How a hit becomes sound

The hot path through `CollisionUtils`
([source](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/CollisionUtils.ts)):

1. **Havok fires** a collision event between a drumstick body and a
   drum trigger volume.
2. `CollisionUtils.findDrumstickIndex(collision, drumsticks)` (line 141)
   locates which drumstick caused it.
3. `CollisionUtils.checkDebounce(drumstickId, lastHitTime)` (line 49)
   rejects events within `physics.debounceMs` of the last hit on the
   same drumstick — prevents physics jitter from triggering double
   hits.
4. `CollisionUtils.calculateHitVelocity(drumstick)` (line 19) reads
   `drumstick.getVelocity()` and combines linear + `velocity.angularWeight *
   angular` speeds, normalizes to `[0..1]` between
   `physics.minVelocity` and `physics.maxVelocity`, applies
   `Math.pow(_, physics.velocityCurve)`, scales to `[1..127]`.
5. `CollisionUtils.triggerHapticFeedback(controller, velocity)` (line 71)
   pulses the controller's gamepad haptic actuator at intensity
   proportional to velocity, duration `haptics.duration`.
6. `CollisionUtils.scheduleSound(wamInstance, audioCtx, midiKey,
   velocity, duration)` (line 98) emits a `wam-midi` note-on at
   `audioCtx.currentTime` and a note-off at `currentTime + duration`.

The `wamInstance` is the Burns Audio drumsampler — the same one used
by `WamSamplerN3D`. The MIDI keys come from `DRUMKIT_CONFIG.midi.keys`:
kick=35-ish, snare=38, rimshot=37, hi-hat=42/46, etc.

#### TODOs left in the file

[`XRDrumKit.ts:19-30`](../src/Refactoring/node3d/subs/drumkit/XRDrumKit/XRDrumKit.ts)
lists open work items: piano-roll-style recording output, per-zone
velocity scaling, rim/center separation, MIDI pedal support, internal
trigger grip option for sticks, distance constraints to "snap"
drumsticks to hands.

---

## Automation controllers

Five controllers, all under
[`subs/automation/`](../src/Refactoring/node3d/subs/automation/).
Their job is to produce one or more **automation outputs** that drive
parameters on other Node3Ds. Tags include `controller` and `automation`.

### `AutomationControllerN3D`

| | |
|---|---|
| **Kind** | `automation_controller` |
| **Tags** | `automationcontroller`, `automation`, `drag` |
| **File** | [`subs/automation/AutomationControllerN3D.ts`](../src/Refactoring/node3d/subs/automation/AutomationControllerN3D.ts) |

The simplest of the bunch: a base plate with a knob (cylinder + line
to indicate orientation) and an automation output sphere.

- **Output**: `T.AutomationN3DConnectable.Output("automation_controller_output", [output], "Automation Output", 1)`.
  Default value is `1`.
- **Parameter** (lines 82–93): `automation_parameter` — drag the
  knob, sets `output.value` *and* spins the GUI cylinder by
  `value * π - π/2`.
- **Trick**: the parameter delegates `getLabel`, `getStepCount`,
  `stringify` to the *connected* automation source — so the knob
  shows the units of whatever it's driving (e.g. "230 Hz" if it's
  wired to an oscillator's frequency). See
  [chapter 03 §Automation](03-node3d-system.md#automation--automationn3dconnectable-source).

### `PositionCubeN3D`

| | |
|---|---|
| **Kind** | `the_cube` |
| **Tags** | `automation`, `controller`, `3d_position`, `interactive` |
| **File** | [`subs/automation/PositionCubeN3D.ts`](../src/Refactoring/node3d/subs/automation/PositionCubeN3D.ts) |

A transparent cube with three coloured cross-axis lines that follow a
"cursor point". Pinch the trigger inside the cube to move the cursor;
its `(x, y, z)` are emitted on three automation outputs.

- **Three outputs**: `position_x`, `position_y`, `position_z`,
  default values `0.5`. Output spheres are coloured darker R/G/B.
- **Interaction** (`InputPressBehavior` on the cube mesh, lines
  186–208): when a controller presses the trigger inside the cube,
  it captures the controller's pointer; on `pointer.onMove` the cube
  computes the local position, clamps to `[-0.5, 0.5]^3`, and sets
  the three outputs.
- **Visual** (lines 127–143): the cursor point and the cube edges
  are tinted with the current `(x, y, z)` as RGB; the transparent
  body uses `materialTransparent` (the dithered noise material from
  `N3DShared`).
- Two factories: `DEFAULT` (size 1.5) and `LARGE` (size 2.5).

### `GazeControllerN3D`

| | |
|---|---|
| **Kind** | `gaze` |
| **Tags** | `automationcontroller`, `automation`, `gaze` |
| **File** | [`subs/automation/GazeControllerN3D.ts`](../src/Refactoring/node3d/subs/automation/GazeControllerN3D.ts) |

An "eye" sphere that switches between two values depending on whether
the user is looking at it.

- **GUI**: base + 1m diameter "eye" sphere (red when not gazed at,
  green when gazed at) + two small knobs (`disabledRotator`,
  `enabledRotator`).
- **Output**: one automation value. When `isGaze`, output is
  `enabledValue`; else `disabledValue`. Both are user-controlled
  via the two knobs.
- **Gaze detection** (lines 152–166): subscribes to
  `InputManager.getInstance().head.onNewTarget` and switches state
  when `e.targetMesh === gui.eye`.
- The observer is wrapped in
  [`usingWith`](../src/Refactoring/utils/utils.ts) so it auto-detaches
  when the GUI base mesh is disposed.

### `VoiceVolumeControllerN3D`

| | |
|---|---|
| **Kind** | `voice` |
| **Tags** | `automationcontroller`, `automation`, `voice` |
| **File** | [`subs/automation/VoiceVolumeControllerN3D.ts`](../src/Refactoring/node3d/subs/automation/VoiceVolumeControllerN3D.ts) |

A microphone + LED, and **two** automation outputs: voice volume and
voice pitch.

- **Audio analysis** (`init()`, lines 166–207):
  - `navigator.mediaDevices.getUserMedia({audio: ...})` with
    autoGainControl, noiseSuppression, echoCancellation all
    *disabled* (so we get the raw signal).
  - Wired into a `MediaStreamSource → AnalyserNode (fftSize=2048)`.
  - A `setInterval(..., 25ms)` reads `getByteFrequencyData(data)`,
    finds peak volume in the first 30 bins, and the lowest bin
    above 64 (a crude pitch estimate).
- **Two outputs**: `volume` and `pitch`, both blended between the
  user-controlled `disabledValue` and `enabledValue` knobs by the
  detected ratio.
- **LED**: green when volume is non-zero, red otherwise.

> **Browser permission**: the first time you spawn this, the page
> will prompt for microphone access. Without it the controller is
> silent.

### `ElectroballsN3D`

| | |
|---|---|
| **Kind** | (unregistered — no entry in `Node3DBuilder.FACTORY_KINDS`) |
| **Tags** | `automation`, `controller`, `3d_position`, `interactive` |
| **File** | [`subs/automation/ElectroballsN3D.ts`](../src/Refactoring/node3d/subs/automation/ElectroballsN3D.ts) |

A planned 4-balls (A red, B green, C blue, D white) physics-based
controller. The GUI is built (lines 26–73) but the `Node3D` class
(line 79) is empty beyond setting up the bounding box — the
electroball physics are not implemented yet. Stub.

---

## WAM bridges

### `Wam3DGeneratorN3D`

| | |
|---|---|
| **Kind** | `wam3d-<name>`, `add-<name>`, `desc:<json>`, `external:<url>`, or any unprefixed kind that the config server resolves |
| **File** | [`subs/Wam3DGeneratorN3D.ts`](../src/Refactoring/node3d/subs/Wam3DGeneratorN3D.ts) |

The generic bridge to **any** WebAudioModule with a 3D-GUI
description. This is what makes "load any WAM" possible.

- The `Wam3DGeneratorN3DFactory` is **not** an `export const`. It's a
  class with a static `create(code: WAMGuiInitCode)` that takes a
  WAM init code, fetches the WAM's `descriptor.json` to derive
  appropriate tags
  ([lines 144–193](../src/Refactoring/node3d/subs/Wam3DGeneratorN3D.ts)):
  - `audioIn + audioOut` → `audio + effect`
  - `audioOut only` → `audio + generator`
  - `audioIn only` → `audio + consumer`
  - `audioOut + midiIn` → `audio + midi + instrument`
  - `midiIn + midiOut` → `midi + effect`
  - etc.
- **GUI generation**: uses the
  [`wam3dgenerator`](https://github.com/Jempasam/3d_wam_editor)
  library's `WamGUIGenerator.create_and_init(...)`. The library
  introspects the WAM's descriptor and builds a 3D control surface;
  in this code we pass it Babylon callbacks so it builds Babylon
  meshes.
- **Bridging callbacks** (lines 49–108): for every control field the
  WAM exposes, register a Node3D parameter. For every audio/MIDI
  in/out, register the appropriate `T.AudioN3DConnectable.*` /
  `T.MidiN3DConnectable.*`. The `count` variable disambiguates
  multiple ports of the same kind.
- **State management**: uses
  `wam3dgenerator`'s `ControlStateManager` (line 109). On change it
  calls `context.notifyStateChange(name)`.
- **Note**: parameters are registered with `notSynced: true` (line 67)
  because the `ControlStateManager` already syncs the underlying WAM
  state — letting the host also sync would double up.

### `WamSamplerN3D` / drumSampler

| | |
|---|---|
| **Kind** | (unregistered — exported but `Node3DBuilder` doesn't map any string to it) |
| **File** | [`subs/drumSampler.ts`](../src/Refactoring/node3d/subs/drumSampler.ts) |

A hardcoded bridge to the
[Burns Audio DrumSampler](https://www.webaudiomodules.com/community/plugins/burns-audio/drumsampler/index.js)
WAM. It's the same WAM the `XRDrumKit` plays into. Currently used as a
class for the drum kit, not exposed as a separate spawnable.

- Two simple ports: one MIDI input (sphere on the left) and one
  audio output (sphere on the right).
- Sets `WamTransportManager.getInstance(audioCtx)` so the sampler
  receives transport events.
- State key: `"wamState"` — round-trips the WAM's own state via
  `audioNode.getState() / setState()`.

---

## Tools / debug

### `AutomationToolN3D` (Harp variant)

| | |
|---|---|
| **Kind** | (unregistered — file naming is misleading) |
| **File** | [`subs/AutomationToolN3D.ts`](../src/Refactoring/node3d/subs/AutomationToolN3D.ts) |

Despite the file name, this exports `AutomationToolN3DFactory.DEFAULT`
labelled "Simple Harp" (10 strings) and `LARGE` labelled "Large Harp"
(20 strings) — but the registered `harp` and `large_harp` kinds in
`Node3DBuilder` actually point at
[`note_generator/HarpN3D.ts`](../src/Refactoring/node3d/subs/note_generator/HarpN3D.ts),
not this file.

The class itself defines a useful **mixer tool**: a base with three
parameter cubes (`mode`, `min`, `max`) plus a MIDI input and an
automation output. The static `MODES` array (lines 103–126) defines
three mixer modes — `Average`, `Max`, `Min`. Probably intended as a
"combine multiple automations into one" plug-in but currently
unfinished.

### `SyncDebugN3D`

| | |
|---|---|
| **Kind** | `sync_debug` |
| **Tags** | `sync`, `debug`, `audio` |
| **File** | [`subs/debug/SyncDebugN3D.ts`](../src/Refactoring/node3d/subs/debug/SyncDebugN3D.ts) |

A diagnostic node for the [Sync protocol](03-node3d-system.md#sync--syncn3dconnectable).

- One `Container(1)` (1-second loop), exposed as both a Sync input
  and a Sync output sphere.
- Three little parameter spheres show `start`, `duration`, `total`
  in seconds — drag the duration sphere to set it, the others are
  read-only displays.
- Use this to visualise how Sync messages cascade through a chain
  of sequencers: spawn a sequencer + sync_debug, wire them together,
  watch how `start` and `total` update.

### `TemplateN3D`

| | |
|---|---|
| **Kind** | (unregistered) |
| **File** | [`subs/TemplateN3D.ts`](../src/Refactoring/node3d/subs/TemplateN3D.ts) |

The boilerplate to copy when starting a new instrument. See chapter
[03 §The canonical Hello world](03-node3d-system.md#the-canonical-hello-world--templaten3dts)
for an annotated walkthrough.

---

## Where to go next

- For the recipe of building a new instrument from scratch, head to
  [09 §1](09-contributor-guide.md#1-add-a-new-instrument-node3d).
- The **wiring** (how ports connect into wires) lives in
  [03 §Connection protocols](03-node3d-system.md#connection-protocols)
  and [07 §iomanager](07-menus-and-world.md#iomanager--connectionmanager).
- The **physics setup** that XRDrumKit relies on is in
  [02 §SceneManager](02-app-core.md#scenemanager-scenemanagerts).
