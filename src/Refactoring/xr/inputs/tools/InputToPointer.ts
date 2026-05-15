import { AbstractMesh, Behavior, Observer, Ray } from "@babylonjs/core";
import { InputMultiPressBehavior } from "./InputMultiPressBehavior";
import { PointerInput } from "../PointerInput";
import { InputMultiHoverBehavior } from "./InputMultiHoverBehavior";
import { InputMoveOverBehavior } from "./InputMoveOverBehavior";


export class InputToPointerBehavior implements Behavior<AbstractMesh> {

    name = "InputToPointerBehavior"


    private target!: AbstractMesh
    private press!: InputMultiPressBehavior
    private move!: InputMoveOverBehavior

    init(): void { }


    private map = new Map<PointerInput, number>()

    getPointerId(pointer: PointerInput){
        if(!this.map.has(pointer)) {
            this.map.set(pointer, this.map.size+1)
        }
        return this.map.get(pointer)!!
    }

    attach(target: AbstractMesh): void {
        this.target = target

        const scene = target.getScene()

        this.press = new InputMultiPressBehavior(
            input=>{
                const info = scene.pickWithRay(new Ray(input.pointer.origin, input.pointer.forward))
                if(info) scene._inputManager.simulatePointerDown(info, {pointerId: this.getPointerId(input.pointer)})
            },
            input=>{
                const info = scene.pickWithRay(new Ray(input.pointer.origin, input.pointer.forward))
                if(info) scene._inputManager.simulatePointerUp(info, {pointerId: this.getPointerId(input.pointer)})
            },
        )
        target.addBehavior(this.press)

        this.move = new InputMoveOverBehavior(
            pointer=>{
                const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward))
                if(info) scene._inputManager.simulatePointerMove(info, {pointerId: this.getPointerId(pointer)})
            },
            pointer=>{
                const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward))
                if(info) scene._inputManager.simulatePointerMove(info, {pointerId: this.getPointerId(pointer)})
            },
            pointer=>{
                const info = scene.pickWithRay(new Ray(pointer.origin, pointer.forward))
                if(info) scene._inputManager.simulatePointerMove(info, {pointerId: this.getPointerId(pointer)})
            },
        )
        target.addBehavior(this.move)
    }

    detach(): void {
        if(this.press) this.target.removeBehavior(this.press)
        if(this.move) this.target.removeBehavior(this.move)
    }
}

