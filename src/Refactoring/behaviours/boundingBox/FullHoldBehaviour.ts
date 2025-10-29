import { Behavior, TransformNode } from "@babylonjs/core";
import { InputManager } from "../../xr/inputs/InputManager";
import { MoveHoldBehaviour } from "./MoveHoldBehaviour";
import { RotateHoldBehaviour } from "./RotateHoldBehaviour";

/**
 * A mix of MoveHoldBehaviour and RotateHoldBehaviour.
 * 
 * An object attached to this behavior will be moved around by the user with his controller.
 * The user can drag the object around, and move it forward and backward.
 * The object will rotate when dragged and will keep its orientation relative to the controller's direction.
 * Using the left thumbstick, the user can move the object forward and backward.
 * 
 * When the squeeze button is pressed, the object will be rotated instead of moved.
 * The user can also rotate the object with the left thumbstick.
 */
export class FullHoldBehaviour implements Behavior<TransformNode> {
  
    name = FullHoldBehaviour.name

    on_move: () => void = () => {}
    on_rotate: () => void = () => {}

    constructor(){}

    private target!: TransformNode
    private disposables: {remove():void}[] = []

    init(): void {}


    attach(target: TransformNode): void {
        this.target = target

        const inputs = InputManager.getInstance()

        // Switch mode
        this.rotate = inputs.right_squeeze.isPressed()
        this.disposables.push(
            inputs.right_squeeze.on_down.add(()=>{
                this.rotate = true
                this.update()
            }),
            inputs.right_squeeze.on_up.add(()=>{
                this.rotate = false
                this.update()
            }),
        )

        this.update()

    }

    detach(){
        this.disposables.forEach(it=> it.remove())
        this.disposables.length = 0
        if(this.holdBehavior) this.target.removeBehavior(this.holdBehavior)
        this.holdBehavior = undefined
    }
    
    private rotate = false

    private holdBehavior?: MoveHoldBehaviour|RotateHoldBehaviour

    private update(){
        // RotateBehavior : rotate
        if(this.rotate){
            if(!this.holdBehavior || !(this.holdBehavior instanceof RotateHoldBehaviour)){
                if(this.holdBehavior) this.target.removeBehavior(this.holdBehavior)
                this.holdBehavior = new RotateHoldBehaviour()
                this.holdBehavior.on_rotate = ()=> this.on_rotate()
                this.target.addBehavior(this.holdBehavior)
            }
        }
        // HoldBehavior : move
        else {
            if(!this.holdBehavior || !(this.holdBehavior instanceof MoveHoldBehaviour)){
                if(this.holdBehavior) this.target.removeBehavior(this.holdBehavior)
                this.holdBehavior = new MoveHoldBehaviour()
                this.holdBehavior.on_move = ()=> this.on_move()
                this.target.addBehavior(this.holdBehavior)
            }
        }
    }

}