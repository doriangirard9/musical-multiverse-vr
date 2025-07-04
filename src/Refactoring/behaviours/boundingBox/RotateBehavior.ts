import { Behavior, Quaternion, Space, TransformNode, Vector3 } from "@babylonjs/core";
import { InputManager, PointerMovementEvent } from "../../xr/inputs/InputManager";

/**
 * An object attached to this behavior will be rotated by the user with his controller.
 * The user can rotate the object by rotating their hand.
 * The object will rotate to match the controller's direction.
 * Using the left thumbstick, the user can rotate the object around its local axes.
 */
export class RotateBehaviour implements Behavior<TransformNode> {
  
  name = "RotateBehaviour"
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
    const side = this.pointer.forward.applyRotationQuaternion(Quaternion.FromEulerAngles(0, Math.PI/2, 0))
    this.target.rotate(Vector3.Up(), x * 0.01, Space.WORLD)
    this.target.rotate(side, y * 0.01, Space.WORLD)
    this.target.rotation = this.target.rotationQuaternion!!.toEulerAngles()
    this.target.rotationQuaternion = null
    this.on_rotate()
  }

}