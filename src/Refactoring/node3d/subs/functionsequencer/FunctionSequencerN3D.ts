import { AbstractMesh, Color3, TransformNode } from "@babylonjs/core"
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D"
import type { Node3DContext } from "../../Node3DContext"
import type { Node3DGUIContext } from "../../Node3DGUIContext"
import { InputPressBehavior } from "../../../xr/inputs/tools/InputPressBehavior"
import { ScriptExecutor } from "./ScriptExecutor"
import { MidiEventManager } from "./MidiEventManager"
import { FunctionKernelImpl } from "./FunctionKernelImpl"
import { FunctionAPI, NoteDefinition, ParameterDefinition } from "./FunctionAPI"
import { RemoteUI, RemoteUIBuilder, RemoteUIElement } from "./api/RemoteUI"

const DEFAULT_SCRIPT = `// Function Sequencer Script
// Test UI Generation

class MySequencer {
    constructor() {
        this.step = 0
        this.isRunning = false
        this.noteLength = 0.25
    }
    
    init() {
        // Register parameters
        api.registerParameters([
            {
                id: "rate",
                config: {
                    label: "Rate",
                    type: "float",
                    minValue: 0.1,
                    maxValue: 2.0,
                    defaultValue: 1.0
                }
            },
            {
                id: "velocity",
                config: {
                    label: "Velocity",
                    type: "int",
                    minValue: 1,
                    maxValue: 127,
                    defaultValue: 100
                }
            }
        ])
        
        // Build UI
        const controlsRow = ui.Row("controls", [
            ui.Action("start", { label: "Start" }),
            ui.Action("stop", { label: "Stop" }),
            ui.Toggle("running", { label: "Running" })
        ])
        
        const paramsRow = ui.Row("parameters", [
            ui.Knob("rate", { label: "Rate", showValue: true }),
            ui.Knob("velocity", { label: "Velocity", showValue: true }),
            ui.Slider("noteLength", { label: "Note Length", width: 0.3 })
        ])
        
        const infoCol = ui.Col("info", [
            ui.Label("Function Sequencer Test"),
            ui.Label("Step: 0"),
            ui.Select("scale", { label: "Scale" })
        ])
        
        api.registerUI(
            ui.Col("main", [
                infoCol,
                controlsRow,
                paramsRow
            ])
        )
    }
    
    onTick(tick) {
        if (!this.isRunning) return
        
        const params = api.getParams()
        const rate = params.rate || 1.0
        const velocity = params.velocity || 100
        
        // Trigger every 24 ticks (16th note at 96 PPQN)
        if (tick % Math.floor(24 / rate) === 0) {
            this.step = (this.step + 1) % 8
            
            // Play C major scale
            const notes = [60, 62, 64, 65, 67, 69, 71, 72]
            const note = notes[this.step]
            
            api.emitNote(0, note, velocity, this.noteLength)
            
            // Highlight step
            ui.Highlight("start", this.step % 2 === 0)
        }
    }
    
    onAction(name) {
        if (name === "start") {
            this.isRunning = true
            this.step = 0
        } else if (name === "stop") {
            this.isRunning = false
            this.step = 0
        }
    }
    
    onMidi(bytes) {
        // Pass through MIDI
        api.emitMidiEvent(bytes, api.getCurrentTime())
    }
    
    onCustomNoteList(noteList) {
        console.log("Custom note list:", noteList)
    }
}

return new MySequencer()
`

/**
 * GUI du Function Sequencer Node3D
 */
export class FunctionSequencerN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext
    root!: TransformNode

    constructor(public factory: FunctionSequencerN3DFactory) { }

    async init(context: Node3DGUIContext) {
        this.context = context
        this.root = new TransformNode("FunctionSequencerGUI", context.scene)
    }

    // Create UI
    ui: RemoteUIBuilder = new RemoteUIBuilder(RemoteUI.
    setUI(){
        const ugi
    }

    async dispose() {
        this.root.dispose()
    }
}

/**
 * Node3D du Function Sequencer
 */
export class FunctionSequencerN3D implements Node3D {
    async setState(key: string, state: Serializable | undefined): Promise<void> { }
    async getState(key: string): Promise<Serializable | void> { }
    getStateKeys(): string[] { return [] }
    async dispose(): Promise<void> { }
}

/**
 * Factory du Function Sequencer Node3D
 */
export class FunctionSequencerN3DFactory implements Node3DFactory<FunctionSequencerN3DGUI, FunctionSequencerN3D> {

    label = "Function Sequencer"
    description = "Live-code a MIDI sequencer with JavaScript"
    tags = ["midi", "sequencer", "live_coding", "generator", "effect"]

    async createGUI(context: Node3DGUIContext): Promise<FunctionSequencerN3DGUI> {
        const gui = new FunctionSequencerN3DGUI(this)
        await gui.init(context)
        return gui
    }

    async create(context: Node3DContext, gui: FunctionSequencerN3DGUI): Promise<FunctionSequencerN3D> {
        return new FunctionSequencerN3D(context, gui)
    }

    static DEFAULT = new FunctionSequencerN3DFactory()
}
