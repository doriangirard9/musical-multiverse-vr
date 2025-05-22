import type { Mesh, TransformNode } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import { Node3DContext } from "../Node3DContext";
import { Node3DGUIContext } from "../Node3DGUIContext";


export class AudioOutputN3DGUI implements Node3DGUI{
    
    audioInput: Mesh
    block: Mesh
    root: TransformNode

    constructor(context: Node3DGUIContext){
        const {babylon:B, tools:{MeshUtils}} = context

        this.root = new B.TransformNode("audio output root", context.scene)

        this.block = B.CreateBox("audio output block", {size:1}, context.scene)
        MeshUtils.setColor(this.block, new B.Color4(.5,.2,.2,1))
        this.block.parent = this.root

        this.audioInput = B.CreateSphere("audio output input", {diameter:.5}, context.scene)
        MeshUtils.setColor(this.audioInput, new B.Color4(0,1,0,1))
        this.audioInput.parent = this.root
        this.audioInput.position.set(-0.75,-.25,0)
    }

    async dispose(){ }
}


export class AudioOutputN3D implements Node3D{

    constructor(context: Node3DContext, gui: AudioOutputN3DGUI){
        const {tools:{AudioN3DConnectable}} = context

        context.addToBoundingBox(gui.block)

        context.createConnectable(new AudioN3DConnectable.Input("audioInput", [gui.audioInput],"Destination",context.audioCtx.destination))
    }

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return []}
    
    async dispose(){ }

}


export const AudioOutputN3DFactory: Node3DFactory<AudioOutputN3DGUI,AudioOutputN3D> = {

    label: "Audio Output",

    createGUI: async (context) => new AudioOutputN3DGUI(context),

    create: async (context, gui) => new AudioOutputN3D(context,gui),

}