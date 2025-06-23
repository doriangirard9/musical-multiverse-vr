import { AbstractMesh, Color3, Color4, TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";


const MIN_NOTE = 36
const MAX_NOTE = 84

const NOTE_WIDTH_RATIO = .25
const BLACK_LENGTH = .6
const BLACK_WIDTH = .8

const OCTAVE = 12
const BLACK_NOTES = [1, 3, 6, 8, 10]

const NOTE_NAME = ["Do/C","Do#/C#","Re/D","Re#/D#", "Mi/E","Fa/F","Fa#/F#","Sol/G", "Sol#/G#","La/A","La#/A#","Si/B"]


export class LivePianoN3DGUI implements Node3DGUI{
    
    root

    base!: AbstractMesh
    output!: AbstractMesh
    notes

    worldSize

    constructor(context: Node3DGUIContext){
        const {babylon:B,tools:T} = context

        this.root = new TransformNode("live piano root")

        let note_count = 0
        for(let i = MIN_NOTE; i<MAX_NOTE; i++)if(!BLACK_NOTES.includes(i%OCTAVE)) note_count++
        this.worldSize = note_count*NOTE_WIDTH_RATIO*1.5
        let base_depth = 1/(note_count*NOTE_WIDTH_RATIO)
        let note_width = 1/note_count
        let base_height = base_depth/8

        // Base
        this.base = B.CreateBox("live piano base", {width: 1, height: base_height, depth: base_depth}, this.root.getScene())
        this.base.parent = this.root
        T.MeshUtils.setColor(this.base, new Color4(.4, .4, .4, 1))

        // Notes
        const BLACK = Color3.Black().toColor4()
        const WHITE = Color3.White().toColor4()

        const notes = this.notes = [] as AbstractMesh[]
        let last_x = -.5 + note_width/2
        for(let i = MIN_NOTE; i<MAX_NOTE; i++){
            const isBlack = BLACK_NOTES.includes(i%OCTAVE)
            if(isBlack){
                const note = B.CreateBox(`live piano note ${i}`, {width: note_width*.9*BLACK_WIDTH, height: base_height, depth: base_depth*.9*BLACK_LENGTH}, this.root.getScene())
                T.MeshUtils.setColor(note, BLACK)
                note.parent = this.root
                note.position.x = last_x - note_width/2
                note.position.y = base_height*1.5
                note.position.z = (base_depth*.9*(1-BLACK_LENGTH))/2
                notes.push(note)
            }
            else{
                const note = B.CreateBox(`live piano note ${i}`, {width: note_width*.9, height: base_height, depth: base_depth*.9}, this.root.getScene())
                T.MeshUtils.setColor(note, WHITE)
                note.parent = this.root
                note.position.x = last_x
                note.position.y = base_height
                notes.push(note)
                last_x += note_width
            }
        }

        this.output = B.CreateSphere("live piano output", {diameter: base_height*2.8}, this.root.getScene())
        T.MeshUtils.setColor(this.output, T.MidiN3DConnectable.OutputColor.toColor4())
        this.output.parent = this.root
        this.output.position.x = .5+base_height*1.4
    }

    async dispose(){ }
}


export class LivePianoN3D implements Node3D{

    output 

    constructor(context: Node3DContext, private gui: LivePianoN3DGUI){
        const {tools:T, audioCtx} = context

        context.addToBoundingBox(gui.base)

        const output = this.output = new T.MidiN3DConnectable.ListOutput("output", [gui.output], "Notes Output")
        context.createConnectable(output)

        // Notes
        for(let note=MIN_NOTE; note<MAX_NOTE; note++){
            const mesh = gui.notes[note-MIN_NOTE]
            context.createButton({
                id: `button${note}`,
                label: NOTE_NAME[note%OCTAVE],
                color: Color3.Blue(),
                meshes: [mesh],
                press() {
                    mesh.scaling.y = .6
                    console.log(`Note ${note} pressed`)
                    output.connections.forEach(conn => {
                        const t =  conn.context.currentTime
                        conn.scheduleEvents({type:"wam-midi", time:t, data:{bytes:[0x90, note, 127]}})
                    })
                },
                release() {
                    mesh.scaling.y = 1
                    console.log(`Note ${note} released`)
                    output.connections.forEach(conn => {
                        const t =  conn.context.currentTime
                        conn.scheduleEvents({type:"wam-midi", time:t, data:{bytes:[0x90, note, 0]}})
                        conn.scheduleEvents({type:"wam-midi", time:t+0.001, data:{bytes:[0x80, note, 0]}})
                    })
                },
            })
            
        }
    }


    async setState(key: string, value: any){}

    async getState(key: string){}

    getStateKeys(){ return [] }
    
    async dispose(){ }

}


export const LivePianoN3DFactory: Node3DFactory<LivePianoN3DGUI,LivePianoN3D> = {

    label: "LivePiano",

    createGUI: async (context) => {
        const ret = new LivePianoN3DGUI(context)
        return ret
    },

    create: async (context, gui) => new LivePianoN3D(context,gui),

}