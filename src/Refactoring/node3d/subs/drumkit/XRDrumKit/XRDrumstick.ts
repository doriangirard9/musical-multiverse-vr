import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
//import { WebXRControllerPhysics } from "@babylonjs/core/XR/features/WebXRControllerPhysics";
//import { Observable } from "@babylonjs/core/Misc/observable";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder, StandardMaterial, PhysicsAggregate, PhysicsShapeType, PhysicsMotionType, PhysicsPrestepType } from "@babylonjs/core";
import { Vector3, Quaternion, Axis } from "@babylonjs/core/Maths/math";
//import { PhysicsImpostor } from "@babylonjs/core/Physics/physicsImpostor";
import XRDrumKit from "./XRDrumKit";
//import XRLogger from "../XRLogger";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";

class XRDrumstick {

    xrDrumKit: XRDrumKit; // Reference to XRDrumKit for shared console and to deactivate sounds if needed
    drumstickAggregate: PhysicsAggregate;
    scene: Scene;
    eventMask: number;
    name : string;
    showBoundingBox: boolean = true; // Display collision bounding boxes for debugging
    controllerAttached: WebXRInputSource | null = null;
    private previousPosition: Vector3 = new Vector3();
    private linearVelocity: Vector3 = new Vector3();
    private lastUpdateTime: number = performance.now();
    private previousRotation: Quaternion = new Quaternion();
    private angularVelocity: Vector3 = new Vector3();
    log = true;
    //xrLogger : XRLogger; //To get controller positions, consider moving this logic outside this class

    constructor(xr : WebXRDefaultExperience, xrDrumKit: XRDrumKit, scene: Scene, eventMask: number, stickNumber : Number, /*xrLogger? : XRLogger*/) {
        
        this.eventMask = eventMask;
        this.scene = scene;
        this.name = "drumstick" + stickNumber;
        //@ts-ignore
        this.drumstickAggregate = this.createDrumstick(xr, stickNumber);
        this.xrDrumKit = xrDrumKit;
        scene.onBeforeRenderObservable.add(() => this.updateVelocity());
        //this.xrLogger = xrLogger; // Initialize the logger
    }

    createDrumstick(xr: WebXRDefaultExperience, stickNumber : Number) {
        const stickLength = 0.4;
        const stickDiameter = 0.02;
        const ballDiameter = 0.03;

        const stick = MeshBuilder.CreateCylinder("stick" + stickNumber, { height: stickLength, diameter: stickDiameter }, this.scene);
        const ball = MeshBuilder.CreateSphere("ball" + stickNumber, { diameter: ballDiameter }, this.scene);

        ball.position = new Vector3(0, stickLength / 2, 0);

        stick.position = new Vector3(0, 0, 0);
        stick.material = new StandardMaterial("stickMaterial", this.scene);
        ball.material = new StandardMaterial("ballMaterial", this.scene);

            // Merge the stick and ball into a single mesh
        const mergedStick = Mesh.MergeMeshes([stick, ball], true, false, undefined, false, true);
        if (!mergedStick) {
        console.error("Failed to merge drumstick meshes");
        return;
        }

            
        mergedStick.name = this.name;
        mergedStick.material = new StandardMaterial("stickMaterial", this.scene);

        mergedStick.position = new Vector3(0, 1, 1);
        /*
        
        TRY TO USE MERGED MESHES INSTEAD OF CONVEX_HULL to not distinguish between ball or stick
        
        const avgPosition = stick.position.add(ball.position).scale(0.5);

        var mergeArray = [stick, ball];
        const mergedStick1 = BABYLON.Mesh.MergeMeshes(mergeArray, false, false, false, false, true);
        const mergedStick2 = mergedStick1.clone("stick2_merged");
        mergedStick1.setPivotMatrix(BABYLON.Matrix.Translation(-avgPosition.x, -avgPosition.y, -avgPosition.z), false);
        mergedStick2.setPivotMatrix(BABYLON.Matrix.Translation(-avgPosition.x, -avgPosition.y, -avgPosition.z), false);
        
        console.log("Merged stick 1 : " + mergedStick1.name);
        console.log("Merged stick 2 : " + mergedStick2.name);
        */
        var drumstickAggregate = new PhysicsAggregate(mergedStick, PhysicsShapeType.CONVEX_HULL, { mass: 1 }, this.scene);
        drumstickAggregate.body.setCollisionCallbackEnabled(true);
        drumstickAggregate.body.setEventMask(this.eventMask);

        // Show bounding box for debugging collision shapes
        if (this.showBoundingBox) {
            mergedStick.showBoundingBox = true;
            console.log(`[${this.name}] Bounding box enabled. Convex hull shape: ${mergedStick.getTotalVertices()} vertices`);
        }

        xr.input.onControllerAddedObservable.add((controller: WebXRInputSource) => {
            controller.onMotionControllerInitObservable.add((motionController: any) => {
                this.xrDrumKit.drumSoundsEnabled = true;
                // @ts-ignore
                let pickedStick: PhysicsAggregate | null = null;

                motionController.getComponent("xr-standard-trigger").onButtonStateChangedObservable.add((button: any) => {
                    if (button.pressed) {
                        pickedStick = this.pickStick(controller, stickLength);
                    } else {
                        this.releaseStick(motionController.heldStick);
                    }
                });
            });
            
            this.scene.onBeforeRenderObservable.add(() => {
                if (controller.grip) {
                    //const controllerPos = controller.grip.position;
                    //const controllerRot = controller.grip.rotationQuaternion || Quaternion.Identity();
                    //this.xrLogger.updateControllerPositions(controllerPos, controllerRot, controller.inputSource.handedness);
                    //this.xrLogger.updateControllerVelocity(this.linearVelocity, this.angularVelocity, this.drumstickAggregate.transformNode.id);
                }
            });
        });

        return drumstickAggregate;
    }

    pickStick(controller: WebXRInputSource, stickLength : number) {
        if (this.log) {
            console.log("Déclenchement de pickStick");
        }
        const meshUnderPointer = this.xrDrumKit.xr.pointerSelection.getMeshUnderPointer(controller.uniqueId);
        if (this.log && meshUnderPointer) {
            console.log("Mesh under pointer : " + meshUnderPointer.name);
        } else if (this.log) {
            console.log("Aucun mesh sous le pointeur");
        }
        if (meshUnderPointer === this.drumstickAggregate.transformNode) {
            this.attachToController(controller, stickLength);
            return this.drumstickAggregate;
        }
        return null;
    }
    
    /**
     * Force-attach drumstick to controller without requiring pointer selection
     * Used when automatically placing sticks in hands (e.g., when sitting at throne)
     */
    forceAttachToController(controller: WebXRInputSource, stickLength: number) {
        this.attachToController(controller, stickLength);
        return this.drumstickAggregate;
    }
    
    /**
     * Internal method to attach drumstick to a controller
     */
    private attachToController(controller: WebXRInputSource, stickLength: number) {
        if (controller.grip) {
            this.drumstickAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
            this.drumstickAggregate.body.setPrestepType(PhysicsPrestepType.TELEPORT);
            this.drumstickAggregate.body.setCollisionCallbackEnabled(true);
            this.drumstickAggregate.body.setEventMask(this.eventMask);
            this.drumstickAggregate.transformNode.setParent(controller.grip);
            this.controllerAttached = controller;

            this.drumstickAggregate.transformNode.position = new Vector3(0, 0, stickLength / 4); // Adjust position to remove offset
            this.drumstickAggregate.transformNode.rotationQuaternion = Quaternion.RotationAxis(Axis.X, Math.PI / 2); // Align with the hand
            
            // Set velocity to zero to stop any movement
            this.drumstickAggregate.body.setLinearVelocity(Vector3.Zero());
            this.drumstickAggregate.body.setAngularVelocity(Vector3.Zero());
        }
    }

    releaseStick(drumstickAggregate: PhysicsAggregate) {
        if (drumstickAggregate) {
            drumstickAggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
            drumstickAggregate.body.setPrestepType(PhysicsPrestepType.DISABLED);
            drumstickAggregate.transformNode.setParent(null);
            this.controllerAttached = null;
            //stickAggregate.controllerPhysicsImpostor = null;
        }
    }

    /*
    getControllerVelocity(xr: WebXRDefaultExperience) {
        
        const xrFrame = xr.baseExperience.sessionManager.currentFrame;
        console.log(xrFrame);
        if (xrFrame) {
            if(this.controllerAttached){
                const pose = xrFrame.getPose(this.controllerAttached.inputSource.targetRaySpace, xr.baseExperience.sessionManager.referenceSpace);
                console.log("POSE")
                console.log(pose)
                console.log(pose?.linearVelocity)
                if (pose && pose.linearVelocity && pose.angularVelocity) {
                    const linearVelocity = new Vector3(pose.linearVelocity.x, pose.linearVelocity.y, -pose.linearVelocity.z);
                    const angularVelocity = new Vector3(pose.angularVelocity.x, pose.angularVelocity.y, -pose.angularVelocity.z);
                    console.log("Linear Velocity: ", linearVelocity);
                    console.log("Angular Velocity: ", angularVelocity);
                    return linearVelocity;
                }
            }
        }
    }
    */

    private updateVelocity() {
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = currentTime;

        // Update linear velocity
        const currentPosition = this.drumstickAggregate.transformNode.getAbsolutePosition();
        this.linearVelocity = currentPosition.subtract(this.previousPosition).scale(1 / deltaTime);
        this.previousPosition.copyFrom(currentPosition);

        // Update angular velocity and position
        const currentRotation = this.drumstickAggregate.transformNode.rotationQuaternion || Quaternion.Identity();
        const deltaRotation = currentRotation.multiply(Quaternion.Inverse(this.previousRotation));
        deltaRotation.toEulerAnglesToRef(this.angularVelocity);
        this.angularVelocity.scaleInPlace(1 / deltaTime);
        this.previousRotation.copyFrom(currentRotation);
    }

    getVelocity(): { linear: Vector3; angular: Vector3 } {
        return { linear: this.linearVelocity, angular: this.angularVelocity };
    }
}
export default XRDrumstick;