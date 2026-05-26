import { Behavior, Matrix, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import { InputManager } from "../../xr/inputs/InputManager";
import { PointerInput } from "../../xr/inputs/PointerInput";

/**
 * An object attached to this behavior will be rotated by the user with his controller.
 * The user can rotate the object by rotating their hand.
 * The object will rotate to match the controller's direction.
 * Using the right thumbstick, the user can rotate the object around its local axes.
 */
export class RotateHoldBehaviour implements Behavior<TransformNode> {
  
  get name (){ return this.constructor.name }

  target!: TransformNode
  oldRotation?: Quaternion

  on_rotate: () => void = () => {}

  pointerInfo?: {forward: Vector3, up: Vector3, right: Vector3, origin: Vector3}

  constructor(readonly pointer: PointerInput){}

  init(): void {}

  attach(target: TransformNode): void {
    this.target = target

    const inputs = InputManager.getInstance()

    inputs.movement.stackDisable()

    const o = this.pointer.onMove.add(() => {
      const new_pointer = {
        forward: this.pointer.forward.clone(),
        up: this.pointer.up.clone(),
        right: this.pointer.right.clone(),
        origin: this.pointer.origin.clone()
      }
      if(!this.pointerInfo) this.pointerInfo = new_pointer
      if(this.pointerInfo.forward.equals(new_pointer.forward) && this.pointerInfo.origin.equals(new_pointer.origin)) return // Ignore if ray didn't change
      this.pointerInfo = new_pointer

      
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

    // Rotate with RIGHT thumbstick
    let power = 4
    const o2 = inputs.right.thumbstick.setPullInterval(20,
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
      inputs.movement.stackEnable()
    }

  }

  detach!: () => void

  rotate(x: number, y: number){
    const pointer = this.pointer

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