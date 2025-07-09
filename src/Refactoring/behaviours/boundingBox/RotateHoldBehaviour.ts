import { Behavior, Matrix, Quaternion, Space, TransformNode, Vector3 } from "@babylonjs/core";
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

    console.log("Register event")
    const o = inputs.pointer_move.add(new_pointer => {
            console.log("Rotate1")
      if(!this.pointer)this.pointer = new_pointer // Initialize pointer if not set yet
      if(this.pointer.forward.equals(new_pointer.forward) && this.pointer.origin.equals(new_pointer.origin)) return // Ignore if ray didn't change
      this.pointer = new_pointer

      console.log("Rotate")
      
      // Rotate by rotating hand
      const newRotation = Quaternion.FromLookDirectionRH(new_pointer.forward, new_pointer.up)
      if(this.oldRotation){
        let delta = newRotation.multiply(this.oldRotation.conjugate())
        delta = delta.multiply(delta)
        setAbsoluteRotation(this.target, delta.multiply(getAbsoluteRotation(this.target)))
      }
      this.oldRotation = newRotation
      this.on_rotate()

    })

    // Rotate with left thumbstick
    let power = 4
    const o2 = inputs.left_thumbstick.setPullInterval(20,
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

    setAbsoluteRotation(this.target, rotation.multiply(getAbsoluteRotation(this.target)))
    this.on_rotate()
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