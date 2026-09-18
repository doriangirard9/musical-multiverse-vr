import { Color3, CreateCylinder, Mesh, StandardMaterial, Vector3 } from "@babylonjs/core"
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
 * The reach of the magnet, in multiples of the size of the module held.
 *
 * Nothing here is in meters: a module put down small attracts from close by, one grown to be played
 * with the whole body attracts from far, and the same gesture wires the same way at every scale.
 */
const RANGE_FACTOR = 1.5

/**
 * How much further than the reach two ports have to be pulled apart for their link to come undone.
 *
 * Above one, so a port trembling right on the edge of the reach does not link and unlink over and over.
 */
const RELEASE_SHARE = 1.3

/** The delay between two sweeps of the ports, in milliseconds. A link is made on a gesture, not on a frame. */
const TICK_INTERVAL = 80

/** The strength and duration of the pulse felt when a link is made, and when one comes undone. */
const ATTACH_PULSE = [0.5, 30] as const
const DETACH_PULSE = [0.25, 60] as const

/** The two poles held in the hand: their size, their spacing and how far ahead of the hand they sit, in meters. */
const POLE_LENGTH = 0.09
const POLE_DIAMETER = 0.022
const POLE_SPACING = 0.035
const POLE_OFFSET = 0.05

/** The colors of the two poles, the way a horseshoe magnet is painted. */
const POLE_COLORS = [new Color3(0.85, 0.15, 0.15), new Color3(0.2, 0.3, 0.9)]

/**
 * The hand that moves a module and wires it at the same time.
 *
 * @remarks
 * A module is taken exactly as the plain hand takes it: the hitboxes are asked for, and the world
 * itself carries and synchronises what is held, and says so. What this hand adds happens while the
 * module travels.
 * Every tick, each of its ports links to the nearest compatible port within reach, and every link of
 * the module pulled further out than the reach comes undone. Letting go freezes what is linked.
 *
 * Nothing is aimed at, so nothing is missed: the decision is where the modules go, not which port the
 * ray is on. And the reach is a multiple of the size of the module held, never a distance of the world.
 *
 * A link only comes undone after having been within the reach, so a module taken with a long cable
 * already hanging off it keeps that cable however far it is carried: to let one go, bring its two ends
 * together first, then pull away. Cables another tool stretched on purpose therefore survive this hand.
 *
 * Nothing is added to the nodes nor to the network, and nothing is shown before the fact: a link either
 * exists, and draws its own cable for every player, or it does not.
 */
export class MagnetTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context

        // The hitboxes, so a module can be taken and the world carries it, and nothing else: the
        // connections stay closed, so no rival cable is dragged out of a port by this hand.
        context.interactions.pointer.enable()
        context.interactions.hitboxes.enable()

        const ray = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)
        const poles = POLE_COLORS.map((color, index) => MagnetTool.#createPole(context, color, index))

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

        this.#unhook = () => {
            taking.remove()
            letting.remove()
            context.scene.onBeforeRenderObservable.remove(ticking)
            for(const pole of poles) pole.dispose(false, true)
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

    /**
     * The links whose two ends the magnet has seen within its reach, the only ones it may undo.
     *
     * Until a link is in there it is ignored, which is what leaves a cable stretched across the room
     * alone while the module it hangs off travels.
     */
    readonly #armed = new Set<N3DConnectionInstance>()

    /** When the ports were last swept, in milliseconds. */
    #lastTick = 0

    /** Watch over the module the hand has just been handed, the world itself carrying it. */
    #take(node: Node3DInstance): void {
        if(node.isLocked) return
        this.#held = node
        this.#armed.clear()
    }

    /** Let go: whatever is linked at this instant stays, and nothing is watched any more. */
    #release(): void {
        this.#held = null
        this.#armed.clear()
    }

    #tick(): void {
        const held = this.#held
        if(held === null) return

        // A module taken out of the world while it was carried is no longer carried.
        if(NetworkManager.getInstance().node3d.nodes.getId(held) === undefined) return this.#release()

        const now = performance.now()
        if(now - this.#lastTick < TICK_INTERVAL) return
        this.#lastTick = now

        const range = RANGE_FACTOR * MagnetTool.#sizeOf(held)
        this.#unlinkFar(held, range)
        this.#linkNear(held, range)
    }

    /** Arm the links of the module whose two ends are within reach, and undo the armed ones pulled out of it. */
    #unlinkFar(held: Node3DInstance, range: number): void {
        for(const link of held.connections){
            const from = link.inputConnectable
            const to = link.outputConnectable
            if(from === null || to === null) continue

            const spacing = MagnetTool.#spacing(from, to)
            if(spacing <= range) this.#armed.add(link)
            else if(spacing > range * RELEASE_SHARE && this.#armed.delete(link)){
                link.remove()
                this.#context.controller.pulse(...DETACH_PULSE)
            }
        }
    }

    /** Link each port of the module to the nearest compatible port within reach, if any. */
    #linkNear(held: Node3DInstance, range: number): void {
        for(const port of held.connectables.values()){
            let nearest: N3DConnectableInstance | null = null
            let spacing = range

            for(const candidate of MagnetTool.#ports()){
                if(!MagnetTool.#canLink(port, candidate)) continue
                const distance = MagnetTool.#spacing(port, candidate)
                if(distance > spacing) continue
                nearest = candidate
                spacing = distance
            }

            if(nearest === null) continue
            // The new link is within reach, so the next tick arms it on its own.
            ConnectionManager.getInstance().connect(port, nearest)
            this.#context.controller.pulse(...ATTACH_PULSE)
        }
    }

    /** One pole of the magnet, a cylinder lying ahead of the hand. */
    static #createPole(context: ToolContext, color: Color3, index: number): Mesh {
        const material = new StandardMaterial("magnet pole", context.scene)
        material.diffuseColor = color
        material.emissiveColor = color.scale(0.4)

        const pole = CreateCylinder("magnet pole", { diameter: POLE_DIAMETER, height: POLE_LENGTH }, context.scene)
        pole.parent = context.visual
        pole.isPickable = false
        pole.material = material
        pole.position.set(POLE_SPACING * (index - 0.5), 0, POLE_OFFSET + POLE_LENGTH / 2)
        pole.rotation.x = Math.PI / 2
        return pole
    }

    /** The distance between two ports, taken at the meshes a cable would run between. */
    static #spacing(a: N3DConnectableInstance, b: N3DConnectableInstance): number {
        return Vector3.Distance(a.config.meshes[0].absolutePosition, b.config.meshes[0].absolutePosition)
    }

    /** The size of a module: the largest side of its hitbox, in meters. Read to be multiplied, never compared. */
    static #sizeOf(node: Node3DInstance): number {
        const extend = node.boundingBoxMesh.getBoundingInfo().boundingBox.extendSizeWorld
        return 2 * Math.max(extend.x, extend.y, extend.z)
    }

    /** Every port of every module of the world. */
    static *#ports(): Generator<N3DConnectableInstance> {
        for(const [, node] of NetworkManager.getInstance().node3d.nodes.entries()){
            yield* node.connectables.values()
        }
    }

    /**
     * Would a link between these two ports be accepted?
     *
     * @remarks
     * The conditions of a link are asked of the port itself, silently: a hand trying every port against
     * every port would drown the player in the red messages the one place that creates links shows.
     * A module is never wired onto itself here, a hand carrying one has no use for that.
     */
    static #canLink(from: N3DConnectableInstance, to: N3DConnectableInstance): boolean {
        if(from.instance === to.instance) return false
        return from.canConnectTo(to) === null
    }

}

/** The kind of the hand that moves a module and wires it as it goes. */
export const MAGNET_TOOL_KIND: ToolKind = {
    label: "Magnet",
    description: "A magnet: a module carried in this hand links itself to the compatible ports passing within its reach, the nearest first, and lets go of a link pulled back out of it. Letting go of the module freezes whatever is linked at that instant.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "distance", "wide"],
    create: context => new MagnetTool(context),
}
