import { AbstractMesh, Behavior, Nullable } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { InputCapability } from "../InputCapability";


/**
 * Hove enter/exit detection behavior. Don't differentiate pointers, so if two pointers are hovering the target.
 * A behaviours that call two callback when the target is hovered and stop being hovered.
 */
export class InputHoverBehavior implements Behavior<AbstractMesh> {

    constructor(
        /**
         * Called if the target is pointed by a pointer, and was not being pointed by
         * any pointer before.
         */
        private onEnter: ()=>void,
        /**
         * Called if the target is no longer pointer by any pointer, and was being pointed by at least one pointer before.
         * Also called if the behavior is detached while the target is still being pointed at. In this case, the behavior will consider that the target is no longer hovered, and call this callback.
         */
        private onExit: ()=>void,

        /**
         * The capability filtering the behavior. While it is disabled the behavior acts as if the
         * target was not there, and whatever it holds is released the moment it gets disabled.
         * A behavior with no capability always acts.
         */
        private capability?: InputCapability,
    ){}

    get name(){ return this.constructor.name }

    isEntered = false
    observables: {remove():void}[] = []

    init(): void {}

    attachedNode: Nullable<AbstractMesh> = null

    attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target
        const inputs = InputManager.getInstance()

        if(inputs.pointedMeshes.includes(target) && this.capability?.isEnabled()!==false){
            this.onEnter()
            this.isEntered = true
        }

        this.observables.push(
            inputs.onEnterTarget.add(e=>{
                if(e.target!==target) return
                if(this.capability?.isEnabled()===false) return
                this.onEnter()
                this.isEntered = true
            }),
            inputs.onExitTarget.add(e=>{
                if(e.target!==target) return
                if(!this.isEntered) return
                this.onExit()
                this.isEntered = false
            }),
        )

        // Losing the capability goes dark, as leaving the target does.
        if(this.capability){
            const onDisable = () => {
                if(!this.isEntered) return
                this.onExit()
                this.isEntered = false
            }
            this.capability.onDisable.add(onDisable)
            this.observables.push({ remove: () => this.capability!.onDisable.delete(onDisable) })
        }
    }

    detach(): void {
        this.observables.forEach(obs=>obs.remove())
        this.observables.length = 0
        if(this.isEntered){
            this.onExit()
            this.isEntered = false
        }
    }

}
