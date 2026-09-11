import { AbstractMesh, Behavior, Nullable } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { PointerInput } from "../PointerInput";
import { InputCapability } from "../InputCapability";


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

        /**
         * The capability filtering the behavior. While it is disabled the behavior acts as if the
         * target was not there, and whatever it holds is released the moment it gets disabled.
         * A behavior with no capability always acts.
         */
        private capability?: InputCapability,
    ){}
    
    attachedNode: Nullable<AbstractMesh> = null;

    get name(){ return this.constructor.name }

    grabbed: PointerInput|null = null

    moveObserver: {remove():void}|null = null

    observables: {remove():void}[] = []

    init(): void {
        this.attachedNode = null;
        this.grabbed = null;
        this.moveObserver = null;
        this.observables = [];
    }

    attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target
        const inputs = InputManager.getInstance()
        this.observables.push(
            inputs.onTriggerDown.add(e=>{
                const pointer = e.pressable.controller?.pointer
                if(!pointer)return
                if(this.grabbed) return
                if(this.capability?.isEnabled()===false) return
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

        // Losing the capability in the middle of a grab releases it, so nothing stays held by a
        // hand that is no longer allowed to hold it.
        if(this.capability){
            const onDisable = () => { if(this.grabbed) this.release() }
            this.capability.onDisable.add(onDisable)
            this.observables.push({ remove: () => this.capability!.onDisable.delete(onDisable) })
        }
    }

    /** Release what is grabbed, if anything is. */
    private release(): void {
        if(!this.grabbed) return
        const pointer = this.grabbed
        this.grabbed = null
        this.onUp(pointer)
        this.moveObserver?.remove()
        this.moveObserver = null
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
