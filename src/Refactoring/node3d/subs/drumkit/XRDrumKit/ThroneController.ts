import { Vector3 } from "@babylonjs/core/Maths/math";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import XRDrumKit from "./XRDrumKit";
import { Scene } from "@babylonjs/core/scene";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager";
import { WebXRAbstractMotionController } from "@babylonjs/core/XR/motionController/webXRAbstractMotionController";
import { WebXRControllerComponent } from "@babylonjs/core/XR/motionController/webXRControllerComponent";

/**
 * ThroneController - Manages sitting/standing at the drum throne
 * 
 * Features:
 * - Press X button when near throne to sit down
 * - Hold B button to stand up (with visual indicator)
 * - Automatic drumstick placement in hands when sitting
 * - Drumsticks released when standing up
 * - Saves/restores user position and height
 * - Disables MOVEMENT feature when sitting, re-enables when standing
 * - Height adjustment with left stick while seated (0.5m-1.5m)
 */
export class ThroneController {
    private xr: WebXRDefaultExperience;
    private xrDrumKit: XRDrumKit;
    private scene: Scene;
    private throneNode: TransformNode;
    
    // State tracking
    private isSitting: boolean = false;
    private savedCameraPosition: Vector3 | null = null;
    private appliedYawDifference: Quaternion | null = null; // The Y rotation we added when sitting
    
    // Movement feature state - just track if it was enabled
    private movementWasEnabled: boolean = false;
    
    // Proximity detection
    private proximityDistance: number = 1.5; // meters - distance to activate "sit" prompt
    private isNearThrone: boolean = false;
    
    // Stand-up button hold tracking
    private standUpButtonHoldStart: number = 0;
    private standUpButtonRequiredHoldTime: number = 1000; // 1 second hold
    private isHoldingStandUpButton: boolean = false;
    
    // Sitting configuration
    private sittingHeightOffset: number = 1.4; // Height above throne position when sitting
    private sittingForwardOffset: number = -0.1; // Distance forward from throne center (meters) - positive = toward drums
    
    // Height adjustment
    private readonly MIN_SITTING_HEIGHT = 0.5; // meters
    private readonly MAX_SITTING_HEIGHT = 1.5; // meters
    private readonly HEIGHT_ADJUSTMENT_SPEED = 0.01; // meters per frame
    
    private log: boolean = true;
    
    constructor(xr: WebXRDefaultExperience, xrDrumKit: XRDrumKit, throneNode: TransformNode, scene: Scene) {
        this.xr = xr;
        this.xrDrumKit = xrDrumKit;
        this.throneNode = throneNode;
        this.scene = scene;
        
        // Don't calculate position here - do it when sitting (after drum kit is positioned)
        
        // Setup button listeners
        this.setupControllers();
        
        // Monitor proximity to throne
        this.scene.onBeforeRenderObservable.add(() => {
            this.checkProximity();
            if (this.isSitting) {
                this.handleHeightAdjustment();
            }
        });
        
        if (this.log) {
            console.log("[ThroneController] Initialized. Press X near throne to sit.");
        }
    }
    
    /**
     * Calculate where the player should be positioned when sitting
     * Called each time before sitting to get the latest throne position
     */
    private calculateSittingPosition(): Vector3 {
        if (!this.throneNode) {
            console.warn("[ThroneController] No throne node provided!");
            return Vector3.Zero();
        }
        
        // The throne meshes are children of throneNode (throneContainer)
        // We need to find the actual throne mesh center, not just the container's position
        const throneMeshes = this.throneNode.getChildMeshes();
        
        if (throneMeshes.length === 0) {
            console.warn("[ThroneController] No throne meshes found!");
            return Vector3.Zero();
        }
        
        // Calculate the center of all throne meshes in world space
        let totalPosition = Vector3.Zero();
        throneMeshes.forEach(mesh => {
            totalPosition.addInPlace(mesh.getAbsolutePosition());
        });
        const throneMeshCenter = totalPosition.scale(1 / throneMeshes.length);
        
        // Get drum kit rotation to apply forward offset correctly
        const drumContainer = this.xrDrumKit.drumContainer;
        let drumKitRotation = 0;
        
        if (drumContainer.rotationQuaternion) {
            // 6DOF uses quaternion rotation - convert to Euler Y angle
            drumKitRotation = drumContainer.rotationQuaternion.toEulerAngles().y;
        } else {
            // Fall back to regular rotation
            drumKitRotation = drumContainer.rotation.y;
        }
        
        // Calculate forward offset in world space (toward drums)
        // In Babylon.js with Y-up, negative Z is typically forward when rotation is 0
        const forwardOffsetX = -this.sittingForwardOffset * Math.sin(drumKitRotation);
        const forwardOffsetZ = -this.sittingForwardOffset * Math.cos(drumKitRotation);
        
        // Position player at the throne mesh center plus forward offset
        const sittingPos = new Vector3(
            throneMeshCenter.x + forwardOffsetX,
            throneMeshCenter.y + this.sittingHeightOffset,
            throneMeshCenter.z + forwardOffsetZ
        );
        
        if (this.log) {
            console.log(`[ThroneController] Sitting position calculated: ${sittingPos.toString()}`);
            console.log(`[ThroneController] Throne mesh center (world): ${throneMeshCenter.toString()}`);
            console.log(`[ThroneController] Number of throne meshes: ${throneMeshes.length}`);
            console.log(`[ThroneController] Forward offset applied: ${this.sittingForwardOffset}m toward drums`);
        }
        
        return sittingPos;
    }
    
    /**
     * Setup controller button listeners
     */
    private setupControllers(): void {
        this.xr.input.onControllerAddedObservable.add((controller: WebXRInputSource) => {
            controller.onMotionControllerInitObservable.add((motionController: any) => {
                if (this.log) {
                    console.log(`[ThroneController] Controller added: ${motionController.handedness}`);
                }
                
                // X button (or A button on right controller) - Sit down
                const xButton = motionController.getComponent("x-button") || 
                               motionController.getComponent("a-button");
                
                if (xButton) {
                    xButton.onButtonStateChangedObservable.add((component: any) => {
                        if (component.pressed && !this.isSitting && this.isNearThrone) {
                            this.sitDown();
                        }
                    });
                }
                
                // B button (or Y button) - Stand up (hold)
                const bButton = motionController.getComponent("b-button") ||
                               motionController.getComponent("y-button");
                
                if (bButton) {
                    bButton.onButtonStateChangedObservable.add((component: any) => {
                        if (component.pressed && this.isSitting) {
                            this.onStandUpButtonPressed();
                        } else if (!component.pressed && this.isSitting) {
                            this.onStandUpButtonReleased();
                        }
                    });
                }
            });
        });
    }
    
    /**
     * Check if player is near the throne
     */
    private checkProximity(): void {
        if (this.isSitting) return;
        
        const camera = this.xr.baseExperience.camera;
        const cameraPos = camera.position;
        
        // Calculate sitting position on the fly to get latest throne position
        const thronePos = this.throneNode.getAbsolutePosition();
        
        // Only check horizontal distance (XZ plane), ignore height difference
        const horizontalDistance = Math.sqrt(
            Math.pow(cameraPos.x - thronePos.x, 2) + 
            Math.pow(cameraPos.z - thronePos.z, 2)
        );
        
        const wasNear = this.isNearThrone;
        this.isNearThrone = horizontalDistance <= this.proximityDistance;
        
        // Log when entering/exiting proximity
        if (this.isNearThrone && !wasNear && this.log) {
            console.log("[ThroneController] Near throne - Press X to sit");
        } else if (!this.isNearThrone && wasNear && this.log) {
            console.log("[ThroneController] Left throne proximity");
        }
    }
    
    /**
     * Sit down at the drums
     */
    private sitDown(): void {
        if (this.isSitting) return;
        
        const camera = this.xr.baseExperience.camera;
        const featuresManager = this.xr.baseExperience.featuresManager;
        
        // Check if MOVEMENT feature is enabled and disable it
        const movementFeature = featuresManager.getEnabledFeature(WebXRFeatureName.MOVEMENT);
        this.movementWasEnabled = movementFeature !== null;
        
        if (this.movementWasEnabled) {
            featuresManager.disableFeature(WebXRFeatureName.MOVEMENT);
            if (this.log) {
                console.log("[ThroneController] MOVEMENT feature disabled");
            }
        }
        
        // Disable gravity while sitting to prevent camera drift
        // Keep collisions enabled so we don't fall through throne
        camera.applyGravity = false;
        
        // Save current XR rig base position and rotation
        this.savedCameraPosition = camera.position.clone();
        
        // Ensure camera has a quaternion
        if (!camera.rotationQuaternion) {
            camera.rotationQuaternion = new Quaternion(0, 0, 0, 1);
        }
        
        // Calculate target sitting position (where we want the XR rig base to be)
        const targetSittingPos = this.calculateSittingPosition();
        
        // Get drum kit rotation
        const drumContainer = this.xrDrumKit.drumContainer;
        if (!drumContainer.rotationQuaternion) {
            drumContainer.rotationQuaternion = new Quaternion(0, 0, 0, 1);
        }
        
        // Create Y-only quaternion from drum kit (set X and Z to 0)
        const drumYOnly = new Quaternion(0, drumContainer.rotationQuaternion._y, 0, drumContainer.rotationQuaternion._w).normalize();
        
        // Get current camera Y-only rotation
        const currentYOnly = new Quaternion(0, camera.rotationQuaternion._y, 0, camera.rotationQuaternion._w).normalize();
        
        // Calculate rotation difference: drumYOnly * inverse(currentYOnly)
        const currentYInverse = Quaternion.Inverse(currentYOnly);
        const yawDifference = drumYOnly.multiply(currentYInverse);
        
        // Save the rotation difference so we can reverse it when standing up
        this.appliedYawDifference = yawDifference.clone();
        
        // Apply the Y rotation difference to current camera (preserves pitch/roll)
        camera.rotationQuaternion.copyFrom(yawDifference.multiply(camera.rotationQuaternion));
        
        // Stop camera velocity before teleporting to prevent drift
        this.stopCameraVelocity(camera);
        
        // Then set camera position to the throne location
        camera.position.copyFrom(targetSittingPos);
        
        this.isSitting = true;
        
        // Automatically pick up drumsticks
        this.pickupDrumsticks();
        
        if (this.log) {
            const drumContainer = this.xrDrumKit.drumContainer;
            console.log("[ThroneController] Sitting down. Hold B to stand up.");
            console.log(`[ThroneController] Target sitting pos: ${targetSittingPos.toString()}`);
            console.log(`[ThroneController] XR rig base moved to: ${camera.position.toString()}`);
            console.log(`[ThroneController] Camera uses quaternion: ${!!camera.rotationQuaternion}`);
            if (camera.rotationQuaternion) {
                console.log(`[ThroneController] Camera rotation quaternion: ${camera.rotationQuaternion.toString()}`);
            } else {
                console.log(`[ThroneController] Camera rotation (Euler Y): ${camera.cameraRotation.y.toFixed(2)} rad`);
            }
            console.log(`[ThroneController] Drum kit uses quaternion: ${!!drumContainer.rotationQuaternion}`);
            if (drumContainer.rotationQuaternion) {
                console.log(`[ThroneController] Drum kit quaternion: ${drumContainer.rotationQuaternion.toString()}`);
            }
            console.log(`[ThroneController] Drum kit rotation (Euler): ${drumContainer.rotation.toString()}`);
            console.log(`[ThroneController] Drum kit position: ${drumContainer.position.toString()}`);
            
            // Log actual position after a delay
            setTimeout(() => {
                console.log(`[ThroneController] Player head actually at: ${camera.globalPosition.toString()}`);
                if (camera.rotationQuaternion) {
                    console.log(`[ThroneController] Camera quaternion after delay: ${camera.rotationQuaternion.toString()}`);
                } else {
                    console.log(`[ThroneController] Camera rotation after delay: ${camera.cameraRotation.y.toFixed(2)} rad`);
                }
            }, 100);
        }
    }
    
    /**
     * Automatically place drumsticks in player's hands
     */
    private pickupDrumsticks(): void {
        // Get controllers
        const controllers = this.xr.input.controllers;
        
        controllers.forEach((controller, index) => {
            if (controller.grip && index < this.xrDrumKit.drumsticks.length) {
                const drumstick = this.xrDrumKit.drumsticks[index];
                
                // Force-attach the drumstick to controller without pointer selection
                drumstick.forceAttachToController(controller, 0.4); // 0.4 is the stick length
                
                if (this.log) {
                    console.log(`[ThroneController] Placed ${drumstick.name} in ${controller.inputSource.handedness} hand`);
                }
            }
        });
    }
    
    /**
     * Handle stand-up button being pressed
     */
    private onStandUpButtonPressed(): void {
        if (!this.isHoldingStandUpButton) {
            this.isHoldingStandUpButton = true;
            this.standUpButtonHoldStart = performance.now();
            
            if (this.log) {
                console.log("[ThroneController] Hold B to stand up...");
            }
            
            // Start monitoring hold duration
            this.monitorStandUpButton();
        }
    }
    
    /**
     * Handle stand-up button being released
     */
    private onStandUpButtonReleased(): void {
        this.isHoldingStandUpButton = false;
        
        if (this.log) {
            console.log("[ThroneController] Stand-up cancelled");
        }
    }
    
    /**
     * Monitor how long the stand-up button is held
     */
    private monitorStandUpButton(): void {
        const checkInterval = setInterval(() => {
            if (!this.isHoldingStandUpButton) {
                clearInterval(checkInterval);
                return;
            }
            
            const holdDuration = performance.now() - this.standUpButtonHoldStart;
            const progress = Math.min(1.0, holdDuration / this.standUpButtonRequiredHoldTime);
            
            // TODO: Show visual indicator of progress (0.0 to 1.0)
            // This could be a circular progress bar or fill indicator
            
            if (progress >= 1.0) {
                clearInterval(checkInterval);
                this.standUp();
            }
        }, 50); // Check every 50ms
    }
    
    /**
     * Stand up from the drums
     */
    private standUp(): void {
        if (!this.isSitting) return;
        
        const camera = this.xr.baseExperience.camera;
        const featuresManager = this.xr.baseExperience.featuresManager;
        
        // Release drumsticks
        this.releaseDrumsticks();
        
        // Stop camera velocity before teleporting to prevent drift
        this.stopCameraVelocity(camera);
        
        // Calculate current physical offset (might have changed while sitting)
        const currentPhysicalOffset = camera.globalPosition.subtract(camera.position);
        
        // Restore XR rig base position (player's head will be at savedPosition + currentPhysicalOffset)
        if (this.savedCameraPosition) {
            // To restore player's physical head position to where it was,
            // account for current physical offset
            const rigTargetPosition = this.savedCameraPosition.subtract(currentPhysicalOffset);
            camera.position.copyFrom(rigTargetPosition);
        }
        
        // Restore rotation - reverse the rotation difference we applied when sitting
        if (this.appliedYawDifference !== null && camera.rotationQuaternion) {
            // Apply the inverse of the rotation we added
            const inverseYawDifference = Quaternion.Inverse(this.appliedYawDifference);
            camera.rotationQuaternion.copyFrom(inverseYawDifference.multiply(camera.rotationQuaternion));
        }
        
        // Re-enable MOVEMENT feature if it was enabled before
        // Must provide full configuration including xrInput
        if (this.movementWasEnabled) {
            // Custom configuration: left stick = movement, right stick = rotation
            const swappedHandednessConfiguration = [
                {
                    // Right stick (right hand) -> rotation
                    allowedComponentTypes: [WebXRControllerComponent.THUMBSTICK_TYPE, WebXRControllerComponent.TOUCHPAD_TYPE],
                    forceHandedness: "right" as XRHandedness,
                    axisChangedHandler: (axes: any, movementState: any, featureContext: any, _xrInput: any) => {
                        movementState.rotateX = Math.abs(axes.x) > featureContext.rotationThreshold ? axes.x : 0;
                        movementState.rotateY = Math.abs(axes.y) > featureContext.rotationThreshold ? axes.y : 0;
                    },
                },
                {
                    // Left stick (left hand) -> movement
                    allowedComponentTypes: [WebXRControllerComponent.THUMBSTICK_TYPE, WebXRControllerComponent.TOUCHPAD_TYPE],
                    forceHandedness: "left" as XRHandedness,
                    axisChangedHandler: (axes: any, movementState: any, featureContext: any, _xrInput: any) => {
                        movementState.moveX = Math.abs(axes.x) > featureContext.movementThreshold ? axes.x : 0;
                        movementState.moveY = Math.abs(axes.y) > featureContext.movementThreshold ? axes.y : 0;
                    },
                },
            ];
            
            featuresManager.enableFeature(WebXRFeatureName.MOVEMENT, "latest", {
                xrInput: this.xr.input,
                movementEnabled: true,
                rotationEnabled: true,
                movementSpeed: 0.2,
                rotationSpeed: 0.3,
                movementOrientationFollowsViewerPose: true,
                movementOrientationFollowsController: false,
                customRegistrationConfigurations: swappedHandednessConfiguration
            });
            
            if (this.log) {
                console.log("[ThroneController] MOVEMENT feature re-enabled");
            }
        }
        
        // Re-enable gravity when standing up
        camera.applyGravity = true;
        
        this.isSitting = false;
        this.isHoldingStandUpButton = false;
        
        if (this.log) {
            console.log("[ThroneController] Standing up. Position restored.");
            console.log(`[ThroneController] XR rig base: ${camera.position.toString()}`);
            console.log(`[ThroneController] Player head at: ${camera.globalPosition.toString()}`);
        }
    }
    
    /**
     * Release drumsticks (they fall to the floor)
     */
    private releaseDrumsticks(): void {
        this.xrDrumKit.drumsticks.forEach(drumstick => {
            if (drumstick.controllerAttached) {
                drumstick.releaseStick(drumstick.drumstickAggregate);
                
                if (this.log) {
                    console.log(`[ThroneController] Released ${drumstick.name}`);
                }
            }
        });
    }
    
    /**
     * Get current sitting state
     */
    public getIsSitting(): boolean {
        return this.isSitting;
    }
    
    /**
     * Get whether player is near the throne
     */
    public getIsNearThrone(): boolean {
        return this.isNearThrone;
    }
    
    /**
     * Get stand-up progress (0.0 to 1.0)
     * For rendering progress indicator
     */
    public getStandUpProgress(): number {
        if (!this.isHoldingStandUpButton) return 0.0;
        
        const holdDuration = performance.now() - this.standUpButtonHoldStart;
        return Math.min(1.0, holdDuration / this.standUpButtonRequiredHoldTime);
    }
    
    /**
     * Get throne position in world space
     * Used for UI positioning
     */
    public getThronePosition(): Vector3 | null {
        if (!this.throneNode) return null;
        return this.throneNode.getAbsolutePosition();
    }
    
    /**
     * Get drum kit container position in world space
     * Used for UI positioning
     */
    public getDrumKitPosition(): Vector3 | null {
        return this.xrDrumKit.drumContainer.getAbsolutePosition();
    }
    
    /**
     * Get drum kit rotation (as quaternion if available)
     * Used for calculating UI forward offset
     */
    public getDrumKitRotation(): { y: number } | null {
        const drumContainer = this.xrDrumKit.drumContainer;
        if (drumContainer.rotationQuaternion) {
            return { y: drumContainer.rotationQuaternion.toEulerAngles().y };
        }
        return { y: drumContainer.rotation.y };
    }
    
    /**
     * Update proximity distance threshold
     */
    public setProximityDistance(distance: number): void {
        this.proximityDistance = distance;
    }
    
    /**
     * Update sitting height offset
     */
    public setSittingHeight(height: number): void {
        this.sittingHeightOffset = height;
    }
    
    /**
     * Handle height adjustment while seated using left stick Y-axis
     * Only active when sitting down
     */
    private handleHeightAdjustment(): void {
        const controllers = this.xr.input.controllers;
        
        // Find the left controller
        for (const controller of controllers) {
            if (controller.inputSource.handedness === 'left' && controller.motionController) {
                const motionController = controller.motionController as WebXRAbstractMotionController;
                const leftStick = motionController.getComponent("xr-standard-thumbstick");
                
                if (leftStick && leftStick.axes) {
                    const yAxis = leftStick.axes.y;
                    
                    // Only adjust if there's meaningful input (deadzone)
                    if (Math.abs(yAxis) > 0.1) {
                        const camera = this.xr.baseExperience.camera;
                        
                        // Adjust height: stick up = higher, stick down = lower
                        const heightChange = -yAxis * this.HEIGHT_ADJUSTMENT_SPEED;
                        const newHeight = camera.position.y + heightChange;
                        
                        // Clamp to min/max range
                        if (newHeight >= this.MIN_SITTING_HEIGHT && newHeight <= this.MAX_SITTING_HEIGHT) {
                            camera.position.y = newHeight;
                        }
                    }
                }
                break; // Found left controller, no need to continue
            }
        }
    }
    
    /**
     * Stop camera momentum/velocity to prevent drift during teleport
     * This resets the camera's direction and rotation vectors to zero
     */
    private stopCameraVelocity(camera: any): void {
        // Reset camera direction and rotation vectors to prevent drift
        camera.cameraDirection.setAll(0);
        camera.cameraRotation.setAll(0);
        
        if (this.log) {
            console.log("[ThroneController] Camera velocity stopped");
        }
    }
}

export default ThroneController;
