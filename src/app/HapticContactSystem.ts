import { InputManager } from "../xr/inputs/InputManager"


/**
 * A haptic system.
 * It is responsible for triggering haptic feedback on the controllers when a pointer touches a mesh.
 */
export class HapticContactSystem {

    // Instance
    static _instance?: HapticContactSystem

    static async initialize(...network: ConstructorParameters<typeof HapticContactSystem>){
        this._instance = await new HapticContactSystem(...network)
    }

    static getInstance(): HapticContactSystem {
        if(!this._instance) throw new Error("HapticContact not initialized. Call initialize() first.")
        return this._instance
    }

    // Haptic Contact
    constructor(
        readonly inputs: InputManager,
    ){
        for(const controller of [inputs.left, inputs.right]){
            controller.pointer.onNewTouch.add((pointer) => {
                if(pointer.isTouching){
                    controller.pulse(0.1, 100, 0)
                }
                else{
                    controller.pulse(0.1, 50, 1)
                }
            })
        }
    }

}
