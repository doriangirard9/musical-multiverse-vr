import * as B from "@babylonjs/core";
import {App} from "../App";

export class RotateBoundingBox implements B.Behavior<B.AbstractMesh> {
    name = "RotateBoundingBox";
    private _isSqueezePressed: boolean = false;
    private _selectedMesh: B.AbstractMesh | null = null;

    constructor(private app: App) {}

    // Initialize the behavior (if needed)
    init(): void {
        // Setup any initialization logic if necessary
    }

    select(target: B.AbstractMesh): void {
        this.attach(target);
    }
    // Attach the behavior to a target mesh
    attach(target: B.AbstractMesh): void {
        this._selectedMesh = target;
        console.log("Rotation behavior attached");

        // Listen to the controller squeeze button
        this.app.xrManager.xrHelper.input.controllers.forEach(controller => {
            console.log("Controller initialized:", controller);

            const squeezeComponent = controller.motionController?.getComponent("xr-standard-squeeze");

            if (squeezeComponent) {
                squeezeComponent.onButtonStateChangedObservable.add((component) => {
                    console.log("Squeeze button pressed:", component.pressed);

                    if (component.value === 1) {
                        this._isSqueezePressed = true;
                        this._startRotation(controller);  // Start applying rotation
                    } else {
                        this._isSqueezePressed = false;// Stop applying rotation
                    }
                });
            } else {
                console.warn("Squeeze component not available on controller.");
            }
        });

    }

    // Detach the behavior from the mesh
    detach(): void {
        this._selectedMesh = null;
        console.log("Rotation behavior detached");
    }

    // Start applying controller rotation to the selected mesh
    private _initialControllerRotation: B.Nullable<B.Quaternion> = null;
    private _initialMeshRotation: B.Nullable<B.Quaternion> = null;

    private _startRotation(controller: B.WebXRInputSource): void {

        if (this._selectedMesh ) {
            this.app.scene.onBeforeRenderObservable.add(() => {
                if (this._isSqueezePressed && controller.grip) {
                    // If we are just starting the rotation, store the initial rotations
                    if (!this._initialControllerRotation) {
                        if (controller.grip.rotationQuaternion) {
                            // Store the initial controller rotation
                            this._initialControllerRotation = controller.grip.rotationQuaternion.clone();
                        }
                        // @ts-ignore
                        if (this._selectedMesh && this._selectedMesh.rotationQuaternion) {
                            // Store the initial mesh rotation
                            this._initialMeshRotation = this._selectedMesh.rotationQuaternion.clone();
                        } else {
                            this._initialMeshRotation = B.Quaternion.Identity();  // Default to identity if no initial rotation
                        }
                        return;  // Skip the first frame to avoid sudden jumps
                    }

                    // Ensure that both initial rotations are defined
                    if (this._initialControllerRotation && this._initialMeshRotation) {
                        // Calculate the current rotation relative to the initial controller rotation
                        const currentControllerRotation = controller.grip.rotationQuaternion!.clone();

                        // Compute the relative rotation (delta)
                        const deltaRotation = this._initialControllerRotation.invert().multiply(currentControllerRotation);

                        // Apply the delta rotation relative to the mesh's initial rotation
                        if (this._selectedMesh) this._selectedMesh.rotationQuaternion = deltaRotation.multiply(this._initialMeshRotation);
                    }
                } else {
                    // Clear initial rotations when the squeeze button is released
                    this._initialControllerRotation = null;
                    //this._initialMeshRotation = null;
                }
            });
        }
    }








}
