import { Color3, CreateBox, CreateCylinder, Mesh, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"
import { Node3dManager } from "../../../app/node3d/Node3dManager"
import { NetworkManager } from "../../../network/NetworkManager"
import { Node3DInstance } from "../../../node3d/instance/Node3DInstance"
import { CarriedBlock } from "../common/CarriedBlock"
import THUMBNAIL_URL from "./thumbnail.png?url"

/**
 * How far the sling reaches from one module to the next, in multiples of the size of the module it
 * reaches from. In no meters, so the same gesture lifts the same load at every scale.
 */
const REACH_FACTOR = 1.2

/** How many modules the crane may lift at once, the nearest first. */
const MAX_FOLLOWERS = 64

/** The delay between two sweeps carrying the load along, in milliseconds. */
const TICK_INTERVAL = 40

/** The strength and duration of the pulse felt when a load is slung, and when nothing came with it. */
const LIFT_PULSE = [0.5, 35] as const
const ALONE_PULSE = [0.2, 60] as const

/** The cubes drawn around what is carried: how solid they are, and the color they are drawn in. */
const MARK_ALPHA = 0.22
const MARK_COLOR = new Color3(0.35, 1, 0.65)

/** The little crane held ahead of the hand: its mast, its jib, its cable and its hook, in meters. */
const MAST_HEIGHT = 0.085
const MAST_THICKNESS = 0.014
const JIB_LENGTH = 0.075
const JIB_THICKNESS = 0.011
const CABLE_DIAMETER = 0.004
const CABLE_LENGTH = 0.045
const HOOK_SIZE = 0.014
const CRANE_OFFSET = 0.055

/** The colors of a building site: the frame of the crane, and its running gear. */
const FRAME_COLOR = new Color3(0.95, 0.72, 0.1)
const GEAR_COLOR = new Color3(0.25, 0.27, 0.3)

/**
 * The hand that lifts a whole structure, and not only the module it took.
 *
 * @remarks
 * Taking a module slings everything standing close to it, near to near, and the whole load travels
 * as one piece, turned and grown as well as carried. What is slung is what looks like one thing,
 * which is what the eye already told the player before the hand moved, and a cube around each
 * module says what is coming along.
 *
 * It is how a corner of the room is moved without taking it apart first.
 */
export class CraneTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context

        context.interactions.pointer.enable()
        context.interactions.hitboxes.enable()

        const ray = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)
        const crane = CraneTool.#createCrane(context)

        const nodes = Node3dManager.getInstance()
        const taking = nodes.onNodeGrabbed.add(({node, pointers}) => {
            if(pointers.includes(context.controller.pointer)) this.#take(node)
        })
        const letting = nodes.onNodeReleased.add(({node, pointers}) => {
            if(node !== this.#held) return
            if(pointers.length === 0 || pointers.includes(context.controller.pointer)) this.#release()
        })
        const ticking = context.scene.onBeforeRenderObservable.add(() => this.#tick())

        this.#unhook = () => {
            taking.remove()
            letting.remove()
            context.scene.onBeforeRenderObservable.remove(ticking)
            for(const mesh of crane) mesh.dispose(false, true)
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

    /** The module the hand carries, none while it carries nothing. */
    #held: Node3DInstance | null = null

    /** The rest of the structure, each one keeping the place it holds relative to the module held. */
    readonly #block = new CarriedBlock()

    /** The cube drawn around each module carried along. */
    readonly #marks = new Map<Node3DInstance, Mesh>()

    /** When the structure was last carried along, in milliseconds. */
    #lastTick = 0

    /**
     * Take the module the world has just handed over, and the structure around it with it.
     * What another hand froze is left where it is, and a pulse says whether a structure came along.
     */
    #take(node: Node3DInstance): void {
        if(node.isLocked) return
        this.#release()
        this.#held = node

        this.#block.take(node, this.#spread(node))
        for(const follower of this.#block.nodes) this.#marks.set(follower, this.#createMark())

        const [strength, duration] = this.#block.size > 0 ? LIFT_PULSE : ALONE_PULSE
        this.#context.controller.pulse(strength, duration)
        this.#carry()
    }

    /** Let go of everything, giving the followers back the freedom they had. */
    #release(): void {
        this.#block.release()
        for(const mark of this.#marks.values()) mark.dispose(false, true)
        this.#marks.clear()
        this.#held = null
    }

    /** Keep the load with the module that carries it. */
    #tick(): void {
        const held = this.#held
        if(held === null) return

        if(NetworkManager.getInstance().node3d.nodes.getId(held) === undefined) return this.#release()

        const now = performance.now()
        if(now - this.#lastTick < TICK_INTERVAL) return
        this.#lastTick = now

        this.#carry()
    }

    /** Put every follower back where it stands in the structure, and lay its cube over it. */
    #carry(): void {
        const held = this.#held
        if(held === null) return

        this.#block.carry(held)

        const carried = this.#block.nodes
        for(const node of carried) CraneTool.#dress(this.#marks.get(node)!, node)

        if(carried.length === this.#marks.size) return
        const gone = new Set(carried)
        for(const [node, mark] of this.#marks){
            if(gone.has(node)) continue
            mark.dispose(false, true)
            this.#marks.delete(node)
        }
    }

    /**
     * Everything the structure of a module reaches, the nearest first.
     * Each step reaches as far as the size of the module it starts from, so a patch built small and
     * the same patch built large come out as the same structure.
     */
    *#spread(from: Node3DInstance): Generator<Node3DInstance> {
        const taken = new Set<Node3DInstance>([from])
        const queue: Node3DInstance[] = [from]
        let found = 0

        for(let index = 0; index < queue.length; index++){
            const current = queue[index]
            const reach = REACH_FACTOR * CraneTool.#sizeOf(current)
            const center = CraneTool.#centerOf(current)

            const near: [number, Node3DInstance][] = []
            for(const [, candidate] of NetworkManager.getInstance().node3d.nodes.entries()){
                if(taken.has(candidate) || candidate.isLocked) continue
                const spacing = Vector3.Distance(center, CraneTool.#centerOf(candidate))
                if(spacing <= reach) near.push([spacing, candidate])
            }
            near.sort(([a], [b]) => a - b)

            for(const [, candidate] of near){
                taken.add(candidate)
                queue.push(candidate)
                yield candidate
                if(++found >= MAX_FOLLOWERS) return
            }
        }
    }

    /** One translucent cube, drawn around a module for as long as it is carried. */
    #createMark(): Mesh {
        const material = new StandardMaterial("crane mark", this.#context.scene)
        material.diffuseColor = MARK_COLOR
        material.emissiveColor = MARK_COLOR.scale(0.5)
        material.alpha = MARK_ALPHA
        material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        material.backFaceCulling = false

        const mark = CreateBox("crane mark", {size: 1}, this.#context.scene)
        mark.material = material
        mark.isPickable = false
        mark.receiveShadows = false
        mark.checkCollisions = false
        mark.rotationQuaternion = Quaternion.Identity()
        return mark
    }

    /** Lay a cube over the module it marks, exactly on its hitbox. */
    static #dress(mark: Mesh, node: Node3DInstance): void {
        const box = node.boundingBoxMesh
        const extend = box.getBoundingInfo().boundingBox.extendSize

        mark.scaling.set(2 * extend.x * box.scaling.x, 2 * extend.y * box.scaling.y, 2 * extend.z * box.scaling.z)
        mark.rotationQuaternion = (box.rotationQuaternion ?? Quaternion.Identity()).clone()
        mark.position.copyFrom(box.absolutePosition)
    }

    /** The middle of a module. */
    static #centerOf(node: Node3DInstance): Vector3 {
        return node.boundingBoxMesh.absolutePosition
    }

    /** The size of a module: the largest side of its hitbox, in meters. Read to be multiplied, never compared. */
    static #sizeOf(node: Node3DInstance): number {
        const extend = node.boundingBoxMesh.getBoundingInfo().boundingBox.extendSizeWorld
        return 2 * Math.max(extend.x, extend.y, extend.z)
    }

    /**
     * The little crane held ahead of the hand: a mast, a jib, and a hook hanging off its cable.
     * The jib runs forward, so the hook hangs ahead of the hand and never inside it.
     */
    static #createCrane(context: ToolContext): Mesh[] {
        const frame = new StandardMaterial("crane frame", context.scene)
        frame.diffuseColor = FRAME_COLOR
        frame.emissiveColor = FRAME_COLOR.scale(0.3)

        const gear = new StandardMaterial("crane gear", context.scene)
        gear.diffuseColor = GEAR_COLOR
        gear.emissiveColor = GEAR_COLOR.scale(0.3)

        const mast = CreateBox("crane mast", {width: MAST_THICKNESS, height: MAST_HEIGHT, depth: MAST_THICKNESS}, context.scene)
        mast.parent = context.visual
        mast.isPickable = false
        mast.material = frame
        mast.position.set(0, 0, CRANE_OFFSET)

        const jib = CreateBox("crane jib", {width: JIB_THICKNESS, height: JIB_THICKNESS, depth: JIB_LENGTH}, context.scene)
        jib.parent = mast
        jib.isPickable = false
        jib.material = frame
        jib.position.set(0, (MAST_HEIGHT - JIB_THICKNESS) / 2, JIB_LENGTH / 2)

        const cable = CreateCylinder("crane cable", {diameter: CABLE_DIAMETER, height: CABLE_LENGTH}, context.scene)
        cable.parent = jib
        cable.isPickable = false
        cable.material = gear
        cable.position.set(0, -CABLE_LENGTH / 2, (JIB_LENGTH - JIB_THICKNESS) / 2)

        const hook = CreateBox("crane hook", {size: HOOK_SIZE}, context.scene)
        hook.parent = cable
        hook.isPickable = false
        hook.material = gear
        hook.position.set(0, -(CABLE_LENGTH + HOOK_SIZE) / 2, 0)

        return [mast, jib, cable, hook]
    }

}

/** The kind of the hand that lifts a whole structure at once. */
export const CRANE_TOOL_KIND: ToolKind = {
    label: "Crane",
    description: "Lifts the module it holds with everything standing around it, near to near: the whole load follows the hand and keeps its shape.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "contact", "wide"],
    create: context => new CraneTool(context),
}
