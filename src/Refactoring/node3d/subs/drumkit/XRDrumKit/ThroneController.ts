import { Vector3 } from "@babylonjs/core/Maths/math";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import XRDrumKit from "./XRDrumKit";
import { Scene } from "@babylonjs/core/scene";

/**
 * ThroneController - Manages sitting/standing at the drum throne
 * 
 * Features:
 * - Press X button when near throne to sit down
 * - Hold B button to stand up (with visual indicator)
 * - Automatic drumstick placement in hands when sitting
 * - Drumsticks released when standing up
 * - Saves/restores user position and height
 */
export class ThroneController {
    private xr: WebXRDefaultExperience;
    private xrDrumKit: XRDrumKit;
    private scene: Scene;
    private throneNode: TransformNode;
    
    // State tracking
    private isSitting: boolean = false;
    private savedCameraPosition: Vector3 | null = null;
    private savedCameraRotation: number | null = null;
    
    // Proximity detection
    private proximityDistance: number = 1.5; // meters - distance to activate "sit" prompt
    private isNearThrone: boolean = false;
    
    // Stand-up button hold tracking
    private standUpButtonHoldStart: number = 0;
    private standUpButtonRequiredHoldTime: number = 1000; // 1 second hold
    private isHoldingStandUpButton: boolean = false;
    
    // Sitting configuration
    private sittingHeightOffset: number = 1.4; // Height above throne position when sitting
    
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
        this.scene.onBeforeRenderObservable.add(() => this.checkProximity());
        
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
        
        // Get the throne's absolute position in world space
        const throneAbsolutePos = this.throneNode.getAbsolutePosition();
        
        // Position player at throne center, slightly back
        const sittingPos = new Vector3(
            throneAbsolutePos.x,
            throneAbsolutePos.y + this.sittingHeightOffset, // Height above throne
            throneAbsolutePos.z - 0.2 // 20cm back from throne center
        );
        
        if (this.log) {
            console.log(`[ThroneController] Sitting position calculated: ${sittingPos.toString()}`);
            console.log(`[ThroneController] Throne absolute position: ${throneAbsolutePos.toString()}`);
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
        const distance = Vector3.Distance(cameraPos, thronePos);
        
        const wasNear = this.isNearThrone;
        this.isNearThrone = distance <= this.proximityDistance;
        
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
        
        // Save current XR rig base position and rotation
        this.savedCameraPosition = camera.position.clone();
        this.savedCameraRotation = camera.cameraRotation.y;
        
        // Calculate target sitting position (where we want player's HEAD to be)
        const targetSittingPos = this.calculateSittingPosition();
        
        // Calculate player's current physical offset from XR rig base
        // globalPosition is where the player's head actually is in world space
        // position is where the XR rig base is
        const physicalOffset = camera.globalPosition.subtract(camera.position);
        
        // To position the player's HEAD at targetSittingPos, we need to move the rig base
        // to (targetSittingPos - physicalOffset)
        const rigTargetPosition = targetSittingPos.subtract(physicalOffset);
        
        // Teleport XR rig base to align player's physical position with throne
        camera.position.copyFrom(rigTargetPosition);
        
        // Face the drums (rotate towards drum kit center)
        const drumKitPos = this.xrDrumKit.drumContainer.getAbsolutePosition();
        const direction = drumKitPos.subtract(targetSittingPos); // Use target sitting pos, not rig base
        const angle = Math.atan2(direction.x, direction.z);
        camera.cameraRotation.y = angle;
        
        this.isSitting = true;
        
        // Automatically pick up drumsticks
        this.pickupDrumsticks();
        
        if (this.log) {
            console.log("[ThroneController] Sitting down. Hold B to stand up.");
            console.log(`[ThroneController] Physical offset: ${physicalOffset.toString()}`);
            console.log(`[ThroneController] Target sitting pos: ${targetSittingPos.toString()}`);
            console.log(`[ThroneController] XR rig base moved to: ${camera.position.toString()}`);
            console.log(`[ThroneController] Player head at: ${camera.globalPosition.toString()}`);
            console.log(`[ThroneController] Drum kit position: ${drumKitPos.toString()}`);
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
        
        // Release drumsticks
        this.releaseDrumsticks();
        
        // Calculate current physical offset (might have changed while sitting)
        const currentPhysicalOffset = camera.globalPosition.subtract(camera.position);
        
        // Restore XR rig base position (player's head will be at savedPosition + currentPhysicalOffset)
        if (this.savedCameraPosition) {
            // To restore player's physical head position to where it was,
            // account for current physical offset
            const rigTargetPosition = this.savedCameraPosition.subtract(currentPhysicalOffset);
            camera.position.copyFrom(rigTargetPosition);
        }
        
        // Restore rotation
        if (this.savedCameraRotation !== null) {
            camera.cameraRotation.y = this.savedCameraRotation;
        }
        
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
}

export default ThroneController;
