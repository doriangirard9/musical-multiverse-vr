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

class XRDrum implements XRDrumComponent {

    //@ts-ignore
    name: String;
    drumComponentContainer: TransformNode;
    xrDrumKit: XRDrumKit;
    private logger: DrumComponentLogger;
    private lastHitTime: Map<string, number> = new Map(); // Track last hit time per drumstick
    private drumSkinMesh: AbstractMesh | undefined; // Reference to the drum skin for animation
    private originalMeshPositions: Map<string, Vector3> = new Map(); // Store original positions

    //@ts-ignore
    constructor(name: string, midiKey: number, xrDrumKit: XRDrumKit, drum3Dmodel: AbstractMesh[]) { //diameter in meters, height in meters, midiKey is the MIDI key to play when the trigger is hit
        this.name = name;
        this.xrDrumKit = xrDrumKit;
        this.logger = new DrumComponentLogger(name);

        this.drumComponentContainer = new TransformNode(name + "Container");
        this.drumComponentContainer.parent = xrDrumKit.drumContainer;
        xrDrumKit.drumComponents.push(this);

        
        const bodyPrimitives = drum3Dmodel.filter(mesh => (mesh.name === name || mesh.name.startsWith(name + "_primitive"))); // Find all primitives
        if (bodyPrimitives.length === 0) {
            this.logger.logError(`Failed to find the main body mesh with name '${name}' or its primitives in the provided drum3Dmodel.`);
            this.logger.logAvailableMeshes(drum3Dmodel);
            return;
        }
        
        bodyPrimitives.forEach(primitive => this.drumComponentContainer.addChild(primitive)); // Attach primitives to the parent node

        this.createDrumComponentBody(this.drumComponentContainer); // Create the body of the drum component

        const trigger = drum3Dmodel.find(mesh => mesh.name === this.name + "Trigger"); // Find the trigger mesh
        if (!trigger) {
            this.logger.logError(`Failed to find the trigger mesh inside the body '${name}'.`);
            return;
        }

        // Find the drum skin mesh for animation (assuming it's named with "Skin" suffix)
        this.drumSkinMesh = drum3Dmodel.find(mesh => mesh.name === this.name + "Skin");
        if (!this.drumSkinMesh) {
            // Try alternative naming conventions
            this.drumSkinMesh = bodyPrimitives.find(mesh => mesh.name.includes("skin") || mesh.name.includes("Skin"));
            if (this.drumSkinMesh) {
                this.logger.logDebug(`Found drum skin mesh: ${this.drumSkinMesh.name}`);
            }
        }

        this.drumComponentContainer.addChild(trigger); // Attach the trigger to the drum component container
        
        this.createDrumComponentTrigger(trigger);

        this.playSoundOnTrigger(midiKey, DRUMKIT_CONFIG.midi.durations.drums);
    }

    createDrumComponentBody(body: TransformNode | TransformNode[]) {
        if (Array.isArray(body)) {
            body.forEach(primitive => {
                this.createDrumComponentBody(primitive);
            });
            return;
        }
        body.getChildMeshes().forEach(mesh => {
            this.logger.logPhysicsSetup(mesh.name);
            /* REMOVED TO ENHANCE PERFORMANCE, ACTIVATE IF COLLISIONS NEEDED
            const bodyAggregate = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0 }, this.xrDrumKit.scene);
            bodyAggregate.body.setMotionType(PhysicsMotionType.STATIC);
            bodyAggregate.body.setPrestepType(PhysicsPrestepType.TELEPORT);
            */
            //bodyAggregate.body.setCollisionCallbackEnabled(true);
            //bodyAggregate.body.setEventMask(this.xrDrumKit.eventMask);
        });
    }

    refreshPhysicsAggregate(): void {
        this.drumComponentContainer.getChildMeshes().forEach(mesh => {
            if(mesh.name === this.name + "Trigger"){
                mesh.physicsBody?.dispose();
                this.createDrumComponentTrigger(mesh);
            }
        });
    }
    createDrumComponentTrigger(trigger: AbstractMesh) {
        if (trigger) {

            // IMPORTANT: Store original scale before creating physics aggregate
            const originalScale = trigger.scaling.clone();
            
            // Temporarily scale the mesh down to create a smaller physics shape
            trigger.scaling.scaleInPlace(this.xrDrumKit.scaleFactor);
            
            // Create physics aggregate with the scaled mesh (physics shape will be smaller)
            const triggerAggregate = new PhysicsAggregate(trigger, PhysicsShapeType.MESH, { mass: 0 }, this.xrDrumKit.scene);
            triggerAggregate.body.setMotionType(PhysicsMotionType.STATIC);
            triggerAggregate.body.setPrestepType(PhysicsPrestepType.TELEPORT);
            
            // CRITICAL: Restore the visual mesh to its original scale
            // This keeps the visual at full size while the physics shape remains at scaled size
            trigger.scaling.copyFrom(originalScale);
            
            // Show bounding box for debugging collision shapes
            if (DRUMKIT_CONFIG.debug.showBoundingBoxes) {
                trigger.showBoundingBox = true;
                this.logger.logBoundingBox(trigger.name);
            }
            
            if (triggerAggregate.body.shape) {
                triggerAggregate.body.shape.isTrigger = true;
                
                // COLLISION FILTERING: Drums only collide with drumsticks
                triggerAggregate.body.shape.filterMembershipMask = COLLISION_GROUP.DRUM;
                triggerAggregate.body.shape.filterCollideMask = COLLISION_GROUP.DRUMSTICK;
            }
        }
    }

    playSoundOnTrigger(midiKey: number, duration: number) { //duration in seconds
        this.xrDrumKit.hk.onTriggerCollisionObservable.add((collision: any) => {
            // Check if this collision involves THIS drum's trigger (could be either collider or collidedAgainst)
            const triggerName = this.name + "Trigger";
            const isThisDrumTrigger = CollisionUtils.isCollisionWithTrigger(collision, triggerName);
            
            if (collision.type === "TRIGGER_ENTERED" && isThisDrumTrigger) {
                this.logger.logCollision(collision);
                
                if (!this.xrDrumKit.drumSoundsEnabled) {
                    return; // Do not play sounds if drum sounds are disabled
                }

                // Find which drumstick hit the drum
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
                
                // Drums should only respond to downward hits (hitting the drum head)
                // Upward movement means stick is rebounding - ignore it
                if (!CollisionUtils.isDownwardHit(linear)) {
                    this.logger.logDebug("Upward movement detected, ignoring hit");
                    return; // Skip upward hits for drums
                }

                // Calculate velocity using utility
                const currentVelocity = CollisionUtils.calculateHitVelocity(drumstick);
                const combinedSpeed = linear.length() + (angular.length() * DRUMKIT_CONFIG.velocity.angularWeight);

                // Log velocity calculations
                this.logger.logVelocity(linear, angular, currentVelocity, combinedSpeed);

                // Animate drum skin trembling based on hit intensity
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
            // Ignore all collisions that don't involve this drum's trigger
        });
    }

    animateOnHit(velocity: number): void {
        // Animate ALL child meshes of the drum INCLUDING the trigger (drum skin)
        const meshesToAnimate = this.drumComponentContainer.getChildMeshes();
        
        if (meshesToAnimate.length === 0) {
            return; // No mesh to animate
        }

        // Animate each mesh using the centralized animation utility
        meshesToAnimate.forEach(mesh => {
            // Store original position if not already stored
            if (!this.originalMeshPositions.has(mesh.name)) {
                this.originalMeshPositions.set(mesh.name, mesh.position.clone());
            }
            
            const basePosition = this.originalMeshPositions.get(mesh.name)!;
            
            // Use the centralized animation utility
            AnimationUtils.createTrembleAnimation(
                mesh,
                velocity,
                basePosition,
                this.xrDrumKit.scene
            );
        });
    }

}
export default XRDrum;

/*
        // Add three legs to the drum container
        const leg1 = this.createLeg(new BABYLON.Vector3(-diameter / 2, -height / 2, 0), drumContainer);
        const leg2 = this.createLeg(new BABYLON.Vector3(diameter / 2, -height / 2, 0), drumContainer);
        const leg3 = this.createLeg(new BABYLON.Vector3(0, -height / 2, diameter / 2), drumContainer);
        */

        /* VERSION COLLISION ENTRE OBJETS (Pas de trigger) - Abandonné (difficile d'empêcher la batterie de bouger)
        const cylinderObservable = cylinderAggregate.body.getCollisionObservable();

        cylinderObservable.add((collisionEvent) => {
            //console.log("Collision détectée :", collisionEvent);
            if(collisionEvent.type !== "COLLISION_STARTED") return;
    
            console.log("ON JOUE : " + name);
    
            const noteMdiToPlay = midiKey;
    
            if (this.wamInstance) {
                // Joue une note lors de la collision
                this.wamInstance.audioNode.scheduleEvents({
                    type: 'wam-midi',
                    time: this.audioContext.currentTime,
                    data: { bytes: new Uint8Array([0x90, noteMdiToPlay, 100]) } // Note ON
                });
                this.wamInstance.audioNode.scheduleEvents({
                    type: 'wam-midi',
                    time: this.audioContext.currentTime + 0.25,
                    data: { bytes: new Uint8Array([0x80, noteMdiToPlay, 100]) } // Note OFF
                });
            }
        });
*/