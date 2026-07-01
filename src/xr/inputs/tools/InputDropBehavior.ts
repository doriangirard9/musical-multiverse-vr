import { AbstractMesh, Behavior, Nullable } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { PointerInput } from "../PointerInput";


/**
 * Drop on target detection behavior.
 * A behaviour that calls a callback when the trigger is released while the associated pointer is pointing at the target.
 * Useful to handle "dropping" an object on a target, or to handle connections between nodes by "dropping" a connection on a connectable.
 * Note that this behaviour only handles the "drop" part, and not the "grab" part. So it can be used independently of any grab behavior, to handle cases where the user doesn't need to grab an object to connect it to a node for example.
 * Also note that this behaviour will only trigger if the pointer is pointing at the target when the trigger is released, so it can be used together with a grab behavior without interfering with it, to handle cases where the user needs to grab an object before connecting it to a node for example.
 * 
 * **Ordering**:
 * - Called before InputGrabBehavior#onUp
 */
export class InputDropBehavior implements Behavior<AbstractMesh> {

    constructor(
        /** Called if a trigger is released while the associated pointer is pointing at the target. */
        private onDrop: (pointer:PointerInput)=>void,
    ){}

    get name(){ return this.constructor.name }

    observable?: {remove():void}

    init(): void {}

    attachedNode: Nullable<AbstractMesh> = null

    attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target
        const inputs = InputManager.getInstance()
        this.observable = inputs.onTriggerUp.add(e=>{
            const pointer = e.pressable.controller?.pointer
            if(!pointer)return
            if(pointer.targetMesh===target) this.onDrop(pointer)
        }, undefined, true)
    }

    detach(): void {
        this.observable?.remove()
        this.observable = undefined
    }

}
