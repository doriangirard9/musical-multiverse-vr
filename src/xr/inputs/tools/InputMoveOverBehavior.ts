import { AbstractMesh, Behavior, Observer } from "@babylonjs/core";
import { PointerInput } from "../PointerInput";
import { InputMultiHoverBehavior } from "./InputMultiHoverBehavior";

/**
 * Start hovering/move over/stop hovering detection behavior. Called for each pointer individually.
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
    attachedNode!: AbstractMesh

    init(): void {}

    attach(target: AbstractMesh): void {
        this.detach()

        this.attachedNode = target

        this.hover = new InputMultiHoverBehavior(
            pointer=>{
                console.log("enter", pointer)
                this.onEnter(pointer)
                this.addMoveObserver(pointer)
            }, 
            pointer=>{
                console.log("exit", pointer)
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
            this.onExit(pointer)
            this.removeMoveObserver(pointer)
        }

        if(this.hover) this.attachedNode.removeBehavior(this.hover)
        this.hover = undefined!
    }

}