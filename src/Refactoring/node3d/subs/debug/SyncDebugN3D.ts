import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";


export class SyncDebugN3DGUI implements Node3DGUI{
    
    input
    output
    block
    root
    duration
    total
    start

    get worldSize(){ return 1 }

    constructor(context: Node3DGUIContext){
        const {babylon:B,tools:T} = context

        this.root = new B.TransformNode("sync debug root", context.scene)

        this.input = T.ConnectableUtils.createInputMesh("sync debug input", .5, context.scene)
        T.MeshUtils.setColor(this.input, T.SynxN3DConnectable.Color.toColor4())
        this.input.parent = this.root
        this.input.material = context.materialMat
        this.input.position.set(-0.75,-.25,0)

        this.output = T.ConnectableUtils.createOutputMesh("sync debug output", .5, context.scene)
        T.MeshUtils.setColor(this.output, T.SynxN3DConnectable.Color.toColor4())
        this.output.parent = this.root
        this.output.position.set(0.75,-.25,0)
        this.output.material = context.materialMat
        this.block = B.CreateBox("sync debug block",{width:1,depth:1,height:.5}, context.scene)
        this.block.parent = this.root

        this.block.position.set(0,-.25,0)

        this.duration = B.CreateSphere("sync debug duration param", {diameter:.3}, context.scene)
        this.duration.parent = this.root
        this.duration.material = context.materialMat
        this.duration.position.set(0,0.25,-0.25)

        this.total = B.CreateSphere("sync debug total param", {diameter:.3}, context.scene)
        this.total.parent = this.root
        this.total.material = context.materialMat
        this.total.position.set(-0.25,0.25,0.25)

        this.start = B.CreateSphere("sync debug start param", {diameter:.3}, context.scene)
        this.start.parent = this.root
        this.start.material = context.materialMat
        this.start.position.set(0.25,0.25,0.25)


    }

    async dispose(){ }
}


export class SyncDebugN3D implements Node3D{

    constructor(context: Node3DContext, private gui: SyncDebugN3DGUI){
        const {tools:T} = context

        context.addToBoundingBox(gui.block)

        const container = new T.SynxN3DConnectable.Container(1)

        context.createConnectable(new T.SynxN3DConnectable.Output("audioOutput", [gui.output], "Audio Output", container))
        context.createConnectable(new T.SynxN3DConnectable.Input("syncInput", [gui.input], "Sync Input", container))

        context.createParameter({
            id: "duration",
            meshes: [gui.duration],
            setValue (value: number): void {
                container.duration = value*100
            },
            getStepCount (): number {
                return 100
            },
            getValue (): number {
                return container.duration/100
            },
            stringify (value: number): string {
                return (value*100).toFixed(2)+"s"
            },
            getLabel (): string {
                return "Duration"
            }
        })

        context.createParameter({
            id: "total",
            meshes: [gui.total],
            setValue (value: number): void {},
            getStepCount (): number { return 0},
            getValue (): number { return container.total/1000 },
            stringify (value: number): string { return (value*1000).toFixed(2)+"s" },
            getLabel (): string { return "Total" }
        })

        context.createParameter({
            id: "start",
            meshes: [gui.start],
            setValue (value: number): void {},
            getStepCount (): number { return 0 },
            getValue (): number { return container.start/1000 },
            stringify (value: number): string { return (value*1000).toFixed(2)+"s" },
            getLabel (): string { return "Start" }
        })


    }

    async setState(key: string, value: any){ }
    async getState(key: string){ }
    getStateKeys(){ return [] }
    async dispose(){ }

}


export const SyncDebugN3DFactory: Node3DFactory<SyncDebugN3DGUI,SyncDebugN3D> = {

    label: "Sync Debug",

    description: "A simple sync debug node that can be used to debug sync issues.",

    tags: ["sync", "debug", "audio"],

    createGUI: async (context) => new SyncDebugN3DGUI(context),

    create: async (context, gui) => new SyncDebugN3D(context,gui),

}