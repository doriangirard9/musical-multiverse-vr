import { AbstractMesh, Color3, Color4, TransformNode, Vector3 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { InputManager } from "../../../xr/inputs/InputManager";
import { AutomationN3DConnectable } from "../../tools";

// Constantes pour l'espace normalisé 1x1x1
const EDGE_THICKNESS = 0.01


export class ElectroballsN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext
    root!: TransformNode

    base!: AbstractMesh
    balls!: AbstractMesh[]

    outputs!: AbstractMesh[]

    worldSize = 2

    constructor(public factory: ElectroballsN3DFactory) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        this.context = context
        const that = this

        // Root (tous les enfants dans l'espace 1x1x1)
        this.root = new B.TransformNode("position_cube_root")

        // Base
        this.base = B.CreateBox("position_cube_base", {width:1, height:0.5, depth:1}, context.scene)
        this.base.material = context.materialMat
        this.base.parent = this.root
        this.base.position.set(0, -0.25, 0)

        // Balls
        function createBalls(name: string, x: number, y: number, color: Color4)
        {
            const ball = B.CreateSphere(name, { diameter: 0.3 }, context.scene)
            ball.material = context.materialLight
            ball.parent = that.root
            ball.position.set(x*.25, 0.75, y*.25)
            T.MeshUtils.setColor(ball, color)
            return ball
        }
        this.balls = [
            createBalls("a ball", -1, -1, Color3.Red().toColor4()), // A
            createBalls("b ball", 1, -1, Color3.Green().toColor4()), // B
            createBalls("c ball", -1, 1, Color3.Blue().toColor4()), // C
            createBalls("d ball", 1, 1, Color3.White().toColor4()), // D   
        ]


        // Create outputs
        function createOutput(name: string, position: Vector3, color: Color4): AbstractMesh {
            const sphere = B.CreateSphere(name, { diameter: 0.1 }, context.scene)
            sphere.material = context.materialMat
            sphere.parent = that.root
            sphere.position.copyFrom(position)
            T.MeshUtils.setColor(sphere, color)
            return sphere
        }
        this.outputs = [
            createOutput("position_output_x", new Vector3(.55, -.5, -0.25), new Color4(0.6, 0, 0, 1)), // X
            createOutput("position_output_y", new Vector3(.55, -.5, 0), new Color4(0, 0.6, 0, 1)), // Y
            createOutput("position_output_z", new Vector3(.55, -.5, 0.25), new Color4(0, 0, 0.6, 1))  // Z
        ]

    }


    async dispose() { }
}

export class ElectroballsN3D implements Node3D {

    private outputs: InstanceType<(typeof AutomationN3DConnectable)["Output"]>[] = []
    private observers: {remove(): void}[] = []

    constructor(context: Node3DContext, private gui: ElectroballsN3DGUI) {
        const { tools: T } = context

        // Hitbox sur la base
        context.addToBoundingBox(gui.base)
    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() {
        this.observers.forEach(obs => obs.remove())
    }
}


export class ElectroballsN3DFactory implements Node3DFactory<ElectroballsN3DGUI, ElectroballsN3D> {

    constructor(
        public size: number,
        public label: string,
        public description: string,
    ) { }

    tags = ["automation", "controller", "3d_position", "interactive"]

    async createGUI(context: Node3DGUIContext) {
        const gui = new ElectroballsN3DGUI(this)
        await gui.init(context)
        return gui
    }

    async create(context: Node3DContext, gui: ElectroballsN3DGUI) {
        return new ElectroballsN3D(context, gui)
    }

    static DEFAULT = new ElectroballsN3DFactory(
        1.5,
        "Electroballs",
        "3D position controller with X/Y/Z automation outputs"
    )

    static LARGE = new ElectroballsN3DFactory(
        2.5,
        "Large Electroballs",
        "Larger 3D position controller for easier control"
    )
}
