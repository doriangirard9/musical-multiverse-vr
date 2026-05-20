import { AbstractMesh, Behavior, Ray } from "@babylonjs/core";
import { InputMultiPressBehavior } from "./InputMultiPressBehavior";
import { PointerInput } from "../PointerInput";
import { InputMoveOverBehavior } from "./InputMoveOverBehavior";
import { ControllerInput } from "../ControllerInput";


const PT: PointerEventInit = { pointerId: 432521 }

/**
 * A behavior that simulates pointer events on the target mesh based on the pointing direction of the input pointers.
 * This way:
 * - If the target is pressed on for the first time, it will simulate a pointer down event on the target.
 * - If the target is released by all pointers, it will simulate a pointer up event on the target.
 * - If the target is pressed on by pointers, the last pointer to pressed will be emit pointer move events.
 * - If no pointer is pressing on the target, but one or more pointers are hovering the target, the last pointer to hover will be emit pointer move events.
 */
export class InputToPointerBehavior implements Behavior<AbstractMesh> {

    name = "InputToPointerBehavior"

    private target!: AbstractMesh
    private press!: InputMultiPressBehavior
    private move!: InputMoveOverBehavior

    private hoveringStack =  [] as PointerInput[]
    private pressingStack =  [] as ControllerInput[]

    init(): void { }

    attach(target: AbstractMesh): void {

        this.target = target

        const scene = target.getScene()

        this.press = new InputMultiPressBehavior(
            input=>{
                this.pressingStack.push(input)
                if(this.pressingStack.length === 1){
                    const info = scene.pickWithRay(new Ray(input.pointer.origin, input.pointer.forward))
                    if(info) scene._inputManager.simulatePointerDown(info, PT)
                }
            },
            input=>{
                this.pressingStack = this.pressingStack.filter(it=> it !== input)
                if(this.pressingStack.length === 0){
                    const info = scene.pickWithRay(new Ray(input.pointer.origin, input.pointer.forward))
                    if(info) scene._inputManager.simulatePointerUp(info, PT)
                }
            },
        )
        target.addBehavior(this.press)

        const checkIfIsActualPointer = (input: PointerInput)=>{
            console.log("Check if is actual pointer. Pressing stack:", this.pressingStack.length, "Hovering stack:", this.hoveringStack.length)
            // If some pointer is pressing take, the last pressing pointer
            if(this.pressingStack.length>0) if(this.pressingStack[this.pressingStack.length-1].pointer === input) return true
            // If no pointer is pressing, take the last hovering pointer
            if(this.hoveringStack.length>0) if(this.hoveringStack[this.hoveringStack.length-1] === input) return true
            return false
        }

        this.move = new InputMoveOverBehavior(
            pointer=>{
                this.hoveringStack.push(pointer)
                if(checkIfIsActualPointer(pointer)){
                    const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward))
                    if(info) scene._inputManager.simulatePointerMove(info, PT)
                }
            },
            pointer=>{
                if(checkIfIsActualPointer(pointer)){
                    const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward))
                    if(info) scene._inputManager.simulatePointerMove(info, PT)
                }
            },
            pointer=>{
                if(checkIfIsActualPointer(pointer)){
                    const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward))
                    if(info) scene._inputManager.simulatePointerMove(info, PT)
                }
                this.hoveringStack = this.hoveringStack.filter(it=> it !== pointer)
            },
        )
        target.addBehavior(this.move)
    }

    detach(): void {
        if(this.press) this.target.removeBehavior(this.press)
        if(this.move) this.target.removeBehavior(this.move)
    }

    // React to state changes

}

