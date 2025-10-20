import { Behavior, Matrix, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import { InputManager } from "../../xr/inputs/InputManager";

/**
 * An object attached to this behavior will be moved around by the user with his controller.
 * The user can drag the object around, and move it forward and backward.
 * The object will rotate when dragged and will keep its orientation relative to the controller's direction.
 * Using the left thumbstick, the user can move the object forward and backward.
 */
export class MoveHoldBehaviour implements Behavior<TransformNode> {
  
  name = MoveHoldBehaviour.name
  distance = -100
  right_distance = 0
  top_distance = 0
  target!: TransformNode
  oldRotation?: Quaternion

  on_move: () => void = () => {}

  constructor(){}

  init(): void {}

  attach(target: TransformNode): void {
    this.target = target

    const inputs = InputManager.getInstance()

    // Move around by dragging
    const o = inputs.pointer_move.add(() => this.updatePos())
    this.updatePos()

    // Move forward and backward
    let power = 1 
    const o2 = inputs.left_thumbstick.setPullInterval(50,
      (_,y)=>{
        power += 0.1
        this.distance += y/4*power
        if(this.distance < 1) this.distance = 1 // Prevent negative distance
        this.updatePos()
      },
      ()=>{
        power = 1
      }
    )

    this.detach = ()=>{
      o.remove()
      o2.remove()
    }

  }

  detach!: () => void

  updatePos(){
    const pointer = InputManager.getInstance().current_pointer

    const {origin, forward, up, right} = pointer

    // Set initial distance
    if(this.distance<0){
      // Start with the distance the target already have with the pointer
      this.distance = pointer.origin.subtract(this.target.absolutePosition).length()
      const next_position = forward.clone().scaleInPlace(this.distance).addInPlace(origin)
      // Dont teleport the target instantly so it is centered on the pointer but keep the same offset
      this.right_distance = -next_position.subtract(this.target.absolutePosition).dot(right)
      this.top_distance = -next_position.subtract(this.target.absolutePosition).dot(up)
    }

    // Move
    const position = forward.clone() .scaleInPlace(this.distance) .addInPlace(origin)
      .addInPlace(right.scale(this.right_distance))
      .addInPlace(up.scale(this.top_distance))
    this.target.setAbsolutePosition(position)

    // Rotate
    const newRotation = Quaternion.FromLookDirectionRH(forward, up)
    if(this.oldRotation){
      const delta = newRotation.multiply(this.oldRotation.conjugate())
      setAbsoluteRotation(this.target, delta.multiply(getAbsoluteRotation(this.target)))
    }
    this.oldRotation = newRotation
    this.on_move()
  }

}

function getAbsoluteRotation(transform: TransformNode): Quaternion {
  transform.computeWorldMatrix(true);
  const worldMatrix = transform.getWorldMatrix();
  const rotMatrix = new Matrix();
  worldMatrix.getRotationMatrixToRef(rotMatrix);
  return Quaternion.FromRotationMatrix(rotMatrix);
}

function setAbsoluteRotation(transform: TransformNode, worldQuat: Quaternion): void {
  let parentQuat = Quaternion.Identity();
  if (transform.parent) {
    const parentMatrix = transform.parent.getWorldMatrix();
    const parentRotMatrix = new Matrix();
    parentMatrix.decompose()
    parentMatrix.getRotationMatrixToRef(parentRotMatrix);
    parentQuat = Quaternion.FromRotationMatrix(parentRotMatrix);
  }

  const localQuat = parentQuat.invert().multiply(worldQuat);
  transform.rotationQuaternion = localQuat; // utiliser rotationQuaternion pour stabilité
}
