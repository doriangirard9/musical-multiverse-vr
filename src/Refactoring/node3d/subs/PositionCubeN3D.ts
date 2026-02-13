import { AbstractMesh, Color4, Observer, Quaternion, TransformNode, Vector3, Vector4 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";
import { InputManager } from "../../xr/inputs/InputManager";
import { AutomationN3DConnectable } from "../tools";

// Constantes pour l'espace normalisé 1x1x1
const EDGE_THICKNESS = 0.01


export class PositionCubeN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext
    root!: TransformNode

    base!: AbstractMesh
    cube!: AbstractMesh
    edges!: AbstractMesh

    axes!: AbstractMesh[]
    point!: AbstractMesh

    outputs!: AbstractMesh[]

    worldSize = 2

    constructor(public factory: PositionCubeN3DFactory) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        this.context = context
        const that = this

        // Root (tous les enfants dans l'espace 1x1x1)
        this.root = new B.TransformNode("position_cube_root")

        // Base
        this.base = B.CreateBox("position_cube_base", {width:1, height:0.1, depth:1}, context.scene)
        this.base.material = context.materialMat
        this.base.parent = this.root
        this.base.position.set(0, -0.55, 0)

        // Cube
        this.cube = B.CreateBox("position_cube_cube", {width:1, height:1, depth:1}, context.scene)
        this.cube.hasVertexAlpha = true
        this.cube.material = context.materialTransparent
        this.cube.parent = this.root
        this.cube.isPickable = false
        this.cube.position.set(0, 0, 0)

        // Box segments
        this.edges = this.createCubeEdge(1, 1, 1)
        this.edges.material = context.materialMat
        this.edges.parent = this.root
        this.edges.position.set(0, 0, 0)

        // Creates cursors axes
        function line(base: Vector3, direction: Vector3, color: Color4) {
            const mesh = that.line(base,direction)
            T.MeshUtils.setColor(mesh, color)
            mesh.material = context.materialMat
            mesh.parent = that.root
            mesh.bakeCurrentTransformIntoVertices()
            return mesh
        }
        this.axes = [
            line(new Vector3(-0.5, 0, 0), new Vector3(1, 0, 0), new Color4(1, 0, 0, 1)), // X
            line(new Vector3(0, -0.5, 0), new Vector3(0, 1, 0), new Color4(0, 1, 0, 1)), // Y
            line(new Vector3(0, 0, -0.5), new Vector3(0, 0, 1), new Color4(0, 0, 1, 1))  // Z
        ]

        // Create cursor point
        this.point = B.CreateSphere("position_cursor_point", { diameter: 0.05 }, context.scene)
        this.point.material = context.materialMat
        this.point.parent = this.root

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

        this.set(.5,.5,.5)
    }

    private line(base: Vector3, direction: Vector3) {
        const { babylon: B } = this.context

        const end = base.add(direction)
        const line = B.CreateBox("line",{width:EDGE_THICKNESS, height:1, depth:EDGE_THICKNESS}, this.context.scene)
        line.position = Vector3.Center(base,end)
        line.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, new Quaternion())
        return line
    }

    private createCubeEdge(width: number, height: number, depth: number){
        const { babylon: B } = this.context
        const line = this.line.bind(this)

        function line4(base: Vector3, x: Vector3, y: Vector3, z: Vector3){
            return [line(base, y), line(base.add(x), y), line(base.add(z), y), line(base.add(x).add(z), y)]
        }

        const base = new Vector3(-width/2, -height/2, -depth/2)
        const vx = new Vector3(width, 0, 0)
        const vy = new Vector3(0, height, 0)
        const vz = new Vector3(0, 0, depth)
        
        const meshes = [ ...line4(base, vx, vy, vz), ...line4(base, vy, vz, vx), ...line4(base, vz, vx, vy) ]
        return B.Mesh.MergeMeshes(meshes, true)!!
    }

    set(x: number, y: number, z: number) {
        const { babylon: B, tools: T } = this.context

        const local = new B.Vector3(x - 0.5, y - 0.5, z - 0.5)
            .maximizeInPlaceFromFloats(-0.5,-0.5,-0.5)
            .minimizeInPlaceFromFloats(0.5,0.5,0.5)
        this.point.position.copyFrom(local)

        this.axes[0].position.set(0, local.y, local.z)
        this.axes[1].position.set(local.x, 0, local.z)
        this.axes[2].position.set(local.x, local.y, 0)

        const color = new B.Color4(x, y, z, 1)
        T.MeshUtils.setColor(this.point, color)
        T.MeshUtils.setColor(this.edges, color)
        T.MeshUtils.setColor(this.cube, new B.Color4(x, y, z, .25))
    }

    localize(target: Vector3): boolean{
        if(this.edges.getBoundingInfo().intersectsPoint(target)){
            Vector3.TransformCoordinatesToRef(target, this.root.getWorldMatrix().clone().invert()!!, target)
            target.addInPlaceFromFloats(0.5, 0.5, 0.5)
            return true
        }
        return false
    }

    async dispose() { }
}

export class PositionCubeN3D implements Node3D {

    private outputs: InstanceType<(typeof AutomationN3DConnectable)["Output"]>[] = []
    private observers: Observer<any>[] = []

    constructor(context: Node3DContext, private gui: PositionCubeN3DGUI) {
        const { tools: T } = context
        const inputs = InputManager.getInstance()

        // Hitbox sur la base
        context.addToBoundingBox(gui.base)

        // Créer les sorties d'automation
        const outputNames = ["X Position", "Y Position", "Z Position"]
        this.outputs = gui.outputs.map((mesh, i) => {
            const output = new T.AutomationN3DConnectable.Output(
                `position_${['x', 'y', 'z'][i]}`,
                [mesh],
                outputNames[i],
                0.5
            )
            context.createConnectable(output)
            return output
        })


        // Détection de position (trigger requis)
        this.observers.push(inputs.pointer_move.add(e => {
            if(!inputs.left_trigger.isPressed() && !inputs.right_trigger.isPressed()) return
            const position = e.origin.clone()
            if(gui.localize(position)){
                gui.set(position.x, position.y, position.z)
                this.outputs[0].value = position.x
                this.outputs[1].value = position.y
                this.outputs[2].value = position.z
            }
        }))
    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() {
        this.observers.forEach(obs => obs.remove())
    }
}


export class PositionCubeN3DFactory implements Node3DFactory<PositionCubeN3DGUI, PositionCubeN3D> {

    constructor(
        public size: number,
        public label: string,
        public description: string,
    ) { }

    tags = ["automation", "controller", "3d_position", "interactive"]

    async createGUI(context: Node3DGUIContext) {
        const gui = new PositionCubeN3DGUI(this)
        await gui.init(context)
        return gui
    }

    async create(context: Node3DContext, gui: PositionCubeN3DGUI) {
        return new PositionCubeN3D(context, gui)
    }

    static DEFAULT = new PositionCubeN3DFactory(
        1.5,
        "Position Cube",
        "3D position controller with X/Y/Z automation outputs"
    )

    static LARGE = new PositionCubeN3DFactory(
        2.5,
        "Large Position Cube",
        "Larger 3D position controller for easier control"
    )
}
