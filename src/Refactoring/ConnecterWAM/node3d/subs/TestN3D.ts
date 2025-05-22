import type { Mesh, TransformNode } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import { Node3DContext } from "../Node3DContext";
import { Node3DGUIContext } from "../Node3DGUIContext";


export class TestN3DGUI implements Node3DGUI{
    
    sphere: Mesh
    audioInput: Mesh
    audioOutput: Mesh
    block: Mesh
    root: TransformNode

    constructor(context: Node3DGUIContext){
        const {babylon:B, tools:{MeshUtils}} = context

        this.root = new B.TransformNode("test root", context.scene)

        this.sphere = B.CreateSphere("test button", {diameter:.5}, context.scene)
        this.sphere.parent = this.root
        this.sphere.position.set(0,.25,0)

        this.audioInput = B.CreateSphere("audio input", {diameter:.5}, context.scene)
        MeshUtils.setColor(this.audioInput, new B.Color4(0,1,0,1))
        this.audioInput.parent = this.root
        this.audioInput.position.set(-0.75,-.25,0)

        this.audioOutput = B.CreateSphere("audio output", {diameter:.5}, context.scene)
        MeshUtils.setColor(this.audioOutput, new B.Color4(1,0,0,1))
        this.audioOutput.parent = this.root
        this.audioOutput.position.set(0.75,-.25,0)

        this.block = B.CreateBox("test box",{width:1,depth:1,height:.5}, context.scene)
        this.block.parent = this.root
        this.block.position.set(0,-.25,0)
    }

    async dispose(){ }
}


export class TestN3D implements Node3D{

    private testValue = 1

    constructor(context: Node3DContext, private gui: TestN3DGUI){
        const {tools:{AudioN3DConnectable}} = context

        const node = this

        context.addToBoundingBox(gui.block)

        context.createParameter({
            id: "testValue",
            meshes:[gui.sphere],
            getLabel(){ return "Testing Value" },
            getStepCount(){ return 4 },
            getValue(){ return node.testValue },
            setValue(value){ 
                node.testValue = value
                gui.sphere.scaling.setAll(value*.5+.5)
                context.notifyStateChange("testValue")
             },
            stringify(value) { return value.toString() },
        })

        context.createConnectable(new AudioN3DConnectable.Input("audioInput", [gui.audioInput],"Destination",context.audioCtx.destination))
    }

    async setState(state: any, key?: string){
        switch(key){
            case "testValue":
                this.testValue = state
                this.gui.sphere.scaling.setAll(state*.5+.5)
                break
            default:
                this.testValue = state.value
                this.gui.sphere.scaling.setAll(state.value*.5+.5)
                break
        }
    }

    async getState(key?: string){
        switch(key){
            case "testValue": return this.testValue
            default: return {value: this.testValue}
        }
    }
    
    async dispose(){ }

}


export const TestN3DFactory: Node3DFactory<TestN3DGUI,TestN3D> = {

    label: "Test Node 3D",

    createGUI: async (context) => new TestN3DGUI(context),

    create: async (context, gui) => new TestN3D(context,gui),

}