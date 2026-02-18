import type { AbstractMesh, Observer, TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";
import { InputManager } from "../../xr/inputs/InputManager";
import { AutomationN3DConnectable, MidiN3DConnectable } from "../tools";
import { InputHoverBehavior } from "../../xr/inputs/tools/InputHoverBehavior";
import { InputMultiPressBehavior } from "../../xr/inputs/tools/InputMultiPressBehavior";



export class HyperKeyboardN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext

    root!: TransformNode

    base!: AbstractMesh
    keys!: AbstractMesh[]

    outputs!: AbstractMesh[]

    get worldSize() { return Math.max(this.factory.x, this.factory.y, this.factory.z)/2 }

    constructor(
        public factory: HyperKeyboardN3DFactory
    ) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context

        this.context = context

        // Coordinates
        const maxaxe = Math.max(this.factory.x, this.factory.y, this.factory.z)
        let width = this.factory.x / maxaxe
        let height = this.factory.y / maxaxe
        let depth = this.factory.z / maxaxe

        // Root
        this.root = new B.TransformNode("hyperkeyboard root")

        // Base plate
        this.base = B.CreateBox("hyperkeyboard base", { width: width + .1, height: 0.1 + .1, depth: height + .1 }, this.root.getScene())
        T.MeshUtils.setColor(this.base, new B.Color4(.4, .4, .4, 1))
        this.base.parent = this.root
        this.base.position.y = -depth
        this.base.material = context.materialMat

        // Keys
        const size = width / this.factory.x
        this.keys = Array.from({ length: this.factory.x * this.factory.y * this.factory.z }, () => undefined as unknown as AbstractMesh)
        for (let x = 0; x < this.factory.x; x++) {
            for (let y = 0; y < this.factory.y; y++) {
                for (let z = 0; z < this.factory.z; z++) {
                    // Create key mesh
                    const key = B.CreateBox(`key_${x}_${y}_${z}`, { size: size * 0.8 }, this.root.getScene())
                    key.parent = this.root
                    key.position.set(
                        (-0.5 + (1 - width) / 2) + (x / this.factory.x) * width + size / 2,
                        (-0.5 + (1 - depth) / 2) + (z / this.factory.z) * depth + size / 2,
                        (-0.5 + (1 - height) / 2) + (y / this.factory.y) * height + size / 2,
                    )
                    key.material = context.materialMat
                    this.keys[x * this.factory.y * this.factory.z + y * this.factory.z + z] = key
                }
            }
        }

        // Outputs
        this.outputs = Array.from({ length: this.factory.y }, (_, i) => {
            const mesh = B.CreateSphere(`hyperkeyboard output n°${i}`, { diameter: size }, this.root.getScene())
            mesh.parent = this.root
            mesh.position.set(
                width / 2 + .05 + size / 2,
                -depth,
                -(size * 2) / 2 + i * size
            )
            mesh.material = context.materialMat
            return mesh
        })

        T.MeshUtils.setColor(this.outputs[0], T.MidiN3DConnectable.OutputColor.toColor4())
        T.MeshUtils.setColor(this.outputs[1], T.AutomationN3DConnectable.OutputColor.toColor4())
        T.MeshUtils.setColor(this.outputs[2], T.AutomationN3DConnectable.OutputColor.toColor4())

    }

    key(x: number, y: number, z: number) {
        if (x < 0 || x >= this.factory.x || y < 0 || y >= this.factory.y || z < 0 || z >= this.factory.z) return undefined
        return this.keys[x * this.factory.y * this.factory.z + y * this.factory.z + z]
    }

    skin(x: number, y: number, z: number, highlight: "highlight" | "pressed" | "default") {
        const { babylon: B, tools: T } = this.context

        const key = this.key(x, y, z)
        if (!key) return

        const color = new B.Color4(1, 1, 1, 1)
        if (highlight == "default") color.set(1, 1, 1, 1)
        else if (highlight == "highlight") color.set(.5, 1, .5, 1)
        else if (highlight == "pressed") color.set(0, 1, 0, 1)

        T.MeshUtils.setColor(key, color)
    }

    forKeys(callback: (x: number, y: number, z: number, key: AbstractMesh) => void) {
        for (let x = 0; x < this.factory.x; x++) {
            for (let y = 0; y < this.factory.y; y++) {
                for (let z = 0; z < this.factory.z; z++) {
                    const key = this.key(x, y, z)
                    if (key) callback(x, y, z, key)
                }
            }
        }
    }

    async dispose() { }
}


export class HyperKeyboardN3D implements Node3D {

    presseds: Set<string> = new Set()
    hovereds: Set<string> = new Set()

    updateVisual(x: number, y: number, z: number){
        const id = `${x},${y},${z}`
        if(this.presseds.has(id)) this.gui.skin(x, y, z, "pressed")
        else if(this.hovereds.has(id)) this.gui.skin(x, y, z, "highlight")
        else this.gui.skin(x, y, z, "default")
    }

    setHighlighted(x: number, y: number, z: number, isHighlighted: boolean) {
        const id = `${x},${y},${z}`
        if(isHighlighted) this.hovereds.add(id)
        else this.hovereds.delete(id)
        this.updateVisual(x, y, z)
    }

    set(x: number, y: number, z: number, isPressed: boolean) {
        const id = `${x},${y},${z}`
        const wasPressed = this.presseds.has(id)

        if(isPressed) this.presseds.add(id)
        else this.presseds.delete(id)

        // Send key down
        if(isPressed && !wasPressed){
            this.onDown(x, y, z)
        }

        // Send key up
        if (!isPressed && wasPressed) {
            this.onUp(x, y, z)
        }

        this.updateVisual(x, y, z)
    }

    onDown(x: number, y: number, z: number) {
        // MIDI Output
        this.output.connections.forEach(conn => {
            conn.scheduleEvents({
                type: "wam-midi",
                time: conn.context.currentTime,
                data: { bytes: [0x90, 60 + y, 127] }
            })
        })
        // Automation Output
        this.automationOutputs[0].value = this.gui.factory.x==1 ? 1 : x/(this.gui.factory.x-1)
        this.automationOutputs[1].value = this.gui.factory.z==1 ? 1 : z/(this.gui.factory.z-1)
    }

    onUp(x: number, y: number, z: number) {
        this.output.connections.forEach(conn => {
            const t = conn.context.currentTime
            conn.scheduleEvents({ type: "wam-midi", time: t, data: { bytes: [0x90, 60 + y, 0] } })
            conn.scheduleEvents({ type: "wam-midi", time: t + 0.001, data: { bytes: [0x80, 60 + y, 0] } })
        })
    }

    private observers: {remove():void}[] = []

    private output!: InstanceType<(typeof MidiN3DConnectable)["ListOutput"]>

    private automationOutputs: InstanceType<(typeof AutomationN3DConnectable)["Output"]>[] = []

    constructor(context: Node3DContext, private gui: HyperKeyboardN3DGUI) {
        const { tools: T } = context
        const inputs = InputManager.getInstance()

        // Hitbox
        context.addToBoundingBox(gui.base)

        // Keys
        gui.forKeys((x, y, z, key) => {
            const hover = new InputHoverBehavior(
                () =>  this.setHighlighted(x, y, z, true),
                () => this.setHighlighted(x, y, z, false),
            )

            const press = new InputMultiPressBehavior(
                () => this.set(x, y, z, true),
                () => this.set(x, y, z, false),
            )

            key .addBehavior(hover) .addBehavior(press)

            this.observers.push({
                remove: () => {
                    key .removeBehavior(hover) .removeBehavior(press)
                }
            })
        })

        // Outputs
        this.output = new T.MidiN3DConnectable.ListOutput(
            "notes",
            [gui.outputs[0]],
            "Notes"
        )
        context.createConnectable(this.output)

        const names = ["Column", "Depth"]
        this.automationOutputs = gui.outputs.slice(1).map((mesh, i) => {
            const out = new T.AutomationN3DConnectable.Output(
                "automation parameter n°" + i,
                [mesh],
                `${names[i]} Value`,
                1
            )
            context.createConnectable(out)
            return out
        })

    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() {
        this.observers.forEach(obs => obs.remove())
    }

}


export class HyperKeyboardN3DFactory implements Node3DFactory<HyperKeyboardN3DGUI, HyperKeyboardN3D> {

    constructor(
        public x: number,
        public y: number,
        public z: number,
        public label: string,
        public description: string,
    ) { }

    tags = ["hyperkeyboard", "keyboard", "midi", "generator", "live_instrument", "automation", "controller"]

    async createGUI(context: Node3DGUIContext) {
        const ret = new HyperKeyboardN3DGUI(this)
        await ret.init(context)
        return ret
    }

    async create(context: Node3DContext, gui: HyperKeyboardN3DGUI) {
        return new HyperKeyboardN3D(context, gui)
    }

    static SMALL = new HyperKeyboardN3DFactory(
        5, 3, 3,
        "Small HyperKeyboard",
        "A 3D hyperkeyboard with 5 keys in width, 3 in height and 1 in depth"
    )

}