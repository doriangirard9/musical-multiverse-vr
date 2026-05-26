import { Matrix, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";

export const QuaternionUtils = {

    RotationAround(quaternion: Quaternion, axis: Vector3): number {
        const axisNormalized = axis.normalize();
        
        // Projet la composante de rotation du quaternion sur l'axe
        const quatAxisVec = new Vector3(quaternion.x, quaternion.y, quaternion.z);
        const projectedMagnitude = Vector3.Dot(quatAxisVec, axisNormalized);
        
        // Calcule l'angle de rotation autour de cet axe
        const angle = 2 * Math.atan2(projectedMagnitude, quaternion.w);
        
        return angle;
    },

    /**
     * Get the absolute rotation of a transform node as a quaternion, and set the absolute rotation of a transform node with a quaternion.
     * @param transform The transform node to get or set the absolute rotation from/to.
     * @returns 
     */
    getAbsolute(transform: TransformNode): Quaternion {
      transform.computeWorldMatrix(true);
      const worldMatrix = transform.getWorldMatrix();
      const rotMatrix = new Matrix();
      worldMatrix.getRotationMatrixToRef(rotMatrix);
      return Quaternion.FromRotationMatrix(rotMatrix);
    },
    
    /**
     * Get the absolute rotation of a transform node as a quaternion, and set the absolute rotation of a transform node with a quaternion.
     * @param transform The transform node to get or set the absolute rotation from/to.
     * @param worldQuat 
     */
    setAbsolute(transform: TransformNode, worldQuat: Quaternion): void {
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
    },
}