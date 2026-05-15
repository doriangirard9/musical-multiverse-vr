import { AbstractMesh, Behavior, Observer } from "@babylonjs/core";
import { PointerInput } from "../PointerInput";
import { InputMultiHoverBehavior } from "./InputMultiHoverBehavior";

/**
 * A behavior that calls three callbacks when the target is hovered, moved over and stop being hovered.
 * Called for each pointer indvidually.
 */
export class InputMoveOverBehavior implements Behavior<AbstractMesh> {

    constructor(
        /**
         * Called if the target is pointed by a pointer, and was not being pointed by this pointer before.
         */
        private onEnter: (pointer:PointerInput)=>void,
        /**
         * Called when the pointer move over the target.
         */
        private onMove: (pointer:PointerInput)=>void,
        /**
         * Called if the target is no longer pointer by a pointer.
         * Also called if the behavior is detached while the target is still being pointed at. In this case, the behavior will consider that the target is no longer hovered, and call this callback.
         */
        private onExit: (pointer:PointerInput)=>void,
    ){}

    get name(){ return this.constructor.name }

    hover!: InputMultiHoverBehavior
    observables: {remove():void}[] = []
    target!: AbstractMesh

    init(): void {}

    attach(target: AbstractMesh): void {
        this.detach()

        this.target = target

        this.hover = new InputMultiHoverBehavior(
            pointer=>{
                this.onEnter(pointer)
                this.addMoveObserver(pointer)
            }, 
            pointer=>{
                this.onExit(pointer)
                this.removeMoveObserver(pointer)
            },
        )
        target.addBehavior(this.hover)

    }

    // Move observer
    private moveObservers = new Map<PointerInput, Observer<PointerInput>>()

    addMoveObserver(pointer: PointerInput){
        if(this.moveObservers.has(pointer)) return
        const obs = pointer.onMove.add(p=>{
            this.onMove(p)
            console.log("move", p)
        })
        this.moveObservers.set(pointer, obs)
    }

    removeMoveObserver(pointer: PointerInput){
        const obs = this.moveObservers.get(pointer)
        if(obs){
            pointer.onMove.remove(obs)
            this.moveObservers.delete(pointer)
        }
    }

    detach(): void {
        for(const pointer of this.moveObservers.keys()){
            this.removeMoveObserver(pointer)
        }

        if(this.hover) this.target.removeBehavior(this.hover)
        this.hover = undefined!
    }

}