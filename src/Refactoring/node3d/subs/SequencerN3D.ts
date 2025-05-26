import { Color3, type AbstractMesh } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DGUIContext } from "../Node3DGUIContext";
import { MidiN3DConnectable } from "../tools";
import { Node3DContext } from "../Node3DContext";

const NOTE_NAME = ["Do/C","Do#/C#","Re/D","Re#/D#", "Mi/E","Fa/F","Fa#/F#","Sol/G", "Sol#/G#","La/A","La#/A#","Si/B"]

class SequencerN3DGUI implements Node3DGUI {

    root
    block
    notes: AbstractMesh[][] = []
    output
    octave

    readonly stepCount = 12
    readonly noteCount = 12
    readonly firstNote = 0

    constructor(context: Node3DGUIContext) {
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
            for(let n = 0; n<this.noteCount; n++){
                const step = [] as AbstractMesh[]
                for(let i = 0; i<this.stepCount; i++){
                    const x = (i+.5)*note_width+fx
                    const y = ty-(n+.5)*note_height
                    const note = (this.firstNote+n)%12
                    const note_pad = B.CreateBox(`sequence note ${n} step ${i}`, {width: w, height: baseSize*.4, depth: h}, context.scene)
                    if(note==1 || note==3 || note==6 || note==8 || note==10) T.MeshUtils.setColor(note_pad, new B.Color4(0, 0, 0, 1)) // Black for Sharp
                    else T.MeshUtils.setColor(note_pad, new B.Color4(1, 1, 1, 1)) // White for Natural
                    note_pad.position.set(x,baseSize*.2,y)
                    note_pad.parent = this.root
                    step.push(note_pad)
                }
                this.notes.push(step)
            }
        }

        createKeyboard(
            -width/2 +baseSize*.2 + baseSize +baseSize*.2,
            -height/2 +baseSize*.2,
            width/2 -baseSize*.2,
            height/2 -baseSize*.2,
        )

        // Create octave button
        const octave = this.octave = B.CreateCylinder("sequencer octave", {diameter: baseSize, height: baseSize*2}, context.scene)
        octave.setPivotPoint(new B.Vector3(0,-baseSize,0))
        octave.position.set(-width/2 + baseSize*.7, baseSize, 0)
        octave.parent = this.root
    }

    async dispose(): Promise<void> {
        this.root.dispose()
        this.notes = []
    }

    get worldSize() { return 4 }
}

class SequencerN3D implements Node3D{

    constructor(context: Node3DContext, gui: SequencerN3DGUI){
        const {tools:T} = context

        context.addToBoundingBox(gui.block)

        const midi_output = new T.MidiN3DConnectable.ListOutput("midioutput", [gui.output], "MIDI Output")
        context.createConnectable(midi_output)

        for(let n=0; n<gui.notes.length; n++){
            for(let i=0; i<gui.notes[n].length; i++){
                const note_pad = gui.notes[n][i]
                const note = (n+gui.firstNote)%12
                const label = `${NOTE_NAME[note]} n°${i+1}`
                let value = 0
                context.createParameter({
                    id: `sequencer_note_${n}_${i}`,
                    meshes: [note_pad],
                    getLabel() { return label },
                    getStepCount() { return 2 },
                    getValue() { return value },
                    setValue(v){ value = v },
                    stringify(v) { return v<.5 ? "Off" : "On" },
                })
            }
        }
    }

    async setState(key: string, state: any): Promise<void> {
    }

    async getState(key: string): Promise<any> {
        return null
    }

    getStateKeys(): string[] {
        return []
    }

    async dispose(): Promise<void> {
        
    }

}

export const SequencerN3DFactory: Node3DFactory<SequencerN3DGUI,SequencerN3D> = {

    label: "Sequencer",
    
    async createGUI(context) { return new SequencerN3DGUI(context) },

    async create(context, gui) { return new SequencerN3D(context,gui) },

}