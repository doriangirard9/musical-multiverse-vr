import { Color3, type Mesh, type TransformNode } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D"
import { Node3DContext } from "../Node3DContext"
import { Node3DGUIContext } from "../Node3DGUIContext"
import { Node3DHandle, Node3DHandleConnectable } from "../Node3DHandle"
import { Node3DN3DConnectable, type RotativeParameter } from "../tools"

/** How many managed nodes a draw needs to mean anything. */
const MIN_MANAGED = 2

/** The case, in GUI units. */
const CASE_SIZE = 0.6

/** The diameter of the manage port and of the knobs, in GUI units. */
const PORT_SIZE = 0.12
const KNOB_SIZE = 0.2

/** The push button on the front, in GUI units. */
const BUTTON_DIAMETER = 0.3
const BUTTON_HEIGHT = 0.08
const BUTTON_COLOR = new Color3(0.9, 0.25, 0.3)

/** The defaults of the two knobs, in percent. */
const DEFAULT_DENSITY = 50
const DEFAULT_AMOUNT = 100


export class RandomizerN3DGUI implements Node3DGUI {

    root!: TransformNode
    case!: Mesh
    port!: Mesh
    button!: Mesh
    density!: RotativeParameter
    amount!: RotativeParameter

    get worldSize(){ return 2 }

    async init(context: Node3DGUIContext){
        const {babylon: B, tools: {MeshUtils, ConnectableUtils, RotativeParameter, Node3DN3DConnectable}} = context

        this.root = new B.TransformNode("randomizer root", context.scene)

        this.case = B.CreateBox("randomizer case", {size: CASE_SIZE}, context.scene)
        this.case.material = context.materialMat
        this.case.parent = this.root

        this.port = ConnectableUtils.createOutputMesh("randomizer manage", PORT_SIZE, context.scene)
        MeshUtils.setColor(this.port, Node3DN3DConnectable.Color.toColor4(1))
        this.port.parent = this.root
        this.port.position.set(0, CASE_SIZE / 2 + PORT_SIZE / 2, 0)

        // The button faces the player, on the front of the case.
        this.button = B.CreateCylinder("randomizer button", {diameter: BUTTON_DIAMETER, height: BUTTON_HEIGHT}, context.scene)
        MeshUtils.setColor(this.button, BUTTON_COLOR.toColor4(1))
        this.button.rotation.x = Math.PI / 2
        this.button.parent = this.root
        this.button.position.set(0, 0, -CASE_SIZE / 2 - BUTTON_HEIGHT / 2)

        // The two knobs sit on top, either side of the port.
        this.density = new RotativeParameter("randomizer density", context)
        this.density.root.parent = this.root
        this.density.root.scaling.setAll(KNOB_SIZE)
        this.density.root.position.set(-CASE_SIZE / 3, CASE_SIZE / 2 + KNOB_SIZE * 0.15, 0)

        this.amount = new RotativeParameter("randomizer amount", context)
        this.amount.root.parent = this.root
        this.amount.root.scaling.setAll(KNOB_SIZE)
        this.amount.root.position.set(CASE_SIZE / 3, CASE_SIZE / 2 + KNOB_SIZE * 0.15, 0)
    }

    async dispose(){
        this.density.dispose()
        this.amount.dispose()
    }
}


/**
 * A box that draws the cables and the parameters of the nodes it manages at random, on a button.
 *
 * @remarks
 * Only what lies between managed nodes is touched. A cable with one end on a node this box does
 * not manage is left as it is, whichever end that is, so a patch can be shaken from the inside
 * while it stays wired to the rest of the world. The cables that hold nodes, of the node3d type,
 * are structure and not signal: they are neither removed nor drawn, which also spares the cables
 * of this very box, since it does not manage itself.
 *
 * The draw happens on the peer that presses the button, and only there: what it changes, cables
 * and parameter values, is synchronized by the ordinary means, so the other peers see one draw
 * and not one per peer.
 */
export class RandomizerN3D implements Node3D {

    /** The nodes managed, as many handles as cables onto them. */
    private readonly managed = new Set<Node3DHandle>()

    /** The share of compatible port pairs that get a cable, in percent. */
    private density = DEFAULT_DENSITY

    /** How far each parameter travels from its value towards the drawn one, in percent. */
    private amount = DEFAULT_AMOUNT

    constructor(private context: Node3DContext, private gui: RandomizerN3DGUI){
        const {tools: {Node3DN3DConnectable, PercentageN3DParameter}} = context

        context.addToBoundingBox(gui.case)

        context.createConnectable(new Node3DN3DConnectable.Output("manage", [gui.port], "Manage", {
            attach: handle => { this.managed.add(handle) },
            detach: handle => { this.managed.delete(handle) },
        }))

        context.createParameter(new PercentageN3DParameter(
            "density", gui.density.meshes,
            value => { this.density = value; gui.density.setValue(value / 100) },
            () => this.density,
            () => "Density",
        ))
        gui.density.setValue(this.density / 100)

        context.createParameter(new PercentageN3DParameter(
            "amount", gui.amount.meshes,
            value => { this.amount = value; gui.amount.setValue(value / 100) },
            () => this.amount,
            () => "Amount",
        ))
        gui.amount.setValue(this.amount / 100)

        context.createButton({
            id: "randomize",
            meshes: [gui.button],
            label: "Randomize",
            color: BUTTON_COLOR,
            press: () => this.randomize(),
            release: () => { },
        })
    }

    /** Draw the cables and the parameters of the managed nodes anew. */
    private randomize(): void {
        const managed = this.collect()
        if(managed.length < MIN_MANAGED){
            this.context.showMessage(`Randomizer: connect at least ${MIN_MANAGED} nodes to manage`)
            return
        }
        this.rewire(managed)
        this.shake(managed)
        this.context.sendSignal(this.gui.root.absolutePosition, Math.random(), Math.random(), Math.random())
    }

    /**
     * The managed nodes, one handle per node.
     *
     * @remarks
     * A node cabled twice onto the port is held by two handles; it is one node all the same, and
     * the network id is what tells. A node not yet in the shared world has no id and is left out
     * of this draw.
     */
    private collect(): Node3DHandle[] {
        const byId = new Map<string, Node3DHandle>()
        for(const handle of this.managed){
            const id = handle.id
            if(handle.isAlive && id !== undefined && !byId.has(id)) byId.set(id, handle)
        }
        return [...byId.values()]
    }

    /**
     * Take every signal cable between two managed nodes off, then draw new ones.
     *
     * @remarks
     * Every compatible pair of an output on one managed node and an input on another is a
     * candidate, drawn with the probability of the density. A pair the ports refuse, a full port
     * for instance, is passed over. Should nothing at all come out while something could have, one
     * cable is laid anyway, so that a press always does something.
     */
    private rewire(managed: Node3DHandle[]): void {
        const ids = new Set(managed.map(handle => handle.id))

        const removed = new Set<string>()
        for(const handle of managed){
            for(const connection of handle.getConnections()){
                if(!ids.has(connection.from.id) || !ids.has(connection.to.id)) continue
                const output = connection.from.getConnectables().find(port => port.id === connection.fromPort)
                if(output?.type === Node3DN3DConnectable.Type) continue
                const key = `${connection.from.id}/${connection.fromPort}>${connection.to.id}/${connection.toPort}`
                if(removed.has(key)) continue
                removed.add(key)
                connection.disconnect()
            }
        }

        type Pair = {from: Node3DHandle, output: Node3DHandleConnectable, to: Node3DHandle, input: Node3DHandleConnectable}
        const pairs: Pair[] = []
        for(const from of managed){
            const outputs = from.getConnectables().filter(port => port.type !== Node3DN3DConnectable.Type && port.direction !== "input")
            for(const to of managed){
                if(to === from) continue
                const inputs = to.getConnectables().filter(port => port.type !== Node3DN3DConnectable.Type && port.direction !== "output")
                for(const output of outputs) for(const input of inputs){
                    if(output.type === input.type) pairs.push({from, output, to, input})
                }
            }
        }
        shuffle(pairs)

        let laid = 0
        const threshold = this.density / 100
        for(const pair of pairs){
            if(Math.random() >= threshold) continue
            if(pair.from.connect(pair.output.id, pair.to, pair.input.id) === null) laid++
        }
        if(laid === 0){
            for(const pair of pairs){
                if(pair.from.connect(pair.output.id, pair.to, pair.input.id) === null) break
            }
        }
    }

    /**
     * Move every parameter of the managed nodes part of the way towards a drawn value.
     *
     * @remarks
     * Written as a hand would write them, which passes the lock an automation may hold: a draw
     * that spared the automated parameters would not be a draw.
     */
    private shake(managed: Node3DHandle[]): void {
        const amount = this.amount / 100
        for(const handle of managed){
            for(const parameter of handle.getParameters()){
                const current = parameter.getNormalizedValue()
                parameter.setNormalizedValue(current + (Math.random() - current) * amount)
            }
        }
    }

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return [] }

    async dispose(){ }

}


/** Fisher-Yates, in place. */
function shuffle<T>(list: T[]): void {
    for(let i = list.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
    }
}


export const RandomizerN3DFactory: Node3DFactory<RandomizerN3DGUI, RandomizerN3D> = {

    label: "Randomizer",

    description: "Manages the nodes cabled onto it and, on a button, draws the cables between them and their parameters at random. Cables to nodes it does not manage are left alone.",

    tags: ["other", "holder", "randomizer", "random", "cable", "parameter", "chaos"],

    createGUI: async (context) => {
        const gui = new RandomizerN3DGUI()
        await gui.init(context)
        return gui
    },

    create: async (context, gui) => new RandomizerN3D(context, gui),

}
