import { AbstractMesh, Behavior } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { ControllerInput } from "../ControllerInput";


/**
 * "Pressing" detection behavior. Called for each pointer individually.
 * A behaviours that call two callback when the state (pointer is on target && trigger is pressed) becomes true or become false for each pointer.
 * Its difference with InputPressBehavior is that the callbacks are called for each pointer, so if two pointers are pressing the target,
 * the onDown callback will be called twice, and the onUp callback will also be called twice when they stop pressing.
 */
export class InputMultiPressBehavior implements Behavior<AbstractMesh> {

    constructor(
        /** Called if the state (pointer is on target && trigger is pressed) becomes true for a pointer. */
        private onDown: (controller:ControllerInput)=>void,

        /** Called if the state (pointer is on target && trigger is pressed) becomes false for a pointer. */
        private onUp: (controller:ControllerInput)=>void,
    ){}

    get name(){ return this.constructor.name }

    observables: {remove():void}[] = []

    init(): void {}

    controllers: Set<ControllerInput> = new Set()

    attachedNode: AbstractMesh

    add(controller: ControllerInput) {
        if(!this.controllers.has(controller)) {
            this.onDown(controller)
            this.controllers.add(controller)
        }
    }

    remove(controller: ControllerInput) {
        if(this.controllers.has(controller)) {
            this.onUp(controller)
            this.controllers.delete(controller)
        }
    }

    attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target
        const inputs = InputManager.getInstance()
        this.observables.push(
            inputs.onNewtarget.add(e => {
                if(e.targetMesh===target && e.controller.trigger.isPressed()) this.add(e.controller)
                if(e.previousMesh===target && e.controller.trigger.isPressed()) this.remove(e.controller)
            }),
            inputs.onTriggerDown.add(e =>{
                if(e.pressable.controller.pointer.targetMesh===target) this.add(e.pressable.controller)
            }),
            inputs.onTriggerUp.add(e => {
                if(e.pressable.controller.pointer.targetMesh===target) this.remove(e.pressable.controller)
            }),
        )
    }

    detach(): void {
        this.observables.forEach(o => o.remove())
        this.observables.length = 0
        this.controllers.forEach(c => this.onUp(c))
        this.controllers.clear()
    }

    get pressers(): ControllerInput[] {
        return Array.from(this.controllers)
    }

}