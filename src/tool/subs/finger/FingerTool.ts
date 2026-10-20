

import { Color3 } from "@babylonjs/core"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { SqueezeAdjust } from "../common/SqueezeAdjust"
import { WandTool } from "../wand/WandTool"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of the finger at creation, in meters. Short, so the hand plays close to what it touches. */
const LENGTH = 0.12

/** The shortest and longest the finger can be made, in meters. */
const MIN_LENGTH = 0.05
const MAX_LENGTH = 0.6

/** The length added or removed at each step of the adjustment, in meters. */
const LENGTH_STEP = 0.02

/** The thickness of the finger, in meters. Thicker than a wand, since it presses rather than strikes. */
const DIAMETER = 0.02

/** The color of the finger. */
const COLOR = new Color3(0.9, 0.6, 0.5)

/**
 * The hand pointing with a bare finger: a short wand ending in no ball, held like any other wand and
 * made longer or shorter by holding the squeeze and pushing the thumbstick up or down.
 *
 * @remarks
 * The end of the finger is what a held note is made of: pressed into a key it stays in the matter,
 * so the note sounds as long as the hand keeps it there and stops when the hand pulls back. The
 * wand hands strike and leave; this one enters and stays, which is what {@link HoldBehavior} hears.
 */
export class FingerTool extends WandTool {


    constructor(context: ToolContext){
        super(context, { name: "finger", length: LENGTH, diameter: DIAMETER, headRadius: 0, color: COLOR })

        this.#adjust = new SqueezeAdjust(context.controller, {
            value: LENGTH,
            min: MIN_LENGTH,
            max: MAX_LENGTH,
            step: LENGTH_STEP,
            onChange: length => this.wand.length = length,
        })
    }

    public override dispose(): void {
        this.#adjust.dispose()
        super.dispose()
    }


    readonly #adjust: SqueezeAdjust

}

/** The kind of the hand pointing with a bare finger. */
export const FINGER_TOOL_KIND: ToolKind = {
    label: "Finger",
    description: "A short finger pressing what the hand touches from close by, its length set with the squeeze and the thumbstick.",
    thumbnail: THUMBNAIL_URL,
    tags: ["contact", "precise", "sustained", "adjustable"],
    create: context => new FingerTool(context),
}
