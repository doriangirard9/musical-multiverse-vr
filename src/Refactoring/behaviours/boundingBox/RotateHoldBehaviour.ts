import { Behavior, Quaternion, Space, TransformNode, Vector3 } from "@babylonjs/core";
import { InputManager, PointerMovementEvent } from "../../xr/inputs/InputManager";

/**
 * An object attached to this behavior will be rotated by the user with his controller.
 * The user can rotate the object by rotating their hand.
 * The object will rotate to match the controller's direction.
 * Using the left thumbstick, the user can rotate the object around its local axes.
 */
export class RotateHoldBehaviour implements Behavior<TransformNode> {
  
  name = RotateHoldBehaviour.name

  target!: TransformNode
  pointer!: PointerMovementEvent
  oldRotation?: Quaternion

  on_rotate: () => void = () => {}

  constructor(){}

  init(): void {}

  attach(target: TransformNode): void {
    this.target = target

    const inputs = InputManager.getInstance()

    const o = inputs.pointer_move.add(new_pointer => {
      if(!this.pointer)this.pointer = new_pointer // Initialize pointer if not set yet
      if(this.pointer.forward.equals(new_pointer.forward) && this.pointer.origin.equals(new_pointer.origin)) return // Ignore if ray didn't change
      this.pointer = new_pointer
      
      // Rotate by rotating hand
      const newRotation = Quaternion.FromUnitVectorsToRef(Vector3.Forward(), this.pointer.forward.normalizeToNew(), new Quaternion())
      if(this.oldRotation){
        const delta = this.oldRotation.conjugate().multiply(newRotation).scale(2)
        this.target.rotationQuaternion = null
        this.target.rotation = delta.multiply(this.target.rotation.toQuaternion()).toEulerAngles()
      }
      this.oldRotation = newRotation
      this.on_rotate()

    })

    // Rotate with left thumbstick
    let power = 4
    const o2 = inputs.left_thumbstick.setPullInterval(50,
      (x,y)=>{
        this.rotate(-x*power,y*power)
        power+=0.2
      },
      ()=>{
        power = 4
      }
    )

    this.detach = ()=>{
      o.remove()
      o2.remove()
    }

  }

  detach!: () => void

  rotate(x: number, y: number){
    const pointer = InputManager.getInstance().current_pointer

    const rotate_x = Quaternion.RotationAxis(pointer.up, x/50)
    const rotate_y = Quaternion.RotationAxis(pointer.right, y/50)
    const rotation = rotate_y.multiplyInPlace(rotate_x)

    this.target.rotationQuaternion = null
    this.target.rotation = rotation.multiply(this.target.rotation.toQuaternion()).toEulerAngles()
    this.on_rotate()
  }

}