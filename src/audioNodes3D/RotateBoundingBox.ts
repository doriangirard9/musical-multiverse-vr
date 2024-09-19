import * as B from "@babylonjs/core";
import {App} from "../App";
export class RotateBoundingBox implements B.Behavior<B.AbstractMesh> {
    name = "RotateBoundingBox";
    private _isSqueezePressed: boolean = false;
    private _selectedMesh: B.AbstractMesh | null = null;
    private _observer: B.Nullable<B.Observer<B.Scene>> = null;

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

    private _selectMeshUnderController(controller: B.WebXRInputSource): void {
        const ray = new B.Ray(controller.pointer.position, controller.pointer.forward, 100);
        const pickResult = this.app.scene.pickWithRay(ray);

        if (pickResult?.hit && pickResult.pickedMesh && pickResult.pickedMesh.name.startsWith("boundingBox")) {
            this.select(pickResult.pickedMesh);
            this._startRotation(controller);
        }
    }

    //Utilise la position du controller pour faire tourner l'objet
    private _startRotation(controller: B.WebXRInputSource): void {
        if (this._selectedMesh) {
            let initialControllerPosition: B.Vector3 | undefined;
            let initialMeshRotation: B.Vector3 | undefined;

            this._observer = this.app.scene.onBeforeRenderObservable.add(() => {
                if (this._isSqueezePressed && controller.grip) {
                    const currentControllerPosition = controller.grip.position.clone();

                    if (!initialControllerPosition) {
                        initialControllerPosition = currentControllerPosition;
                        initialMeshRotation = this._selectedMesh!.rotation.clone();
                        return;
                    }

                    const deltaPosition = currentControllerPosition.subtract(initialControllerPosition);

                    const deltaX = deltaPosition.y;
                    const deltaY = deltaPosition.x;
                    const deltaZ = deltaPosition.z;

                    const sensitivity = 5;
                    const rotationX = initialMeshRotation!.x + deltaX * sensitivity;
                    const rotationY = initialMeshRotation!.y + deltaY * sensitivity;
                    const rotationZ = initialMeshRotation!.z + deltaZ * sensitivity;

                    const smoothingFactor = 0.1;
                    this._selectedMesh!.rotation.x += (rotationX - this._selectedMesh!.rotation.x) * smoothingFactor;
                    this._selectedMesh!.rotation.y += (rotationY - this._selectedMesh!.rotation.y) * smoothingFactor;
                    this._selectedMesh!.rotation.z += (rotationZ - this._selectedMesh!.rotation.z) * smoothingFactor;

                } else {
                    initialControllerPosition = undefined;
                    initialMeshRotation = undefined;
                    if (this._observer) {
                        this.app.scene.onBeforeRenderObservable.remove(this._observer);
                        this._observer = null;
                    }
                }
            });
        }
    }

    /*
    // Tester les 2 versions pour voir celle que vous préférez, celle-ci est la premiere version ou j'ai demandé a chatgpt d'améliorer
    // Celle ci utilise la rotation du controller pour faire tourner l'objet
        private _startRotation(controller: B.WebXRInputSource): void {
        if (this._selectedMesh) {
            let initialControllerRotation: B.Vector3 | undefined;
            let initialMeshRotation: B.Vector3 | undefined;

            this._observer = this.app.scene.onBeforeRenderObservable.add(() => {
                if (this._isSqueezePressed && controller.grip) {
                    const currentControllerRotation = controller.grip.rotationQuaternion!.toEulerAngles();

                    if (!initialControllerRotation) {
                        // Stocker les rotations initiales
                        initialControllerRotation = currentControllerRotation.clone();
                        initialMeshRotation = this._selectedMesh!.rotation.clone();
                        return;
                    }

                    // Calculer les deltas
                    let deltaX = currentControllerRotation.x - initialControllerRotation.x;
                    let deltaY = currentControllerRotation.y - initialControllerRotation.y;
                    let deltaZ = currentControllerRotation.z - initialControllerRotation.z;

                    // Normaliser les angles
                    deltaX = this._normalizeAngle(deltaX);
                    deltaY = this._normalizeAngle(deltaY);
                    deltaZ = this._normalizeAngle(deltaZ);

                    // Ajuster la sensibilité
                    const sensitivity = 1.0;
                    deltaX *= sensitivity;
                    deltaY *= sensitivity;
                    deltaZ *= sensitivity;

                    // Calculer les rotations cibles
                    const targetRotationX = initialMeshRotation!.x + deltaX;
                    const targetRotationY = initialMeshRotation!.y + deltaY;
                    const targetRotationZ = initialMeshRotation!.z + deltaZ;

                    // Appliquer le lissage
                    const smoothingFactor = 0.1;
                    this._selectedMesh!.rotation.x += (targetRotationX - this._selectedMesh!.rotation.x) * smoothingFactor;
                    this._selectedMesh!.rotation.y += (targetRotationY - this._selectedMesh!.rotation.y) * smoothingFactor;
                    this._selectedMesh!.rotation.z += (targetRotationZ - this._selectedMesh!.rotation.z) * smoothingFactor;

                } else {
                    // Réinitialiser les variables
                    initialControllerRotation = undefined;
                    initialMeshRotation = undefined;

                    // Supprimer l'observer
                    if (this._observer) {
                        this.app.scene.onBeforeRenderObservable.remove(this._observer);
                        this._observer = null;
                    }
                }
            });
        }
    }


    private _normalizeAngle(angle: number): number {
        angle = angle % (2 * Math.PI);
        if (angle > Math.PI) {
            angle -= 2 * Math.PI;
        } else if (angle < -Math.PI) {
            angle += 2 * Math.PI;
        }
        return angle;
    }
     */
    logRed(msg: string): void {
        console.log("%c" + msg, "color:red");
    }
}
