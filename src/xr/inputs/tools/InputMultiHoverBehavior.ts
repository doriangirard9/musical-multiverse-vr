import { AbstractMesh, Behavior } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { PointerInput } from "../PointerInput";
import { InputCapability } from "../InputCapability";


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

        /**
         * The capability filtering the behavior. While it is disabled the behavior acts as if the
         * target was not there, and whatever it holds is released the moment it gets disabled.
         * A behavior with no capability always acts.
         */
        private capability?: InputCapability,
    ){}

    get name(){ return this.constructor.name }

    observables: {remove():void}[] = []
    attachedNode!: AbstractMesh

    /** The pointers the enter callback was called for, so each one is exited exactly once. */
    private entered: Set<PointerInput> = new Set()

    private enter(pointer: PointerInput) {
        if(this.entered.has(pointer)) return
        if(this.capability?.isEnabled()===false) return
        this.entered.add(pointer)
        this.onEnter(pointer)
    }

    private exit(pointer: PointerInput) {
        if(!this.entered.delete(pointer)) return
        this.onExit(pointer)
    }

    init(): void {}

    attach(target: AbstractMesh): void {
        this.detach()
        const inputs = InputManager.getInstance()
        this.attachedNode = target

        // Initial
        for(const controller of inputs.controllers){
            if(controller.pointer.targetMesh===target) this.enter(controller.pointer)
        }

        this.observables.push(
            inputs.onNewTarget.add(pointer=>{
                if(pointer.previousMesh===target) this.exit(pointer)
                if(pointer.targetMesh===target) this.enter(pointer)
            })
        )

        // Losing the capability goes dark, as leaving the target does.
        if(this.capability){
            const onDisable = () => [...this.entered].forEach(pointer => this.exit(pointer))
            this.capability.onDisable.add(onDisable)
            this.observables.push({ remove: () => this.capability!.onDisable.delete(onDisable) })
        }
    }

    detach(): void {
        this.observables.forEach(obs=>obs.remove())
        this.observables.length = 0
        ;[...this.entered].forEach(pointer => this.exit(pointer))
    }

}