import { AbstractMesh, Behavior } from "@babylonjs/core";
import { InputManager } from "../InputManager";


/**
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
    ){}

    get name(){ return this.constructor.name }

    isEntered = false
    observables: {remove():void}[] = []

    init(): void {}

    attach(target: AbstractMesh): void {
        this.detach()
        const inputs = InputManager.getInstance()

        if(inputs.pointedMeshes.includes(target)){
            this.onEnter()
            this.isEntered = true
        }

        this.observables.push(
            inputs.onEnterTarget.add(e=>{
                if(e.target===target){
                    this.onEnter()
                    this.isEntered = true
                }
            }),
            inputs.onExitTarget.add(e=>{
                if(e.target===target){
                    this.onExit()
                    this.isEntered = false
                }
            }),
        )
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