import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"

/**
 * The plain hand: it shows the ray of its controller and lets every world interaction happen.
 * Selecting and grabbing are driven by the meshes of the world, so this hand only owns the ray visual.
 */
export class PointerTool implements Tool {

    constructor(context: ToolContext){
        this.#visual = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)
    }

    public dispose(): void {
        this.#visual.remove()
    }

    readonly #visual: ReturnType<typeof tools.InputVisualPointer.CreateSimple>

}

/** The kind of the plain hand, held by both hands at startup. */
export const POINTER_TOOL_KIND: ToolKind = {
    label: "Pointer",
    description: "The plain hand: it shows the ray of its controller and lets the ordinary interactions of the world happen, selecting and grabbing included.",
    tags: ["tool", "distance", "default"],
    create: context => new PointerTool(context),
}
