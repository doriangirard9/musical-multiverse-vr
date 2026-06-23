import { AbstractMesh, Behavior } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { PointerInput } from "../PointerInput";


/**
 * Start hovering/move over/stop hovering detection behavior. Called for each pointer individually.
 * A behaviours that call two callback when the target is hovered and stop being hovered.
 * Called for each pointer indvidually.
 * The difference with InputHoverBehavior is that the onEnter and onExit callbacks are called for each pointer, so if two pointers are hovering the target,
 * the onEnter callback will be called twice, and the onExit callback will also be called twice when they stop hovering.
 * Also, if the behavior is detached while the target is still being pointed at by one or more pointers, the onExit callback will be called for each pointer that was pointing at the target.
 */
export class InputMultiHoverBehavior implements Behavior<AbstractMesh> {

    constructor(
        /**
         * Called if the target is pointed by a pointer, and was not being pointed by this pointer before.
         */
        private onEnter: (pointer:PointerInput)=>void,
        /**
         * Called if the target is no longer pointer by a pointer.
         * Also called if the behavior is detached while the target is still being pointed at. In this case, the behavior will consider that the target is no longer hovered, and call this callback.
         */
        private onExit: (pointer:PointerInput)=>void,
    ){}

    get name(){ return this.constructor.name }

    observables: {remove():void}[] = []
    attachedNode!: AbstractMesh

    init(): void {}

    attach(target: AbstractMesh): void {
        this.detach()
        const inputs = InputManager.getInstance()
        this.attachedNode = target

        // Initial
        for(const controller of inputs.controllers){
            if(controller.pointer.targetMesh===target){
                this.onEnter(controller.pointer)
            }
        }

        this.observables.push(
            inputs.onNewTarget.add(pointer=>{
                if(pointer.previousMesh===target) this.onExit(pointer)
                if(pointer.targetMesh===target) this.onEnter(pointer)
            })
        )
    }

    detach(): void {
        const inputs = InputManager.getInstance()

        this.observables.forEach(obs=>obs.remove())
        this.observables.length = 0
        for(const controller of inputs.controllers){
            if(controller.pointer.targetMesh===this.attachedNode){
                this.onExit(controller.pointer)
            }
        }
    }

}