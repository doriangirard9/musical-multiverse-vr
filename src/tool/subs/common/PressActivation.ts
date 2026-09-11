// The bridge between a button of a controller and the pressure of a point of matter.

import { Interactor } from "../../../instrument"
import { PressableInput } from "../../../xr/inputs"

/**
 * A button of a controller mirrored into the pressure of an interactor.
 *
 * @remarks
 * Nothing here asks whether anything is touched: {@link Interactor} keeps the pressure whether the
 * point meets a mesh or not, and publishes it under the touch the moment there is one. So the whole
 * job is to copy the button, and the awkward orders take care of themselves — the trigger held
 * before the contact, the contact lost with the trigger still held, the point going from one mesh to
 * another mid press.
 *
 * The state is read rather than listened to, once per frame by whoever owns the point: a button that
 * changed twice between two frames still leaves the interactor where the button now is, which
 * listening to the events cannot promise.
 */
export class PressActivation {

    /**
     * @param interactor - The point the button presses.
     * @param button - The button read, the trigger for every hand of the application.
     */
    constructor(
        private readonly interactor: Interactor,
        private readonly button: PressableInput,
    ){}

    /** Lay the state of the button on the interactor. Called once per frame by the owner of the point. */
    public update(): void {
        if(this.button.isPressed() === false){
            this.interactor.deactivate()
            return
        }

        // A button pressed that says nothing of how hard it is held is held all the way.
        const read = this.button.getValue()
        const value = read > 0 ? read : 1

        if(this.interactor.activated === false || this.interactor.activationValue !== value){
            this.interactor.activate(value)
        }
    }

}
