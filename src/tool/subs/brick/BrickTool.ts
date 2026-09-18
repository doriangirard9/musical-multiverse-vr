import { Color3, CreateBox, CreateCylinder, Matrix, Mesh, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"
import { ConnectionManager } from "../../../app/node3d/ConnectionManager"
import { Node3dManager } from "../../../app/node3d/Node3dManager"
import { NetworkManager } from "../../../network/NetworkManager"
import { N3DConnectableInstance } from "../../../node3d/instance/N3DConnectableInstance"
import { N3DConnectionInstance } from "../../../node3d/instance/N3DConnectionInstance"
import { Node3DInstance } from "../../../node3d/instance/Node3DInstance"
import THUMBNAIL_URL from "./thumbnail.png?url"

/**
 * How wide the air between two modules may be for one to be offered a place on the other, as a
 * share of the size of the smaller of the two.
 *
 * Measured between the faces, never between the middles: a small module brought against a large one
 * would otherwise have to be pushed inside it before anything was offered. And nothing here is in
 * meters, so the same gesture builds the same stack at every scale.
 */
const SNAP_RANGE_FACTOR = 1.2

/**
 * How near the place offered the module has to be held for the place to show and to take, as a
 * share of the size of the module held, on top of the air the place itself leaves.
 *
 * This is what makes the stacking a decision rather than an accident: the place appears, and the
 * hand either goes to it or does not. The air is added in because a module held right against its
 * place is already that far from it, and that hand is plainly aiming at it.
 */
const LOCK_REACH_SHARE = 0.7

/**
 * The air left between two nested modules, as a share of the size of the smaller of the two.
 *
 * Not nothing: two faces flush against each other hide the cable that runs between them, and a
 * player has to see what a stack wired. Wide enough for the cable to read, narrow enough that the
 * two modules still read as one piece.
 */
const NEST_GAP_SHARE = 0.45

/** Beyond this angle, in degrees, two modules are not parallel, and nothing is nested. */
const PARALLEL_ANGLE_DEG = 20

/**
 * How close two ports have to be to face each other, as a share of the size of the smaller module.
 *
 * The air left between two nested modules plus what a port sunk into its own face adds: a stack
 * this hand has just made must read as a stack when it is read again, so this follows the air
 * rather than standing on its own.
 */
const FACE_GAP_SHARE = NEST_GAP_SHARE + 0.35

/** How far onto its side a port has to sit to count as being on the face that touches, as a share of the half size. */
const FACE_SIDE_SHARE = 0.15

/** The delay between two sweeps carrying the followers along and looking for a place, in milliseconds. */
const TICK_INTERVAL = 40

/**
 * The strength and duration of the pulse felt when a place is offered, when a module takes it, and
 * when a module is pulled off the stack it was hanging on.
 */
const LOCK_PULSE = [0.25, 25] as const
const SNAP_PULSE = [0.6, 40] as const
const UNHOOK_PULSE = [0.4, 60] as const

/** The ghost showing the place offered: how solid it is, and the color it is drawn in. */
const GHOST_ALPHA = 0.28
const GHOST_COLOR = new Color3(0.4, 0.9, 1)

/** The brick held ahead of the hand: its sides, its studs and how far ahead of the hand it sits, in meters. */
const BRICK_WIDTH = 0.08
const BRICK_HEIGHT = 0.035
const BRICK_DEPTH = 0.055
const STUD_DIAMETER = 0.02
const STUD_HEIGHT = 0.012
const BRICK_OFFSET = 0.07

/** The color of the brick held in the hand. */
const BRICK_COLOR = new Color3(0.85, 0.35, 0.12)

/** A place a module is offered on another one, and what would be wired if it were taken. */
type Lock = {
    position: Vector3
    rotation: Quaternion
    pairs: [N3DConnectableInstance, N3DConnectableInstance][]
}

/**
 * The hand that stacks modules, and carries a stack as one piece.
 *
 * @remarks
 * While a module is carried near another one, the place it would take on it is worked out and shown
 * as a ghost: laid parallel, flush against the side it is being brought to, its ports facing the
 * ports of the other. Letting go there lays it exactly on that place and wires the facing ports:
 * stacking is chaining, and the cable is there with a tube of no length at all. No place is offered
 * unless at least one link would be made, so modules never glue themselves together for nothing.
 *
 * Nesting is not a state and nothing is written anywhere: two modules are nested when they are
 * parallel, linked, and the two ports of that link sit on the faces that touch. It is read again
 * every time it is asked, from the world itself, so any hand pulling a module out of a stack
 * un-nests it without knowing this tool exists.
 *
 * Taking a module takes everything nested onto it, near to near, and the whole patch travels as one
 * piece, turned as well as carried. Taking it with the squeeze already pressed takes that module
 * alone: it is how one module is pulled out of its stack.
 *
 * The hold itself is not guessed from the trigger: the world says what it hands over
 * ({@link Node3dManager.onNodeGrabbed}), so a module taken with two hands, or let go because the
 * hand lost the right to hold it, is followed just the same.
 */
export class BrickTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context

        // The hitboxes, so a module can be taken and the world carries it, and nothing else: the
        // connections stay closed, so no cable is dragged out of a port by this hand.
        context.interactions.pointer.enable()
        context.interactions.hitboxes.enable()

        const ray = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)
        const brick = BrickTool.#createBrick(context)
        const ghost = this.#ghost = BrickTool.#createGhost(context)

        const nodes = Node3dManager.getInstance()
        const taking = nodes.onNodeGrabbed.add(({node, pointers}) => {
            if(pointers.includes(context.controller.pointer)) this.#take(node)
        })
        const letting = nodes.onNodeReleased.add(({node, pointers}) => {
            if(node !== this.#held) return
            if(pointers.length === 0 || pointers.includes(context.controller.pointer)) this.#drop()
        })
        const ticking = context.scene.onBeforeRenderObservable.add(() => this.#tick())

        this.#unhook = () => {
            taking.remove()
            letting.remove()
            context.scene.onBeforeRenderObservable.remove(ticking)
            for(const mesh of brick) mesh.dispose(false, true)
            ghost.dispose(false, true)
            ray.remove()
        }
    }

    public dispose(): void {
        this.#unhook()
        this.#release()
        this.#context.interactions.disable()
    }


    readonly #context: ToolContext

    /** Everything the tool put in the world or hooked onto it, undone at once. */
    readonly #unhook: () => void

    /** The box showing the place offered, hidden while no place is. */
    readonly #ghost: Mesh

    /** The module the hand carries, none while it carries nothing. */
    #held: Node3DInstance | null = null

    /** What is nested onto the held module, and where each of them stands relative to it. */
    readonly #followers = [] as {node: Node3DInstance, relative: Matrix, wasLocked: boolean}[]

    /** The place the held module is offered, none while it is offered none. */
    #lock: Lock | null = null


    /** When the followers were last carried along, in milliseconds. */
    #lastTick = 0

    /**
     * Take a module, and with it everything nested onto it, near to near.
     *
     * @remarks
     * Whether the stack comes along is decided here, at the moment the module is taken, and never
     * again: taken with the squeeze pressed, the module comes off its stack and travels alone. It
     * cannot be decided while carrying, because the squeeze is already what turns a held module
     * instead of moving it, and a module that can only turn can never be pulled out of anything.
     *
     * Coming off a stack undoes the links that held it there, and those alone. A cable running to
     * a module it was merely wired to is not what held it, and it goes on running.
     */
    #take(node: Node3DInstance): void {
        if(node.isLocked) return
        this.#release()
        this.#held = node

        if(this.#context.controller.squeeze.isPressed()){
            for(const hook of BrickTool.#hooksOf(node)) hook.remove()
            this.#context.controller.pulse(...UNHOOK_PULSE)
            return this.#reread()
        }

        for(const follower of BrickTool.#stackOf(node)){
            this.#followers.push({node: follower, relative: Matrix.Identity(), wasLocked: follower.isLocked})
            // Frozen while it travels, so another hand cannot tear it out of the block in flight.
            follower.isLocked = true
        }
        this.#reread()
    }

    /** Read again where each follower stands relative to the held module. */
    #reread(): void {
        const held = this.#held
        if(held === null) return

        const inverse = BrickTool.#frameOf(held).invert()
        for(const follower of this.#followers){
            BrickTool.#frameOf(follower.node).multiplyToRef(inverse, follower.relative)
        }
    }

    /** Let go of everything, giving the followers back the freedom they had. */
    #release(): void {
        for(const follower of this.#followers) follower.node.isLocked = follower.wasLocked
        this.#followers.length = 0
        this.#held = null
        this.#show(null)
    }

    #tick(): void {
        const held = this.#held
        if(held === null) return

        // A module taken out of the world while it was carried is no longer carried.
        if(NetworkManager.getInstance().node3d.nodes.getId(held) === undefined) return this.#release()

        const now = performance.now()
        if(now - this.#lastTick < TICK_INTERVAL) return
        this.#lastTick = now

        // Turned as well as moved: the followers keep the place they hold in the block, so a stack
        // turned in the hand turns as one piece.
        this.#carry(held)
        this.#show(this.#lockOf(held))
    }

    /** Move every follower to where it stands relative to the held module, and say so to the others. */
    #carry(held: Node3DInstance): void {
        const frame = BrickTool.#frameOf(held)
        const scale = new Vector3()
        const rotation = new Quaternion()
        const position = new Vector3()

        for(const follower of this.#followers){
            const box = follower.node.boundingBoxMesh
            follower.relative.multiply(frame).decompose(scale, rotation, position)
            box.rotationQuaternion = rotation.clone()
            box.setAbsolutePosition(position)
            follower.node.updatePosition()
        }
    }

    /** Show the place offered where it is, or nothing at all when none is. */
    #show(lock: Lock | null): void {
        const had = this.#lock !== null
        this.#lock = lock

        if(lock === null){
            this.#ghost.isVisible = false
            return
        }

        const held = this.#held!
        const box = held.boundingBoxMesh
        const extend = box.getBoundingInfo().boundingBox.extendSize

        this.#ghost.scaling.set(2 * extend.x * box.scaling.x, 2 * extend.y * box.scaling.y, 2 * extend.z * box.scaling.z)
        this.#ghost.rotationQuaternion = lock.rotation.clone()
        this.#ghost.position.copyFrom(lock.position)
        this.#ghost.isVisible = true

        // The place appearing is felt, once, so the hand knows without looking away from what it does.
        if(!had) this.#context.controller.pulse(...LOCK_PULSE)
    }

    /** Put the held module down: onto the place offered, or wherever the hand let it go. */
    #drop(): void {
        const held = this.#held
        const lock = this.#lock

        if(held !== null && lock !== null){
            const box = held.boundingBoxMesh
            box.rotationQuaternion = lock.rotation.clone()
            box.setAbsolutePosition(lock.position)
            BrickTool.#settle(held)
            held.updatePosition()

            for(const [from, to] of lock.pairs) ConnectionManager.getInstance().connect(from, to)
            this.#context.controller.pulse(...SNAP_PULSE)
        }

        this.#release()
    }

    /**
     * The place the held module is offered on the module it is being brought to, none when it is
     * offered none.
     *
     * @remarks
     * The place is worked out without moving anything: the held module is rigid, its hitbox and its
     * ports travel together, so where each port would land is the one turn and shift that would
     * lay the module down, applied to where the port is now. A place with nothing to wire is no
     * place, and a place the hand is not near enough to is not shown: it would put a module down
     * somewhere the hand never aimed at.
     */
    #lockOf(held: Node3DInstance): Lock | null {
        const target = this.#nearest(held)
        if(target === null) return null

        const axes = BrickTool.#axesOf(target)
        const side = BrickTool.#sideOf(target, held, axes)

        const rotation = BrickTool.#parallelTo(axes, held.boundingBoxMesh.rotationQuaternion ?? Quaternion.Identity())
        const air = NEST_GAP_SHARE * Math.min(BrickTool.#sizeOf(held), BrickTool.#sizeOf(target))
        const radius = BrickTool.#radiusOf(target, side) + BrickTool.#radiusAt(held, side, rotation) + air
        const position = BrickTool.#centerOf(target).add(side.scale(radius))

        // Near enough to be meant: the hand is what puts a module on a place, not the room.
        const reach = LOCK_REACH_SHARE * BrickTool.#sizeOf(held) + air
        if(Vector3.Distance(BrickTool.#centerOf(held), position) > reach) return null

        // What the hand would do to the module, ports and all: where it stands now, undone, then
        // where it would stand.
        const move = BrickTool.#frameOf(held).invert().multiply(Matrix.Compose(Vector3.One(), rotation, position))
        const pairs = BrickTool.#facingPorts(held, target, side, position, rotation, move)
        if(pairs.length === 0) return null

        return {position, rotation, pairs}
    }

    /**
     * The module the held one is being brought to: the one whose face it is nearest, the carried
     * block aside.
     *
     * @remarks
     * The air between the two faces is what is read, not the distance between the two middles. A
     * large module is large in every direction, and a module brought against its side is far from
     * its middle while touching it.
     */
    #nearest(held: Node3DInstance): Node3DInstance | null {
        const carried = new Set(this.#followers.map(it => it.node))
        const center = BrickTool.#centerOf(held)

        let nearest: Node3DInstance | null = null
        let spacing = Infinity

        for(const [, node] of NetworkManager.getInstance().node3d.nodes.entries()){
            if(node === held || carried.has(node)) continue

            const side = BrickTool.#centerOf(node).subtract(center)
            if(side.lengthSquared() < Number.EPSILON) continue
            const distance = side.length()
            side.normalize()

            const air = distance - BrickTool.#radiusOf(node, side.scale(-1)) - BrickTool.#radiusOf(held, side)
            if(air > SNAP_RANGE_FACTOR * Math.min(BrickTool.#sizeOf(held), BrickTool.#sizeOf(node))) continue
            if(air >= spacing) continue
            nearest = node
            spacing = air
        }
        return nearest
    }


    //// READING THE WORLD ////
    /** Everything nested onto a module, near to near, the module itself aside. */
    static #stackOf(node: Node3DInstance): Node3DInstance[] {
        const seen = new Set<Node3DInstance>([node])
        const stack = [] as Node3DInstance[]
        const pending = [node]

        while(pending.length > 0){
            const current = pending.pop()!
            for(const [, other] of NetworkManager.getInstance().node3d.nodes.entries()){
                if(seen.has(other) || !BrickTool.#isNested(current, other)) continue
                seen.add(other)
                stack.push(other)
                pending.push(other)
            }
        }
        return stack
    }

    /**
     * Are these two modules nested one onto the other?
     *
     * @remarks
     * Three things at once, none of them stored anywhere: they are parallel, a link runs between
     * them, and the two ports of that link sit on the faces that touch. Pulling one away breaks
     * the last of the three, so a stack comes apart with any hand and any tool.
     */
    static #isNested(a: Node3DInstance, b: Node3DInstance): boolean {
        return BrickTool.#hookBetween(a, b) !== null
    }

    /**
     * The link by which one module hangs onto another one, none when they only happen to be wired.
     *
     * @remarks
     * This is what tells a stack from a patch. A cable running across the room between two modules
     * that face anywhere is a wire and nothing more; the same cable between two parallel faces a
     * hand's width apart is what holds a brick onto a brick. Only the second is a hook, and only a
     * hook is undone when a module is pulled out of its stack.
     */
    static #hookBetween(a: Node3DInstance, b: Node3DInstance): N3DConnectionInstance | null {
        if(a === b) return null
        if(!BrickTool.#isParallel(a, b)) return null

        const centerA = BrickTool.#centerOf(a)
        const centerB = BrickTool.#centerOf(b)

        const side = centerB.subtract(centerA)
        if(side.lengthSquared() < Number.EPSILON) return null
        side.normalize()
        const back = side.scale(-1)

        const reach = FACE_GAP_SHARE * Math.min(BrickTool.#sizeOf(a), BrickTool.#sizeOf(b))
        const radiusA = BrickTool.#radiusOf(a, side)
        const radiusB = BrickTool.#radiusOf(b, back)

        for(const link of a.connections){
            const one = link.inputConnectable
            const two = link.outputConnectable
            if(one === null || two === null) continue

            const portA = one.instance === a ? one : two
            const portB = portA === one ? two : one
            if(portA.instance !== a || portB.instance !== b) continue

            const placeA = BrickTool.#placeOf(portA)
            const placeB = BrickTool.#placeOf(portB)
            if(placeA === null || placeB === null) continue
            if(Vector3.Distance(placeA, placeB) > reach) continue
            if(!BrickTool.#isOnFace(centerA, radiusA, placeA, side)) continue
            if(!BrickTool.#isOnFace(centerB, radiusB, placeB, back)) continue
            return link
        }
        return null
    }

    /** Every link by which a module hangs onto another one, its plain cables left alone. */
    static #hooksOf(node: Node3DInstance): N3DConnectionInstance[] {
        const hooks = new Set<N3DConnectionInstance>()

        for(const link of node.connections){
            const one = link.inputConnectable
            const two = link.outputConnectable
            if(one === null || two === null) continue

            const other = one.instance === node ? two.instance : one.instance
            if(other === node) continue
            if(BrickTool.#hookBetween(node, other) !== null) hooks.add(link)
        }
        return [...hooks]
    }

    /** Are the axes of these two modules aligned, whichever way round? */
    static #isParallel(a: Node3DInstance, b: Node3DInstance): boolean {
        const limit = Math.cos(PARALLEL_ANGLE_DEG * Math.PI / 180)
        const axesA = BrickTool.#axesOf(a)
        const axesB = BrickTool.#axesOf(b)

        for(const axis of axesA){
            const best = Math.max(...axesB.map(other => Math.abs(Vector3.Dot(axis, other))))
            if(best < limit) return false
        }
        return true
    }

    /** Is this port far enough onto the side the other module lies on to count as being on that face? */
    static #isOnFace(center: Vector3, radius: number, place: Vector3, side: Vector3): boolean {
        return Vector3.Dot(place.subtract(center), side) > FACE_SIDE_SHARE * radius
    }

    /**
     * The couples of ports the two facing sides would wire, the held module being where it is offered.
     *
     * @remarks
     * The conditions of a link are asked of the port itself, silently: a hand trying every port
     * against every port would drown the player in the red messages the one place that creates
     * links shows. A port already spoken for is not taken twice.
     */
    static #facingPorts(
        held: Node3DInstance,
        target: Node3DInstance,
        side: Vector3,
        center: Vector3,
        rotation: Quaternion,
        move: Matrix,
    ): [N3DConnectableInstance, N3DConnectableInstance][] {
        const back = side.scale(-1)
        const reach = FACE_GAP_SHARE * Math.min(BrickTool.#sizeOf(held), BrickTool.#sizeOf(target))

        const targetCenter = BrickTool.#centerOf(target)
        const targetRadius = BrickTool.#radiusOf(target, side)
        const heldRadius = BrickTool.#radiusAt(held, back, rotation)

        const taken = new Set<N3DConnectableInstance>()
        const pairs = [] as [N3DConnectableInstance, N3DConnectableInstance][]

        for(const port of held.connectables.values()){
            const here = BrickTool.#placeOf(port)
            if(here === null) continue

            // Where the port would be once the module is laid down, which is where it matters.
            const place = Vector3.TransformCoordinates(here, move)
            if(!BrickTool.#isOnFace(center, heldRadius, place, back)) continue

            let nearest: N3DConnectableInstance | null = null
            let spacing = reach

            for(const candidate of target.connectables.values()){
                if(taken.has(candidate)) continue
                const other = BrickTool.#placeOf(candidate)
                if(other === null || !BrickTool.#isOnFace(targetCenter, targetRadius, other, side)) continue
                if(port.canConnectTo(candidate) !== null) continue

                const distance = Vector3.Distance(place, other)
                if(distance > spacing) continue
                nearest = candidate
                spacing = distance
            }

            if(nearest === null) continue
            taken.add(nearest)
            pairs.push([port, nearest])
        }
        return pairs
    }


    //// GEOMETRY ////
    /** The place a cable would leave this port from, none when the port has no mesh. */
    static #placeOf(port: N3DConnectableInstance): Vector3 | null {
        const mesh = port.config.meshes[0]
        return mesh === undefined ? null : mesh.absolutePosition
    }

    /** The middle of the hitbox of a module. */
    static #centerOf(node: Node3DInstance): Vector3 {
        return node.boundingBoxMesh.absolutePosition
    }

    /** The place and the facing of a module, as one matrix. */
    static #frameOf(node: Node3DInstance): Matrix {
        const box = node.boundingBoxMesh
        return Matrix.Compose(Vector3.One(), box.rotationQuaternion ?? Quaternion.Identity(), box.absolutePosition)
    }

    /** The three axes a facing points at. */
    static #axesFrom(rotation: Quaternion): [Vector3, Vector3, Vector3] {
        const frame = Matrix.Identity()
        Matrix.FromQuaternionToRef(rotation, frame)
        return [
            Vector3.TransformNormal(Vector3.Right(), frame).normalize(),
            Vector3.TransformNormal(Vector3.Up(), frame).normalize(),
            Vector3.TransformNormal(Vector3.Forward(), frame).normalize(),
        ]
    }

    /** The three axes of a module, the way its hitbox faces. */
    static #axesOf(node: Node3DInstance): [Vector3, Vector3, Vector3] {
        return BrickTool.#axesFrom(node.boundingBoxMesh.rotationQuaternion ?? Quaternion.Identity())
    }

    /** The half sides of the hitbox of a module, along its own axes. */
    static #sidesOf(node: Node3DInstance): [number, number, number] {
        const box = node.boundingBoxMesh
        const extend = box.getBoundingInfo().boundingBox.extendSize
        return [extend.x * box.scaling.x, extend.y * box.scaling.y, extend.z * box.scaling.z]
    }

    /** The half size of a module in a direction of the world, its hitbox being a box that may face anywhere. */
    static #radiusOf(node: Node3DInstance, direction: Vector3): number {
        return BrickTool.#radiusAt(node, direction, node.boundingBoxMesh.rotationQuaternion ?? Quaternion.Identity())
    }

    /** The same half size, the module being turned the way it would be turned. */
    static #radiusAt(node: Node3DInstance, direction: Vector3, rotation: Quaternion): number {
        const sides = BrickTool.#sidesOf(node)
        return BrickTool.#axesFrom(rotation)
            .reduce((total, axis, index) => total + Math.abs(Vector3.Dot(direction, axis)) * sides[index], 0)
    }

    /** The size of a module: the largest side of its hitbox, in meters. Read to be multiplied, never compared. */
    static #sizeOf(node: Node3DInstance): number {
        const extend = node.boundingBoxMesh.getBoundingInfo().boundingBox.extendSizeWorld
        return 2 * Math.max(extend.x, extend.y, extend.z)
    }

    /** Make the world agree with what was just written on the hitbox, ports included. */
    static #settle(node: Node3DInstance): void {
        node.boundingBoxMesh.computeWorldMatrix(true)
        for(const port of node.connectables.values()){
            for(const mesh of port.config.meshes) mesh.computeWorldMatrix(true)
        }
    }

    /** The side of a module another one is brought to: the axis of the first that points most at the second. */
    static #sideOf(target: Node3DInstance, held: Node3DInstance, axes: [Vector3, Vector3, Vector3]): Vector3 {
        const offset = BrickTool.#centerOf(held).subtract(BrickTool.#centerOf(target))

        let side = axes[0].clone()
        let reach = -Infinity
        for(const axis of axes){
            const along = Vector3.Dot(offset, axis)
            if(Math.abs(along) <= reach) continue
            reach = Math.abs(along)
            side = along < 0 ? axis.scale(-1) : axis.clone()
        }
        return side
    }

    /**
     * The facing that lays a module parallel to another one while turning it the least.
     *
     * @remarks
     * Twenty four facings keep two boxes parallel, one per way of laying the axes of one onto the
     * axes of the other. The one nearest what the hand is already holding is kept, so a module
     * held flat stays flat instead of spinning onto its side on its own.
     */
    static #parallelTo(axes: [Vector3, Vector3, Vector3], current: Quaternion): Quaternion {
        const facing = Matrix.Identity()
        Matrix.FromXYZAxesToRef(axes[0], axes[1], axes[2], facing)

        let best = Quaternion.FromRotationMatrix(facing)
        let nearest = -Infinity

        for(const turn of BrickTool.#turns()){
            const candidate = Quaternion.FromRotationMatrix(turn.multiply(facing))
            const likeness = Math.abs(Quaternion.Dot(candidate, current))
            if(likeness <= nearest) continue
            nearest = likeness
            best = candidate
        }
        return best
    }

    /** The twenty four turns that lay the axes of a box onto the axes of a box, worked out once. */
    static #turnsCache: Matrix[] | null = null

    static #turns(): Matrix[] {
        if(BrickTool.#turnsCache !== null) return BrickTool.#turnsCache

        const unit = [Vector3.Right(), Vector3.Up(), Vector3.Forward()]
        const orders = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]
        const turns = [] as Matrix[]

        for(const order of orders){
            for(let signs = 0; signs < 8; signs++){
                const x = unit[order[0]].scale(signs & 1 ? -1 : 1)
                const y = unit[order[1]].scale(signs & 2 ? -1 : 1)
                const z = unit[order[2]].scale(signs & 4 ? -1 : 1)
                // Only half of them are turns: the others put the box through the mirror.
                if(Vector3.Dot(Vector3.Cross(x, y), z) < 0) continue
                const turn = Matrix.Identity()
                Matrix.FromXYZAxesToRef(x, y, z, turn)
                turns.push(turn)
            }
        }
        return BrickTool.#turnsCache = turns
    }


    //// WHAT THE HAND SHOWS ////
    /** The box showing the place offered, a hollow ghost of the module to come. */
    static #createGhost(context: ToolContext): Mesh {
        const material = new StandardMaterial("brick ghost", context.scene)
        material.diffuseColor = GHOST_COLOR
        material.emissiveColor = GHOST_COLOR.scale(0.5)
        material.alpha = GHOST_ALPHA
        material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        material.backFaceCulling = false

        const ghost = CreateBox("brick ghost", {size: 1}, context.scene)
        ghost.material = material
        ghost.isPickable = false
        ghost.receiveShadows = false
        ghost.checkCollisions = false
        ghost.isVisible = false
        ghost.rotationQuaternion = Quaternion.Identity()
        return ghost
    }

    /** The brick held ahead of the hand, a block with two studs on top. */
    static #createBrick(context: ToolContext): Mesh[] {
        const material = new StandardMaterial("brick", context.scene)
        material.diffuseColor = BRICK_COLOR
        material.emissiveColor = BRICK_COLOR.scale(0.35)

        const body = CreateBox("brick", {width: BRICK_WIDTH, height: BRICK_HEIGHT, depth: BRICK_DEPTH}, context.scene)
        body.parent = context.visual
        body.isPickable = false
        body.material = material
        body.position.set(0, 0, BRICK_OFFSET + BRICK_DEPTH / 2)

        const studs = [-1, 1].map(side => {
            const stud = CreateCylinder("brick stud", {diameter: STUD_DIAMETER, height: STUD_HEIGHT}, context.scene)
            stud.parent = body
            stud.isPickable = false
            stud.material = material
            stud.position.set(side * BRICK_WIDTH / 4, (BRICK_HEIGHT + STUD_HEIGHT) / 2, 0)
            return stud
        })

        return [body, ...studs]
    }

}

/** The kind of the hand that stacks modules and carries a stack as one piece. */
export const BRICK_TOOL_KIND: ToolKind = {
    label: "Brick",
    description: "A brick: a module carried against another one is shown the place it would take on it, laid parallel and flush against that side, and letting go there lays it exactly there and wires the ports that end up facing each other. No place is shown unless something would wire. Taking a module takes the whole stack nested onto it, and taking it with the squeeze already pressed takes that module alone.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "contact", "precise"],
    create: context => new BrickTool(context),
}
