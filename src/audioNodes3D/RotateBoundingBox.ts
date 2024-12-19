import * as B from "@babylonjs/core";
import {App} from "../App";
import {AudioEventBus} from "../AudioEvents.ts";
import {NodeTransform} from "./types.ts";

export class RotateBoundingBox implements B.Behavior<B.AbstractMesh> {
    name = "RotateBoundingBox";
    private _isSqueezePressed: boolean = false;
    private _selectedMesh: B.AbstractMesh | null = null;
    private _observer: B.Nullable<B.Observer<B.Scene>> = null;
    private _eventBus = AudioEventBus.getInstance();
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
            const smoothingFactor = 0.3;
            const sensitivity = 0.7;

            let previousMeshEulerRotation: B.Vector3 | undefined;
            let lastEmittedTransform: NodeTransform | undefined;

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

                    if(this._selectedMesh) {
                        const currentTransform: NodeTransform = {
                            position: {
                                x: this._selectedMesh.position.x,
                                y: this._selectedMesh.position.y,
                                z: this._selectedMesh.position.z
                            },
                            rotation: {
                                x: this._selectedMesh.rotation.x,
                                y: this._selectedMesh.rotation.y,
                                z: this._selectedMesh.rotation.z
                            }
                        };

                        if (this._hasSignificantChange(currentTransform, lastEmittedTransform)) {
                            this._eventBus.emit('POSITION_CHANGE', {
                                nodeId: this._selectedMesh.id.split('boundingBox')[1],
                                position: currentTransform.position,
                                rotation: currentTransform.rotation,
                                source: 'user'
                            });
                            lastEmittedTransform = { ...currentTransform };
                        }
                    }
                } else {
                    initialControllerRotationQuaternion = undefined;
                    initialMeshRotationQuaternion = undefined;
                    targetMeshRotationQuaternion = undefined;
                    previousMeshEulerRotation = undefined;
                    lastEmittedTransform = undefined;
                    if (this._observer) {
                        this.app.scene.onBeforeRenderObservable.remove(this._observer);
                        this._observer = null;
                    }
                }
            });
        }
    }

    private _hasSignificantChange(current: NodeTransform, last?: NodeTransform): boolean {
        if (!last) return true;

        const threshold = 0.05;

        return Math.abs(current.position.x - last.position.x) > threshold ||
            Math.abs(current.position.y - last.position.y) > threshold ||
            Math.abs(current.position.z - last.position.z) > threshold ||
            Math.abs(current.rotation.x - last.rotation.x) > threshold ||
            Math.abs(current.rotation.y - last.rotation.y) > threshold ||
            Math.abs(current.rotation.z - last.rotation.z) > threshold;
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
