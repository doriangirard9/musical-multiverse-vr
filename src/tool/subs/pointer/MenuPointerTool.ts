import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"
import THUMBNAIL_URL from "./thumbnail.png?url"

/**
 * The bare hand: it shows the ray of its controller and nothing else.
 *
 * @remarks
 * Only the pointer is asked for, so the hand has a target and the world knows where it aims, but
 * none of what the plain {@link PointerTool} adds on top of it answers: no hitbox to take a node by,
 * so nothing is moved or turned, no parameter to drag, no button to press, no connectable to link.
 *
 * It is not in the catalog of `ToolSystem`: it is the hand something else puts there with
 * `equip`, for the time the user spends in front of a menu, so he aims at it without moving the
 * world behind it by accident.
 */
export class MenuPointerTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context
        this.#visual = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)

        // The pointer alone: it is the ground of the other interactions, and none of them is asked
        // for here, so the hand aims without touching anything.
        context.interactions.pointer.enable()
    }

    public dispose(): void {
        this.#context.interactions.pointer.disable()
        this.#visual.remove()
    }

    readonly #context: ToolContext

    readonly #visual: ReturnType<typeof tools.InputVisualPointer.CreateSimple>

}

/** The kind of the bare hand, given by `equip` and never offered in the catalog. */
export const MENU_POINTER_TOOL_KIND: ToolKind = {
    label: "Menu pointer",
    description: "The bare hand: its ray aims, and nothing of the world answers it.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "distance"],
    create: context => new MenuPointerTool(context),
}
