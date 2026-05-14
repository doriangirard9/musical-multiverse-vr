import type { AbstractMesh, TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable } from "../../tools";


export class AutomationControllerN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext

    root!: TransformNode

    base!: AbstractMesh

    output!: AbstractMesh

    rotator!: AbstractMesh

    get worldSize() { return 1.5 }

    constructor() { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context

        this.context = context

        // Root
        this.root = new B.TransformNode("automation controller root", context.scene)

        // Base plate
        this.base = B.CreateBox("automation controller base", { width: 1, height: 0.5, depth: 1 }, context.scene)
        T.MeshUtils.setColor(this.base, new B.Color4(.4, .4, .4, 1))
        this.base.parent = this.root
        this.base.position.set(0, -.25, 0)
        this.base.material = context.materialMat

        // Rotator
        this.rotator = B.CreateCylinder("automation controller rotator", { diameter: .5, height: .5 }, context.scene)
        T.MeshUtils.setColor(this.rotator, new B.Color4(0.8, 0.8, 0.8, 1))
        this.rotator.parent = this.root
        this.rotator.position.set(0, 0.25, 0)
        this.rotator.material = context.materialMat

        const rotatorLine = B.CreateBox("automation controller rotator line", { width: .1, height: .6, depth: .25 }, context.scene)
        T.MeshUtils.setColor(rotatorLine, new B.Color4(0.6, 0.6, 0.6, 1))
        rotatorLine.parent = this.rotator
        rotatorLine.position.set(0, 0, 0.25)

        // Output
        this.output = T.ConnectableUtils.createOutputMesh("automation controller output", .5, context.scene)
        this.output.parent = this.root
        this.output.position.set(0.75, -0.25, 0)
        this.output.material = context.materialMat
        T.MeshUtils.setColor(this.output, T.AutomationN3DConnectable.Color.toColor4())
    }

    async dispose() { }
}

export class AutomationControllerN3D implements Node3D {

    output!: InstanceType<(typeof AutomationN3DConnectable)['Output']>

    constructor(context: Node3DContext, gui: AutomationControllerN3DGUI) {
        const { tools: T } = context

        // Hitbox
        context.addToBoundingBox(gui.base)

        // Output
        const output = this.output = new T.AutomationN3DConnectable.Output(
            "automation_controller_output",
            [gui.output],
            "Automation Output",
            1
        )
        context.createConnectable(output)

        // Parameter
        context.createParameter({
            id: "automation_parameter",
            meshes: [gui.rotator],
            getLabel() { return output.name },
            getStepCount() { return output.stepCount },
            getValue() { return output.value },
            setValue(value) {
                output.value = value
                gui.rotator.rotation.y = value * Math.PI - Math.PI/2
            },
            stringify(value) { return output.stringify(value) },
        })
        gui.rotator.rotation.y = 1 * Math.PI - Math.PI/2
    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() { }

}


export const AutomationControllerN3DFactory: Node3DFactory<AutomationControllerN3DGUI, AutomationControllerN3D> = {

    label: "Automation Controller",

    description: "A simple rotatable controller that can be used to control any automation parameter. It can be used to create knobs, wheels, or any other circular controllers.",

    tags: ["automationcontroller", "automation", "drag"],

    async createGUI(context: Node3DGUIContext) {
        const ret = new AutomationControllerN3DGUI()
        await ret.init(context)
        return ret
    },

    async create(context: Node3DContext, gui: AutomationControllerN3DGUI) {
        return new AutomationControllerN3D(context, gui)
    },

}