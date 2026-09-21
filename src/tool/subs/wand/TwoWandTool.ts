

import { Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { Wand } from "./Wand"
import { PointDriver } from "../common/PointDriver"
import { SqueezeDrive } from "../common/SqueezeDrive"
import { WAND_TILT } from "./WandTool"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of a shaft, in meters. */
const LENGTH = 0.35

/** The angle between the two wands with the squeeze released, in radians. */
const SPREAD = Math.PI / 3

/** The angle between the two wands with the squeeze fully pressed: none, they merge. */
const PRESSED_SPREAD = 0

/**
 * The hand holding two wands, both starting at the controller and opening like a pair of scissors
 * around the pointing direction. The harder the squeeze is pressed, the closer the two wands come,
 * until they merge into one under a fully held squeeze. They open again as the squeeze is released.
 *
 * @remarks
 * Each wand carries its own point of matter, so the hand plays two meshes at once and a mesh knows
 * which of the two it heard: one hand, two voices.
 */
export class TwoWandTool implements Tool {


    constructor(context: ToolContext){
        this.#wands = [-1, 1].map(side => this.#createWand(context, side))
        this.#drivers = this.#wands.map((wand, index) => this.#createDriver(context, wand, index))

        this.#drive = new SqueezeDrive(context.controller, {
            released: SPREAD,
            pressed: PRESSED_SPREAD,
            onChange: spread => this.#spread(spread),
        })
    }

    public dispose(): void {
        this.#drive.dispose()
        for(const driver of this.#drivers) driver.dispose()
        for(const wand of this.#wands) wand.dispose()
    }


    readonly #wands: Wand[]

    readonly #drivers: PointDriver[]

    readonly #drive: SqueezeDrive

    /** Scratch vectors for the ends of the two wands, so moving them allocates nothing. */
    readonly #scratch = [new Vector3(), new Vector3()]

    /** Scratch vectors for the directions of the two wands. */
    readonly #directions = [new Vector3(), new Vector3()]

    /** Hang one wand on the hand, held like the wand of any other hand. */
    #createWand(context: ToolContext, side: number): Wand {
        const wand = new Wand(context.scene, { name: `two wand ${side}`, length: LENGTH })
        wand.root.parent = context.visual
        return wand
    }

    /** Give one wand the point of matter at its end. */
    #createDriver(context: ToolContext, wand: Wand, index: number): PointDriver {
        return new PointDriver({
            label: `two wand ${index} ${context.side}`,
            scene: context.scene,
            controller: context.controller,
            radius: wand.headRadius,
            position: () => wand.tipTo(this.#scratch[index]),
            direction: () => wand.directionTo(this.#directions[index]),
        })
    }

    /**
     * Open the two wands symmetrically around the pointing direction.
     * Both keep their origin on the controller, so widening the angle only moves their far end.
     */
    #spread(spread: number): void {
        this.#wands[0].root.rotation.set(-WAND_TILT, -spread / 2, 0)
        this.#wands[1].root.rotation.set(-WAND_TILT, spread / 2, 0)
    }

}

/** The kind of the hand holding two wands of adjustable spacing. */
export const TWO_WAND_TOOL_KIND: ToolKind = {
    label: "Two wands",
    description: "Open like scissors around the pointing direction and close onto each other as the squeeze is pressed: one hand, two voices.",
    thumbnail: THUMBNAIL_URL,
    tags: ["contact", "percussive", "wide", "adjustable"],
    create: context => new TwoWandTool(context),
}
