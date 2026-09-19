// The soft wand hand: a wand hanging on a slack spring, thrown up by what its ball hits.

import { Observer, Scene } from "@babylonjs/core"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { WAND_TILT, WandTool } from "./WandTool"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of the shaft, the length of a plain wand, in meters. */
const LENGTH = 0.4

/** How far below its resting tilt a fully held squeeze swings the wand, in radians. */
const PUSH_ANGLE = Math.PI / 3

/** The highest the wand can be thrown, in radians above the pointing direction of the hand. */
const MAX_TILT = Math.PI / 2

/**
 * How hard the wand is pulled back toward the tilt it is heading for, in radians per second squared
 * and per radian of gap. Slack with the squeeze released, firm with it fully pressed, so a relaxed
 * hand lets the wand drift and a pressed one drives it down.
 */
const REST_STIFFNESS = 3
const PUSH_STIFFNESS = 40

/** How fast the wand loses its speed, per second. Enough to come to rest without swinging back. */
const DAMPING = 2.5

/** The speed a blow throws the wand up at, in radians per second. */
const BOUNCE_SPEED = 2.5

/** The longest frame the motion is integrated over, in seconds. A longer one is a hitch. */
const MAX_STEP = 0.05

/**
 * The hand holding a soft wand, held like any other wand: the harder the squeeze is pressed, the
 * further down toward the pointing direction the wand swings, and hitting something with its ball
 * throws the wand up out of the way.
 *
 * @remarks
 * The wand is a tilt and an angular speed, moved by a slack spring pulling it toward the tilt the
 * squeeze asks for: a blow is a speed given to it, not a position it is placed at, so how high it
 * flies and how long it hangs up there come out of the motion itself rather than being timed.
 * {@link REST_STIFFNESS} is what makes it soft — released, the wand takes a second or two to come
 * back down, so it never strikes twice on its own.
 */
export class SoftWandTool extends WandTool {


    constructor(context: ToolContext){
        super(context, { name: "soft wand", length: LENGTH })

        this.#scene = context.scene
        this.#observer = this.#scene.onBeforeRenderObservable.add(() => this.#update())
    }

    public override dispose(): void {
        this.#scene.onBeforeRenderObservable.remove(this.#observer)
        super.dispose()
    }


    readonly #scene: Scene

    readonly #observer: Observer<Scene>

    /** How fast the wand swings, in radians per second. */
    #speed = 0

    /** Move the wand by one step of its motion, and throw it up on whatever it runs into. */
    #update(): void {
        const step = this.#scene.getEngine().getDeltaTime() / 1000
        if(step <= 0) return

        const squeeze = this.context.controller.squeeze.getValue()
        const target = WAND_TILT - squeeze * PUSH_ANGLE
        const stiffness = REST_STIFFNESS + (PUSH_STIFFNESS - REST_STIFFNESS) * squeeze

        const clamped = Math.min(step, MAX_STEP)
        this.#speed += (stiffness * (target - this.tilt) - DAMPING * this.#speed) * clamped

        let tilt = this.tilt + this.#speed * clamped

        if(this.#isBlocked() === true){
            // The blow is a speed given to the wand: it leaves on its own from where it was stopped.
            // Never a slower one than it already carries, so a wand on its way out of the matter is
            // not held back by the matter it is still in.
            this.#speed = Math.max(this.#speed, BOUNCE_SPEED)
            tilt = this.tilt + this.#speed * clamped
        }

        if(tilt >= MAX_TILT){
            this.tilt = MAX_TILT
            this.#speed = 0
            return
        }

        this.tilt = tilt
    }

    /**
     * Is the ball of the wand in the matter?
     *
     * @remarks
     * What is asked is the touch of the point of matter at the end of the wand, the very one that
     * plays the instruments, so the wand bounces on exactly what it plays and on nothing else.
     *
     * A ray cast from the hand along the shaft was tried instead, and is what made the wand bounce
     * off nothing: it met whatever stood anywhere between the hand and the ball, and it met it
     * before the ball ever arrived, so the wand was thrown back without a sound having been made.
     */
    #isBlocked(): boolean {
        return this.driver.interactor.touchedMesh !== null
    }

}

/** The kind of the hand holding a soft wand. */
export const SOFT_WAND_TOOL_KIND: ToolKind = {
    label: "Soft wand",
    description: "Hangs on a spring, straightens under the squeeze and bounces off whatever it strikes, so the gesture is the one of the wrist.",
    thumbnail: THUMBNAIL_URL,
    tags: ["contact", "physical", "percussive"],
    create: context => new SoftWandTool(context),
}
