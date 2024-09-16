import * as B from "@babylonjs/core";
import {App} from "../App";
export class RotateBoundingBox implements B.Behavior<B.AbstractMesh> {
    name = "RotateBoundingBox";
    private _isSqueezePressed: boolean = false;
    private _selectedMesh: B.AbstractMesh | null = null;
    private _observer: B.Nullable<B.Observer<B.Scene>> = null;
    private _controllerObserver: B.Nullable<B.Observer<any>> = null; // To store controller button event observer

    constructor(private app: App) {}

    init(): void {
        this.logRed("RotateBoundingBox init");

        // Iterate over all controllers
        this.app.xrManager.xrHelper.input.controllers.forEach(controller => {
            console.log("Controller initialized:", controller);

            const squeezeComponent = controller.motionController?.getComponent("xr-standard-squeeze");

            if (squeezeComponent) {
                // Attach a squeeze button state observer
                this._controllerObserver = squeezeComponent.onButtonStateChangedObservable.add((component) => {
                    console.log("Squeeze button pressed:", component.pressed);

                    // Only proceed if a mesh is selected
                    if (this._selectedMesh) {
                        if (component.value === 1) {
                            this._isSqueezePressed = true;
                            this._startRotation(controller);  // Start applying rotation
                        } else {
                            this._isSqueezePressed = false;  // Stop applying rotation
                        }
                    } else {
                        console.log("No mesh selected, ignoring squeeze input");
                    }
                });
            } else {
                console.warn("Squeeze component not available on controller.");
            }
        });
    }

    select(target: B.AbstractMesh): void {
        this.logRed("RotateBoundingBox select");
        this._selectedMesh = target;
        this._selectedMesh.visibility = 0.5;
    }

    attach(target: B.AbstractMesh): void {
        this.logRed("RotateBoundingBox attach");
        this.select(target);
    }

    detach(): void {
        this.logRed("RotateBoundingBox detach");

        // Reset visibility of the selected mesh
        if (this._selectedMesh) {
            this._selectedMesh.visibility = 0;

        }

        // Remove the observer if it exists
        if (this._observer) {
            this.app.scene.onBeforeRenderObservable.remove(this._observer);
            this._observer = null;  // Clear the observer reference
        }

        // Clear the controller observer to prevent attaching to any new mesh
        if (this._controllerObserver) {
            this.app.xrManager.xrHelper.input.controllers.forEach(controller => {
                const squeezeComponent = controller.motionController?.getComponent("xr-standard-squeeze");
                if (squeezeComponent) {
                    squeezeComponent.onButtonStateChangedObservable.remove(this._controllerObserver);
                }
            });
            this._controllerObserver = null;
        }

        // Clear internal state related to rotation and mesh
        this._selectedMesh = null;
        this._initialControllerRotation = null;
        this._initialMeshRotation = null;
        this._isSqueezePressed = false;

    }

    private _initialControllerRotation: B.Nullable<B.Quaternion> = null;
    private _initialMeshRotation: B.Nullable<B.Quaternion> = null;

    private _startRotation(controller: B.WebXRInputSource): void {
        if (this._selectedMesh) {
            console.log(this._selectedMesh.name);
            this.logRed("if -- 0");

            // Add the observer and store it in the class-level variable
            this._observer = this.app.scene.onBeforeRenderObservable.add(() => {
                if (this._isSqueezePressed && controller.grip) {
                    this.logRed("if -- 1");

                    if (!this._initialControllerRotation) {
                        this.logRed("if -- 2");

                        if (controller.grip.rotationQuaternion) {
                            this.logRed("if -- 3");
                            this._initialControllerRotation = controller.grip.rotationQuaternion.clone();
                        }

                        if (this._selectedMesh && this._selectedMesh.rotationQuaternion) {
                            this.logRed("if -- 4");
                            this._initialMeshRotation = this._selectedMesh.rotationQuaternion.clone();
                        } else {
                            this.logRed("if -- 5");
                            this._initialMeshRotation = B.Quaternion.Identity();  // Default to identity if no initial rotation
                        }
                        return;  // Skip the first frame to avoid sudden jumps
                    }

                    if (this._initialControllerRotation && this._initialMeshRotation) {
                        this.logRed("if -- 6");
                        const currentControllerRotation = controller.grip.rotationQuaternion!.clone();
                        const deltaRotation = this._initialControllerRotation.invert().multiply(currentControllerRotation);

                        if (this._selectedMesh) {
                            this.logRed("if -- 7");
                            this._selectedMesh.rotationQuaternion = deltaRotation.multiply(this._initialMeshRotation);
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
