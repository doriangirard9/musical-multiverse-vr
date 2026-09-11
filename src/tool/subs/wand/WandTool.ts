import { Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolContext } from "../../ToolContext"
import { PointDriver } from "../common/PointDriver"
import { Wand, WandOptions } from "./Wand"

/**
 * How much a wand held by a hand points above the pointing direction of that hand, in radians.
 * The hands holding wands share it so a wand is held the same way whichever hand holds it.
 */
export const WAND_TILT = Math.PI / 6

/**
 * A hand holding one wand, tilted up so it reads as held rather than aimed.
 *
 * @remarks
 * Placing the wand is the business of the hand, not of the wand: this class parents and orients it,
 * and reports where it reaches in world space. Subclasses add what makes their wand special, and an
 * overridden {@link dispose} releases what they created before calling this one.
 *
 * The end of the wand is a point of matter, so every wand plays the instruments it meets without
 * having to say anything about it: what a subclass changes is where that end goes, never how it is
 * heard.
 */
export abstract class WandTool implements Tool {


    /** The wand held by the hand. */
    protected readonly wand: Wand

    /** The point of matter at the end of the wand, what actually plays the instruments. */
    protected readonly driver: PointDriver

    protected constructor(
        protected readonly context: ToolContext,
        options: WandOptions,
    ){
        this.wand = new Wand(context.scene, options)
        this.wand.root.parent = context.visual
        this.tilt = WAND_TILT

        this.driver = new PointDriver({
            label: `${options.name} ${context.side}`,
            scene: context.scene,
            controller: context.controller,
            radius: Math.max(this.wand.headRadius, (options.diameter ?? 0) / 2),
            position: () => this.wand.tipTo(this.#tip),
            direction: () => this.direction,
        })
    }

    public dispose(): void {
        this.driver.dispose()
        this.wand.dispose()
    }

    /**
     * How much the wand points above the pointing direction of the hand, in radians.
     * {@link WAND_TILT} at rest, moved by the hands whose wand swings.
     */
    protected get tilt(): number { return this.#tilt }

    protected set tilt(tilt: number) {
        this.#tilt = tilt
        this.wand.root.rotation.x = -tilt
    }

    /** The world direction the wand points to. */
    protected get direction(): Vector3 { return this.directionAt(this.#tilt) }

    /**
     * The world direction the wand would point to at the given tilt.
     * @param tilt - The angle above the pointing direction of the hand, in radians.
     */
    protected directionAt(tilt: number): Vector3 {
        const pointer = this.context.controller.pointer
        return pointer.forward.scale(Math.cos(tilt)).addInPlace(pointer.up.scale(Math.sin(tilt)))
    }


    #tilt = WAND_TILT

    /** Scratch vector for the end of the wand, so reading it each frame allocates nothing. */
    readonly #tip = new Vector3()

}
