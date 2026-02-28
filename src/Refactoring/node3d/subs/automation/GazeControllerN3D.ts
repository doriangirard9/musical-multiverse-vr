import { AbstractMesh, Color4, TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable } from "../../tools";
import { InputManager } from "../../../xr/inputs/InputManager";
import { usingWith } from "../../../utils/utils";


export class GazeControllerN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext

    root!: TransformNode

    base!: AbstractMesh

    output!: AbstractMesh

    disabledRotator!: AbstractMesh

    enabledRotator!: AbstractMesh

    eye!: AbstractMesh

    get worldSize() { return 1.5 }

    constructor() { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        const that = this

        this.context = context

        // Root
        this.root = new B.TransformNode("automation controller root")

        // Base plate
        this.base = B.CreateBox("automation controller base", { width: 1, height: 0.5, depth: 1 }, context.scene)
        T.MeshUtils.setColor(this.base, new B.Color4(.4, .4, .4, 1))
        this.base.parent = this.root
        this.base.position.set(0, -.25, 0)
        this.base.material = context.materialMat

        // Eye
        this.eye = B.CreateSphere("automation controller eye", { diameter: 1 }, context.scene)
        T.MeshUtils.setColor(this.eye, new B.Color4(1, 0, 0, 1))
        this.eye.parent = this.root
        this.eye.position.set(0, 0, 1)
        this.base.material = context.materialLight

        // Rotator
        function createRotator(name: string, position: number, color: Color4) {
            const rotatorBase = B.CreateCylinder(name, { diameter: .4, height: .5 }, context.scene)
            T.MeshUtils.setColor(rotatorBase, new B.Color4(0.8, 0.8, 0.8, 1))
            rotatorBase.parent = that.root
            rotatorBase.position.set(position, 0.25, 0)

            const line = B.CreateBox(name + " line", { width: .1, height: .6, depth: .25 }, context.scene)
            T.MeshUtils.setColor(line, color)
            line.parent = rotatorBase
            line.position.set(0, 0, 0.1)
            
            return rotatorBase
        }
        this.disabledRotator = createRotator("automation controller disabled rotator", -0.25, new B.Color4(1, 0, 0, 1))
        this.enabledRotator = createRotator("automation controller enabled rotator", 0.25, new B.Color4(0, 1, 0, 1))

        // Output
        this.output = B.CreateSphere("automation controller output", { diameter: .5 }, context.scene)
        this.output.parent = this.root
        this.output.position.set(0.75, -0.25, 0)
        this.output.material = context.materialMat
        T.MeshUtils.setColor(this.output, T.AutomationN3DConnectable.OutputColor.toColor4())
    }

    async dispose() { }
}

export class GazeControllerN3D implements Node3D {

    output!: InstanceType<(typeof AutomationN3DConnectable)['Output']>

    enabledValue = 1
    disabledValue = 0
    isGaze = false

    updateValue(){
        const {tools:T} = this.context

        if(this.isGaze) {
            this.output.value = this.enabledValue
            T.MeshUtils.setColor(this.gui.eye, new Color4(0, 1, 0, 1))
        }
        else {
            this.output.value = this.disabledValue
            T.MeshUtils.setColor(this.gui.eye, new Color4(1, 0, 0, 1))
        }
    }

    constructor(private context: Node3DContext, private gui: GazeControllerN3DGUI) {
        const { tools: T } = context
        const that = this

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
            id: "automation_parameter_enabled",
            meshes: [gui.enabledRotator, ...gui.enabledRotator.getChildMeshes()],
            getLabel() { return output.name },
            getStepCount() { return output.stepCount },
            getValue() { return that.enabledValue },
            setValue(value) {
                that.enabledValue = value
                gui.enabledRotator.rotation.y = value * Math.PI - Math.PI/2
                that.updateValue()
            },
            stringify(value) { return output.stringify(value) },
        })

        gui.enabledRotator.rotation.y = 1 * Math.PI - Math.PI/2

        context.createParameter({
            id: "automation_parameter_disabled",
            meshes: [gui.disabledRotator, ...gui.disabledRotator.getChildMeshes()],
            getLabel() { return output.name },
            getStepCount() { return output.stepCount },
            getValue() { return that.disabledValue },
            setValue(value) {
                that.disabledValue = value
                gui.disabledRotator.rotation.y = value * Math.PI - Math.PI/2
                that.updateValue()
            },
            stringify(value) { return output.stringify(value) },
        })

        gui.disabledRotator.rotation.y = 0 * Math.PI - Math.PI/2

        // Gaze
        const o = InputManager.getInstance().head.onNewTarget.add(e => {
            if(e.targetMesh === gui.eye){
                if(!this.isGaze){
                    this.isGaze = true
                    this.updateValue()
                }
            }
            else{
                if(this.isGaze){
                    this.isGaze = false
                    this.updateValue()
                }
            }
        })

        usingWith(gui.base, o)

        that.updateValue()
    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() { }

}


export const GazeControllerN3DFactory: Node3DFactory<GazeControllerN3DGUI, GazeControllerN3D> = {

    label: "Gaze Controller",

    description: "A simple controller that changes its output value when the user gazes at it. Can be used for simple interactions or as a building block for more complex automations.",

    tags: ["automationcontroller", "automation", "gaze"],

    async createGUI(context: Node3DGUIContext) {
        const ret = new GazeControllerN3DGUI()
        await ret.init(context)
        return ret
    },

    async create(context: Node3DContext, gui: GazeControllerN3DGUI) {
        return new GazeControllerN3D(context, gui)
    },

}