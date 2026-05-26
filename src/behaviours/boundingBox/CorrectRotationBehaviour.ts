import { AbstractMesh, Behavior, Observer, Quaternion, Vector3 } from "@babylonjs/core"
import { QuaternionUtils } from "../../utils/quaternion"




/**
 * Softly corrects the rotation of an objets so it's left vector is parallel to the ground.
 */
export class RotationCorrectionBehaviour implements Behavior<AbstractMesh> {
  
    get name(){ return this.constructor.name }

    constructor(){}

    init(): void {}

    target!: AbstractMesh
    observer!: Observer<any>

    attach(target: AbstractMesh): void {
        this.detach()
        this.target = target
        this.observer = this.target.getScene().onAfterPhysicsObservable.add(()=>{
            const rotation = QuaternionUtils.getAbsolute(this.target)
            const left = Vector3.Left().rotateByQuaternionToRef(rotation, new Vector3())
            const target_left = new Vector3(left.x, 0, left.z).normalize()
            const rotation_to_apply = Quaternion.FromUnitVectorsToRef(left, target_left, new Quaternion())
            const softened_rotation = Quaternion.Slerp(Quaternion.Identity(), rotation_to_apply, 0.1)

            this.target.rotationQuaternion = softened_rotation.multiply(this.target.rotationQuaternion!)
        })
    }

    detach(){
        if(this.observer) this.target.getScene().onAfterPhysicsObservable.remove(this.observer)
    }
}