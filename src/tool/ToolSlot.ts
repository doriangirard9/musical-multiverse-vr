import { Observable, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core"
import { ControllerInput } from "../xr/inputs"
import { Tool } from "./Tool"
import { ToolKind } from "./ToolKind"
import { ToolContext, ToolInteraction, ToolInteractionKind, ToolPickFilters } from "./ToolContext"
import { PickFilter } from "../xr/inputs/AbstractPointerInput"
import { InputManager } from "../xr/inputs"
import { InputCapability } from "../xr/inputs/InputCapability"
import { N3DInteractions } from "../node3d/instance/N3DInteractions"

/**
 * One hand of the user, and the tool currently held by it.
 *
 * @remarks
 * The slot owns the visual node following the controller, so a tool only has to parent its
 * meshes to it. It is made of two layers:
 *
 * - what the hand is equipped with, which is public: the {@link kind} the user is holding, and the
 *   {@link override} that replaces it without being seen;
 * - the life of the instance, which is private: the hand holds one tool at a time, and changing
 *   what it is equipped with disposes the previous tool before creating the new one.
 */
export class ToolSlot {


    /**
     * Notified after the equipped kind changed, with the slot itself.
     * An override is not a change of equipment, so it never notifies.
     */
    public readonly onChange = new Observable<ToolSlot>()

    constructor(
        /** The side of the hand. */
        public readonly side: "left" | "right",

        /** The controller of the hand. */
        public readonly controller: ControllerInput,

        scene: Scene,
        kind: ToolKind|null,
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
                pointer: ToolSlot.#interactionOf(slot, "pointer"),
                parameters: ToolSlot.#interactionOf(slot, "parameters"),
                buttons: ToolSlot.#interactionOf(slot, "buttons"),
                hitboxes: ToolSlot.#interactionOf(slot, "hitboxes"),
                connections: ToolSlot.#interactionOf(slot, "connections"),
                enable(){ for(const kind of ToolSlot.#KINDS) ToolSlot.#ask(slot, kind, true) },
                disable(){ for(const kind of ToolSlot.#KINDS) ToolSlot.#ask(slot, kind, false) },
            },
            pickFilters: ToolSlot.#pickFiltersOf(slot),
        }

        // Off until the tool of the hand asks for them, so a hand never interacts by default.
        this.#context.interactions.disable()

        this.#equipped = kind
        this.#refresh()
    }


    //// What the hand is equipped with ////

    /**
     * The kind the hand is equipped with, none for an empty hand.
     *
     * @remarks
     * This is the equipment as the user sees it: what he chose, or what the world put in his hand.
     * It is what the selection menu shows as held, and it does not follow an {@link override}: a
     * hand lent to something else is still equipped with what it will take back.
     */
    public get kind(): ToolKind|null { return this.#equipped }

    /**
     * Equip the hand with a kind, or empty it.
     * Equipping the kind already equipped does nothing.
     * @param kind - The kind to equip, none to leave the hand empty.
     */
    public select(kind: ToolKind|null): void {
        if(kind === this.#equipped) return

        this.#equipped = kind
        this.#refresh()
        this.onChange.notifyObservers(this)
    }

    /** The kind replacing the equipment for the time being, none when the hand is its own. */
    public get overridden(): ToolKind|null { return this.#override }

    /**
     * Lend the hand to a kind, without changing what it is equipped with.
     *
     * @remarks
     * The override takes the place of the equipment in the hand and nowhere else: {@link kind} does
     * not move, {@link onChange} does not fire, and the hand takes its equipment back as soon as the
     * override is dropped, whatever it became meanwhile. It is how a tool is put in a hand for the
     * time of something, the selection menu being the one that does it.
     *
     * @param kind - The kind to lend the hand to, none to give the hand back.
     */
    public override(kind: ToolKind|null): void {
        if(kind === this.#override) return

        this.#override = kind
        this.#refresh()
    }

    /** The kind really in the hand: the override when there is one, the equipment otherwise. */
    public get held(): ToolKind|null { return this.#override ?? this.#equipped }

    /** The tool currently held by the hand, none when the hand is empty. */
    public get tool(): Tool|null { return this.#tool }

    /** Dispose the held tool and the visual node of the hand. */
    public dispose(): void {
        this.#equipped = null
        this.#override = null
        this.#instantiated = null
        this.#tool?.dispose()
        this.#tool = null
        this.#context.interactions.disable()
        this.#context.pickFilters.clear()
        this.#followObserver?.remove()
        this.#followObserver = undefined
        this.#visual.dispose()
        this.onChange.clear()
    }


    /** The name a hand disables the ordinary interactions of its own pointer under. */
    static readonly #DISABLING = "tool"

    /** The capability behind one kind of interaction: the pointer itself, or one of the node ones. */
    static #capabilityOf(kind: ToolInteractionKind): InputCapability {
        return kind === "pointer" ? InputManager.getInstance().pointer : N3DInteractions[kind]
    }

    /** Every kind of ordinary interaction, each one switched on its own. */
    static readonly #KINDS: readonly ToolInteractionKind[] = ["pointer", "parameters", "buttons", "hitboxes", "connections"]

    /** The switch one hand holds over one kind of interaction, for its own pointer only. */
    static #interactionOf(slot: ToolSlot, kind: ToolInteractionKind): ToolInteraction {
        return {
            get enabled(){ return !ToolSlot.#capabilityOf(kind).isPointerDisabled(slot.controller.pointer) },
            enable(){ ToolSlot.#ask(slot, kind, true) },
            disable(){ ToolSlot.#ask(slot, kind, false) },
        }
    }

    /**
     * Say whether a hand asks for one kind of ordinary interaction, and answer it for the pointer
     * of that hand only: the other hand keeps what its own tool asked for.
     */
    static #ask(slot: ToolSlot, kind: ToolInteractionKind, asking: boolean): void {
        const capability = ToolSlot.#capabilityOf(kind)
        if(asking) capability.enablePointerFor(slot.controller.pointer, ToolSlot.#DISABLING)
        else capability.disablePointerFor(slot.controller.pointer, ToolSlot.#DISABLING)
    }

    /**
     * The filters one hand puts on its own pointer. They are kept apart from the filters the
     * pointer already has, so clearing the hand never removes what someone else added.
     */
    static #pickFiltersOf(slot: ToolSlot): ToolPickFilters {
        const pointer = slot.controller.pointer
        const owned = new Set<PickFilter>()
        return {
            add(filter){ owned.add(filter); pointer.pickFilters.add(filter) },
            remove(filter){ if(owned.delete(filter)) pointer.pickFilters.delete(filter) },
            has(filter){ return owned.has(filter) },
            clear(){ for(const filter of owned) pointer.pickFilters.delete(filter); owned.clear() },
        }
    }

    /** The filters of the held tool, on the pointer of this hand only. */
    public get pickFilters(): ToolPickFilters { return this.#context.pickFilters }

    readonly #visual: TransformNode

    readonly #context: ToolContext


    //// The life of the instance ////

    /** The kind the hand is equipped with, what it takes back once no override stands in the way. */
    #equipped: ToolKind|null = null

    /** The kind replacing the equipment for the time being. */
    #override: ToolKind|null = null

    /** The kind the living tool was created from, so a refresh knows whether anything changed. */
    #instantiated: ToolKind|null = null

    /** The one tool living in the hand, none while the hand is empty. */
    #tool: Tool|null = null

    /**
     * Put in the hand the kind it must now hold, and nothing else.
     *
     * @remarks
     * Two tools never live on the same hand: the previous one is disposed, and what it asked of the
     * world is taken back with it, before the new one is created. A hand holding the right kind
     * already is left alone, so equipping a kind twice, or dropping an override that changed
     * nothing, does not restart the tool.
     */
    #refresh(): void {
        const kind = this.held
        if(kind === this.#instantiated) return

        this.#tool?.dispose()
        this.#context.interactions.disable()
        this.#context.pickFilters.clear()

        this.#tool = kind?.create(this.#context) ?? null
        this.#instantiated = kind
    }

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
