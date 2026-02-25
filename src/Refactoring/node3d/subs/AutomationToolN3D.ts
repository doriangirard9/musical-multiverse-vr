import { AbstractMesh, Color3, Color4, TransformNode, Vector3 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";


export class AutomationToolN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext

    root!: TransformNode

    base!: AbstractMesh

    mode!: AbstractMesh

    min!: AbstractMesh

    max!: AbstractMesh

    input!: AbstractMesh

    output!: AbstractMesh

    worldSize = 1

    constructor(public factory: AutomationToolN3DFactory) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        this.context = context
        const that = this

        // Root
        this.root = new B.TransformNode("harp_transform")

        // Base
        this.base = B.CreateBox("harp_base", {width:.7, height:.5, depth:1}, context.scene)
        this.base.material = context.materialMat
        this.base.parent = this.root
        this.base.position.set(0, -.25, 0)
        T.MeshUtils.setColor(this.base, Color3.Gray().toColor4())

        // Input and output
        function createOutput(name: string, position: Vector3, color: Color4): AbstractMesh {
            const sphere = B.CreateSphere(name, { diameter: 0.5 }, context.scene)
            sphere.material = context.materialMat
            sphere.parent = that.root
            sphere.position.copyFrom(position)
            T.MeshUtils.setColor(sphere, color)
            return sphere
        }
        this.input = createOutput("input", new Vector3(-0.35-.25, -0.25, 0), T.AutomationN3DConnectable.InputColor.toColor4())
        this.output = createOutput("output", new Vector3(0.35-.25, -0.25, 0), T.AutomationN3DConnectable.OutputColor.toColor4())

        // Parameter
        function createParameter(name: string, position: Vector3): AbstractMesh {
            const box = B.CreateBox(name, { width: 0.3, height: 0.3, depth: 0.3 }, context.scene)
            box.material = context.materialMat
            box.parent = that.root
            box.position.copyFrom(position)
            T.MeshUtils.setColor(box, Color3.White().toColor4())
            return box
        }
        this.mode = createParameter("mode", new Vector3(0, 0.15, -0.5))
        this.min = createParameter("min", new Vector3(0, 0.15, 0))
        this.max = createParameter("max", new Vector3(0, 0.15, 0.5))
    }

    generateHash(str:string): number{
        let hash = 0
        for (const char of str) {
            hash = (hash << 5) - hash + char.charCodeAt(0)
            hash |= 0
        }
        return hash
    }

    setMode(value: number){
        const {tools:T} = this.context
        const hash = this.generateHash(value.toString())
        const color = new Color4(hash % 256 / 255, (hash >> 8) % 256 / 255, (hash >> 16) % 256 / 255, 1)
        T.MeshUtils.setColor(this.mode, color)
    }

    setMin(value: number){
        const {tools:T} = this.context
        const lerped = Color3.Lerp(Color3.Black(), Color3.White(), value).toColor4()
        T.MeshUtils.setColor(this.min, lerped)
    }

    setMax(value: number){
        const {tools:T} = this.context
        const lerped = Color3.Lerp(Color3.Black(), Color3.White(), value).toColor4()
        T.MeshUtils.setColor(this.max, lerped)
    }

    async dispose() { }
}

export class AutomationToolN3D implements Node3D {

    static MODES: {
        name:string,
        mixer(values:number[]): number,
    }[] = [
        {
            name: "Average",
            mixer(values: number[]) {
                const sum = values.reduce((a, b) => a + b, 0)
                return sum / values.length
            }
        },
        {
            name: "Max",
            mixer(values: number[]) {
                return Math.max(...values)
            }
        },
        {
            name: "Min",
            mixer(values: number[]) {
                return Math.min(...values)
            }
        },
    ]

    private observers: {remove(): void}[] = []

    max = 0
    min = 0
    mode = 0

    input
    output

    constructor(context: Node3DContext, private gui: AutomationToolN3DGUI) {
        const { tools: T } = context

        // Hitbox sur la base
        context.addToBoundingBox(gui.base)

        // Outputs
        const input = this.input = new T.MidiN3DConnectable.ListOutput(
            "midi_output",
            [gui.input],
            "String notes"
        )
        context.createConnectable(input)

        const output = this.output = new T.AutomationN3DConnectable.Output(
            "automation_output", 
            [gui.output], 
            "String pinch height",
            0
        )
        context.createConnectable(output)
    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() {
        this.observers.forEach(obs => obs.remove())
    }
}


export class AutomationToolN3DFactory implements Node3DFactory<AutomationToolN3DGUI, AutomationToolN3D> {

    constructor(
        public count: number,
        public label: string,
        public description: string,
    ) { }

    tags = ["automation", "controller", "harp", "live_instrument", "generator", "midi"]

    async createGUI(context: Node3DGUIContext) {
        const gui = new AutomationToolN3DGUI(this)
        await gui.init(context)
        return gui
    }

    async create(context: Node3DContext, gui: AutomationToolN3DGUI) {
        return new AutomationToolN3D(context, gui)
    }

    static DEFAULT = new AutomationToolN3DFactory(
        10,
        "Simple Harp",
        "A simple 3d harp with 10 strings",
    )

    static LARGE = new AutomationToolN3DFactory(
        20,
        "Large Harp",
        "A large 3d harp with 20 strings",
    )
}
