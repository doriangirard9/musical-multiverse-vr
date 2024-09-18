import * as B from "@babylonjs/core";
import {App} from "../App";
export class RotateBoundingBox implements B.Behavior<B.AbstractMesh> {
    name = "RotateBoundingBox";
    private _isSqueezePressed: boolean = false;
    private _selectedMesh: B.AbstractMesh | null = null;
    private _observer: B.Nullable<B.Observer<B.Scene>> = null;
    //private _controllerObserver: B.Nullable<B.Observer<any>> = null; // To store controller button event observer
    private _initialControllerRotation: B.Nullable<B.Vector3> = null;
    private _initialMeshRotation: B.Nullable<B.Vector3> = null;

    constructor(private app: App) {}

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

        // Clear internal state related to rotation and mesh



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
        this._initialControllerRotation = null;
        this._initialMeshRotation = null;
        this._selectedMesh = null;

        if (this._observer) {
            this.app.scene.onBeforeRenderObservable.remove(this._observer);
            this._observer = null;
        }
    }

    private _selectMeshUnderController(controller: B.WebXRInputSource): void {
        const ray = new B.Ray(controller.pointer.position, controller.pointer.forward, 100); // Ray length of 100 units
        const pickResult = this.app.scene.pickWithRay(ray);

        if (pickResult?.hit && pickResult.pickedMesh && pickResult.pickedMesh.name.startsWith("boundingBox")) {
            this.select(pickResult.pickedMesh);
            this._startRotation(controller); // Start rotating the selected mesh
        }
    }
    private _startRotation(controller: B.WebXRInputSource): void {
        if (this._selectedMesh) {
            console.log(this._selectedMesh.name);

            // Add the observer and store it in the class-level variable
            this._observer = this.app.scene.onBeforeRenderObservable.add(() => {
                if (this._isSqueezePressed && controller.grip) {
                    if (!this._initialControllerRotation) {
                        if (controller.grip.rotationQuaternion) {
                            // Convert the controller's rotation quaternion to Euler angles
                            this._initialControllerRotation = controller.grip.rotationQuaternion.toEulerAngles().clone();
                        }

                        if (this._selectedMesh) {
                                // Use the mesh's existing Euler rotation
                                this._initialMeshRotation = this._selectedMesh.rotation.clone();
                        } else {
                            // Default to zero rotation if no initial rotation is found
                            this._initialMeshRotation = new B.Vector3(0, 0, 0);
                        }
                        return;  // Skip the first frame to avoid sudden jumps
                    }

                    if (this._initialControllerRotation && this._initialMeshRotation) {
                        const currentControllerRotationQuaternion = controller.grip.rotationQuaternion!.clone();
                        // Convert the current controller rotation to Euler angles
                        const currentControllerRotation = currentControllerRotationQuaternion.toEulerAngles();

                        // Calculate the delta rotation by subtracting the initial controller rotation from the current rotation
                        const deltaRotation = currentControllerRotation.subtract(this._initialControllerRotation);

                        if (this._selectedMesh) {
                            // Apply the delta rotation to the initial mesh rotation
                            this._selectedMesh.rotation = this._initialMeshRotation.add(deltaRotation);
                        }
                    }
                } else {
                    this._initialControllerRotation = null;
                    this._initialMeshRotation = null;

                    // Remove the observer when the squeeze button is released
                    if (this._observer) {
                        this.app.scene.onBeforeRenderObservable.remove(this._observer);
                        this._observer = null;
                    }
                }
            });
        }
    }


    logRed(msg: string): void {
        console.log("%c" + msg, "color:red");
    }
}
