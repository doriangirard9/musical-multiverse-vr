import { AbstractMesh, Behavior } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { ControllerInput } from "../ControllerInput";


/**
 * A behaviours that call two callback when the state (pointer is on target && trigger is pressed) becomes true or become false.
 * Ideal for piano keys.
 * The difference with InputGrabBehavior is that the onDown callback is called even if the trigger is pressed before the pointer is on the target,
 * and the onUp callback is called even if the trigger is still pressed when the pointer is moved out of the target.
 */
export class InputMultiPressBehavior implements Behavior<AbstractMesh> {

    constructor(
        /** Called if the state (pointer is on target && trigger is pressed) becomes true. */
        private onDown: ()=>void,

        /** Called if the state (pointer is on target && trigger is pressed) becomes false. */
        private onUp: ()=>void,
    ){}

    name = "InputMultiPressBehavior"

    private _pressers: Set<ControllerInput> = new Set()
    
    private checkPressed(inputManager: InputManager, target: AbstractMesh) {
        const new_pressers = inputManager.controllers.filter(c=>{
            return (c.pointer.targetMesh===target) && c.trigger.isPressed()
        })

        const shouldBePressed = new_pressers.length > 0
        const isPressed = this._pressers.size > 0

        if(shouldBePressed && !isPressed) {
            this.onDown()
        }
        else if(!shouldBePressed && isPressed) {
            this.onUp()
        }

        this._pressers.clear()
        new_pressers.forEach(c => this._pressers.add(c))
    }

    observables: {remove():void}[] = []

    init(): void {}

    attach(target: AbstractMesh): void {
        this.detach()
        const inputs = InputManager.getInstance()
        this.observables.push(
            inputs.onNewtarget.add(e => {
                if(e.previousMesh===target || e.targetMesh===target) this.checkPressed(inputs, target)
            }),
            inputs.onTriggerDown.add(e =>{
                if(e.pressable.controller.pointer.targetMesh===target) this.checkPressed(inputs, target)
            }),
            inputs.onTriggerUp.add(e => {
                if(e.pressable.controller.pointer.targetMesh===target) this.checkPressed(inputs, target)
            }),
        )
    }

    detach(): void {
        this.observables.forEach(o => o.remove())
        this.observables.length = 0
        if(this._pressers.size > 0) {
            this.onUp()
            this._pressers.clear()
        }
    }

    get pressers(): ControllerInput[] {
        return Array.from(this._pressers)
    }

}