import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { SteeringVehicle } from "./steering/SteeringVehicle";
import { Observer, Scene } from "@babylonjs/core";
import { PointerDragBehavior } from "@babylonjs/core";
import { Vector3 } from '@babylonjs/core';

// ==========================================
// 1. THE VISUALS (Meshes & Materials)
// ==========================================
export class SwarmThereminN3DGUI implements Node3DGUI {
    
    public root: any;
    public plate: any;
    public targetMesh: any;
    public boidMeshes: any[] = [];

    get worldSize() { return 1; } // Scale factor for the XR world

    constructor(context: Node3DGUIContext) {
        const { babylon: B, scene } = context;

        this.root = new B.TransformNode("swarm-root", scene);

        // 1. Build the Grid Plate
        this.plate = B.MeshBuilder.CreatePlane("swarm-plate", { size: 5 }, scene);
        this.plate.rotation.x = Math.PI / 2;
        this.plate.parent = this.root;
        
        // (Optional: You can use your GridMaterial here if you import it, 
        // but let's use the shared material for now to ensure it compiles safely)
        this.plate.material = context.materialMat; 

        // 2. Build the target indicator (The Pink Ball)
        this.targetMesh = B.MeshBuilder.CreateSphere("swarm-target", { diameter: 0.5 }, scene);
        this.targetMesh.position.y = 0.25;
        this.targetMesh.parent = this.root;
        
        const tMat = new B.StandardMaterial("tMat", scene);
        tMat.emissiveColor = new B.Color3(1, 0, 0.5);
        this.targetMesh.material = tMat;

        // 3. Build the Boids
        for (let i = 0; i < 5; i++) {
            const boid = B.MeshBuilder.CreateCylinder("boid", { height: 0.4, diameterTop: 0, diameterBottom: 0.2 }, scene);
            boid.rotation.x = Math.PI / 2;
            boid.position.set((Math.random() - 0.5) * 5, 0.25, (Math.random() - 0.5) * 5);
            boid.parent = this.root;
            this.boidMeshes.push(boid);
        }
    }

    async dispose() {
        // Babylon handles child mesh disposal automatically when the root is disposed by the Engine
    }
}

// ==========================================
// 2. THE LOGIC (Physics & Audio)
// ==========================================
export class SwarmThereminN3D implements Node3D {
    public targetPos: Vector3;
    public vehicles: SteeringVehicle[] = [];
    private renderObserver: Observer<Scene> | null = null;

    constructor(private context: Node3DContext, private gui: SwarmThereminN3DGUI) {
        const {tools:T} = context
        
        // Register the main plate to the node's bounding box so you can grab/move the whole instrument structure in VR
        context.addToBoundingBox(gui.plate);

        // --- NEW: VR HAND INTERACTION ---
        // 1. Initialize the target position
        this.targetPos = gui.targetMesh.position.clone();

        // 2. Attach a Drag Behavior constrained to the X/Z plane (the flat grid)

        /*const dragBehavior = new T.InputGrabBehavior(
            ()=>{},
            ()=>{},
            ()=>{
                gui.targetMesh.position.x = Math.max(-2.5, Math.min(2.5, gui.targetMesh.position.x));
                gui.targetMesh.position.z = Math.max(-2.5, Math.min(2.5, gui.targetMesh.position.z));
                gui.targetMesh.position.y = 0.25; // Lock the height
                
                // Update the physics target for the boids
                this.targetPos.copyFrom(gui.targetMesh.position);
            },
        )
        gui.targetMesh.addBehavior(dragBehavior)*/

        const dragBehavior = new PointerDragBehavior({ dragPlaneNormal: new Vector3(0, 1, 0) });
        dragBehavior.useObjectOrientationForDragging = false;
        gui.targetMesh.addBehavior(dragBehavior);

        // 3. Keep the ball strictly within the bounds of the 5x5 plate while dragging
        dragBehavior.onDragObservable.add(() => {
            
        });

        // Initialize Physics for the Boids
        for (let mesh of gui.boidMeshes) {
            const v = new SteeringVehicle(mesh);
            v.maxSpeed = 3.0;
            v.perceptionRadius = 3.0;
            v.behaviorManager.setBehaviorWeight("Wander", 1.0);
            this.vehicles.push(v);
        }

        // Hook into Babylon's render loop for continuous physics calculations
        const scene = gui.root.getScene();
        this.renderObserver = scene.onBeforeRenderObservable.add(() => this.updatePhysics(scene));
    }

    private updatePhysics(scene: Scene) {
        const dt = Math.min(scene.getEngine().getDeltaTime() / 1000.0, 0.1);
        if (dt <= 0) return;

        // Note: targetVehicle is GONE! The target is now 1:1 attached to your VR Hand.

        const targetData = {
            position: this.targetPos,
            boids: this.vehicles,
        };

        for (const v of this.vehicles) {
            // Tell the boids to flock toward the VR hand's position
            v.behaviorManager.flock(targetData.boids, {
                x: -2.5, y: -2.5, width: 5, height: 5, distance: 1
            });
            v.applyComplexBehaviors(targetData);
            v.update(dt);
            v.edges(5, 5);
        }
    }

    // Required Interface Methods for Node3D State Synchronization
    async setState(key: string, value: any) { }
    async getState(key: string) { return null; }
    getStateKeys() { return []; }
    
    async dispose() {
        if (this.renderObserver) {
            this.gui.root.getScene().onBeforeRenderObservable.remove(this.renderObserver);
        }
    }
}

// ==========================================
// 3. THE FACTORY (Registration)
// ==========================================
export const SwarmThereminN3DFactory: Node3DFactory<SwarmThereminN3DGUI, SwarmThereminN3D> = {
    label: "Swarm Theremin",
    description: "An interactive 3D theremin surrounded by flocking boids.",
    tags: ["swarm", "audio", "interactive"],
    
    createGUI: async (context) => new SwarmThereminN3DGUI(context),
    create: async (context, gui) => new SwarmThereminN3D(context, gui),
};