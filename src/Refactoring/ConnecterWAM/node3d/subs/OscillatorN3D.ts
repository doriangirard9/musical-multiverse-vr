import type { Mesh, TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";


export class OscillatorN3DGUI implements Node3DGUI{
    
    audioOutput: Mesh
    block: Mesh
    root: TransformNode

    constructor(context: Node3DGUIContext){
        const {babylon:B,tools:T} = context

        this.root = new B.TransformNode("test root", context.scene)

        this.audioOutput = B.CreateSphere("test button", {diameter:.5}, context.scene)
        T.MeshUtils.setColor(this.audioOutput, new B.Color4(1,0,0,1))
        this.audioOutput.parent = this.root
        this.audioOutput.position.set(0.75,-.25,0)

        this.block = B.CreateBox("test box",{width:1,depth:1,height:.5}, context.scene)
        this.block.parent = this.root
        this.block.position.set(0,-.25,0)
    }

    async dispose(){ }
}


export class OscillatorN3D implements Node3D{

    constructor(context: Node3DContext, gui: OscillatorN3DGUI){
        const {tools:T} = context

        context.addToBoundingBox(gui.block)

        const audionode = context.audioCtx.createOscillator()
        audionode.start()

        context.createConnectable(new T.AudioN3DConnectable.Output("audioOutput", [gui.audioOutput], "Audio Output", audionode))
    }

    async setState(_1: string, _2: any,){ }

    async getState(_1: string){ return {} }

    getStateKeys(){ return [] }
    
    async dispose(){ }

}


export const OscillatorN3DFactory: Node3DFactory<OscillatorN3DGUI,OscillatorN3D> = {

    label: "Oscillator",

    createGUI: async (context) => new OscillatorN3DGUI(context),

    create: async (context, gui) => new OscillatorN3D(context,gui),

}