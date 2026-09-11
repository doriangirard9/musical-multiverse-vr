import { Observable, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core"
import { ControllerInput } from "../xr/inputs"
import { Tool } from "./Tool"
import { ToolKind } from "./ToolKind"
import { ToolContext, ToolInteraction, ToolInteractionKind } from "./ToolContext"
import { InputManager } from "../xr/inputs"

/**
 * One hand of the user, and the tool currently held by it.
 *
 * @remarks
 * The slot owns the visual node following the controller, so a tool only has to parent its
 * meshes to it. Selecting a kind disposes the previous tool before creating the new one:
 * two tools never live on the same hand.
 */
export class ToolSlot {


    /** Notified after the held tool changed, with the slot itself. */
    public readonly onChange = new Observable<ToolSlot>()

    constructor(
        /** The side of the hand. */
        public readonly side: "left" | "right",

        /** The controller of the hand. */
        public readonly controller: ControllerInput,

        scene: Scene,
        kind: ToolKind,
    ){
        this.#visual = new TransformNode(`${side} hand`, scene)
        this.#follow()

        const slot = this

        this.#context = {
            controller,
            side,
            scene,
            visual: this.#visual,
            interactions: {
                parameters: ToolSlot.#interactionOf(slot, "parameters"),
                buttons: ToolSlot.#interactionOf(slot, "buttons"),
                hitboxes: ToolSlot.#interactionOf(slot, "hitboxes"),
                connections: ToolSlot.#interactionOf(slot, "connections"),
                enable(){ for(const kind of ToolSlot.#KINDS) ToolSlot.#ask(slot, kind, true) },
                disable(){ for(const kind of ToolSlot.#KINDS) ToolSlot.#ask(slot, kind, false) },
            },
        }

        // Off until the tool of the hand asks for them, so a hand never interacts by default.
        this.#context.interactions.disable()

        this.#kind = kind
        this.#tool = kind.create(this.#context)
    }

    /** The kind currently held by the hand. */
    public get kind(): ToolKind { return this.#kind }

    /** The tool currently held by the hand. */
    public get tool(): Tool { return this.#tool }

    /**
     * Replace the held tool by a new one of the given kind.
     * Selecting the kind already held does nothing.
     * @param kind - The kind to hold.
     */
    public select(kind: ToolKind): void {
        if(kind === this.#kind) return

        this.#tool.dispose()
        this.#context.interactions.disable()
        this.#tool = kind.create(this.#context)
        this.#kind = kind
        this.onChange.notifyObservers(this)
    }

    /** Dispose the held tool and the visual node of the hand. */
    public dispose(): void {
        this.#tool.dispose()
        this.#context.interactions.disable()
        this.#followObserver?.remove()
        this.#followObserver = undefined
        this.#visual.dispose()
        this.onChange.clear()
    }


    /** The name a hand disables the ordinary interactions of its own pointer under. */
    static readonly #DISABLING = "tool"

    /** Every kind of ordinary interaction, each one switched on its own. */
    static readonly #KINDS: readonly ToolInteractionKind[] = ["parameters", "buttons", "hitboxes", "connections"]

    /** The switch one hand holds over one kind of interaction, for its own pointer only. */
    static #interactionOf(slot: ToolSlot, kind: ToolInteractionKind): ToolInteraction {
        return {
            get enabled(){ return !InputManager.getInstance()[kind].isPointerDisabled(slot.controller.pointer) },
            enable(){ ToolSlot.#ask(slot, kind, true) },
            disable(){ ToolSlot.#ask(slot, kind, false) },
        }
    }

    /**
     * Say whether a hand asks for one kind of ordinary interaction, and answer it for the pointer
     * of that hand only: the other hand keeps what its own tool asked for.
     */
    static #ask(slot: ToolSlot, kind: ToolInteractionKind, asking: boolean): void {
        const capability = InputManager.getInstance()[kind]
        if(asking) capability.enablePointerFor(slot.controller.pointer, ToolSlot.#DISABLING)
        else capability.disablePointerFor(slot.controller.pointer, ToolSlot.#DISABLING)
    }

    readonly #visual: TransformNode

    readonly #context: ToolContext

    #tool: Tool

    #kind: ToolKind

    #followObserver?: { remove(): void }

    /** Keep the visual node on the controller, from the pointer matrix so no XR type leaks here. */
    #follow(): void {
        const position = new Vector3()
        const rotation = new Quaternion()
        const scaling = new Vector3()

        this.#visual.rotationQuaternion = rotation

        this.#followObserver = this.controller.pointer.onMove.add(pointer => {
            pointer.matrix.decompose(scaling, rotation, position)
            this.#visual.position.copyFrom(position)
        })
    }

}
