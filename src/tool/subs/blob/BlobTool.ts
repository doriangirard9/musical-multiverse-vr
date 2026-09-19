import { Color3, CreateBox, CreateCylinder, CreateSphere, Matrix, Mesh, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"
import { Node3dManager } from "../../../app/node3d/Node3dManager"
import { ConnectionManager } from "../../../app/node3d/ConnectionManager"
import { Serialization } from "../../../app/node3d/Serialization"
import { NetworkManager } from "../../../network/NetworkManager"
import { Node3DInstance } from "../../../node3d/instance/Node3DInstance"
import { N3DConnectionInstance } from "../../../node3d/instance/N3DConnectionInstance"
import { frameOf } from "../common/CarriedBlock"
import THUMBNAIL_URL from "./thumbnail.png?url"

/**
 * How far the hand must travel to tear one more module off, in multiples of the size of that module.
 *
 * Nothing here is in meters: the same gesture peels the same patch whether it was built to be held
 * in the hand or to be walked into.
 */
const PEEL_FACTOR = 0.55

/**
 * How near the hand must come back for the last module torn off to stick again, in multiples of its
 * size.
 *
 * Strictly under {@link PEEL_FACTOR}: the gap between the two is what keeps a hand held still at the
 * edge of a bond from tearing and sticking the same module many times a second.
 */
const MERGE_FACTOR = 0.3

/**
 * How many modules one gesture may peel.
 *
 * A patch wired end to end is one single sheet, and a hand that peels everything peels nothing in
 * particular. The front stops here, and what is left is always the far end of the sheet.
 */
const MAX_PEELED = 32

/** The delay between two sweeps, in milliseconds. */
const TICK_INTERVAL = 40

/** Felt without looking: a module came off, one stuck back, and a port that would take no more cables. */
const PEEL_PULSE = [0.55, 35] as const
const MERGE_PULSE = [0.25, 55] as const
const REFUSED_PULSE = [0.15, 20] as const

/** The cube announcing the module about to come off: how solid it gets, and the color it is drawn in. */
const MARK_ALPHA = 0.3
const MARK_COLOR = new Color3(0.45, 1, 0.55)

/** The strands of slime drawn between what has come off and what it came off from. */
const THREAD_DIAMETER = 0.05
const THREAD_COLOR = new Color3(0.45, 1, 0.55)
const THREAD_ALPHA = 0.45

/** How thin the strand of a bond about to give is drawn, as a share of that diameter. */
const THREAD_THINNING = 0.65

/** How wide the strands trailing behind what came off are drawn, as a share of that diameter. */
const TRAIL_WIDTH = 0.7

/** The slime a module that came off is wrapped in: its color, how solid it is, and how far off the
 * module it stands, as a share of the size of that module. */
const SHELL_COLOR = new Color3(0.3, 1, 0.42)
const SHELL_ALPHA = 0.28
const SHELL_MARGIN = 0.14

/** The ball of slime held ahead of the hand, in meters. */
const BLOB_RADIUS = 0.032
const BLOB_OFFSET = 0.055
const BLOB_COLOR = new Color3(0.35, 0.95, 0.45)
const BLOB_ALPHA = 0.62

/** How far the ball of slime is drawn out by a pull about to tear, as a share of its radius. */
const BLOB_STRETCH = 0.8

/** One module of the sheet, photographed the moment the hand took hold. */
type Piece = {
    node: Node3DInstance

    /** Where it stood, and so where its copy is left behind. */
    origin: Matrix

    /** Its place in the sheet, read against the module the hand holds. */
    relative: Matrix

    /** The largest side of its hitbox. Read to be multiplied, never compared. */
    size: number

    /** How many cables away from the module the hand holds it stands. */
    depth: number

    /** The module it was reached through, none for the module the hand holds. */
    parent: Piece | null

    /** The copy left behind, none while the module still holds. */
    stamp: Node3DInstance | null

    /** The freedom it had before the gesture. */
    wasLocked: boolean
}

/** One cable of the sheet, photographed the moment the hand took hold, output end first. */
type Edge = {
    from: Piece
    fromPort: string
    to: Piece
    toPort: string
}

/** A cable this gesture has drawn, and between which pair of ends it was drawn. */
type Wire = {
    connection: N3DConnectionInstance
    shape: string
}

/**
 * The hand that peels a patch off itself, the way a sticker is lifted from its backing.
 *
 * @remarks
 * A module is taken exactly as the plain hand takes it, and the world itself carries it. What this
 * hand adds is what stays behind: past a first pull, a copy of the module is left stuck where it
 * stood, with the same parameters and the same cables, so the one in the hand reads as the one that
 * came off. Pull further and the neighbour comes off in turn, then its neighbour, each leaving its
 * own copy, the front running along the cables and never across open space.
 *
 * Each bond further from the hand holds harder: a module one cable out needs half the travel of one
 * two cables out. So how far the hand pulls says how much of the patch comes off, and the gesture
 * can be stopped anywhere along the way.
 *
 * It undoes itself. Come back and the last module peeled sticks again, exactly onto its copy, which
 * is taken out of the world as if it had never been made. Sticking back needs a closer return than
 * peeling needed a pull, so a hand held still at the edge of a bond does not flicker.
 *
 * The shape of what comes off is read once, at the take, while the patch is still whole: a module
 * that peels late snaps straight to the place it held in the original, never to where it happens to
 * stand at that moment. That is what makes the copy come off with the shape of the thing copied
 * rather than stretched out along the gesture.
 *
 * Letting go keeps whatever has come off, so stopping early simply copies less. A pull let go before
 * anything came off keeps nothing instead: the module goes back where it was taken from, since this
 * hand is for copying a patch and not for dragging one out of shape.
 */
export class BlobTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context

        // The hitboxes, so a module can be taken and the world carries it, and nothing else: the
        // connections stay closed, so no cable is dragged out of a port by this hand.
        context.interactions.pointer.enable()
        context.interactions.hitboxes.enable()

        const ray = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)
        const blob = this.#createBlob()
        const mark = this.#createMark()
        const slime = BlobTool.#createSlime(context)
        const shell = BlobTool.#createShell(context)
        mark.setEnabled(false)

        // The hold is not guessed from the trigger: the world says what it hands over, so a module
        // taken with two hands, or let go because the hand lost the right to hold it, is followed
        // just the same.
        const nodes = Node3dManager.getInstance()
        const taking = nodes.onNodeGrabbed.add(({node, pointers}) => {
            if(pointers.includes(context.controller.pointer)) this.#take(node)
        })
        const letting = nodes.onNodeReleased.add(({node, pointers}) => {
            if(node !== this.#held) return
            if(pointers.length === 0 || pointers.includes(context.controller.pointer)) this.#release()
        })
        const ticking = context.scene.onBeforeRenderObservable.add(() => this.#tick())

        this.#blob = blob
        this.#mark = mark
        this.#slime = slime
        this.#shell = shell

        this.#unhook = () => {
            taking.remove()
            letting.remove()
            context.scene.onBeforeRenderObservable.remove(ticking)
            for(const strand of this.#threads) strand.dispose(false, true)
            for(const skin of this.#shells) skin.dispose(false, true)
            this.#threads.length = 0
            this.#shells.length = 0
            slime.dispose()
            shell.dispose()
            mark.dispose(false, true)
            for(const mesh of blob) mesh.dispose(false, true)
            ray.remove()
        }
    }

    public dispose(): void {
        this.#isDisposed = true
        this.#release()
        this.#unhook()
        this.#context.interactions.disable()
    }


    readonly #context: ToolContext

    /** Everything the tool put in the world or hooked onto it, undone at once. */
    readonly #unhook: () => void

    /** The ball of slime held ahead of the hand, and the bead floating inside it. */
    readonly #blob: Mesh[]

    /** The cube laid over the module about to come off. */
    readonly #mark: Mesh

    /** What every strand of slime is made of. */
    readonly #slime: StandardMaterial

    /**
     * The strands of slime drawn this sweep, kept from one sweep to the next.
     *
     * @remarks
     * A strand is never thrown away, only put away: a gesture draws and drops them by the dozen as
     * the front runs along the patch, and building a mesh per module per sweep would be felt.
     */
    readonly #threads: Mesh[] = []

    /** What the slime wrapped around a module that came off is made of. */
    readonly #shell: StandardMaterial

    /** The slime wrapped around each module that came off, kept from one sweep to the next. */
    readonly #shells: Mesh[] = []

    /** The module the hand carries, none while it carries nothing. */
    #held: Node3DInstance | null = null

    /** Where that module stood when it was taken. */
    #start = Vector3.Zero()

    /** The sheet, nearest cable first, the module the hand holds at the front. */
    #pieces: Piece[] = []

    /** The cables of the sheet, as they stood at the take. */
    #edges: Edge[] = []

    /** How many modules have come off: always a run from the front of the sheet, never a hole in it. */
    #peeled = 0

    /** The cables this gesture has drawn between the copies and whatever they hang onto. */
    readonly #wires = new Map<Edge, Wire>()

    /** True while a copy is being built, since building one is not instant. */
    #pending = false

    /** True once the front has met a module whose copy could not be built. */
    #stuck = false

    #isDisposed = false

    /** When the sheet was last carried along, in milliseconds. */
    #lastTick = 0

    /**
     * Take the module the world has just handed over, and photograph the patch it belongs to.
     *
     * @remarks
     * The whole photograph is taken here, while the patch is still whole: the place each module
     * holds, and every cable between them. Everything the gesture does afterwards is read off this
     * photograph and never off the world, which is by then busy changing under the cables being
     * drawn.
     */
    #take(node: Node3DInstance): void {
        if(node.isLocked) return
        this.#release()
        this.#held = node
        this.#start = node.boundingBoxMesh.absolutePosition.clone()
        this.#spread(node)
    }

    /**
     * Let go of everything.
     *
     * @remarks
     * What came off stays off, where it stands and wired as it is wired: a gesture that tore
     * something is never undone at its end. The followers are given back exactly the freedom they
     * had.
     *
     * A pull that tore nothing is another matter: no copy was left behind, so letting go there would
     * simply have dragged a module out of the patch, which is not what this hand is for. It is put
     * back exactly where it was taken from, and the world is left as it was found.
     */
    #release(): void {
        // Before the pieces go, since this is read off the photograph.
        const held = this.#held
        const first = this.#pieces[0]
        if(held !== null && this.#peeled === 0 && first !== undefined
            && NetworkManager.getInstance().node3d.nodes.getId(held) !== undefined){
            BlobTool.#put(held, first.origin)
        }

        for(let index = 1; index < this.#peeled; index++){
            const piece = this.#pieces[index]
            if(piece.node.isLocked !== piece.wasLocked) piece.node.isLocked = piece.wasLocked
        }
        this.#held = null
        this.#pieces = []
        this.#edges = []
        this.#peeled = 0
        this.#stuck = false
        this.#wires.clear()
        this.#mark.setEnabled(false)
        this.#putAwayThreads(0)
        this.#putAwayShells(0)
        this.#dressBlob(0)
    }

    #tick(): void {
        const held = this.#held
        if(held === null) return

        // A module taken out of the world while it was carried is no longer carried.
        if(NetworkManager.getInstance().node3d.nodes.getId(held) === undefined) return this.#release()

        const now = performance.now()
        if(now - this.#lastTick < TICK_INTERVAL) return
        this.#lastTick = now

        // How far the hand has drawn the sheet away from where it lay. One single number drives the
        // whole front, so what the hand feels and what the patch does cannot drift apart.
        const travel = Vector3.Distance(this.#start, held.boundingBoxMesh.absolutePosition)

        this.#carry()

        // At most one module changes state per sweep, so the front is seen running along the patch
        // rather than jumping through it.
        if(!this.#pending){
            const next = this.#pieces[this.#peeled]
            const last = this.#peeled > 0 ? this.#pieces[this.#peeled - 1] : undefined
            if(!this.#stuck && next !== undefined && this.#peeled < MAX_PEELED && travel > BlobTool.#bond(next, PEEL_FACTOR)) void this.#peel()
            else if(last !== undefined && travel < BlobTool.#bond(last, MERGE_FACTOR)) this.#stick()
        }

        this.#show(travel)
    }

    /** How far the hand must travel for this module to change state: its own size, its own depth. */
    static #bond(piece: Piece, factor: number): number {
        return (piece.depth + 1) * factor * piece.size
    }

    /**
     * Tear the next module off the sheet, leaving a copy of it stuck where it stood.
     *
     * @remarks
     * Building the copy is not instant, so the gesture may have ended, or the front moved, by the
     * time it stands: a copy that arrives too late is taken straight back out of the world, and the
     * front is left where it now is. A module whose copy could not be built at all stops the front
     * for the rest of the gesture rather than being tried again every sweep.
     */
    async #peel(): Promise<void> {
        const held = this.#held
        const index = this.#peeled
        const piece = this.#pieces[index]
        if(held === null || piece === undefined) return

        this.#pending = true
        try{
            const stamp = await this.#stamp(piece)

            if(this.#isDisposed || this.#held !== held || this.#peeled !== index){
                if(stamp !== null) void stamp.dispose()
                return
            }
            if(stamp === null){
                this.#stuck = true
                this.#context.controller.pulse(...REFUSED_PULSE)
                return
            }

            piece.stamp = stamp
            this.#peeled = index + 1

            // The module the hand holds is carried by the world and never written here. The others
            // snap to the place they held in the patch, which is where they belong from now on.
            if(index > 0){
                piece.wasLocked = piece.node.isLocked
                piece.node.isLocked = true
                BlobTool.#put(piece.node, piece.relative.multiply(frameOf(held)))
            }

            this.#rewire()
            this.#context.controller.pulse(...PEEL_PULSE)
        }
        finally{
            this.#pending = false
        }
    }

    /**
     * Stick the last module peeled back onto its copy, and take that copy out of the world.
     *
     * @remarks
     * Only ever the last one: sticking a module back from the middle of what came off would leave a
     * hole in the sheet, and the front would no longer be a front.
     */
    #stick(): void {
        const index = this.#peeled - 1
        const piece = this.#pieces[index]
        if(piece === undefined) return

        const stamp = piece.stamp
        piece.stamp = null
        this.#peeled = index
        this.#stuck = false

        // The cables go before the copy does, so none of them is left hanging off a module that is
        // being taken out of the world.
        this.#rewire()
        if(stamp !== null) void stamp.dispose()

        if(index > 0){
            BlobTool.#put(piece.node, piece.origin)
            piece.node.isLocked = piece.wasLocked
        }

        this.#context.controller.pulse(...MERGE_PULSE)
    }

    /**
     * Put every module that came off back where it stands in the sheet.
     *
     * @remarks
     * Worked out every sweep from the place read at the take, never from where the module stood one
     * sweep ago, so nothing drifts over a long gesture. Because that place carries the size and the
     * facing, the whole of the gesture reaches the sheet: it turns when the module in the hand turns
     * and spreads out when it grows.
     */
    #carry(): void {
        const held = this.#held
        if(held === null) return

        const frame = frameOf(held)
        const world = NetworkManager.getInstance().node3d.nodes

        for(let index = 1; index < this.#peeled; index++){
            const piece = this.#pieces[index]
            if(world.getId(piece.node) === undefined) continue
            BlobTool.#put(piece.node, piece.relative.multiply(frame))
        }
    }

    /**
     * Does the world know this module well enough for it to be copied?
     *
     * @remarks
     * A module is written into the world in two steps, and it answers to its name before it says
     * what kind of thing it is. Everything that copies has to ask for both, since a copy is built
     * from the kind alone.
     */
    static #known(node: Node3DInstance): boolean {
        const world = NetworkManager.getInstance().node3d.nodes
        const id = world.getId(node)
        return id !== undefined && world.getData(id) !== undefined
    }

    /** Lay a module onto a frame, and say so to the other players. */
    static #put(node: Node3DInstance, frame: Matrix): void {
        const scale = new Vector3()
        const rotation = new Quaternion()
        const position = new Vector3()
        frame.decompose(scale, rotation, position)

        // The scale is uniform everywhere in this project, so one of its three sides says it all.
        const box = node.boundingBoxMesh
        box.rotationQuaternion = rotation
        box.scaling.setAll(scale.x)
        box.setAbsolutePosition(position)
        node.updatePosition()
    }

    /** The copy of a module, left standing exactly where that module stood at the take. */
    async #stamp(piece: Piece): Promise<Node3DInstance | null> {
        // A module still being built, or already taken out of the world, has no kind to copy yet:
        // the world knows it by name a moment before it says what it is made of. Copying it then
        // would ask for a module of no kind at all, which is not a thing the world can build.
        if(!BlobTool.#known(piece.node)) return null

        const serialization = Serialization.getInstance()

        // Alone: the cables of the copy are drawn afterwards, and they are not the cables this
        // module has right now, since half of what it hangs onto may already have come off.
        const [stamp] = await serialization.load(serialization.save([piece.node], false))
        if(stamp === undefined) return null

        BlobTool.#put(stamp, piece.origin)
        return stamp
    }

    /**
     * Draw and drop the cables of the copies, so the patch reads the same on both sides of the peel.
     *
     * @remarks
     * One rule, applied to every cable of the photograph: an end that has come off is replaced by
     * its copy, an end that still holds is left as it is. A cable with neither end off is the
     * original one and is not touched.
     *
     * So a copy hangs onto the modules its original hung onto, and the moment one of those comes off
     * in turn, the cable swings over to that one's copy on its own. That is the sticker being lifted
     * one bond at a time, and it needs no case of its own.
     *
     * A port that will take no more cables simply goes without: the gesture is never stopped by one,
     * and a short pulse says the patch came off one cable short.
     */
    #rewire(): void {
        for(const edge of this.#edges){
            const fromPeeled = edge.from.stamp !== null
            const toPeeled = edge.to.stamp !== null
            const shape = fromPeeled || toPeeled ? `${fromPeeled}/${toPeeled}` : null

            const current = this.#wires.get(edge)
            if(current !== undefined && current.shape === shape) continue

            if(current !== undefined){
                current.connection.remove()
                this.#wires.delete(edge)
            }
            if(shape === null) continue

            const connection = BlobTool.#link(
                fromPeeled ? edge.from.stamp! : edge.from.node, edge.fromPort,
                toPeeled ? edge.to.stamp! : edge.to.node, edge.toPort,
            )
            if(connection === null) this.#context.controller.pulse(...REFUSED_PULSE)
            else this.#wires.set(edge, {connection, shape})
        }
    }

    /**
     * One cable between two named ports, or none when those ports would refuse it.
     *
     * @remarks
     * The refusal is asked for rather than found out: a port already holding as many cables as it
     * takes is the ordinary case here, since peeling wires a copy onto a port the original is still
     * wired onto.
     *
     * The manager tells nothing of what it made, so the new cable is picked out by looking at what
     * the port holds before and after.
     */
    static #link(from: Node3DInstance, fromPort: string, to: Node3DInstance, toPort: string): N3DConnectionInstance | null {
        const output = from.connectables.get(fromPort)
        const input = to.connectables.get(toPort)
        if(output === undefined || input === undefined) return null
        if(output.canConnectTo(input) !== null) return null

        const before = new Set(output.connections)
        ConnectionManager.getInstance().connect(output, input)
        for(const connection of output.connections) if(!before.has(connection)) return connection
        return null
    }

    /**
     * Photograph the patch a module belongs to: every module it reaches through cables, and how.
     *
     * @remarks
     * The spreading follows the cables and nothing else, so what comes off is what is wired
     * together, which is the thing the player built rather than the things that happen to stand
     * close by. It is walked nearest cable first, so the run of modules that may come off is always
     * a run outward from the hand.
     *
     * A module the world cannot yet name is left out, and so is the cable leading to it: one being
     * built has no kind to copy, and photographing it would only stop the peel later on, in the
     * middle of the gesture, rather than here.
     */
    #spread(from: Node3DInstance): void {
        if(!BlobTool.#known(from)) return

        const frame = frameOf(from).invert()
        const pieces = new Map<Node3DInstance, Piece>()

        const add = (node: Node3DInstance, depth: number, parent: Piece | null): void => {
            const extend = node.boundingBoxMesh.getBoundingInfo().boundingBox.extendSizeWorld
            const piece: Piece = {
                node,
                origin: frameOf(node),
                relative: frameOf(node).multiply(frame),
                size: 2 * Math.max(extend.x, extend.y, extend.z),
                depth,
                parent,
                stamp: null,
                wasLocked: node.isLocked,
            }
            pieces.set(node, piece)
            this.#pieces.push(piece)
        }

        add(from, 0, null)

        const seen = new Set<N3DConnectionInstance>()
        for(let index = 0; index < this.#pieces.length; index++){
            const piece = this.#pieces[index]
            for(const connection of piece.node.connections){
                if(seen.has(connection)) continue
                seen.add(connection)

                const output = connection.outputConnectable
                const input = connection.inputConnectable
                if(!output || !input) continue

                const other = output.instance === piece.node ? input.instance : output.instance
                if(!pieces.has(other)){
                    if(!BlobTool.#known(other)) continue
                    add(other, piece.depth + 1, piece)
                }

                this.#edges.push({
                    from: pieces.get(output.instance)!,
                    fromPort: output.config.id,
                    to: pieces.get(input.instance)!,
                    toPort: input.config.id,
                })
            }
        }
    }

    /**
     * Draw the slime: one strand behind every module that came off, one more on the bond about to
     * give.
     *
     * @remarks
     * A module that came off stays joined to the copy it came from by a strand, for as long as the
     * hand holds the gesture. That is what says which copy came out of which module, and it is the
     * one thing that reads at a glance when a dozen of them are travelling at once.
     *
     * Of the modules still holding, only the one at the front is drawn, with the cube that announces
     * it. Everything behind it has already given, everything ahead of it is not being pulled on yet,
     * and drawing them all would say nothing about where the peel has got to.
     */
    #show(travel: number): void {
        const piece = this.#pieces[this.#peeled]
        const strain = piece === undefined || this.#stuck || this.#peeled >= MAX_PEELED
            ? 0
            : Math.min(1, travel / BlobTool.#bond(piece, PEEL_FACTOR))

        this.#dressBlob(strain)

        // Every module that came off travels wrapped in slime, with a strand of it running back to
        // the copy standing where it was taken from.
        let drawn = 0
        for(let index = 0; index < this.#peeled; index++){
            const peeled = this.#pieces[index]

            const skin = this.#skin(index)
            skin.setEnabled(true)
            BlobTool.#dress(skin, peeled.node, SHELL_MARGIN)

            const from = peeled.origin.getTranslation()
            const to = peeled.node.boundingBoxMesh.absolutePosition
            if(this.#stretch(drawn, from, to, TRAIL_WIDTH)) drawn++
        }
        this.#putAwayShells(this.#peeled)

        if(piece === undefined || strain <= 0){
            this.#mark.setEnabled(false)
            this.#putAwayThreads(drawn)
            return
        }

        // The cube stands on the module that is next, and grows solid as its bond gives.
        this.#mark.setEnabled(true)
        this.#mark.material!.alpha = MARK_ALPHA * strain
        BlobTool.#dress(this.#mark, piece.node)

        // The strand of the bond itself runs from where that module still lies to whatever pulls on
        // it: the module it hangs from once that one has come off, the hand itself while nothing has.
        const anchor = piece.parent !== null && piece.parent.stamp !== null
            ? piece.parent.node.boundingBoxMesh.absolutePosition
            : this.#held!.boundingBoxMesh.absolutePosition
        if(this.#stretch(drawn, piece.origin.getTranslation(), anchor, 1 - THREAD_THINNING * strain)) drawn++

        this.#putAwayThreads(drawn)
    }

    /** Put away every strand past the ones drawn this sweep. */
    #putAwayThreads(drawn: number): void {
        for(let index = drawn; index < this.#threads.length; index++) this.#threads[index].setEnabled(false)
    }

    /** Draw the ball of slime out towards whatever it is pulling on. */
    #dressBlob(strain: number): void {
        const [ball] = this.#blob
        const squeeze = 1 - BLOB_STRETCH * strain * 0.3
        ball.scaling.set(squeeze, squeeze, 1 + BLOB_STRETCH * strain)
    }

    /** One translucent cube, laid over the module the next pull would tear off. */
    #createMark(): Mesh {
        const material = new StandardMaterial("blob mark", this.#context.scene)
        material.diffuseColor = MARK_COLOR
        material.emissiveColor = MARK_COLOR.scale(0.5)
        material.alpha = MARK_ALPHA
        material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        material.backFaceCulling = false

        const mark = CreateBox("blob mark", {size: 1}, this.#context.scene)
        mark.material = material
        mark.isPickable = false
        mark.receiveShadows = false
        mark.checkCollisions = false
        mark.rotationQuaternion = Quaternion.Identity()
        return mark
    }

    /** Lay a cube over the module it marks, on its hitbox, standing off it by a share of its size. */
    static #dress(mark: Mesh, node: Node3DInstance, margin: number = 0): void {
        const box = node.boundingBoxMesh
        const extend = box.getBoundingInfo().boundingBox.extendSize
        const swell = 2 * (1 + margin)

        mark.scaling.set(swell * extend.x * box.scaling.x, swell * extend.y * box.scaling.y, swell * extend.z * box.scaling.z)
        mark.rotationQuaternion = (box.rotationQuaternion ?? Quaternion.Identity()).clone()
        mark.position.copyFrom(box.absolutePosition)
    }

    /** What the slime wrapped around a module is made of: green, and well seen through. */
    static #createShell(context: ToolContext): StandardMaterial {
        const material = new StandardMaterial("blob shell", context.scene)
        material.diffuseColor = SHELL_COLOR
        material.emissiveColor = SHELL_COLOR.scale(0.4)
        material.specularColor = new Color3(1, 1, 1)
        material.alpha = SHELL_ALPHA
        material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND

        // Both sides, so the far wall of the cube is seen through the near one and the module reads
        // as sitting inside a lump of slime rather than behind a pane of it.
        material.backFaceCulling = false
        return material
    }

    /**
     * The slime at this place in the reserve, made the first time that place is asked for.
     *
     * @remarks
     * Unpickable, so a module wrapped in slime is still taken by the hand through its own hitbox.
     */
    #skin(index: number): Mesh {
        const known = this.#shells[index]
        if(known !== undefined) return known

        const skin = CreateBox("blob shell", {size: 1}, this.#context.scene)
        skin.material = this.#shell
        skin.isPickable = false
        skin.receiveShadows = false
        skin.checkCollisions = false
        skin.rotationQuaternion = Quaternion.Identity()
        this.#shells[index] = skin
        return skin
    }

    /** Put away every lump of slime past the ones drawn this sweep. */
    #putAwayShells(drawn: number): void {
        for(let index = drawn; index < this.#shells.length; index++) this.#shells[index].setEnabled(false)
    }

    /** What every strand of slime is made of: green, and seen through. */
    static #createSlime(context: ToolContext): StandardMaterial {
        const material = new StandardMaterial("blob slime", context.scene)
        material.diffuseColor = THREAD_COLOR
        material.emissiveColor = THREAD_COLOR.scale(0.6)
        material.alpha = THREAD_ALPHA
        material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        material.backFaceCulling = false
        return material
    }

    /**
     * The strand at this place in the reserve, made the first time that place is asked for.
     *
     * @remarks
     * Drawn along Y and one unit long, so laying it between two points is one scale and one turn.
     */
    #thread(index: number): Mesh {
        const known = this.#threads[index]
        if(known !== undefined) return known

        const thread = CreateCylinder("blob thread", {diameter: THREAD_DIAMETER, height: 1, tessellation: 6}, this.#context.scene)
        thread.material = this.#slime
        thread.isPickable = false
        thread.receiveShadows = false
        thread.checkCollisions = false
        thread.rotationQuaternion = Quaternion.Identity()
        this.#threads[index] = thread
        return thread
    }

    /**
     * Lay one strand between two points, and say whether there was anything to lay.
     *
     * @remarks
     * Two points on top of each other have no direction to turn towards, which happens the moment a
     * module snaps into place, so no strand is spent on them.
     */
    #stretch(index: number, from: Vector3, to: Vector3, width: number): boolean {
        const along = to.subtract(from)
        const length = along.length()
        if(length < Number.EPSILON) return false

        const thread = this.#thread(index)
        thread.setEnabled(true)
        thread.scaling.set(width, length, width)
        thread.position.copyFrom(from).addInPlace(to).scaleInPlace(0.5)
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, along.scaleInPlace(1 / length), thread.rotationQuaternion!)
        return true
    }

    /** The ball of slime held ahead of the hand, with a darker bead floating inside it. */
    #createBlob(): Mesh[] {
        const skin = new StandardMaterial("blob skin", this.#context.scene)
        skin.diffuseColor = BLOB_COLOR
        skin.emissiveColor = BLOB_COLOR.scale(0.35)
        skin.specularColor = new Color3(1, 1, 1)
        skin.alpha = BLOB_ALPHA
        skin.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        skin.backFaceCulling = false

        const core = new StandardMaterial("blob core", this.#context.scene)
        core.diffuseColor = BLOB_COLOR.scale(0.4)
        core.emissiveColor = BLOB_COLOR.scale(0.6)

        const ball = CreateSphere("blob", {diameter: 2 * BLOB_RADIUS, segments: 10}, this.#context.scene)
        ball.parent = this.#context.visual
        ball.isPickable = false
        ball.material = skin
        ball.position.set(0, 0, BLOB_OFFSET)

        const bead = CreateSphere("blob bead", {diameter: BLOB_RADIUS, segments: 8}, this.#context.scene)
        bead.parent = ball
        bead.isPickable = false
        bead.material = core

        return [ball, bead]
    }

}

/** The kind of the hand that peels a patch off itself, leaving a copy stuck behind. */
export const BLOB_TOOL_KIND: ToolKind = {
    label: "Blob",
    description: "Pulls a copy out of the module it holds and leaves the original stuck in place: pull further and the modules wired to it come off in turn, come back and they stick again.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "contact", "wide"],
    create: context => new BlobTool(context),
}
