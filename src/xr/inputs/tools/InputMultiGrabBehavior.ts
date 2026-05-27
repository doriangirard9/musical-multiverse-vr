import { AbstractMesh, Behavior } from "@babylonjs/core";
import { InputManager } from "../InputManager";
import { PointerInput } from "../PointerInput";


/**
 * Start grab/move/release detection behavior. Called for each pointer individually.
 * A behaviour that calls callbacks when the target is grabbed and released per pointer.
 * Unlike press behaviors, it only starts when the trigger is pressed while pointing at the target.
 *
 *  * **Ordering**:
 * - OnUp is called after InputDropBehavior#onDrop
 */
export class InputMultiGrabBehavior implements Behavior<AbstractMesh> {

    constructor(
        /** Called if a trigger is pressed while the associated pointer is pointing at the target. */
        private onDown: (pointer: PointerInput) => void,

        /** Called if a trigger that has triggered the onDown callback is released, or if the behavior is detached while the target is still grabbed. */
        private onUp: (pointer: PointerInput) => void,

        /** Called if the target is grabbed, and the pointer that is grabbing it moves. */
        private onMove?: (pointer: PointerInput) => void,
    ) {}

    get name() { return this.constructor.name; }

    private grabbed: Set<PointerInput> = new Set();
    private moveObservers: Map<PointerInput, { remove(): void }> = new Map();
    private observables: { remove(): void }[] = [];

    init(): void {}

    private add(pointer: PointerInput) {
        if (this.grabbed.has(pointer)) return;
        this.grabbed.add(pointer);
        this.onDown(pointer);
        if (this.onMove) {
            const moveObserver = pointer.onMove.add(p => this.onMove!(p));
            this.moveObservers.set(pointer, moveObserver);
        }
    }

    private remove(pointer: PointerInput) {
        if (!this.grabbed.has(pointer)) return;
        this.grabbed.delete(pointer);
        this.onUp(pointer);
        const moveObserver = this.moveObservers.get(pointer);
        moveObserver?.remove();
        this.moveObservers.delete(pointer);
    }

    attachedNode: AbstractMesh

    attach(target: AbstractMesh): void {
        this.detach()

        this.attachedNode = target
        
        const inputs = InputManager.getInstance();
        this.observables.push(
            inputs.onTriggerDown.add(e => {
                const pointer = e.pressable.controller?.pointer;
                if (!pointer) return;
                if (pointer.targetMesh === target) {
                    this.add(pointer);
                }
            }),
            inputs.onTriggerUp.add(e => {
                const pointer = e.pressable.controller?.pointer;
                if (!pointer) return;
                if (this.grabbed.has(pointer)) {
                    this.remove(pointer);
                }
            })
        );
    }

    detach(): void {
        this.observables.forEach(obs => obs.remove());
        this.observables.length = 0;

        this.grabbed.forEach(pointer => this.onUp(pointer));
        this.grabbed.clear();

        this.moveObservers.forEach(obs => obs.remove());
        this.moveObservers.clear();
    }

    get grabbers(): PointerInput[] {
        return Array.from(this.grabbed);
    }

}
