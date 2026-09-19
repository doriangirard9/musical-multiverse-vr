import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { SqueezeDrive } from "../common/SqueezeDrive"
import { WandTool } from "./WandTool"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of the shaft with the squeeze released, the length of a plain wand, in meters. */
const LENGTH = 0.4

/** The length of the shaft with the squeeze fully pressed, in meters. */
const PRESSED_LENGTH = 2

/**
 * The hand holding a wand that grows with the pressure on the squeeze: a plain wand at rest, and up
 * to a long one when the squeeze is held fully. It shrinks back on its own as the squeeze is
 * released.
 */
export class GrowingWandTool extends WandTool {


    constructor(context: ToolContext){
        super(context, { name: "wand", length: LENGTH })

        this.#drive = new SqueezeDrive(context.controller, {
            released: LENGTH,
            pressed: PRESSED_LENGTH,
            onChange: length => this.wand.length = length,
        })
    }

    public override dispose(): void {
        this.#drive.dispose()
        super.dispose()
    }


    readonly #drive: SqueezeDrive

}

/** The kind of the hand holding a wand growing with the squeeze. */
export const WAND_TOOL_KIND: ToolKind = {
    label: "Grow Wand",
    description: "Grows under the pressure on the squeeze and shrinks back on its own once released: a reach held, never set.",
    thumbnail: THUMBNAIL_URL,
    tags: ["contact", "percussive", "precise", "adjustable"],
    create: context => new GrowingWandTool(context),
}
