import { Scene, TransformNode } from "@babylonjs/core"
import { ControllerInput } from "../xr/inputs"
import { PickFilter } from "../xr/inputs/AbstractPointerInput"

/** One kind of ordinary interaction, each one asked for on its own. */
export type ToolInteractionKind = "pointer" | "parameters" | "buttons" | "hitboxes" | "connections"

/**
 * One ordinary interaction of the world, as one hand asks for it.
 *
 * @remarks
 * The switch is per hand: the world answers the pointer of a hand only for what the tool of that
 * hand asked, whatever the other hand holds. What a hand asks for lasts as long as its tool.
 */
export interface ToolInteraction {

    /** Does this hand ask for it? */
    readonly enabled: boolean

    /** Ask for it. Doing it twice changes nothing. */
    enable(): void

    /** Stop asking for it. The other hand keeps what it asked for. */
    disable(): void

}

/**
 * The ordinary interactions of the world, each one asked for on its own.
 *
 * @remarks
 * What the world offers to a hand that points at it, off for everyone unless a hand asks for it, so
 * a hand playing an instrument does not disturb the nodes it sweeps through. A tool asks for them
 * one by one, and {@link pointer} is the ground of the others: without it the hand picks nothing.
 *
 * ```ts
 * context.interactions.pointer.enable()
 * context.interactions.hitboxes.enable()
 * ```
 */
export interface ToolInteractions extends Record<ToolInteractionKind, ToolInteraction> {

    /** The pointer of the hand looking for a target at all. Needed by every other one, asked for explicitly. */
    readonly pointer: ToolInteraction

    /** Dragging the parameters of the nodes. */
    readonly parameters: ToolInteraction

    /** Pressing the buttons of the nodes. */
    readonly buttons: ToolInteraction

    /** Grabbing the nodes by their hitbox to move them. */
    readonly hitboxes: ToolInteraction

    /** Dragging the connectables of the nodes to link them. */
    readonly connections: ToolInteraction

    /** Ask for every one of them at once. */
    enable(): void

    /** Stop asking for any of them. */
    disable(): void

}

/**
 * The filters restricting what the pointer of one hand can pick, as one tool sets them.
 *
 * @remarks
 * A filter is a {@link PickFilter}: it is given every candidate mesh and refuses the ones the tool
 * has no use for, so the pointer passes through them as if they were not there. The filters apply
 * to the pointer of that hand only, whatever the other hand holds.
 */
export interface ToolPickFilters {

    /** Add a filter. Adding the same one twice changes nothing. */
    add(filter: PickFilter): void

    /** Remove a filter added by this hand. */
    remove(filter: PickFilter): void

    /** Does this hand hold that filter? */
    has(filter: PickFilter): boolean

    /** Remove every filter of this hand. */
    clear(): void

}

/**
 * Everything a tool is given at creation.
 *
 * @remarks
 * The context is owned by the {@link ToolSlot} that created the tool, and stays valid
 * until the tool is disposed. It carries what belongs to that one hand; a tool reaches
 * the application systems it needs by itself.
 */
export interface ToolContext {

    /** The controller the tool is bound to. Its buttons are the tool's inputs. */
    readonly controller: ControllerInput

    /** The side of the hand the tool is bound to. */
    readonly side: "left" | "right"

    /** The scene the tool creates its meshes into. */
    readonly scene: Scene

    /**
     * The node following the hand, to which the tool parents its visual.
     * Owned and moved by the slot: the tool never disposes it.
     */
    readonly visual: TransformNode

    /**
     * The ordinary interactions of the world, off until a tool asks for them, each one on its own.
     * What a tool asks for lasts as long as the tool: a hand taking another one starts over.
     */
    readonly interactions: ToolInteractions

    /**
     * The filters restricting what the pointer of this hand can pick. A mesh is picked only if
     * every filter accepts it. They last as long as the tool: a hand taking another one starts over.
     */
    readonly pickFilters: ToolPickFilters

}
