import XRDrumComponent from "./XRDrumComponent";
import { TransformNode } from "@babylonjs/core";
import { PhysicsAggregate, PhysicsMotionType, PhysicsPrestepType, PhysicsShapeType } from "@babylonjs/core/Physics";
import { AbstractMesh } from "@babylonjs/core";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import XRDrumKit from "../XRDrumKit";
import { DRUMKIT_CONFIG } from "../XRDrumKitConfig";
import { CollisionUtils } from "../CollisionUtils";
import { AnimationUtils } from "../AnimationUtils";
import { DrumComponentLogger } from "./XRDrumComponentLogger";
import { COLLISION_GROUP } from "../CollisionGroups";

class XRHiHat implements XRDrumComponent {

    //@ts-ignore
    name: String;
    drumComponentContainer: TransformNode;
    xrDrumKit: XRDrumKit;
    private logger: DrumComponentLogger;
    private lastHitTime: Map<string, number> = new Map(); // Track last hit time per drumstick
    private hiHatMesh: AbstractMesh | undefined; // Reference to the Hi-Hat mesh for animation
    private originalPosition: Vector3 | undefined; // Store original position
    hiHatAggregate: PhysicsAggregate | undefined; // Store physics aggregate reference

    //@ts-ignore
    constructor(name: string, midiKey: number, xrDrumKit: XRDrumKit, drum3Dmodel: AbstractMesh[]) {
        this.name = name;
        this.xrDrumKit = xrDrumKit;
        this.logger = new DrumComponentLogger(name);

        this.drumComponentContainer = new TransformNode(name + "Container");
        this.drumComponentContainer.parent = xrDrumKit.drumContainer;
        xrDrumKit.drumComponents.push(this);

        const hiHat3DMesh = drum3Dmodel.find(mesh => mesh.name === name);
        if (hiHat3DMesh === undefined) {
            this.logger.logError(`Failed to find the Hi-Hat mesh with name '${name}'`);
            this.logger.logAvailableMeshes(drum3Dmodel);
            return;
        }
        
        // Store reference to Hi-Hat mesh for animation
        this.hiHatMesh = hiHat3DMesh;
        this.originalPosition = hiHat3DMesh.position.clone();
        
        this.drumComponentContainer.addChild(hiHat3DMesh);

        this.createDrumComponentBody(this.drumComponentContainer);

        this.drumComponentContainer.addChild(hiHat3DMesh);

        this.createDrumComponentTrigger(hiHat3DMesh);

        this.playSoundOnTrigger(midiKey, DRUMKIT_CONFIG.midi.durations.hiHat);
    }

    createDrumComponentBody(body: TransformNode | TransformNode[]) {
        if (Array.isArray(body)) {
            body.forEach(primitive => {
                this.createDrumComponentBody(primitive);
            });
            return;
        }
        // PERFORMANCE OPTIMIZATION:
        // Physics bodies for Hi-Hat meshes are disabled as they're purely visual
        // and don't need collision detection (only triggers do)
        body.getChildMeshes().forEach(mesh => {
            this.logger.logPhysicsSetup(mesh.name);
        });
        // Visual mesh only - no physics aggregate needed
    }

    refreshPhysicsAggregate(): void {
        this.hiHatAggregate?.dispose();
        this.createDrumComponentTrigger(this.drumComponentContainer.getChildMeshes()[0]);
    }
    createDrumComponentTrigger(trigger: AbstractMesh) {
        if (trigger) {

            // IMPORTANT: Store original scale before creating physics aggregate
            const originalScale = trigger.scaling.clone();
            
            // Temporarily scale the mesh down to create a smaller physics shape
            trigger.scaling.scaleInPlace(this.xrDrumKit.scaleFactor);
            
            // Create STATIC physics - Hi-Hat doesn't move via physics, only via animation
            // The physics shape will be created based on the CURRENT (scaled) mesh geometry
            const triggerAggregate = new PhysicsAggregate(trigger, PhysicsShapeType.MESH, { mass: 0 }, this.xrDrumKit.scene);
            triggerAggregate.transformNode.id = this.name + "Trigger";
            triggerAggregate.body.setMotionType(PhysicsMotionType.STATIC);
            triggerAggregate.body.setPrestepType(PhysicsPrestepType.TELEPORT);
            
            // CRITICAL: Restore the visual mesh to its original scale
            // This keeps the visual at full size while the physics shape remains at scaled size
            trigger.scaling.copyFrom(originalScale);
            
            this.hiHatAggregate = triggerAggregate;
                      
            // Show bounding box for debugging collision shapes
            if (DRUMKIT_CONFIG.debug.showBoundingBoxes) {
                trigger.showBoundingBox = true;
                this.logger.logBoundingBox(trigger.name);
            }
            
            // COLLISION FILTERING: Hi-Hat is like a cymbal, only collides with drumsticks
            if (triggerAggregate.body.shape) {
                triggerAggregate.body.shape.isTrigger = true;
                triggerAggregate.body.shape.filterMembershipMask = COLLISION_GROUP.CYMBAL;
                triggerAggregate.body.shape.filterCollideMask = COLLISION_GROUP.DRUMSTICK;
            }
            
            this.logger.logDebug("Created static Hi-Hat trigger with tremble animation support");
        }
    }

    playSoundOnTrigger(midiKey: number, duration: number) {
        this.xrDrumKit.hk.onTriggerCollisionObservable.add((collision: any) => {
            const triggerName = this.name + "Trigger";
            const isThisHiHatTrigger = CollisionUtils.isCollisionWithTrigger(collision, triggerName);
            
            if (collision.type === "TRIGGER_ENTERED" && isThisHiHatTrigger) {
                this.logger.logCollision(collision);
                
                if (!this.xrDrumKit.drumSoundsEnabled) {
                    return;
                }

                // Find which drumstick hit the hi-hat
                const drumstickIndex = CollisionUtils.findDrumstickIndex(collision, this.xrDrumKit.drumsticks);
                if (drumstickIndex === -1) {
                    return; // Not hit by a drumstick
                }

                const drumstick = this.xrDrumKit.drumsticks[drumstickIndex];
                const drumstickId = drumstick.drumstickAggregate.transformNode.id;

                // DEBOUNCE: Prevent multiple triggers from same hit
                if (!CollisionUtils.checkDebounce(drumstickId, this.lastHitTime)) {
                    this.logger.logDebounce();
                    return;
                }
                
                const { linear, angular } = drumstick.getVelocity();
                
                // Hi-Hat can be hit from any direction (like cymbals)
                
                // Calculate velocity using utility
                const currentVelocity = CollisionUtils.calculateHitVelocity(drumstick);
                const combinedSpeed = linear.length() + (angular.length() * DRUMKIT_CONFIG.velocity.angularWeight);

                // Log velocity calculations
                this.logger.logVelocity(linear, angular, currentVelocity, combinedSpeed);

                // Animate Hi-Hat with tremble effect (like drums)
                this.animateOnHit(currentVelocity);

                // Vibrate the controller
                CollisionUtils.triggerHapticFeedback(drumstick.controllerAttached, currentVelocity);

                // Play the sound
                CollisionUtils.scheduleSound(
                    this.xrDrumKit.wamInstance,
                    this.xrDrumKit.audioContext,
                    midiKey,
                    currentVelocity,
                    duration
                );
                
                this.logger.logSound(midiKey, currentVelocity);
            }
        });
    }

    animateOnHit(velocity: number): void {
        if (!this.hiHatMesh || !this.originalPosition) {
            return;
        }

        // Use the specialized Hi-Hat tremble animation from utility
        AnimationUtils.createHiHatTrembleAnimation(
            this.hiHatMesh,
            velocity,
            this.originalPosition,
            this.xrDrumKit.scene
        );
    }

}
export default XRHiHat;
