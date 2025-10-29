import { Color3, Color4, type AbstractMesh } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DGUIContext } from "../Node3DGUIContext";
import { MidiN3DConnectable } from "../tools";
import { Node3DContext } from "../Node3DContext";

const NOTE_NAME = ["Do/C","Do#/C#","Re/D","Re#/D#", "Mi/E","Fa/F","Fa#/F#","Sol/G", "Sol#/G#","La/A","La#/A#","Si/B"]
const WHITE = Color3.White().toColor4()
const BLACK = Color3.Black().toColor4()
const NODE_COLOR = [WHITE, BLACK, WHITE, BLACK,  WHITE, WHITE, BLACK, WHITE,  BLACK, WHITE, BLACK, WHITE]

class SequencerN3DGUI implements Node3DGUI {

    root
    block
    notes: AbstractMesh[][] = [] 
    output
    octave

    readonly stepCount = 12
    readonly noteCount = 12
    readonly firstNote = 0

    constructor(private context: Node3DGUIContext) {
        const {babylon:B,tools:T} = context

        this.root = new B.TransformNode("sequencer root", context.scene)

        // Get dimensions
        const aspectRatio = this.stepCount/this.noteCount

        const [width,height] = (()=>{
            if(aspectRatio>1) return [1,1/aspectRatio]
            else return [aspectRatio,1]
        })()

        const baseSize = .5/Math.max(1, Math.min(this.stepCount, this.noteCount))

        // Create base
        const block = this.block = B.CreateBox("sequencer block", {width: width, height: baseSize, depth: height}, context.scene)
        T.MeshUtils.setColor(this.block, Color3.Blue().toColor4())
        block.position.y = -baseSize/2
        block.parent = this.root

        // Create output
        const output = this.output = B.CreateIcoSphere("sequencer output", {radius:baseSize*.7}, context.scene)
        T.MeshUtils.setColor(output, MidiN3DConnectable.OutputColor.toColor4())
        output.position.set(.5+baseSize*.7, -baseSize*.7, 0)
        output.parent = this.root

        // Create notes
        const createKeyboard = (fx: number, fy: number, tx: number, ty: number)=>{
            const sx = tx-fx
            const sy = ty-fy

            const note_width = sx/(this.stepCount)
            const note_height = sy/(this.noteCount)
            const w = note_width*.9
            const h = note_height*.9
            for(let s = 0; s<this.stepCount; s++){
                const step = [] as AbstractMesh[]
                this.notes.push(step)
                for(let n = 0; n<this.noteCount; n++){
                    const x = (s+.5)*note_width+fx
                    const y = ty-(n+.5)*note_height
                    const note_pad = B.CreateBox(`sequence note ${n} step ${s}`, {width: w, height: baseSize*.2, depth: h}, context.scene)
                    step.push(note_pad)
                    this.uncolorize(s, n)
                    note_pad.position.set(x,baseSize*.1,y)
                    note_pad.parent = this.root
                }
            }
        }

        createKeyboard(
            -width/2 +baseSize*.2 + baseSize*1.5 +baseSize*.2,
            -height/2 +baseSize*.2,
            width/2 -baseSize*.2,
            height/2 -baseSize*.2,
        )

        // Create octave button
        const octave = this.octave = B.CreateCylinder("sequencer octave", {diameter: baseSize*1.5, height: baseSize*2}, context.scene)
        octave.setPivotPoint(new B.Vector3(0,-baseSize,0))
        octave.position.set(-width/2 + baseSize*.95, baseSize, 0)
        octave.parent = this.root
    }

    getNodePad(step: number, note: number){
        return this.notes[step][note] 
    }

    uncolorize(step: number, note: number) {
        const {tools:T} = this.context
        T.MeshUtils.setColor(this.getNodePad(step, note), NODE_COLOR[(this.firstNote+note)%12])
    }

    colorize(step: number, note: number, color: (value:Color4)=>Color4){
        const {tools:T} = this.context
        T.MeshUtils.setColor(this.getNodePad(step, note), color(NODE_COLOR[(this.firstNote+note)%12]))
    }

    async dispose(): Promise<void> {
        this.root.dispose()
        this.notes = []
    }

    get worldSize() { return 4 }
}

class SequencerN3D implements Node3D{

    private note_states = [] as boolean[][]

    private set(step:number,note:number,value:boolean){
        this.note_states[step][note] = value
        if(value) this.gui.colorize(step, note, (light:Color4)=>Color3.Green().toColor4().addInPlace(light).scaleInPlace(.5))
        else this.gui.uncolorize(step, note)
    }

    constructor(context: Node3DContext, private gui: SequencerN3DGUI){
        const {tools:T} = context
        const sequencer = this

        context.addToBoundingBox(gui.block)

        // Create midi output
        const midi_output = new T.MidiN3DConnectable.ListOutput("midioutput", [gui.output], "MIDI Output")
        context.createConnectable(midi_output)

        // Create note buttons
        for(let s=0; s<gui.notes.length; s++){
            const step_note_states = [] as boolean[]
            this.note_states.push(step_note_states)
            for(let n=0; n<gui.notes[s].length; n++){
                step_note_states.push(false)
                const note_pad = gui.getNodePad(s, n)
                const note = (n+gui.firstNote)%12
                const label = `${NOTE_NAME[note]} n°${s+1}`
                context.createParameter({
                    id: `sequencer_note_${n}_${s}`,
                    meshes: [note_pad],
                    getLabel() { return label },
                    getStepCount() { return 2 },
                    getValue() { return step_note_states[n] ? 1 : 0 },
                    setValue(v){ sequencer.set(s, n, v<.5 ? false : true) },
                    stringify(v) { return v<.5 ? "Off" : "On" },
                })
                sequencer.set(s, n, false)
            }
        }
    }

    async setState(key: string, state: any): Promise<void> { }

    async getState(key: string): Promise<any> { }

    getStateKeys(): string[] { return []}

    async dispose(): Promise<void> {
        
    }

}

export const SequencerN3DFactory: Node3DFactory<SequencerN3DGUI,SequencerN3D> = {

    label: "Sequencer",

    description: "A simple sequencer that can be used to create patterns of MIDI notes. ",

    tags: ["sequencer", "midi", "generator", "pattern"],
    
    async createGUI(context) { return new SequencerN3DGUI(context) },

    async create(context, gui) { return new SequencerN3D(context,gui) },

}