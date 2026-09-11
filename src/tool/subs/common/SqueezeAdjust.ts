import { ControllerInput } from "../../../xr/inputs"

/** The delay between two steps while the thumbstick is held, in milliseconds. */
const STEP_INTERVAL = 120

/** How far the thumbstick has to be pushed before it adjusts anything. */
const DEAD_ZONE = 0.4

/** What a {@link SqueezeAdjust} is made of. */
export interface SqueezeAdjustOptions {

    /** The value the adjustment starts at. */
    value: number

    /** The lowest value the adjustment can reach. */
    min: number

    /** The highest value the adjustment can reach. */
    max: number

    /** How much one step of the thumbstick adds or removes. */
    step: number

    /** Called with the new value whenever it changed. */
    onChange: (value: number) => void

}

/**
 * A value the user sets by holding the squeeze and pushing the thumbstick up or down.
 *
 * @remarks
 * Unlike {@link SqueezeDrive}, the value stays where the user left it: the squeeze is what opens the
 * adjustment, not what carries the value, so a wand made long stays long once the hand is relaxed.
 * The thumbstick alone keeps its ordinary meaning, since nothing is adjusted while the squeeze is
 * released.
 */
export class SqueezeAdjust {


    constructor(controller: ControllerInput, options: SqueezeAdjustOptions){
        this.#options = options
        this.#value = options.value

        this.#observer = controller.thumbstick.setPullInterval(STEP_INTERVAL, (_x, y) => {
            if(controller.squeeze.isPressed() === false) return
            if(Math.abs(y) < DEAD_ZONE) return
            this.#move(Math.sign(y) * options.step)
        })
    }

    /** The current value of the adjustment. */
    public get value(): number { return this.#value }

    public dispose(): void {
        this.#observer.remove()
    }


    readonly #options: SqueezeAdjustOptions

    readonly #observer: { remove(): void }

    #value: number

    /** Move the value by one step, kept between its two ends. */
    #move(amount: number): void {
        const { min, max, onChange } = this.#options
        const value = Math.min(max, Math.max(min, this.#value + amount))
        if(value === this.#value) return

        this.#value = value
        onChange(value)
    }

}
