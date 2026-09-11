import { Scene, TransformNode } from "@babylonjs/core"
import { ControllerInput } from "../xr/inputs"

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

}
