import { Matrix, type Mesh, type Observer, type Scene, type TransformNode } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D"
import { Node3DContext } from "../Node3DContext"
import { Node3DGUIContext } from "../Node3DGUIContext"
import { Node3DHandle } from "../Node3DHandle"

/** The board, in GUI units: a wide flat slab. */
const BOARD_WIDTH = 1
const BOARD_HEIGHT = 0.05
const BOARD_DEPTH = 0.7

/** The diameter of an attach port, in GUI units. */
const PORT_SIZE = 0.1

/** Where the four ports sit on the board, one per quarter, in GUI units. */
const PORT_SPOTS: [number, number][] = [
    [-0.25, -0.175], [0.25, -0.175],
    [-0.25, 0.175], [0.25, 0.175],
]


export class PlaqueN3DGUI implements Node3DGUI {

    root!: TransformNode
    board!: Mesh
    ports: Mesh[] = []

    get worldSize(){ return 4 }

    async init(context: Node3DGUIContext){
        const {babylon: B, tools: {MeshUtils, ConnectableUtils, Node3DN3DConnectable}} = context

        this.root = new B.TransformNode("plaque root", context.scene)

        this.board = B.CreateBox("plaque board", {width: BOARD_WIDTH, height: BOARD_HEIGHT, depth: BOARD_DEPTH}, context.scene)
        this.board.material = context.materialMat
        this.board.parent = this.root

        // The ports stand on the board, out of the bounding box, so a cable reaches them directly.
        for(const [x, z] of PORT_SPOTS){
            const port = ConnectableUtils.createOutputMesh("plaque attach", PORT_SIZE, context.scene)
            MeshUtils.setColor(port, Node3DN3DConnectable.Color.toColor4(1))
            port.parent = this.root
            port.position.set(x, BOARD_HEIGHT / 2 + PORT_SIZE / 2, z)
            this.ports.push(port)
        }
    }

    async dispose(){ }
}


/**
 * A board other nodes are attached to: move the board and they come along.
 *
 * @remarks
 * Only the peer whose hands hold the board writes where the attached nodes go; every other peer
 * receives their positions through the ordinary synchronization of each node. Following the frame
 * of the board instead, on every peer, would have two peers writing the same positions from
 * frames that do not arrive in the same order, and the nodes would shiver.
 *
 * So the place each node holds on the board is read at the take, and pushed every frame until the
 * release. A node moved by hand between two takes is simply read again at the next one, which is
 * what keeps it movable. A board moved by anything but a hand does not carry its nodes.
 */
export class PlaqueN3D implements Node3D {

    /** The nodes on the board, as many handles as cables onto them. */
    private readonly attached = new Set<Node3DHandle>()

    /** Where each attached node stands against the board, read at the take. */
    private readonly places = new Map<Node3DHandle, Matrix>()

    private following: Observer<Scene> | null = null

    constructor(context: Node3DContext, gui: PlaqueN3DGUI){
        const {tools: {Node3DN3DConnectable, FrameUtils}} = context
        const scene = gui.root.getScene()

        context.addToBoundingBox(gui.board)

        // Four ports, one behavior: where the cable is dropped only says where the node reads as held.
        gui.ports.forEach((port, index) => {
            context.createConnectable(new Node3DN3DConnectable.Output(`attach_${index}`, [port], `Attach ${index + 1}`, {
                attach: handle => { this.attached.add(handle) },
                detach: handle => {
                    this.attached.delete(handle)
                    this.places.delete(handle)
                },
            }))
        })

        context.observe(context.self.onGrab, () => {
            const board = context.self.getFrame()
            this.places.clear()
            for(const handle of this.attached){
                if(handle.isAlive) this.places.set(handle, FrameUtils.relative(handle.getFrame(), board))
            }
            this.following ??= context.observe(scene.onBeforeRenderObservable, () => {
                const board = context.self.getFrame()
                for(const [handle, place] of this.places){
                    if(handle.isAlive) handle.setFrame(FrameUtils.absolute(place, board))
                }
            })
        })

        context.observe(context.self.onRelease, () => {
            if(this.following) scene.onBeforeRenderObservable.remove(this.following)
            this.following = null
            this.places.clear()
        })
    }

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return [] }

    async dispose(){ }

}


export const PlaqueN3DFactory: Node3DFactory<PlaqueN3DGUI, PlaqueN3D> = {

    label: "Plaque",

    description: "A board other nodes are attached to. Drop a cable from one of its ports on the hitbox of a node and it comes along when the board is moved, turned or resized.",

    tags: ["other", "holder", "plaque", "board", "group", "move"],

    createGUI: async (context) => {
        const gui = new PlaqueN3DGUI()
        await gui.init(context)
        return gui
    },

    create: async (context, gui) => new PlaqueN3D(context, gui),

}
