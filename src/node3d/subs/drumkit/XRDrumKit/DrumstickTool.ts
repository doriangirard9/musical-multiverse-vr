import { Tool } from "../../../../tool/Tool";
import { ToolContext } from "../../../../tool/ToolContext";
import { ToolKind } from "../../../../tool/ToolKind";
import XRDrumstick from "./XRDrumstick";
import THUMBNAIL_URL from "../../../../tool/subs/wand/thumbnail.png?url"

/**
 * The hand holding one drumstick of a drum kit.
 *
 * The stick itself is a physics body, not a mesh of the hand: it is attached to the controller by
 * the drumstick, which keeps following it and answering the drums exactly as before. The tool only
 * says how long the hand holds it. So nothing is parented to the visual node of the slot.
 */
export class DrumstickTool implements Tool {

    constructor(
        private readonly drumstick: XRDrumstick,
        context: ToolContext,
    ){
        this.drumstick.attachToHand(context.controller);
    }

    dispose(): void {
        this.drumstick.releaseStick(this.drumstick.drumstickAggregate);
    }

}

/**
 * The kind putting one precise drumstick in a hand.
 *
 * A kind carries no state, so each stick of each kit has its own, created with it. These kinds are
 * not in the catalog of `ToolSystem`: a stick is taken by clicking on it, not chosen from a menu.
 *
 * @param drumstick The stick the hand takes.
 */
export function drumstickToolKind(drumstick: XRDrumstick): ToolKind {
    return {
        label: "Drumstick",
        description: "A drum kit stick, held until another tool is chosen. It plays the drums and the cymbals by striking them, the harder the louder.",
        thumbnail: THUMBNAIL_URL,
        tags: ["contact", "percussive"],
        create: context => new DrumstickTool(drumstick, context),
    };
}

export default DrumstickTool;
