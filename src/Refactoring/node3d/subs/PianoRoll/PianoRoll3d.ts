import { Color3, Color4, type AbstractMesh } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { MidiN3DConnectable } from "../../tools";
import { Node3DContext } from "../../Node3DContext";
import * as B from "@babylonjs/core";


// colors 

class PianoRollN3DGUI implements Node3DGUI {
    root
    baseMesh!: B.Mesh;

    constructor(private context: Node3DGUIContext) {
        const {babylon:B,tools:T} = context

        this.root = new B.TransformNode("pianoroll root", context.scene)



    }



    async dispose(): Promise<void> {
        this.root.dispose()


    }

    get worldSize() { return 4 }

}


class PianoRollN3D implements Node3D{

    constructor(context: Node3DContext, private gui: PianoRollN3DGUI){
        const {tools:T} = context
        const sequencer = this
        context.addToBoundingBox(gui.baseMesh)

        // Create midi output
        const midi_output = new T.MidiN3DConnectable.ListOutput("midioutput", [gui.output], "MIDI Output")
        context.createConnectable(midi_output)

        // Create note buttons

    }

    async setState(key: string, state: any): Promise<void> { }

    async getState(key: string): Promise<any> { }

    getStateKeys(): string[] { return []}

    async dispose(): Promise<void> {
        
    }

}



export const PianoRollN3DFactory: Node3DFactory<PianoRollN3DGUI,PianoRollN3D> = {

    label: "pianoroll",
    
    async createGUI(context) { return new PianoRollN3DGUI(context) },

    async create(context, gui) { return new PianoRollN3D(context,gui) },

}