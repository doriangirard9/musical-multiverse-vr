import { Color3, type Mesh, type TransformNode, Vector3 } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D"
import { Node3DContext } from "../Node3DContext"
import { Node3DGUIContext } from "../Node3DGUIContext"
import { Node3DHandle, Node3DHandleConnectable } from "../Node3DHandle"
import { MeshUtils, Node3DN3DConnectable } from "../tools"

/** How many managed nodes a draw needs: one alone still gets its parameters drawn. */
const MIN_MANAGED = 1

/** The case, in GUI units. */
const CASE_SIZE = 0.6

/** The diameter of the manage port, in GUI units. */
const PORT_SIZE = 0.2

/** The arrange switch beside the button, in GUI units. */
const SWITCH_SIZE = 0.1
const SWITCH_OFF_COLOR = new Color3(0.35, 0.35, 0.35)
const SWITCH_ON_COLOR = new Color3(0.3, 0.85, 0.4)

/** The gaps left when the managed nodes are lined up above the box, in world units. */
const ROW_GAP = 0.3
const ROW_HEIGHT = 0.5

/** The push button on top, in GUI units. */
const BUTTON_DIAMETER = 0.3
const BUTTON_HEIGHT = 0.08
const BUTTON_COLOR = new Color3(0.9, 0.25, 0.3)


export class RandomizerN3DGUI implements Node3DGUI {

    root!: TransformNode
    case!: Mesh
    port!: Mesh
    button!: Mesh
    switch!: Mesh

    get worldSize(){ return 2 }

    async init(context: Node3DGUIContext){
        const {babylon: B, tools: {MeshUtils, ConnectableUtils, Node3DN3DConnectable}} = context

        this.root = new B.TransformNode("randomizer root", context.scene)

        this.case = B.CreateBox("randomizer case", {size: CASE_SIZE}, context.scene)
        this.case.material = context.materialMat
        this.case.parent = this.root

        // Everything stands on top of the case, out of the hitbox, so hands and cables reach it directly:
        // the port on the back row, the button and the arrange switch on the front row.
        const top = CASE_SIZE / 2
        const back = CASE_SIZE * 0.3
        const front = -CASE_SIZE * 0.25

        this.port = ConnectableUtils.createOutputMesh("randomizer manage", PORT_SIZE, context.scene)
        MeshUtils.setColor(this.port, Node3DN3DConnectable.Color.toColor4(1))
        this.port.parent = this.root
        this.port.position.set(0, top + PORT_SIZE / 2, back)

        this.button = B.CreateCylinder("randomizer button", {diameter: BUTTON_DIAMETER, height: BUTTON_HEIGHT}, context.scene)
        MeshUtils.setColor(this.button, BUTTON_COLOR.toColor4(1))
        this.button.parent = this.root
        this.button.position.set(0, top + BUTTON_HEIGHT / 2, front)

        this.switch = B.CreateBox("randomizer arrange", {size: SWITCH_SIZE}, context.scene)
        this.switch.parent = this.root
        this.switch.position.set(BUTTON_DIAMETER / 2 + SWITCH_SIZE, top + SWITCH_SIZE / 2, front)
        this.setArrange(false)
    }

    /** Light the arrange switch up or off. */
    setArrange(on: boolean){
        MeshUtils.setColor(this.switch, (on ? SWITCH_ON_COLOR : SWITCH_OFF_COLOR).toColor4(1))
    }

    async dispose(){ }
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

    /** Whether the managed nodes are lined up above the box, in chain order, after a draw. */
    private arrange = false

    constructor(private context: Node3DContext, private gui: RandomizerN3DGUI){
        const {tools: {Node3DN3DConnectable, BooleanN3DParameter}} = context

        context.addToBoundingBox(gui.case)

        context.createConnectable(new Node3DN3DConnectable.Output("manage", [gui.port], "Manage", {
            attach: handle => { this.managed.add(handle) },
            detach: handle => { this.managed.delete(handle) },
        }))

        context.createParameter(new BooleanN3DParameter(
            "arrange", [gui.switch],
            value => { this.arrange = value; gui.setArrange(value) },
            () => this.arrange,
            () => "Arrange",
        ))

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
            this.context.showMessage(`Randomizer: connect a node to manage`)
            return
        }
        const laid = this.rewire(managed)
        this.shake(managed)
        if(this.arrange) this.lineUp(managed, laid)
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
     * Take every signal cable between two managed nodes off, then draw chains through them.
     *
     * @remarks
     * The chains are grown by {@link grow}: from a random node, every port reaches out to another
     * node and the nodes reached carry on, until nothing grows, then a fresh chain starts from a
     * node still untouched. Nothing is laid beyond the chains, so no port carries more than one
     * cable of the draw.
     *
     * @returns The pairs of the chains as laid, in the order they were laid.
     */
    private rewire(managed: Node3DHandle[]): Pair[] {
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

        return grow(managed, this.pairs(managed))
    }

    /**
     * Line the managed nodes up in a row past the top of the box's interface, sources first and
     * sinks last along the cables laid, the nodes no cable touches at the end. The row runs along
     * the box's own right and stands off it along the up of its interface, that is towards its
     * back row, where the port is, not along the normal of the face nor the world's up. Every node takes the
     * very orientation of the box and keeps its size.
     */
    private lineUp(managed: Node3DHandle[], laid: Pair[]): void {
        const ordered = topological(managed, laid)

        const self = this.context.self
        const frame = self.getFrame()
        const right = Vector3.Right().applyRotationQuaternion(frame.rotation)
        const up = Vector3.Forward().applyRotationQuaternion(frame.rotation)
        const floor = self.getExtent().z + ROW_HEIGHT

        const extents = ordered.map(handle => handle.getExtent())
        const width = extents.reduce((sum, extent) => sum + extent.x * 2, 0) + ROW_GAP * (ordered.length - 1)
        let x = -width / 2
        ordered.forEach((handle, index) => {
            const extent = extents[index]
            x += extent.x
            handle.setFrame({
                position: frame.position.add(right.scale(x)).add(up.scale(floor + extent.z)),
                rotation: frame.rotation.clone(),
            })
            x += extent.x + ROW_GAP
        })
    }

    /**
     * Every compatible pair of a signal output on one managed node and a signal input on another.
     *
     * @remarks
     * A port that holds a cable to a node outside the managed ones is left out: that cable is the
     * patch's link to the rest of the world, and the draw neither doubles it nor competes with it.
     */
    private pairs(managed: Node3DHandle[]): Pair[] {
        const ids = new Set(managed.map(handle => handle.id))
        const taken = new Set<string>()
        for(const handle of managed){
            for(const connection of handle.getConnections()){
                if(!ids.has(connection.from.id)) taken.add(`${connection.to.id}/${connection.toPort}`)
                if(!ids.has(connection.to.id)) taken.add(`${connection.from.id}/${connection.fromPort}`)
            }
        }
        const free = (handle: Node3DHandle, port: Node3DHandleConnectable) =>
            port.type !== Node3DN3DConnectable.Type && !taken.has(`${handle.id}/${port.id}`)

        const pairs: Pair[] = []
        for(const from of managed){
            const outputs = from.getConnectables().filter(port => port.direction !== "input" && free(from, port))
            for(const to of managed){
                if(to === from) continue
                const inputs = to.getConnectables().filter(port => port.direction !== "output" && free(to, port))
                for(const output of outputs) for(const input of inputs){
                    if(output.type === input.type) pairs.push({from, output, to, input})
                }
            }
        }
        return pairs
    }

    /**
     * Draw every parameter of the managed nodes anew, anywhere in its range.
     *
     * @remarks
     * Written as a hand would write them, which passes the lock an automation may hold: a draw
     * that spared the automated parameters would not be a draw.
     */
    private shake(managed: Node3DHandle[]): void {
        for(const handle of managed){
            for(const parameter of handle.getParameters()) parameter.setNormalizedValue(Math.random())
        }
    }

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return [] }

    async dispose(){ }

}


type Pair = {from: Node3DHandle, output: Node3DHandleConnectable, to: Node3DHandle, input: Node3DHandleConnectable}


/**
 * Grow chains of cables through the nodes and lay them.
 *
 * @remarks
 * A chain starts at a random node. Each of its free ports reaches out through one compatible pair,
 * outputs forward and inputs backward, and every node reached does the same in turn, so a node
 * with several outputs branches and a node with several inputs gathers. A port serves once per
 * draw. A node not yet in any chain is preferred as the far end, and a node already in one is
 * taken only when no other will do, which is how chains join up. A pair that would close a loop
 * is never taken, and one the ports refuse, a full port for instance, is passed over. When the
 * chain stops growing, another starts from a node still untouched, until none is left.
 *
 * @returns The pairs laid, in the order they were laid.
 */
function grow(managed: Node3DHandle[], pairs: Pair[]): Pair[] {
    const laid: Pair[] = []
    const used = new Set<string>()
    const visited = new Set<Node3DHandle>()
    const remaining = [...managed]
    shuffle(remaining)

    const free = (pair: Pair) =>
        !used.has(`${pair.from.id}/${pair.output.id}`) && !used.has(`${pair.to.id}/${pair.input.id}`)

    /** Reach out of `node` through `port` once, and tell whether a node joined the chain. */
    const spread = (node: Node3DHandle, port: Node3DHandleConnectable, forward: boolean): Node3DHandle|null => {
        let candidates = pairs.filter(pair =>
            (forward ? pair.from === node && pair.output.id === port.id : pair.to === node && pair.input.id === port.id)
            && free(pair) && !reaches(laid, pair.to, pair.from)
        )
        const fresh = candidates.filter(pair => !visited.has(forward ? pair.to : pair.from))
        if(fresh.length) candidates = fresh
        shuffle(candidates)
        for(const pair of candidates){
            if(pair.from.connect(pair.output.id, pair.to, pair.input.id) !== null) continue
            laid.push(pair)
            used.add(`${pair.from.id}/${pair.output.id}`)
            used.add(`${pair.to.id}/${pair.input.id}`)
            const other = forward ? pair.to : pair.from
            return visited.has(other) ? null : other
        }
        return null
    }

    while(remaining.length){
        const start = remaining.pop()!
        if(visited.has(start)) continue
        visited.add(start)
        const queue = [start]
        while(queue.length){
            const node = queue.shift()!
            for(const port of node.getConnectables()){
                if(port.type === Node3DN3DConnectable.Type) continue
                const outward = port.direction !== "input"
                const inward = port.direction !== "output"
                for(const forward of outward && inward ? [true, false] : [outward]){
                    const joined = spread(node, port, forward)
                    if(joined){
                        visited.add(joined)
                        queue.push(joined)
                    }
                }
            }
        }
    }
    return laid
}


/** Whether cables already laid lead from `from` to `to`. */
function reaches(laid: Pair[], from: Node3DHandle, to: Node3DHandle): boolean {
    const seen = new Set<Node3DHandle>()
    const stack = [from]
    while(stack.length){
        const node = stack.pop()!
        if(node === to) return true
        if(seen.has(node)) continue
        seen.add(node)
        for(const pair of laid) if(pair.from === node) stack.push(pair.to)
    }
    return false
}


/**
 * The nodes ordered along the cables laid, sources first, sinks last, each chain kept together,
 * and the nodes no cable touches at the end.
 *
 * @remarks
 * A depth first walk down the cables from every source, taken in reverse postorder: that is a
 * topological order, and one where a node sits next to what it feeds, so the cables of a row do
 * not cross where they need not.
 */
function topological(managed: Node3DHandle[], laid: Pair[]): Node3DHandle[] {
    const fed = new Set(laid.map(pair => pair.to))
    const touched = new Set(laid.flatMap(pair => [pair.from, pair.to]))
    const seen = new Set<Node3DHandle>()
    const post: Node3DHandle[] = []
    const visit = (node: Node3DHandle) => {
        if(seen.has(node)) return
        seen.add(node)
        for(const pair of laid) if(pair.from === node) visit(pair.to)
        post.push(node)
    }
    for(const handle of managed) if(touched.has(handle) && !fed.has(handle)) visit(handle)
    const ordered = post.reverse()
    for(const handle of managed) if(!seen.has(handle)) ordered.push(handle)
    return ordered
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

    description: "Manages the nodes cabled onto it and, on a button, draws chains of cables through them, branching on every port, and every parameter at random. A switch lines the nodes up above it, sources first, after each draw. Cables to nodes it does not manage are left alone.",

    tags: ["other", "holder", "randomizer", "random", "cable", "parameter", "chaos"],

    createGUI: async (context) => {
        const gui = new RandomizerN3DGUI()
        await gui.init(context)
        return gui
    },

    create: async (context, gui) => new RandomizerN3D(context, gui),

}
