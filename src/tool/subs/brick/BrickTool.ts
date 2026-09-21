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
import { CarriedBlock, frameOf } from "../common/CarriedBlock"
import THUMBNAIL_URL from "./thumbnail.png?url"

/**
 * How wide the air between two modules may be for one to be offered a place on the other, as a
 * share of the size of the smaller of the two. Measured between the faces, never the middles.
 */
const SNAP_RANGE_FACTOR = 1.2

/**
 * How near the place offered the module has to be held for the place to show and to take, as a
 * share of its size. This is what makes stacking a decision rather than an accident.
 */
const LOCK_REACH_SHARE = 0.7

/**
 * The air left between two nested modules, as a share of the size of the smaller of the two.
 * Wide enough for the cable between them to be seen, narrow enough that they read as one piece.
 */
const NEST_GAP_SHARE = 0.45

/** Beyond this angle, in degrees, two modules are not parallel, and nothing is nested. */
const PARALLEL_ANGLE_DEG = 20

/**
 * How close two ports have to be to face each other, as a share of the size of the smaller module.
 * It follows the air left between two nested modules, so a stack this hand made reads as a stack.
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
 * A module brought near another is offered the place it would take on it, shown as a ghost, and
 * letting go there lays it down and wires the ports that face: stacking is chaining. Taking a
 * module takes the stack with it; taking it with the squeeze pressed pulls it out of its stack.
 *
 * It is how a patch is built by hand, the wiring coming with the building.
 */
export class BrickTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context

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

    /** What is nested onto the held module, each keeping the place it holds relative to it. */
    readonly #block = new CarriedBlock()

    /** The place the held module is offered, none while it is offered none. */
    #lock: Lock | null = null


    /** When the followers were last carried along, in milliseconds. */
    #lastTick = 0

    /**
     * Take a module, and with it everything nested onto it, near to near.
     * Taken with the squeeze pressed, it comes off its stack alone, undoing the links that held it
     * there and those alone.
     */
    #take(node: Node3DInstance): void {
        if(node.isLocked) return
        this.#release()
        this.#held = node

        if(this.#context.controller.squeeze.isPressed()){
            for(const hook of BrickTool.#hooksOf(node)) hook.remove()
            this.#context.controller.pulse(...UNHOOK_PULSE)
            return
        }

        this.#block.take(node, BrickTool.#stackOf(node))
    }

    /** Let go of everything, giving the followers back the freedom they had. */
    #release(): void {
        this.#block.release()
        this.#held = null
        this.#show(null)
    }

    /**
     * Keep the stack with the module that carries it, and offer it a place.
     * The whole of the gesture reaches it: a stack turned in the hand turns as one piece.
     */
    #tick(): void {
        const held = this.#held
        if(held === null) return

        if(NetworkManager.getInstance().node3d.nodes.getId(held) === undefined) return this.#release()

        const now = performance.now()
        if(now - this.#lastTick < TICK_INTERVAL) return
        this.#lastTick = now

        this.#block.carry(held)
        this.#show(this.#lockOf(held))
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

            this.#block.carry(held)

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
     * A place with nothing to wire is no place, and a place the hand is not near enough to is not
     * offered: it would put a module down somewhere the hand never aimed at.
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

        const reach = LOCK_REACH_SHARE * BrickTool.#sizeOf(held) + air
        if(Vector3.Distance(BrickTool.#centerOf(held), position) > reach) return null

        const move = frameOf(held).invert().multiply(Matrix.Compose(held.boundingBoxMesh.scaling.clone(), rotation, position))
        const pairs = BrickTool.#facingPorts(held, target, side, position, rotation, move)
        if(pairs.length === 0) return null

        return {position, rotation, pairs}
    }

    /**
     * The module the held one is being brought to: the one whose face it is nearest, the carried
     * block aside.
     *
     * The air between the two faces is what is read, not the distance between the two middles.
     */
    #nearest(held: Node3DInstance): Node3DInstance | null {
        const center = BrickTool.#centerOf(held)

        let nearest: Node3DInstance | null = null
        let spacing = Infinity

        for(const [, node] of NetworkManager.getInstance().node3d.nodes.entries()){
            if(node === held || this.#block.has(node)) continue

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
     * Are these two modules nested one onto the other: parallel, linked, and that link running
     * between the faces that touch? Read from the world, so a stack comes apart with any tool.
     */
    static #isNested(a: Node3DInstance, b: Node3DInstance): boolean {
        return BrickTool.#hookBetween(a, b) !== null
    }

    /**
     * The link by which one module hangs onto another one, none when they only happen to be wired.
     * This is what tells a stack from a patch, and only a hook is undone by pulling a module out.
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
     * The couples of ports the two facing sides would wire, the held module being where it is
     * offered. A port already spoken for is not taken twice.
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
     * The facing that lays a module parallel to another one while turning it the least, so a module
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

    /** Those turns, worked out on the first ask and kept. */
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
    description: "A module carried against another is shown where it would sit, flush and parallel, and letting go there wires the ports that face each other. Taking a module takes the stack nested on it.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "contact", "precise"],
    create: context => new BrickTool(context),
}
