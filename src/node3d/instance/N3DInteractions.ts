import { InputCapability } from "../../xr/inputs/InputCapability"

/**
 * The ordinary interactions a hand can have with the nodes, each one switched on its own.
 *
 * @remarks
 * They are capabilities of the nodes, not of the inputs: the input layer only knows whether a
 * pointer picks anything at all (see `InputManager.pointer`), while what a node does with a
 * pointer that reaches it is decided here. Each one can be disabled as a whole, or for one pointer
 * only, so a hand whose tool did not ask for it passes over the nodes without touching them.
 */
export const N3DInteractions = {

    /**
     * Dragging the parameters of the nodes.
     * Disabled means the parameters do not light up, do not answer the trigger, and keep their value.
     */
    parameters: new InputCapability(),

    /** Pressing the buttons of the nodes. Disabled means a button is neither lit nor pressed. */
    buttons: new InputCapability(),

    /** Grabbing the nodes by their hitbox to move them. Disabled means the hitbox stays invisible and still. */
    hitboxes: new InputCapability(),

    /** Dragging the connectables of the nodes to link them. Disabled means no link is made or broken. */
    connections: new InputCapability(),

} as const

/** The name of one of the interactions with the nodes. */
export type N3DInteractionKind = keyof typeof N3DInteractions
