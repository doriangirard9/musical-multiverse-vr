import { Interactor } from "../../../instrument"
import { PressableInput } from "../../../xr/inputs"

/**
 * A button of a controller mirrored into the pressure of an interactor.
 *
 * @remarks
 * The whole job is to copy the button, {@link Interactor} keeping the pressure whether the point
 * meets a mesh or not, so the awkward orders take care of themselves: the trigger held before the
 * contact, the contact lost with the trigger still held. The state is read once per frame rather
 * than listened to, so a button that changed twice between two frames still ends up right.
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

    /**
     * Lay the state of the button on the interactor. Called once per frame by the owner of the point.
     * A button that says nothing of how hard it is held is taken as held all the way.
     */
    public update(): void {
        if(this.button.isPressed() === false){
            this.interactor.deactivate()
            return
        }

        const read = this.button.getValue()
        const value = read > 0 ? read : 1

        if(this.interactor.activated === false || this.interactor.activationValue !== value){
            this.interactor.activate(value)
        }
    }

}
