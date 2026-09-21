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

/** How far the hand must travel to tear one more module off, in multiples of the size of that module. */
const PEEL_FACTOR = 0.55

/**
 * How near the hand must come back for the last module torn off to stick again, in multiples of its
 * size. Under {@link PEEL_FACTOR}, so a hand held still at a bond does not tear and stick over and over.
 */
const MERGE_FACTOR = 0.3

/** How many modules one gesture may peel, a patch wired end to end being one single sheet. */
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
 * Pulling a module away leaves a copy of it standing where it was, and pulling further takes its
 * neighbours along one cable at a time, each leaving its own copy. Coming back sticks the last one
 * peeled again, so how far the hand pulls is how much of the patch is copied, and the gesture can
 * be stopped or undone anywhere along the way.
 *
 * It is how a piece of a patch is lifted out of it, its shape and its wiring included, without
 * being built a second time.
 */
export class BlobTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context

        context.interactions.pointer.enable()
        context.interactions.hitboxes.enable()

        const ray = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)
        const blob = this.#createBlob()
        const mark = this.#createMark()
        const slime = BlobTool.#createSlime(context)
        const shell = BlobTool.#createShell(context)
        mark.setEnabled(false)

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
     * The gesture is played out against that photograph, so it copies the patch as it was taken.
     */
    #take(node: Node3DInstance): void {
        if(node.isLocked) return
        this.#release()
        this.#held = node
        this.#start = node.boundingBoxMesh.absolutePosition.clone()
        this.#spread(node)
    }

    /**
     * Let go of everything: what came off stays off, wired as it is wired.
     * A pull that tore nothing puts its module back where it was taken from, this hand being for
     * copying a patch and not for dragging one out of shape.
     */
    #release(): void {
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

    /** Run the front along the patch, as far as the hand has drawn it. */
    #tick(): void {
        const held = this.#held
        if(held === null) return

        if(NetworkManager.getInstance().node3d.nodes.getId(held) === undefined) return this.#release()

        const now = performance.now()
        if(now - this.#lastTick < TICK_INTERVAL) return
        this.#lastTick = now

        const travel = Vector3.Distance(this.#start, held.boundingBoxMesh.absolutePosition)

        this.#carry()

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
     * A module that cannot be copied stops the front there for the rest of the gesture.
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
     * Only ever the last one, so the front stays a front.
     */
    #stick(): void {
        const index = this.#peeled - 1
        const piece = this.#pieces[index]
        if(piece === undefined) return

        const stamp = piece.stamp
        piece.stamp = null
        this.#peeled = index
        this.#stuck = false

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
     * The whole of the gesture reaches it: it turns when the hand turns and spreads out when the
     * module in the hand grows.
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

    /** Does the world know this module well enough for it to be copied? */
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

        const box = node.boundingBoxMesh
        box.rotationQuaternion = rotation
        box.scaling.setAll(scale.x)
        box.setAbsolutePosition(position)
        node.updatePosition()
    }

    /**
     * The copy of a module, left standing exactly where that module stood at the take.
     * None for a module the world does not know well enough yet. Its cables are drawn afterwards.
     */
    async #stamp(piece: Piece): Promise<Node3DInstance | null> {
        if(!BlobTool.#known(piece.node)) return null

        const serialization = Serialization.getInstance()

        const [stamp] = await serialization.load(serialization.save([piece.node], false))
        if(stamp === undefined) return null

        BlobTool.#put(stamp, piece.origin)
        return stamp
    }

    /**
     * Draw and drop the cables of the copies, so the patch reads the same on both sides of the peel.
     * A port that will take no more cables simply goes without, a short pulse saying so.
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

    /** One cable between two named ports, or none when those ports would refuse it. */
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
     * What is wired together is what may come off, so the hand copies the thing the player built
     * and not what happens to stand close by.
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
     * give. It says which copy came out of which module, and where the peel has got to.
     */
    #show(travel: number): void {
        const piece = this.#pieces[this.#peeled]
        const strain = piece === undefined || this.#stuck || this.#peeled >= MAX_PEELED
            ? 0
            : Math.min(1, travel / BlobTool.#bond(piece, PEEL_FACTOR))

        this.#dressBlob(strain)

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

        this.#mark.setEnabled(true)
        this.#mark.material!.alpha = MARK_ALPHA * strain
        BlobTool.#dress(this.#mark, piece.node)

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

    /**
     * What the slime wrapped around a module is made of: green, and well seen through.
     * Both of its sides are drawn, so a module reads as sitting inside a lump of slime rather than
     * behind a pane of it.
     */
    static #createShell(context: ToolContext): StandardMaterial {
        const material = new StandardMaterial("blob shell", context.scene)
        material.diffuseColor = SHELL_COLOR
        material.emissiveColor = SHELL_COLOR.scale(0.4)
        material.specularColor = new Color3(1, 1, 1)
        material.alpha = SHELL_ALPHA
        material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND

        material.backFaceCulling = false
        return material
    }

    /**
     * The slime at this place in the reserve, made the first time that place is asked for.
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

    /** The strand at this place in the reserve, made the first time that place is asked for. */
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

    /** Lay one strand between two points, and say whether there was anything to lay. */
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
