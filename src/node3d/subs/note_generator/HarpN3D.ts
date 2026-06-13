import { AbstractMesh, Color3, Color4, TransformNode, Vector3 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { InputManager } from "../../../xr/inputs/InputManager";
import { InputMultiPressBehavior } from "../../../xr/inputs/tools/InputMultiPressBehavior";


const LINE_IN_ONE = 8
const LINE_WIDTH = 0.08

export class HarpN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext
    root!: TransformNode

    base!: AbstractMesh
    lines!: AbstractMesh[]
    outputs!: AbstractMesh[]

    noteSelector!: AbstractMesh

    worldSize!: number

    constructor(public factory: HarpN3DFactory) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        this.context = context
        const that = this

        // Position and dimensions
        let width = this.factory.count/LINE_IN_ONE
        let heigth = 1
        if(width>1){
            heigth/=width
            width=1
        }
        const scale = Math.min(width, heigth)

        this.worldSize = 1/scale*2

        const left = -0.5+(1-width)/2
        const top = -0.5+(1-heigth)/2

        // Root (tous les enfants dans l'espace 1x1x1)
        this.root = new B.TransformNode("harp_transform", context.scene)

        // Base
        const base_height = 0.1*scale
        this.base = B.CreateBox("harp_base", {width:width, height:base_height, depth:heigth+.1}, context.scene)
        this.base.material = context.materialMat
        this.base.parent = this.root
        this.base.position.set(0, -.5+base_height/2, 0)
        T.MeshUtils.setColor(this.base, Color3.Gray().toColor4())

        // Back
        const bg_depth = 0.1*scale
        const bg_height = (1-base_height)*scale
        const bg = B.CreateBox("harp_back", {width:width, height:bg_height, depth:bg_depth}, context.scene)
        bg.material = context.materialMat
        bg.parent = this.root
        bg.position.set(0, -.5+base_height/2+bg_height/2, bg_depth/2+Math.min(width,heigth)*LINE_WIDTH)

        // Line
        function createLine(i: number){
            const x = (width/(that.factory.count+1))*(i+1)
            const line_width = Math.min(width,heigth)*LINE_WIDTH
            const line = B.CreateBox(`line_${i}`, {width:line_width, height:.9*scale, depth:line_width}, context.scene)
            line.material = context.materialLight
            line.parent = that.root
            line.position.set(left+x, -.5+base_height+scale*.9/2, 0-line_width/2)
            T.MeshUtils.setColor(line, Color3.White().toColor4())
            return line
        }

        this.lines = Array.from({length: this.factory.count}, (_, i) => createLine(i))


        // Create outputs
        const controlsize = 0.3*scale
        function createOutput(name: string, position: Vector3, color: Color4): AbstractMesh {
            const sphere = B.CreateSphere(name, { diameter: controlsize }, context.scene)
            sphere.material = context.materialMat
            sphere.parent = that.root
            sphere.position.copyFrom(position)
            T.MeshUtils.setColor(sphere, color)
            return sphere
        }
        this.outputs = [
            createOutput("midi_output", new Vector3(width/2+controlsize/2, -0.5+base_height/2, -heigth/4), T.MidiN3DConnectable.Color.toColor4()), // MIDI
            createOutput("automation_output", new Vector3(width/2+controlsize/2, -0.5+base_height/2, heigth/4), T.AutomationN3DConnectable.Color.toColor4()), // Y
        ]

        // Create note selector
        this.noteSelector = B.CreateBox("note_selector", {size: controlsize}, context.scene)
        this.noteSelector.material = context.materialMat
        this.noteSelector.parent = that.root
        this.noteSelector.position.set(0, base_height/2-.5, -heigth/2-controlsize/2)

    }

    highlight(index: number, isHighlight: boolean){
        const {tools:T} = this.context

        const line = this.lines[index]
        if(line){
            if(isHighlight){
                T.MeshUtils.setColor(line, Color3.Yellow().toColor4())
                line.scaling.setAll(1.1)
            } else {
                T.MeshUtils.setColor(line, Color3.White().toColor4())
                line.scaling.setAll(1)
            }
        }
    }


    async dispose() { }
}

export class HarpN3D implements Node3D {

    private observers: {remove(): void}[] = []

    midiOutput
    automationOutput



    press(index: number){
        this.midiOutput.connections.forEach(conn=>{
            conn.scheduleEvents({
                type: "wam-midi",
                time: conn.context.currentTime,
                data: { bytes: [0x90, 60 + index, 127] }
            })
        })
    }

    unpress(index: number){
        this.midiOutput.connections.forEach(conn => {
            const t = conn.context.currentTime
            conn.scheduleEvents({ type: "wam-midi", time: t, data: { bytes: [0x90, this.context.tools.NoteUtils.getnote(index), 0] } })
            conn.scheduleEvents({ type: "wam-midi", time: t + 0.001, data: { bytes: [0x80, this.context.tools.NoteUtils.getnote(index), 0] } })
        })
    }

    constructor(private context: Node3DContext, private gui: HarpN3DGUI) {
        const { tools: T } = context
        const inputs = InputManager.getInstance()

        // Hitbox sur la base
        context.addToBoundingBox(gui.base)

        // Press
        gui.lines.forEach((line, index) => {
            let i = 0
            const press = new InputMultiPressBehavior(
                ()=>{
                    this.press(index)
                    i++
                    if(i==1) gui.highlight(index, true)
                },
                ()=>{
                    this.unpress(index)
                    i--
                    if(i==0) gui.highlight(index, false)
                }
            )

            line.addBehavior(press)

            this.observers.push({
                remove() {
                    line.removeBehavior(press)
                },
            })
        })

        // Outputs
        const midiOutput = this.midiOutput = new T.MidiN3DConnectable.ListOutput(
            "midi_output",
            [gui.outputs[0]],
            "String notes"
        )
        context.createConnectable(midiOutput)

        const automationOutput = this.automationOutput = new T.AutomationN3DConnectable.Output(
            "automation_output", 
            [gui.outputs[1]], 
            "String pinch height",
            0
        )
        context.createConnectable(automationOutput)
    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() {
        this.observers.forEach(obs => obs.remove())
    }
}


export class HarpN3DFactory implements Node3DFactory<HarpN3DGUI, HarpN3D> {

    constructor(
        public count: number,
        public label: string,
        public description: string,
    ) { }

    tags = ["automation", "controller", "harp", "live_instrument", "generator", "midi"]

    async createGUI(context: Node3DGUIContext) {
        const gui = new HarpN3DGUI(this)
        await gui.init(context)
        return gui
    }

    async create(context: Node3DContext, gui: HarpN3DGUI) {
        return new HarpN3D(context, gui)
    }

    static DEFAULT = new HarpN3DFactory(
        10,
        "Simple Harp",
        "A simple 3d harp with 10 strings",
    )

    static LARGE = new HarpN3DFactory(
        20,
        "Large Harp",
        "A large 3d harp with 20 strings",
    )
}
