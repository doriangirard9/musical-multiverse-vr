import { AbstractMesh, Behavior } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { PointerInput } from "../PointerInput";


/**
 * Grab/move/release detection behavior. Only supports one grab at a time.
 * A behaviours that call two callback when the target is grabbed and stop being grabbed.
 * Can also call a callback when the target is moved while being grabbed.
 * 
 *  * **Ordering**:
 * - OnUp is called after InputDropBehavior#onDrop
 */
export class InputGrabBehavior implements Behavior<AbstractMesh> {

    constructor(
        /** Called if a trigger is pressed while the associated pointer is pointing at the target. */
        private onDown: (pointer:PointerInput)=>void,

        /** Called if a trigger that has triggered the onDown callback is released, or if the behavior is detached while the target is still grabbed. In this case, the behavior will consider that the target is no longer grabbed, and call this callback. */
        private onUp: (pointer:PointerInput)=>void,

        /** Called if the target is grabbed, and the pointer that is grabbing it moves. */
        private onMove?: (pointer:PointerInput)=>void,
    ){}

    get name(){ return this.constructor.name }

    grabbed: PointerInput|null = null

    moveObserver: {remove():void}|null = null

    observables: {remove():void}[] = []

    init(): void {}

    attachedNode: AbstractMesh

    attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target
        const inputs = InputManager.getInstance()
        this.observables.push(
            inputs.onTriggerDown.add(e=>{
                const pointer = e.pressable.controller?.pointer
                if(!pointer)return
                if(pointer.targetMesh===target){
                    this.grabbed = pointer
                    this.onDown(pointer)
                    if(this.onMove){
                        this.moveObserver = pointer.onMove.add(p=>{
                            this.onMove!(p)
                        })
                    }
                }
            }),
            inputs.onTriggerUp.add(e=>{
                const pointer = e.pressable.controller?.pointer
                if(!pointer)return
                if(this.grabbed===pointer){
                    this.grabbed = null
                    this.onUp(pointer)
                    this.moveObserver?.remove()
                    this.moveObserver = null
                }
            })
        )
    }

    detach(): void {
        this.observables.forEach(obs=>obs.remove())
        this.observables.length = 0
        if(this.grabbed){
            this.onUp(this.grabbed)
            this.grabbed = null
        }
        this.moveObserver?.remove()
        this.moveObserver = null
    }

}