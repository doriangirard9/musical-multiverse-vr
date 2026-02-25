import { ControllerInput } from "./ControllerInput";
import { AbstractPointerInput } from "./AbstractPointerInput";

/**
 * Class representing the pointer input of a controller. It provides the position and orientation of the pointer, as well as the mesh it is targeting (if any).
 */
export class PointerInput extends AbstractPointerInput {

    constructor(
        readonly controller: ControllerInput
    ){
        super()
    }

}