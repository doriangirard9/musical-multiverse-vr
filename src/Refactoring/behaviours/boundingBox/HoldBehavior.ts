import { Behavior, Quaternion, Ray, TransformNode, Vector3 } from "@babylonjs/core";
import { InputManager } from "../../xr/inputs/InputManager";

/**
 * An object attached to this behavior will be moved around by the user with his controller.
 * The user can drag the object around, and move it forward and backward.
 * The object will rotate when dragged and will keep its orientation relative to the controller's direction.
 * Using the left thumbstick, the user can move the object forward and backward.
 */
export class HoldBehaviour implements Behavior<TransformNode> {
  
  name = "HoldBehaviour"
  distance = 5
  target!: TransformNode
  ray!: Ray
  oldRotation?: Quaternion

  constructor(){}

  init(): void {}

  attach(target: TransformNode): void {
    this.target = target

    const inputs = InputManager.getInstance()

    // Move around by dragging
    const o = inputs.pointer_move.add(event => {
      this.ray = event.ray
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
    const {origin,direction} = this.ray
    const position = direction.clone() .scaleInPlace(this.distance) .addInPlace(origin)
    this.target.position.copyFrom(position)

    const newRotation = Quaternion.FromUnitVectorsToRef(Vector3.Forward(), direction.normalizeToNew(), new Quaternion())
    if(this.oldRotation){
      const delta = this.oldRotation.conjugate().multiply(newRotation)
      this.target.rotationQuaternion = null
      this.target.rotation = delta.multiply(this.target.rotation.toQuaternion()).toEulerAngles()
    }
    this.oldRotation = newRotation
  }

}