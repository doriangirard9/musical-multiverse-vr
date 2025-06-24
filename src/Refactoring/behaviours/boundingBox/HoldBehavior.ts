import { Behavior, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import { InputManager, PointerMovementEvent } from "../../xr/inputs/InputManager";

/**
 * An object attached to this behavior will be moved around by the user with his controller.
 * The user can drag the object around, and move it forward and backward.
 * The object will rotate when dragged and will keep its orientation relative to the controller's direction.
 * Using the left thumbstick, the user can move the object forward and backward.
 */
export class HoldBehaviour implements Behavior<TransformNode> {
  
  name = "HoldBehaviour"
  distance = -100
  right_distance = 0
  top_distance = 0
  target!: TransformNode
  pointer?: PointerMovementEvent
  oldRotation?: Quaternion

  on_move: () => void = () => {}

  constructor(){}

  init(): void {}

  attach(target: TransformNode): void {
    this.target = target

    const inputs = InputManager.getInstance()

    // Move around by dragging
    const o = inputs.pointer_move.add(new_pointer => {
      this.pointer = new_pointer
      this.updatePos()
    })

    // Move forward and backward
    const o2 = inputs.left_thumbstick.setPullInterval(50, (_,y)=>{
      this.distance += y/4
      if(this.distance < 1) this.distance = 1 // Prevent negative distance
      this.updatePos()
    })

    this.detach = ()=>{
      o.remove()
      o2.remove()
    }

  }

  detach!: () => void

  updatePos(){
    if(!this.pointer) return // Ensure ray is initialized

    const {origin, forward, up, right} = this.pointer

    // Set initial distance
    if(this.distance<0){
      // Start with the distance the target already have with the pointer
      this.distance = this.pointer.origin.subtract(this.target.position).length()
      const next_position = forward.clone().scaleInPlace(this.distance).addInPlace(origin)
      // Dont teleport the target instantly so it is centered on the pointer but keep the same offset
      this.right_distance = -next_position.subtract(this.target.position).dot(right)
      this.top_distance = -next_position.subtract(this.target.position).dot(up)
    }

    const position = forward.clone() .scaleInPlace(this.distance) .addInPlace(origin)
      .addInPlace(right.scale(this.right_distance))
      .addInPlace(up.scale(this.top_distance))
    this.target.position.copyFrom(position)

    const newRotation = Quaternion.FromLookDirectionRH(forward, up.negate())
    if(this.oldRotation){
      const delta = this.oldRotation.conjugate().multiply(newRotation)
      this.target.rotationQuaternion = null
      this.target.rotation = delta.multiply(this.target.rotation.toQuaternion()).toEulerAngles()
    }
    this.oldRotation = newRotation
    this.on_move()
  }

}