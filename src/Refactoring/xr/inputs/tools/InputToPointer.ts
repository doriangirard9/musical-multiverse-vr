import { AbstractMesh, Behavior, Observer, Ray } from "@babylonjs/core";
import { InputPressBehavior } from "./InputPressBehavior";


export class InputToPointerBehavior implements Behavior<AbstractMesh> {

    name = "InputToPointerBehavior"


    private target!: AbstractMesh
    private press!: InputPressBehavior
    private move!: Observer<any>

    init(): void { }

    attach(target: AbstractMesh): void {
        this.target = target

        const scene = target.getScene()

        this.press = new InputPressBehavior(
            input=>{
                const info = scene.pickWithRay(new Ray(input.pointer.origin, input.pointer.forward))
                if(info) scene._inputManager.simulatePointerDown(info)
            },
            input=>{
                const info = scene.pickWithRay(new Ray(input.pointer.origin, input.pointer.forward))
                if(info) scene._inputManager.simulatePointerUp(info)
            },
        )
        target.addBehavior(this.press)
    }

    detach(): void {
        if(this.press) this.target.removeBehavior(this.press)
    }
}

