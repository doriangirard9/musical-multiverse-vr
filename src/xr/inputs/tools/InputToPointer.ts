import { AbstractMesh, Behavior, Observer, Ray } from "@babylonjs/core";
import { PointerInput } from "../PointerInput";
import { InputMoveOverBehavior } from "./InputMoveOverBehavior";
import { InputMultiGrabBehavior } from "./InputMultiGrabBehavior";
import { InputManager } from "../InputManager";


const PT: PointerEventInit = { pointerId: 432521 }

/**
 * A behavior that simulates babylonjs pointer events on the target mesh based on the pointing direction of the input pointers.
 * This way:
 * - If the target is pressed on for the first time, it will simulate a pointer down event on the target.
 * - If the target is released by all pointers, it will simulate a pointer up event on the target.
 * - If the target is pressed on by pointers, the last pointer to pressed will be emit pointer move events.
 * - If no pointer is pressing on the target, but one or more pointers are hovering the target, the last pointer to hover will be emit pointer move events.
 */
export class InputToPointerBehavior implements Behavior<AbstractMesh> {

    name = "InputToPointerBehavior"

    attachedNode!: AbstractMesh
    private pointer_up!: Observer<any>
    private grab!: InputMultiGrabBehavior
    private move!: InputMoveOverBehavior

    private hoveringStack =  [] as PointerInput[]
    private grabbingStack =  [] as PointerInput[]

    init(): void { }

    attach(target: AbstractMesh): void {

        this.attachedNode = target

        const scene = target.getScene()

        this.grab = new InputMultiGrabBehavior(
            pointer=>{
                this.grabbingStack.push(pointer)
                this.updateCurrentMovingPointer()
                if(this.grabbingStack.length === 1){
                    const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward), (mesh) => mesh.isPickable)
                    if(info) scene._inputManager.simulatePointerDown(info, PT)
                }
            },
            pointer=>{
                this.grabbingStack = this.grabbingStack.filter(it=> it !== pointer)
                this.updateCurrentMovingPointer()
                if(this.grabbingStack.length === 0){
                    const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward), (mesh) => mesh.isPickable)
                    if(info) scene._inputManager.simulatePointerUp(info, PT)
                }
            }
        )

        target.addBehavior(this.grab)
        
        this.pointer_up = InputManager.getInstance().onTriggerUp.add(e=>{
            
        })

        this.move = new InputMoveOverBehavior(
            pointer=>{
                this.hoveringStack.push(pointer)
                this.updateCurrentMovingPointer()
            },
            _=>{},
            pointer=>{
                this.hoveringStack = this.hoveringStack.filter(it=> it !== pointer)
                this.updateCurrentMovingPointer()
            },
        )
        target.addBehavior(this.move)
    }

    // POINTER MOVE LOGIC //
    private current_moving_pointer: PointerInput | null = null

    private updateCurrentMovingPointer(){
        const scene = this.attachedNode.getScene()

        this.disposeCurrentMovingPointer()

        // If some pointer is grabbing, take the last grabbing pointer
        if(this.grabbingStack.length>0) this.current_moving_pointer = this.grabbingStack[this.grabbingStack.length-1]
        // If no pointer is pressing, take the last hovering pointer
        else if(this.hoveringStack.length>0) this.current_moving_pointer = this.hoveringStack[this.hoveringStack.length-1]
        else this.current_moving_pointer = null

        // Add observers
        if(this.current_moving_pointer!=null){
            const o = this.current_moving_pointer.onMove.add(pointer=>{
                const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward), (mesh) => mesh.isPickable)
                if(info) scene._inputManager.simulatePointerMove(info, PT)
            })

            this.disposeCurrentMovingPointer = ()=>{
                o.remove()
                this.disposeCurrentMovingPointer = ()=>{}
            }
        }
    }

    private disposeCurrentMovingPointer = ()=>{}


    detach(): void {
        if(this.grab) this.attachedNode.removeBehavior(this.grab)
        if(this.move) this.attachedNode.removeBehavior(this.move)
        if(this.pointer_up) this.pointer_up.remove()
        this.disposeCurrentMovingPointer()
    }

    // React to state changes

}

