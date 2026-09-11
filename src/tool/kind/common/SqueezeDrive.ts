import { ControllerInput } from "../../../xr/inputs"

/**
 * A value moving between two ends as the squeeze of a hand is pressed harder or released.
 *
 * @remarks
 * The squeeze is analog, so the value follows the pressure continuously rather than snapping between
 * two states. Releasing the squeeze brings the value back to its released end on its own.
 */
export class SqueezeDrive {


    constructor(
        controller: ControllerInput,
        options: {
            /** The value reached when the squeeze is fully released. */
            released: number,
            /** The value reached when the squeeze is fully pressed. */
            pressed: number,
            /** Called with the new value whenever the pressure changes. */
            onChange: (value: number) => void,
        },
    ){
        this.#options = options
        this.#apply(controller.squeeze.getValue())
        this.#observer = controller.squeeze.onValueChange.add(event => this.#apply(event.value))
    }

    /** The current value of the drive. */
    public get value(): number { return this.#value }

    public dispose(): void {
        this.#observer.remove()
    }


    readonly #options: { released: number, pressed: number, onChange: (value: number) => void }

    readonly #observer: { remove(): void }

    #value = 0

    /** Move the value to where the given pressure puts it. */
    #apply(pressure: number): void {
        const { released, pressed, onChange } = this.#options
        this.#value = released + (pressed - released) * pressure
        onChange(this.#value)
    }

}
