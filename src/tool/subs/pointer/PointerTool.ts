import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"
import { PointDriver } from "../common/PointDriver"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The radius of the point of matter carried at the origin of the pointer, in meters. */
const POINT_RADIUS = 0.015

/**
 * The plain hand: it shows the ray of its controller and lets every world interaction happen.
 *
 * @remarks
 * The only hand asking the world for its ordinary interactions: the parameters, the buttons, the
 * hitboxes and the links answer a pointing hand and nothing else. Selecting and grabbing are driven
 * by the meshes of the world, so this hand only owns the ray visual and a point of matter that
 * meets nothing: it does not play the instruments, but still carries a point for whatever looks
 * for one.
 */
export class PointerTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context
        this.#visual = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)

        context.interactions.enable()

        const pointer = context.controller.pointer
        this.#driver = new PointDriver({
            label: `pointer ${context.side}`,
            scene: context.scene,
            controller: context.controller,
            radius: POINT_RADIUS,
            position: () => pointer.origin.clone(),
            direction: () => pointer.forward,
            hittable: false,
        })
    }

    public dispose(): void {
        this.#driver.dispose()
        this.#context.interactions.disable()
        this.#visual.remove()
    }

    readonly #driver: PointDriver

    readonly #context: ToolContext

    readonly #visual: ReturnType<typeof tools.InputVisualPointer.CreateSimple>

}

/** The kind of the plain hand, held by both hands at startup. */
export const POINTER_TOOL_KIND: ToolKind = {
    label: "Pointer",
    description: "The plain hand: its ray selects, grabs and triggers everything the world already answers to.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "distance", "default"],
    create: context => new PointerTool(context),
}
