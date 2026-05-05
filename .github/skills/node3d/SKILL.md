---
name: node3d
description: Build custom 3D audio/music nodes. Create a Node3D by defining GUI, logic, and factory. Includes connectables (audio, MIDI, sync) and parameters for interactivity.
---

# Create a Node3D Component

## Purpose

A **Node3D** is a self-contained 3D interactive component in the musical multiverse. It combines:
- **Visual representation** (BabylonJS meshes)
- **Logic/state** (audio processing, MIDI generation, etc.)
- **Connectivity** (inputs/outputs for audio, MIDI, sync)
- **Interactivity** (draggable parameters, buttons)

This skill teaches the complete workflow to create a custom Node3D from scratch.

## When to Create a Node3D

✅ **Create when:**
- Building a new synthesizer/effect
- Creating an audio generator (sequencer, oscillator, etc.)
- Building interactive 3D UI components
- Need audio/MIDI I/O connectors
- Want per-instance parameters

❌ **Don't create when:**
- Simple static 3D models (use regular meshes)
- Pure UI components without audio (use standard Node3D features)
- No interactivity needed

---

# Step-by-Step Workflow

## 1. Plan Your Node3D

**Define:**
- **Name:** Short, descriptive (e.g., "Sequencer", "Oscillator")
- **Purpose:** What does it do? (Generate audio, trigger notes, etc.)
- **Inputs:** Connectables coming IN (audio, MIDI, sync)
- **Outputs:** Connectables going OUT (audio, MIDI, sync)
- **Parameters:** Draggable/adjustable values (frequency, duration, etc.)

**Example - Oscillator:**
```
Name: Oscillator
Purpose: Generate sinusoidal audio wave
Inputs: Sync (optional timing)
Outputs: Audio output
Parameters: Frequency (slider 0-1000 Hz)
```

**Example - Sequencer:**
```
Name: Sequencer
Purpose: Play pattern of MIDI notes in time
Inputs: Sync input (timing/tempo)
Outputs: MIDI output, Sync output
Parameters: 144 note pads (on/off), 12 note pitch sliders
```

---

## 2. Create the GUI Class

The GUI class creates all 3D meshes and stores references.

### Basic Structure

```typescript
import type { Node3DGUI } from "../Node3D";
import type { Node3DGUIContext } from "../Node3DGUIContext";

class MyNode3DGUI implements Node3DGUI {
    // Store all mesh references
    root: TransformNode          // Parent container
    block: AbstractMesh          // Main body
    audioOutput: AbstractMesh    // Connector mesh
    parameter: AbstractMesh      // Parameter visual

    get worldSize() { return 1 } // Size hint for selection

    constructor(readonly context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        
        // Create root container
        this.root = new B.TransformNode("mynode root", context.scene)

        // Create main body
        this.block = B.CreateBox("block", {...}, context.scene)
        this.block.material = context.materialMat
        this.block.parent = this.root

        // Create audio output connector
        this.audioOutput = T.ConnectableUtils.createOutputMesh(
            "audio_output",
            0.5,
            context.scene
        )
        this.audioOutput.parent = this.root
        this.audioOutput.position.set(0.5, 0, 0)

        // Create parameter (sphere for dragging)
        this.parameter = B.CreateSphere("param", {diameter: 0.3}, context.scene)
        this.parameter.parent = this.root
        this.parameter.position.set(0, 0.5, 0)
    }

    async dispose(): Promise<void> {
        this.root.dispose()
    }
}
```

### Key Points

- ✅ Implement `Node3DGUI` interface
- ✅ Create `root` TransformNode as parent
- ✅ Use `context.materialMat` for all meshes
- ✅ Store all important mesh references
- ✅ Implement `get worldSize()`
- ✅ Implement `async dispose()`
- ✅ Position connectors/parameters relative to root

### Mesh Types

```typescript
// Main body
const box = B.CreateBox("box", {width: 1, height: 0.5, depth: 1}, scene)
const sphere = B.CreateSphere("sphere", {diameter: 1}, scene)
const cylinder = B.CreateCylinder("cyl", {diameter: 1, height: 0.5}, scene)

// Connectors (audio/MIDI/sync inputs/outputs)
const audioOut = T.ConnectableUtils.createOutputMesh("audio", 0.5, scene)
const audioIn = T.ConnectableUtils.createInputMesh("audio", 0.5, scene)
const syncOut = B.CreateIcoSphere("sync", {radius: 0.5}, scene)
const syncIn = B.CreateIcoSphere("sync", {radius: 0.5}, scene)

// Parameters (usually spheres for dragging)
const slider = B.CreateSphere("slider", {diameter: 0.3}, scene)
```

---

## 3. Create the Node3D Logic Class

The Node3D class manages state and audio processing.

### Basic Structure

```typescript
import type { Node3D } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";

class MyNode3D implements Node3D {
    // Audio/MIDI nodes
    private audioNode: OscillatorNode
    private midiOutput: MidiN3DConnectable.ListOutput

    // State
    private frequency = 440

    // Sync timing
    private sync: SyncContainer

    constructor(context: Node3DContext, private gui: MyNode3DGUI) {
        const { tools: T } = context

        // Add to bounding box
        context.addToBoundingBox(gui.block)

        // Create audio nodes
        this.audioNode = context.audioCtx.createOscillator()
        this.audioNode.frequency.value = this.frequency
        this.audioNode.start()

        // Create MIDI output connectable
        this.midiOutput = new T.MidiN3DConnectable.ListOutput(
            "midioutput",
            [gui.audioOutput],
            "Audio Output"
        )
        context.createConnectable(this.midiOutput)

        // Create Sync container
        this.sync = new T.SynxN3DConnectable.Container(1)
        context.createConnectable(
            new T.SynxN3DConnectable.Input(
                "syncInput",
                [gui.audioInput],
                "Sync Input",
                this.sync
            )
        )

        // Create parameters
        context.createParameter({
            id: "frequency",
            meshes: [gui.parameter],
            getLabel() { return "Frequency" },
            getStepCount() { return 100 },
            getValue() { return this.frequency / 1000 },
            setValue(value: number) {
                this.frequency = value * 1000
                this.audioNode.frequency.value = this.frequency
                context.notifyStateChange("frequency")
            },
            stringify(value: number) {
                return `${Math.round(value * 1000)} Hz`
            },
        })
    }

    async setState(key: string, value: any): Promise<void> {
        // Load state from save file
        if (key === "frequency") {
            this.frequency = value
            this.audioNode.frequency.value = this.frequency
        }
    }

    async getState(key: string): Promise<any> {
        // Save state to file
        if (key === "frequency") return this.frequency
    }

    getStateKeys(): string[] {
        return ["frequency"]
    }

    async dispose(): Promise<void> {
        this.audioNode.stop()
    }
}
```

### Key Points

- ✅ Implement `Node3D` interface
- ✅ Constructor receives `context` and `gui` instance
- ✅ Call `context.addToBoundingBox(gui.block)`
- ✅ Create connectables with `context.createConnectable()`
- ✅ Create parameters with `context.createParameter()`
- ✅ Implement `setState()`, `getState()`, `getStateKeys()` for save/load
- ✅ Implement `async dispose()`

### Creating Connectables

```typescript
// Audio output
context.createConnectable(
    new T.AudioN3DConnectable.Output(
        "audioOutput",
        [gui.audioOutput],     // Meshes to interact with
        "Audio Output",        // Label
        audioNode              // Audio node to connect
    )
)

// MIDI output
context.createConnectable(
    new T.MidiN3DConnectable.ListOutput(
        "midioutput",
        [gui.midiOutput],
        "MIDI Output"
    )
)

// Sync input
context.createConnectable(
    new T.SynxN3DConnectable.Input(
        "syncInput",
        [gui.syncInput],
        "Sync Input",
        syncContainer
    )
)
```

### Creating Parameters

```typescript
context.createParameter({
    id: "parameter_id",           // Unique identifier
    meshes: [gui.parameterMesh],  // Mesh to interact with
    
    getLabel(): string {
        return "Parameter Name"
    },
    
    getStepCount(): number {
        return 100  // Number of discrete steps (0 = continuous)
    },
    
    getValue(): number {
        return currentValue  // Return 0-1 normalized
    },
    
    setValue(value: number): void {
        // Update internal state
        this.internalValue = value * 100
        context.notifyStateChange("parameter_id")
    },
    
    stringify(value: number): string {
        return `${Math.round(value * 100)}`  // Display string
    },
})
```

---

## 4. Create the Factory

The factory is the blueprint for creating instances.

### Basic Structure

```typescript
import type { Node3DFactory } from "../Node3D";

export const MyNode3DFactory: Node3DFactory<MyNode3DGUI, MyNode3D> = {
    label: "My Node",
    description: "A simple node that does something cool",
    tags: ["audio", "generator", "custom"],
    
    createGUI: async (context) => new MyNode3DGUI(context),
    create: async (context, gui) => new MyNode3D(context, gui),
}
```

### Key Points

- ✅ Export factory as `const [Name]N3DFactory`
- ✅ Implement `label` (short name)
- ✅ Implement `description` (what it does)
- ✅ Add relevant `tags` for discovery
- ✅ Implement `createGUI()` async factory
- ✅ Implement `create()` async factory
- ✅ Generic types: `<GUI_Class, Node3D_Class>`

---

## 5. Register in Node3DBuilder

To make your Node3D discoverable, add it to [Node3DBuilder.ts](../app/Node3DBuilder.ts):

```typescript
import { MyNode3DFactory } from "../node3d/subs/MyNode3D.ts"

export class Node3DBuilder {
    FACTORY_KINDS = [
        "audiooutput", "oscillator",
        "my_node",  // ← Add your kind here
        // ...
    ]

    private async createFactories(kind: string) {
        if (kind === "my_node") return MyNode3DFactory
        // ...
    }
}
```

---

# Complete Examples

## Example 1: Simple Oscillator (Minimal)

```typescript
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";

class OscillatorN3DGUI implements Node3DGUI {
    audioOutput: AbstractMesh
    block: AbstractMesh
    root: TransformNode
    frequency: AbstractMesh

    get worldSize() { return 1 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        
        this.root = new B.TransformNode("oscillator root", context.scene)
        
        this.audioOutput = T.ConnectableUtils.createOutputMesh("output", 0.5, context.scene)
        this.audioOutput.parent = this.root
        this.audioOutput.position.set(0.75, -0.25, 0)

        this.block = B.CreateBox("oscillator box", { width: 1, height: 0.5, depth: 1 }, context.scene)
        this.block.parent = this.root
        this.block.position.y = -0.25

        this.frequency = B.CreateSphere("frequency", { diameter: 0.5 }, context.scene)
        this.frequency.parent = this.root
        this.frequency.position.set(0, 0.25, 0)
    }

    async dispose() { }
}

class OscillatorN3D implements Node3D {
    audionode: OscillatorNode

    constructor(context: Node3DContext, private gui: OscillatorN3DGUI) {
        const { tools: T } = context

        context.addToBoundingBox(gui.block)

        this.audionode = context.audioCtx.createOscillator()
        this.audionode.frequency.value = 440
        this.audionode.start()

        context.createConnectable(
            new T.AudioN3DConnectable.Output(
                "audioOutput",
                [gui.audioOutput],
                "Audio Output",
                this.audionode
            )
        )

        context.createParameter({
            id: "frequency",
            getLabel() { return "Frequency" },
            getStepCount() { return 100 },
            getValue() { return (this.audionode.frequency.value - 130) / 100 },
            setValue(value: number) {
                this.audionode.frequency.value = value * 100 + 130
            },
            meshes: [gui.frequency],
            stringify(value) { return `${Math.round(value * 100 + 130)} Hz` },
        })
    }

    async setState(key: string, value: any) { }
    async getState(key: string) { }
    getStateKeys() { return [] }
    async dispose() { }
}

export const OscillatorN3DFactory: Node3DFactory<OscillatorN3DGUI, OscillatorN3D> = {
    label: "Oscillator",
    description: "Generates sinusoidal audio wave",
    tags: ["oscillator", "audio", "generator"],
    createGUI: async (context) => new OscillatorN3DGUI(context),
    create: async (context, gui) => new OscillatorN3D(context, gui),
}
```

## Example 2: Complex Sequencer (With Grid & State)

See [SequencerN3D.ts](../../src/Refactoring/node3d/subs/SequencerN3D.ts) for a full implementation with:
- 12×12 grid of note pads (using instances optimization)
- MIDI output + Sync I/O
- Multiple parameters (note on/off, pitch selection)
- State management (save/load)

---

# Quality Checklist

Before considering your Node3D complete:

- [ ] GUI class implements `Node3DGUI`
- [ ] GUI creates `root` TransformNode
- [ ] All meshes use `context.materialMat`
- [ ] Node3D class implements `Node3D`
- [ ] Constructor calls `context.addToBoundingBox()`
- [ ] All connectables created with `context.createConnectable()`
- [ ] All parameters created with `context.createParameter()`
- [ ] `setState()`, `getState()`, `getStateKeys()` implemented
- [ ] `async dispose()` implemented on both classes
- [ ] Factory exported with proper naming: `[Name]N3DFactory`
- [ ] Factory has `label`, `description`, `tags`
- [ ] Factory registered in Node3DBuilder
- [ ] No console errors when loading
- [ ] Connectors (inputs/outputs) are clickable
- [ ] Parameters respond to dragging
- [ ] Audio/MIDI processing works end-to-end

---

# Common Patterns

### Toggle Parameter (On/Off)

```typescript
context.createParameter({
    id: "toggle_param",
    meshes: [gui.toggleMesh],
    getLabel() { return "Toggle" },
    getStepCount() { return 2 },  // On/Off
    getValue() { return this.isOn ? 1 : 0 },
    setValue(value: number) {
        this.isOn = value > 0.5
    },
    stringify(value) { return value > 0.5 ? "On" : "Off" },
})
```

### Range Slider (Continuous)

```typescript
context.createParameter({
    id: "range_param",
    meshes: [gui.sliderMesh],
    getLabel() { return "Amount" },
    getStepCount() { return 0 },  // Continuous
    getValue() { return this.value },  // 0-1
    setValue(value: number) {
        this.value = Math.max(0, Math.min(1, value))
    },
    stringify(value) { return `${Math.round(value * 100)}%` },
})
```

### Grid of Parameters (Like Sequencer)

```typescript
for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
        const id = `grid_${row}_${col}`
        context.createParameter({
            id: id,
            meshes: [gui.gridMeshes[row][col]],
            getValue() { return this.gridState[row][col] ? 1 : 0 },
            setValue(value: number) {
                this.gridState[row][col] = value > 0.5
                // Update visual
                this.updateGridVisual(row, col)
            },
            // ...
        })
    }
}
```

---

# Common Pitfalls

### ❌ Forgetting `context.addToBoundingBox()`
```typescript
// Missing: context.addToBoundingBox(gui.block)
// Result: Node can't be selected/moved
```
→ Fix: Always add main mesh to bounding box

### ❌ Not Storing Parameter Mesh References
```typescript
// ❌ Wrong: Creating throwaway mesh
const tempMesh = B.CreateSphere("temp", {...}, scene)
context.createParameter({meshes: [tempMesh], ...})
// tempMesh is lost, parameter can't be found later
```
→ Fix: Store in GUI and keep reference

### ❌ Using Wrong Material
```typescript
// ❌ Wrong: Creating custom material
const mat = new B.StandardMaterial("custom", scene)
this.block.material = mat
```
→ Fix: Always use `context.materialMat`

### ❌ Not Implementing Dispose
```typescript
// ❌ Wrong: No cleanup
async dispose() { }

// Result: Memory leak if node is deleted
```
→ Fix: Call `dispose()` on all meshes and audio nodes

### ❌ Forgetting Async/Await
```typescript
// ❌ Wrong: Not async
createGUI(context) { return new MyGUI(context) }

// Should be:
async createGUI(context) { return new MyGUI(context) }
```

---

# Testing Your Node3D

### 1. Visual Verification
- Does the node appear in 3D scene?
- Can you drag it around?
- Do parameter meshes respond to dragging?

### 2. Connection Testing
- Can you drag connectors to other nodes?
- Do connected inputs/outputs work?

### 3. Audio Testing
- Open browser DevTools Console
- Connect to speakers/output
- Trigger audio events
- Check for errors

### 4. State Testing
- Modify parameters
- Save the scene
- Reload
- Verify parameters are restored

---

# Performance Tips

- Use **instances** for grids of identical meshes (see instances skill)
- **Batch parameter updates** instead of per-frame updates
- **Lazy load** heavy resources (images, models)
- **Dispose properly** to avoid memory leaks
- Limit **parameter update frequency** (not every frame)

---

# Related Skills

- **instances** - Optimize grids of meshes (sequencer pads, keyboards)
- **agent-customization** - Create custom agent instructions
- **SyncN3DConnectable** - Understand sync protocol between nodes

---

# Template: Copy & Paste Starter

```typescript
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";

class MyN3DGUI implements Node3DGUI {
    root: any
    block: any

    get worldSize() { return 1 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B } = context
        this.root = new B.TransformNode("my_root", context.scene)
        this.block = B.CreateBox("block", {}, context.scene)
        this.block.material = context.materialMat
        this.block.parent = this.root
    }

    async dispose() { }
}

class MyN3D implements Node3D {
    constructor(context: Node3DContext, private gui: MyN3DGUI) {
        context.addToBoundingBox(gui.block)
    }

    async setState(key: string, value: any) { }
    async getState(key: string) { }
    getStateKeys() { return [] }
    async dispose() { }
}

export const MyN3DFactory: Node3DFactory<MyN3DGUI, MyN3D> = {
    label: "My Node",
    description: "Does something",
    tags: ["custom"],
    createGUI: async (context) => new MyN3DGUI(context),
    create: async (context, gui) => new MyN3D(context, gui),
}
```

---

**Last Updated:** May 5, 2026  
**Examples:** OscillatorN3D (simple), SequencerN3D (complex with grid)  
**Key Files:** [Node3D.ts](../node3d/Node3D.ts), [Node3DBuilder.ts](../app/Node3DBuilder.ts)
