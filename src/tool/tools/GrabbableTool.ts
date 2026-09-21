import { AbstractMesh, Quaternion, TransformNode, Vector3 } from "@babylonjs/core"
import { ControllerInput, InputManager, PointerInput, tools } from "../../xr/inputs"
import { ToolSystem } from "../../app/tool/ToolSystem"
import { Tool } from "../Tool"
import { ToolKind } from "../ToolKind"
import { ToolContext } from "../ToolContext"
import DEFAULT_THUMBNAIL_URL from "../subs/pointer/thumbnail.png?url"

/** The visibility of the hitbox while a hand points at it, so what it covers shows through. */
const HOVERED_VISIBILITY = 0.3

/** What a grabbable object is made of, and what it tells when it changes hands. */
export interface GrabbableToolOptions {

    /** The name of the tool, as the selection menu lists it while a hand holds the object. */
    readonly label: string

    /** What the object does once in hand. */
    readonly description?: string

    /** The tags of the kind. */
    readonly tags?: readonly string[]

    /** The picture of the kind in the selection menu. The plain hand when the object gives none. */
    readonly thumbnail?: string

    /** The object itself: under the root at rest, under the visual node of a hand while held. */
    readonly node: TransformNode

    /** The mesh a hand points at to take the object. Made translucent while pointed at. */
    readonly hitbox: AbstractMesh

    /** Where the object rests: the node it is parented to, at the identity, whenever no hand holds it. */
    readonly root: TransformNode

    /** Called once a hand took the object, the node already under the visual node of that hand. */
    onEquip?(controller: ControllerInput): void

    /** Called once a hand let go of the object, the node already back under the root. */
    onUnequip?(controller: ControllerInput): void

}

/**
 * An object of the world a hand can take and hold as its tool.
 *
 * @remarks
 * The object is taken by pointing at its hitbox and pulling the trigger: the pointing hand then
 * holds it as a {@link ToolKind}, through `ToolSystem.equip`, and the node follows that hand.
 * Only the two hands of the user can take it; the screen and camera pointers are ignored. Pointing
 * at the object held in one hand and pulling the trigger of the other hand passes it over.
 *
 * The hand lets go of the object when the user chooses another tool in the menu, when the object
 * is disposed, or when {@link unequip} is called: the node then goes back under its root, at the
 * identity, and the hand takes back what it held before.
 */
export class GrabbableTool {


    /** The kind a hand holds while it holds the object. */
    public readonly kind: ToolKind

    constructor(options: GrabbableToolOptions){
        this.#options = options

        this.kind = {
            label: options.label,
            description: options.description ?? options.label + ", taken from the world.",
            thumbnail: options.thumbnail ?? DEFAULT_THUMBNAIL_URL,
            tags: options.tags ?? ["tool", "world"],
            create: context => new HeldTool(this, context),
        }

        this.#rest()

        this.#grab = new tools.InputGrabBehavior(
            pointer => { const hand = GrabbableTool.#handOf(pointer); if(hand) this.equip(hand) },
            () => {},
        )

        this.#hover = new tools.InputMultiHoverBehavior(
            pointer => { if(GrabbableTool.#handOf(pointer)) this.#enter(pointer) },
            pointer => this.#exit(pointer),
        )

        options.hitbox.isPickable = true
        options.hitbox.addBehavior(this.#hover)
        options.hitbox.addBehavior(this.#grab)
    }

    /** The hand holding the object, none while it rests. */
    public get holder(): ControllerInput|null { return this.#held?.controller ?? null }

    /**
     * Put the object in a hand. A hand already holding it keeps it; the other hand lets go of it.
     * @param controller - The controller of the hand, ignored when it is not a hand.
     */
    public equip(controller: ControllerInput): void {
        if(this.#held?.controller === controller) return
        const system = ToolSystem.getInstance()
        if(!system.slotOf(controller)) return

        this.unequip()
        const equipment = system.equip(controller, this.kind)
        if(this.#held?.controller === controller) this.#held.equipment = equipment
        else equipment.dispose()
    }

    /**
     * Take the object out of the hand holding it, if any, and put it back at rest.
     * Giving the hand its tool back is what puts the object down, so there is nothing else to undo.
     */
    public unequip(): void {
        this.#held?.equipment?.dispose()
    }

    /** Take the object back from any hand, and stop it from being taken. The node itself is left alive. */
    public dispose(): void {
        this.unequip()
        this.#options.hitbox.removeBehavior(this.#grab)
        this.#options.hitbox.removeBehavior(this.#hover)
        this.#hovering.clear()
        this.#options.hitbox.visibility = this.#restVisibility
    }


    readonly #options: GrabbableToolOptions

    readonly #grab: tools.InputGrabBehavior

    readonly #hover: tools.InputMultiHoverBehavior

    /** The hand holding the object and the way to give it back, none at rest. */
    #held: { controller: ControllerInput, equipment?: {dispose(): void} } | null = null

    /** The hands pointing at the hitbox, for the hitbox to turn opaque again once the last leaves. */
    readonly #hovering = new Set<PointerInput>()

    /** The visibility of the hitbox when no hand points at it. */
    #restVisibility = 1

    /** The controller of a pointer, when that pointer is one of the two hands. */
    static #handOf(pointer: PointerInput): ControllerInput|undefined {
        const inputs = InputManager.getInstance()
        if(pointer === inputs.left.pointer) return inputs.left
        if(pointer === inputs.right.pointer) return inputs.right
        return undefined
    }

    /** Put the node under a parent, at the identity. */
    static #place(node: TransformNode, parent: TransformNode|null): void {
        node.parent = parent
        node.position.setAll(0)
        node.scaling.setAll(1)
        if(node.rotationQuaternion) node.rotationQuaternion.copyFrom(Quaternion.Identity())
        else node.rotation.copyFrom(Vector3.Zero())
    }

    /** Put the object back under its root, at the identity. */
    #rest(): void {
        GrabbableTool.#place(this.#options.node, this.#options.root)
    }

    #enter(pointer: PointerInput): void {
        if(this.#hovering.size === 0){
            this.#restVisibility = this.#options.hitbox.visibility
            this.#options.hitbox.visibility = HOVERED_VISIBILITY
        }
        this.#hovering.add(pointer)
    }

    #exit(pointer: PointerInput): void {
        if(!this.#hovering.delete(pointer)) return
        if(this.#hovering.size === 0) this.#options.hitbox.visibility = this.#restVisibility
    }

    /** The tool of a hand takes the object: called by {@link HeldTool} only. */
    _take(context: ToolContext): void {
        this.#held = { controller: context.controller }
        GrabbableTool.#place(this.#options.node, context.visual)
        this.#options.onEquip?.(context.controller)
    }

    /** The tool of a hand lets go of the object: called by {@link HeldTool} only. */
    _give(context: ToolContext): void {
        if(this.#held?.controller !== context.controller) return
        this.#held = null
        this.#rest()
        this.#options.onUnequip?.(context.controller)
    }

}

/** The tool a hand holds while it holds a grabbable object: it only carries the object. */
class HeldTool implements Tool {

    constructor(grabbable: GrabbableTool, context: ToolContext){
        this.#grabbable = grabbable
        this.#context = context
        grabbable._take(context)
    }

    public dispose(): void {
        this.#grabbable._give(this.#context)
    }

    readonly #grabbable: GrabbableTool

    readonly #context: ToolContext

}
