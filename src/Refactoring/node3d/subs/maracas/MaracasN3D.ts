import { AbstractMesh, TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";

const MARACAS_URL = (await import("./maracas.glb?url")).default

export class MaracasN3DGUI implements Node3DGUI{
    
    root

    maracas!: AbstractMesh
    base!: AbstractMesh
    output!: AbstractMesh

    get worldSize(){ return 1 }

    constructor(){
        this.root = new TransformNode("maracas root")
    }

    async init(context: Node3DGUIContext){
        const {babylon:B,tools:T} = context

        this.maracas = await B.ImportMeshAsync(MARACAS_URL, context.scene) .then(it=>it.meshes[0])
        this.maracas.parent = this.root
        this.maracas.position.y = .2

        this.base = B.CreateBox("maracas base", {size:1,height:.2}, context.scene)
        this.base.parent = this.root
        this.base.position.set(0,-.4,0)

        this.output = B.CreateSphere("test button", {diameter:.5}, context.scene)
        T.MeshUtils.setColor(this.output, T.MidiN3DConnectable.OutputColor.toColor4())
        this.output.parent = this.root
        this.output.position.set(.6,-.4,0)
    }

    async dispose(){ }
}


export class MaracasN3D implements Node3D{

    output

    constructor(context: Node3DContext, private gui: MaracasN3DGUI){
        const {tools:T, audioCtx} = context

        context.addToBoundingBox(gui.base)

        this.output = new T.MidiN3DConnectable.ListOutput("midioutput", [gui.output], "MIDI Output")
        context.createConnectable(this.output)

        context.createParameter({
            id: "rotation",
            getLabel: () => "Rotation",
            getValue: () => this.rotation,
            getStepCount: () => 100,
            stringify: (value: number) => `Rotation: ${Math.round(value*100)}%`,
            setValue: (value: number) =>{
                this.setRotation(value)
            },
            meshes: [gui.maracas],
        })
        this.setRotation(.5)
    }

    rotation = 0
    last_offset = 0
    setRotation(value: number){
        const offset = value - this.rotation
        if(offset == 0) return

        if(this.last_offset*offset<0){
            this.output.connections.forEach(conn => {
                            console.log("flop")
                const t =  conn.context.currentTime
                const note = Math.floor(10+100*value)
                conn.scheduleEvents({type:"wam-midi", time:t, data:{bytes:[0x90, note, 127]}})
                conn.scheduleEvents({type:"wam-midi", time:t+1, data:{bytes:[0x90, note, 0]}})
                conn.scheduleEvents({type:"wam-midi", time:t+1.1, data:{bytes:[0x80, note, 0]}})
            })
        }
        this.last_offset = offset
        this.rotation = value

        this.gui.maracas.rotation.y = (value-.5)*Math.PI-3
    }

    async setState(key: string, value: any){}

    async getState(key: string){}

    getStateKeys(){ return [] }
    
    async dispose(){ }

}


export const MaracasN3DFactory: Node3DFactory<MaracasN3DGUI,MaracasN3D> = {

    label: "Maracas",

    description: "A simple maracars that can be dragged like a parameter to be shaken.",

    tags: ["maracas", "midi", "generator", "live_instrument", "shake"],

    createGUI: async (context) => {
        const ret = new MaracasN3DGUI()
        await ret.init(context)
        return ret
    },

    create: async (context, gui) => new MaracasN3D(context,gui),

}