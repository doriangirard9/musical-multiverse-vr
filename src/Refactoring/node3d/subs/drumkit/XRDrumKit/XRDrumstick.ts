import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
//import { WebXRControllerPhysics } from "@babylonjs/core/XR/features/WebXRControllerPhysics";
//import { Observable } from "@babylonjs/core/Misc/observable";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder, StandardMaterial, PhysicsAggregate, PhysicsShapeType, PhysicsMotionType, PhysicsPrestepType, Color3 } from "@babylonjs/core";
import { Sound } from "@babylonjs/core/Audio/sound";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math";
//import { Axis } from "@babylonjs/core/Maths/math";
//import { PhysicsImpostor } from "@babylonjs/core/Physics/physicsImpostor";
import XRDrumKit from "./XRDrumKit";
import XRLogger from "../XRLogger";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { COLLISION_GROUP } from "./CollisionGroups";
import { DRUMKIT_CONFIG } from "./XRDrumKitConfig";
import { PhysicsShapeSphere, PhysicsShapeCapsule } from "@babylonjs/core/Physics/v2/physicsShape";

class XRDrumstick {

    xrDrumKit: XRDrumKit; // Reference to XRDrumKit for shared console and to deactivate sounds if needed
    drumstickAggregate: PhysicsAggregate;
    scene: Scene;
    eventMask: number;
    name : string;
    showBoundingBox: boolean = false; // Display collision bounding boxes for debugging
    controllerAttached: WebXRInputSource | null = null;
    private transitionTimeout: number | null = null; // Timeout for TELEPORT -> ACTION transition
    log = false;
    xrLogger : XRLogger; //To get controller positions, consider moving this logic outside this class
    
    // Drumstick collision detection (using Babylon.js collision system, not Havok)
    private collisionStick: Mesh | null = null; // Invisible sphere at tip for collision detection
    private collisionSound: Sound | null = null;
    private lastCollisionTime: number = 0;
    private otherDrumstick: XRDrumstick | null = null; // Reference to the other drumstick for collision checks
    private isCurrentlyColliding: boolean = false; // Track if currently in collision to prevent repeated triggers
    private pickupTime: number = 0; // Track when drumstick was picked up to prevent immediate collision sound

    constructor(xr : WebXRDefaultExperience, xrDrumKit: XRDrumKit, scene: Scene, eventMask: number, stickNumber : Number, xrLogger : XRLogger) {
        
        this.eventMask = eventMask;
        this.scene = scene;
        this.name = "drumstick" + stickNumber;
        //@ts-ignore
        this.drumstickAggregate = this.createDrumstick(xr, stickNumber);
        this.xrDrumKit = xrDrumKit;
        // Only update transform when attached - no need for manual velocity calculation
        scene.onBeforeRenderObservable.add(() => this.updateTransform());
        this.xrLogger = xrLogger; // Initialize the logger
        
        // Only initialize collision detection if enabled in config
        if (DRUMKIT_CONFIG.drumstick.enableCollisionDetection) {
            // Create collision detection sphere
            this.createcollisionStick(stickNumber);
            
            // Load collision sound
            this.loadCollisionSound();
        }
    }

    createDrumstick(xr: WebXRDefaultExperience, stickNumber : Number) {
        const stickLength = DRUMKIT_CONFIG.drumstick.stickLength;
        const stickDiameter = DRUMKIT_CONFIG.drumstick.stickDiameter;
        const ballDiameter = DRUMKIT_CONFIG.drumstick.ballDiameter;

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
        
        // Create brown wood material for drumsticks
        const stickMaterial = new StandardMaterial("stickMaterial_" + stickNumber, this.scene);
        stickMaterial.diffuseColor = new Color3(0.6, 0.4, 0.2); // Brown wood color
        stickMaterial.specularColor = new Color3(0.2, 0.2, 0.2); // Subtle shine
        mergedStick.material = stickMaterial;
        
        mergedStick.position = new Vector3(0, 1, 1);
        
        // Create COMPOUND physics shape: Capsule (stick) + Sphere (ball) = Single collision object
        // This prevents double-hits when both parts pass through a trigger
        var drumstickAggregate = new PhysicsAggregate(
            mergedStick, 
            PhysicsShapeType.CONTAINER,  // Container for compound shapes
            { mass: DRUMKIT_CONFIG.drumstick.mass }, 
            this.scene
        );
        
        // Add capsule shape for the stick portion (full length of stick)
        const capsuleShape = new PhysicsShapeCapsule(
            new Vector3(0, -stickLength / 2, 0),  // Point A (bottom of stick)
            new Vector3(0, stickLength / 2, 0),   // Point B (top of stick where ball starts)
            stickDiameter / 2,                     // Radius
            this.scene
        );
        drumstickAggregate.shape.addChildFromParent(mergedStick, capsuleShape, mergedStick);
        
        // Add sphere shape for the ball tip
        const sphereShape = new PhysicsShapeSphere(
            new Vector3(0, stickLength / 2, 0),   // Ball position at tip (same as capsule top point)
            ballDiameter / 2,                      // Ball radius
            this.scene
        );
        drumstickAggregate.shape.addChildFromParent(mergedStick, sphereShape, mergedStick);
        
        drumstickAggregate.body.setCollisionCallbackEnabled(true);
        drumstickAggregate.body.setEventMask(this.eventMask);

        // COLLISION FILTERING: Drumsticks collide with drums, cymbals, and ground (but not each other)
        if (drumstickAggregate.body.shape) {
            drumstickAggregate.body.shape.filterMembershipMask = COLLISION_GROUP.DRUMSTICK;
            drumstickAggregate.body.shape.filterCollideMask = COLLISION_GROUP.DRUM | COLLISION_GROUP.CYMBAL | COLLISION_GROUP.DRUMSTICK ;
            console.log(`[${this.name}] Collision filtering: DRUMSTICK -> (DRUM | CYMBAL | GROUND)`);
        }

        // Show bounding box for debugging collision shapes
        if (this.showBoundingBox) {
            mergedStick.showBoundingBox = true;
            console.log(`[${this.name}] Bounding box enabled. Compound shape: Capsule + Sphere`);
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
                    const controllerPos = controller.grip.position;
                    const controllerRot = controller.grip.rotationQuaternion || Quaternion.Identity();
                    this.xrLogger.updateControllerPositions(controllerPos, controllerRot, controller.inputSource.handedness);
                    
                    // Get velocities directly from physics body (automatically calculated by ACTION prestep)
                    const linearVel = this.drumstickAggregate.body.getLinearVelocity();
                    const angularVel = this.drumstickAggregate.body.getAngularVelocity();
                    this.xrLogger.updateControllerVelocity(linearVel, angularVel, this.drumstickAggregate.transformNode.id);
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
     * 
     * PICKUP TRANSITION STRATEGY:
     * 1. Initially use TELEPORT prestep to avoid hitting other objects during pickup
     * 2. After a short delay (200ms), switch to ACTION prestep for proper collision physics
     * 
     * This prevents the drumstick from sending other objects flying when being picked up
     */
    private attachToController(controller: WebXRInputSource, _stickLength: number) {
        if (controller.grip) {
            // Clear any existing transition timeout
            if (this.transitionTimeout !== null) {
                clearTimeout(this.transitionTimeout);
                this.transitionTimeout = null;
            }
            
            // Record pickup time to prevent immediate collision detection
            this.pickupTime = performance.now();
            
            // ===== PHASE 1: TELEPORT (Safe Pickup) =====
            // Use TELEPORT initially to avoid collisions during pickup
            this.drumstickAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
            this.drumstickAggregate.body.setPrestepType(PhysicsPrestepType.TELEPORT);
            this.drumstickAggregate.body.setCollisionCallbackEnabled(true);
            this.drumstickAggregate.body.setEventMask(this.eventMask);
            
            // Zero out velocity to prevent sudden movements
            this.drumstickAggregate.body.setLinearVelocity(Vector3.Zero());
            this.drumstickAggregate.body.setAngularVelocity(Vector3.Zero());
            
            this.controllerAttached = controller;
            
            if (this.log) {
                console.log(`[${this.name}] Attached with TELEPORT prestep (transition in ${DRUMKIT_CONFIG.drumstick.pickupTransitionMs}ms)`);
            }
            
            // ===== PHASE 2: Transition to ACTION (After Delay) =====
            // After a short delay, switch to ACTION for proper physics-based collisions
            this.transitionTimeout = window.setTimeout(() => {
                if (this.controllerAttached && this.drumstickAggregate) {
                    this.drumstickAggregate.body.setPrestepType(PhysicsPrestepType.ACTION);
                    
                    if (this.log) {
                        console.log(`[${this.name}] Transitioned to ACTION prestep - collisions now active`);
                    }
                }
                this.transitionTimeout = null;
            }, DRUMKIT_CONFIG.drumstick.pickupTransitionMs);
            
            /* ===== OLD APPROACH: Immediate ACTION (causes flying objects) =====
            this.drumstickAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
            this.drumstickAggregate.body.setPrestepType(PhysicsPrestepType.ACTION);
            this.drumstickAggregate.body.setCollisionCallbackEnabled(true);
            this.drumstickAggregate.body.setEventMask(this.eventMask);
            this.controllerAttached = controller;
            */
        }
    }

    releaseStick(drumstickAggregate: PhysicsAggregate) {
        if (drumstickAggregate) {
            // Clear transition timeout if stick is released during pickup
            if (this.transitionTimeout !== null) {
                clearTimeout(this.transitionTimeout);
                this.transitionTimeout = null;
            }
            
            drumstickAggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
            drumstickAggregate.body.setPrestepType(PhysicsPrestepType.DISABLED);
            this.controllerAttached = null;
            
            // If using APPROACH 2, also need to unparent:
            // drumstickAggregate.transformNode.setParent(null);
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

    /**
     * Update drumstick transform to follow controller when attached
     * With ACTION prestep type, the physics engine automatically calculates velocities
     */
    private updateTransform() {
        // ===== APPROACH 1 ONLY: Manual Transform Updates =====
        // If drumstick is attached to a controller, update its transform to follow the controller
        // NOTE: This section is NOT needed if using APPROACH 2 (parenting)
        if (this.controllerAttached && this.controllerAttached.grip) {
            const stickLength = DRUMKIT_CONFIG.drumstick.stickLength;
            
            // Get controller's world transform
            const controllerPosition = this.controllerAttached.grip.absolutePosition.clone();
            const controllerRotation = this.controllerAttached.grip.absoluteRotationQuaternion || Quaternion.Identity();
            
            // Calculate drumstick offset (same as before when parented)
            const offset = new Vector3(0, 0, stickLength / 4);
            const rotationOffset = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2); // Axis.X = new Vector3(1,0,0)
            
            // Apply rotation offset
            const finalRotation = controllerRotation.multiply(rotationOffset);
            
            // Rotate offset by controller rotation and add to position
            const rotatedOffset = offset.rotateByQuaternionToRef(controllerRotation, new Vector3());
            const finalPosition = controllerPosition.add(rotatedOffset);
            
            // Update drumstick transform using setTargetTransform for smooth physics
            // This is the proper way for ANIMATED bodies - avoids TELEPORT issues
            // The physics engine will automatically calculate velocities from the transform change
            this.drumstickAggregate.transformNode.position.copyFrom(finalPosition);
            this.drumstickAggregate.transformNode.rotationQuaternion = finalRotation;
            
            // Sync physics body with the visual transform
            this.drumstickAggregate.body.setTargetTransform(finalPosition, finalRotation);
            
            // VELOCITY LOGGING FOR TUNING - Only log when drumstick is held
            if(this.log && this.controllerAttached) {
                // Get velocities directly from physics body
                const linearVel = this.drumstickAggregate.body.getLinearVelocity();
                const angularVel = this.drumstickAggregate.body.getAngularVelocity();
                
                const linearSpeed = linearVel.length();
                const angularSpeed = angularVel.length();
                const combinedSpeed = linearSpeed + (angularSpeed * DRUMKIT_CONFIG.velocity.angularWeight);
                
                // Log every frame to capture peak velocities during fast movements
                console.log(`[${this.name}] Linear: ${linearSpeed.toFixed(3)} m/s | Angular: ${angularSpeed.toFixed(3)} rad/s | Combined: ${combinedSpeed.toFixed(3)}`);
            }
            
            // Update collision sphere position and check for collisions ONLY when held
            if (DRUMKIT_CONFIG.drumstick.enableCollisionDetection) {
                this.updatecollisionStick();
                this.checkDrumstickCollision();
            }
        }
    }

    /**
     * Get drumstick velocities directly from physics body
     * With ACTION prestep type and setTargetTransform(), the engine calculates these automatically
     */
    getVelocity(): { linear: Vector3; angular: Vector3 } {
        return {
            linear: this.drumstickAggregate.body.getLinearVelocity(),
            angular: this.drumstickAggregate.body.getAngularVelocity()
        };
    }

    /**
     * Create an invisible collision cylinder along the drumstick body
     * Uses Babylon.js collision system (not Havok physics)
     */
    private createcollisionStick(stickNumber: Number): void {
        const radius = DRUMKIT_CONFIG.drumstick.stickDiameter / 2;
        const length = DRUMKIT_CONFIG.drumstick.stickLength;
        
        // Create invisible cylinder along the stick body (not the ball)
        this.collisionStick = MeshBuilder.CreateCylinder(
            `drumstickCollisionCylinder${stickNumber}`,
            { 
                height: length,
                diameter: radius * 2 
            },
            this.scene
        );
        
        // Make it visible for debugging/adjustment (controlled by config)
        const showMesh = DRUMKIT_CONFIG.drumstick.showCollisionMesh;
        this.collisionStick.isVisible = showMesh;
        if (showMesh) {
            const mat = new StandardMaterial(`collisionCylinderMat${stickNumber}`, this.scene);
            mat.diffuseColor = new Color3(0, 1, 0); // Green for cylinder
            mat.alpha = 0.4; // Semi-transparent so you can see the stick inside
            mat.wireframe = false; // Set to true to see as wireframe
            this.collisionStick.material = mat;
        }
        
        // Position along stick body initially (centered on stick, not at tip)
        this.collisionStick.position = new Vector3(0, 0, 0);
        
        // Enable collision checking for intersectsMesh() detection
        this.collisionStick.checkCollisions = false; // Don't use physics collisions
        
        // Make it non-collidable with physics objects (camera, etc.)
        this.collisionStick.isPickable = false; // Can't be picked/selected
        
        if (DRUMKIT_CONFIG.debug.logDrumstickCollisions) {
            console.log(`[${this.name}] Created collision detection cylinder on stick body (length: ${length}m, radius: ${radius}m)`);
            console.log(`[${this.name}] Collision mesh is VISIBLE (green cylinder) for adjustment`);
        }
    }

    /**
     * Update collision cylinder position and rotation to follow the drumstick body
     * Called every frame in updateTransform()
     */
    private updatecollisionStick(): void {
        if (!this.collisionStick) return;

        const cylinderOffset = new Vector3(0, 0, 0);
        
        // Get drumstick's rotation
        const drumstickRotation = this.drumstickAggregate.transformNode.rotationQuaternion || Quaternion.Identity();
        
        // Rotate the cylinder offset by drumstick rotation
        const rotatedOffset = cylinderOffset.rotateByQuaternionToRef(drumstickRotation, new Vector3());
        
        // Calculate world position of the cylinder center
        const cylinderPosition = this.drumstickAggregate.transformNode.position.add(rotatedOffset);
        
        // Update collision cylinder position and rotation
        this.collisionStick.position.copyFrom(cylinderPosition);
        this.collisionStick.rotationQuaternion = drumstickRotation;
    }

    /**
     * Check for collision with the other drumstick
     * Uses Babylon.js's intersectsMesh() method
     * Implements TRIGGER_ENTERED logic - only fires once until sticks separate
     */
    private checkDrumstickCollision(): void {
        if (!this.otherDrumstick || !this.collisionStick || !this.otherDrumstick.collisionStick) {
            return;
        }
        
        // Don't check collision during grace period after pickup
        const now = performance.now();
        const timeSincePickup = now - this.pickupTime;
        const timeSinceOtherPickup = now - this.otherDrumstick.pickupTime;
        const gracePeriod = DRUMKIT_CONFIG.drumstick.collisionGracePeriodMs;
        
        // If either stick was recently picked up, skip collision detection
        if (timeSincePickup < gracePeriod || timeSinceOtherPickup < gracePeriod) {
            return;
        }
        
        // Check if our collision cylinder intersects with the other drumstick's collision cylinder
        // Use precise=true for accurate mesh-to-mesh collision detection
        const isIntersecting = this.collisionStick.intersectsMesh(this.otherDrumstick.collisionStick, true);
        
        if (isIntersecting) {
            // COLLISION ENTER - only trigger if we weren't colliding before
            if (!this.isCurrentlyColliding) {
                this.isCurrentlyColliding = true;
                
                // Debounce to prevent sound spam (extra safety)
                if (now - this.lastCollisionTime < DRUMKIT_CONFIG.drumstick.collisionDebounceMs) {
                    return;
                }
                
                this.lastCollisionTime = now;
                
                // Play collision sound
                this.playCollisionSound();
                
                // Trigger haptic feedback on BOTH controllers
                this.triggerCollisionHaptics();
                if (this.otherDrumstick) {
                    this.otherDrumstick.triggerCollisionHaptics();
                }
                
                if (DRUMKIT_CONFIG.debug.logDrumstickCollisions) {
                    console.log(`[${this.name}] COLLISION ENTERED with ${this.otherDrumstick.name}`);
                }
            }
        } else {
            // COLLISION EXIT - reset flag when sticks separate
            if (this.isCurrentlyColliding) {
                this.isCurrentlyColliding = false;
                
                if (DRUMKIT_CONFIG.debug.logDrumstickCollisions) {
                    console.log(`[${this.name}] COLLISION EXITED from ${this.otherDrumstick.name}`);
                }
            }
        }
    }

    /**
     * Load the drumstick collision sound
     */
    private loadCollisionSound(): void {
        const soundPath = DRUMKIT_CONFIG.drumstick.collisionSoundPath;
        const volume = DRUMKIT_CONFIG.drumstick.collisionSoundVolume;
        
        this.collisionSound = new Sound(
            `${this.name}_collision`,
            soundPath,
            this.scene,
            null,
            {
                loop: false,
                autoplay: false,
                volume: volume
            }
        );
        
        if (DRUMKIT_CONFIG.debug.logDrumstickCollisions) {
            console.log(`[${this.name}] Loaded collision sound: ${soundPath}`);
        }
    }

    /**
     * Play the collision sound when drumsticks collide
     */
    private playCollisionSound(): void {
        if (this.collisionSound && this.collisionSound.isReady()) {
            this.collisionSound.play();
        }
    }

    /**
     * Trigger haptic feedback on the controller holding this drumstick
     */
    private triggerCollisionHaptics(): void {
        if (!this.controllerAttached?.motionController?.gamepadObject?.hapticActuators?.[0]) {
            return;
        }

        // Use configured intensity and duration for stick collisions
        const intensity = DRUMKIT_CONFIG.drumstick.collisionHapticIntensity;
        const duration = DRUMKIT_CONFIG.drumstick.collisionHapticDuration;

        this.controllerAttached.motionController.gamepadObject.hapticActuators[0].pulse(
            intensity,
            duration
        );
    }

    /**
     * Set reference to the other drumstick for collision detection
     * Called from XRDrumKit after both drumsticks are created
     */
    setOtherDrumstick(otherDrumstick: XRDrumstick): void {
        this.otherDrumstick = otherDrumstick;
    }
}
export default XRDrumstick;