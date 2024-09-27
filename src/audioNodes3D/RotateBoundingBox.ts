import * as B from "@babylonjs/core";
import {App} from "../App";

export class RotateBoundingBox implements B.Behavior<B.AbstractMesh> {
    name = "RotateBoundingBox";
    private _isSqueezePressed: boolean = false;
    private _selectedMesh: B.AbstractMesh | null = null;
    private _observer: B.Nullable<B.Observer<B.Scene>> = null;

    constructor(private app: App) {
    }

    init(): void {
        this.logRed("RotateBoundingBox init");

    }

    select(target: B.AbstractMesh): void {
        this.logRed("RotateBoundingBox select");
        this._selectedMesh = target;

        this.logRed("Mesh initial euler: " + this._selectedMesh.rotation.toString());
        this._selectedMesh.visibility = 0.5;
    }

    attach(): void {
        this.logRed("RotateBoundingBox attach");
        this.onSqueezePressed();

    }

    detach(): void {
        this.logRed("RotateBoundingBox detach");

        // Reset visibility of the selected mesh
        if (this._selectedMesh) {
            this._selectedMesh.visibility = 0;
        }
        this.onSqueezeReleased();


    }

    public onSqueezePressed(): void {
        const controller = this.app.xrManager.xrInputManager.rightController;
        if (!controller) {
            return;
        }
        this._isSqueezePressed = true;
        this._selectMeshUnderController(controller);
    }

    public onSqueezeReleased(): void {
        this._isSqueezePressed = false;
        this._selectedMesh = null;

        if (this._observer) {
            this.app.scene.onBeforeRenderObservable.remove(this._observer);
            this._observer = null;
        }
    }

    logRed(msg: string): void {
        console.log("%c" + msg, "color:red");
    }

    private _selectMeshUnderController(controller: B.WebXRInputSource): void {
        const ray = new B.Ray(controller.pointer.position, controller.pointer.forward, 100);
        const pickResult = this.app.scene.pickWithRay(ray);

        if (pickResult?.hit && pickResult.pickedMesh && pickResult.pickedMesh.name.startsWith("boundingBox")) {
            this.select(pickResult.pickedMesh);
            this._startRotation(controller);
        }
    }

    private _startRotation(controller: B.WebXRInputSource): void {
        if (this._selectedMesh) {
            let initialControllerRotationQuaternion: B.Quaternion | undefined;
            let initialMeshRotationQuaternion: B.Quaternion | undefined;
            let targetMeshRotationQuaternion: B.Quaternion | undefined;
            const smoothingFactor = 0.3; // Ajustez cette valeur entre 0 et 1 pour contrôler le lissage
            const sensitivity = 0.7; // Ajustez cette valeur pour contrôler la sensibilité

            let previousMeshEulerRotation: B.Vector3 | undefined;

            this._observer = this.app.scene.onBeforeRenderObservable.add(() => {
                if (this._isSqueezePressed && controller.grip) {
                    if (!controller.grip.rotationQuaternion) {
                        return;
                    }

                    const controllerRotationQuaternion = controller.grip.rotationQuaternion.clone();

                    if (!initialControllerRotationQuaternion) {
                        initialControllerRotationQuaternion = controllerRotationQuaternion.clone();
                        initialMeshRotationQuaternion = B.Quaternion.FromEulerVector(this._selectedMesh!.rotation);
                        targetMeshRotationQuaternion = initialMeshRotationQuaternion.clone();
                        previousMeshEulerRotation = this._selectedMesh!.rotation.clone();
                        return;
                    }

                    const deltaRotationQuaternion = controllerRotationQuaternion.multiply(B.Quaternion.Inverse(initialControllerRotationQuaternion));
                    const adjustedDeltaRotationQuaternion = B.Quaternion.Slerp(B.Quaternion.Identity(), deltaRotationQuaternion, sensitivity);

                    targetMeshRotationQuaternion = adjustedDeltaRotationQuaternion.multiply(initialMeshRotationQuaternion!);

                    const currentMeshRotationQuaternion = B.Quaternion.FromEulerVector(this._selectedMesh!.rotation);
                    const newMeshRotationQuaternion = B.Quaternion.Slerp(
                        currentMeshRotationQuaternion,
                        targetMeshRotationQuaternion,
                        smoothingFactor
                    );

                    let newMeshRotationEuler = this._quaternionToEuler(newMeshRotationQuaternion, previousMeshEulerRotation);
                    this._selectedMesh!.rotation.copyFrom(newMeshRotationEuler);
                    previousMeshEulerRotation = newMeshRotationEuler.clone();
                } else {
                    initialControllerRotationQuaternion = undefined;
                    initialMeshRotationQuaternion = undefined;
                    targetMeshRotationQuaternion = undefined;
                    previousMeshEulerRotation = undefined;
                    if (this._observer) {
                        this.app.scene.onBeforeRenderObservable.remove(this._observer);
                        this._observer = null;
                    }
                }
            });
        }
    }

    private _quaternionToEuler(q: B.Quaternion, previousEuler: B.Vector3 | undefined): B.Vector3 {
        let currentEuler = q.toEulerAngles();

        if (previousEuler) {
            currentEuler = this._ensureEulerContinuity(previousEuler, currentEuler);
        }

        return currentEuler;
    }

    private _ensureEulerContinuity(previous: B.Vector3, current: B.Vector3): B.Vector3 {
        const unwrapped = current.clone();

        unwrapped.x = this._closestAngle(previous.x, current.x);
        unwrapped.y = this._closestAngle(previous.y, current.y);
        unwrapped.z = this._closestAngle(previous.z, current.z);

        return unwrapped;
    }

    private _closestAngle(previous: number, current: number): number {
        const twoPi = 2 * Math.PI;
        let delta = current - previous;

        if (delta > Math.PI) {
            current -= twoPi;
        } else if (delta < -Math.PI) {
            current += twoPi;
        }

        return current;
    }
}
