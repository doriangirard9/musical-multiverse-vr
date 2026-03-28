import * as B from "@babylonjs/core";
import {Inspector} from "@babylonjs/inspector";
import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
// // Enable GLTF/GLB loader for loading controller models from WebXR Input registry
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Materials/Node/Blocks';
import {NetworkManager} from "../network/NetworkManager.ts";
import { WaveGround } from "../world/ground/WaveGround.ts";
import { SoundwaveEmitter } from "../world/soundwave/SoundwaveEmitter.ts";

export class SceneManager {
    private static _instance: SceneManager | null = null;

    private readonly canvas: HTMLCanvasElement;
    private readonly engine: B.Engine;
    private readonly scene: B.Scene;
    private readonly shadowGenerator: B.ShadowGenerator;
    private waveGround!: WaveGround;
    private soundwaveEmitter!: SoundwaveEmitter;
    //@ts-ignore
    private readonly ground: B.Mesh;
    private physicsInitialized: boolean = false;


    private constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new B.Engine(this.canvas, true, { stencil: true});
        this.scene = new B.Scene(this.engine);
        this.shadowGenerator = this.initializeShadowGenerator();
        this.ground = this.createGround();

        this.scene.clearColor = new B.Color4(0.15, 0.15, 0.15, 1);
        
        // Initialize physics asynchronously
        this.initializePhysics();

        // Handle window resize
        window.addEventListener("resize", () => {
            this.engine.resize();
        });

        // Enable inspector on 'U' key press
        window.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.code === "KeyU") {
                if (Inspector.IsVisible) {
                    Inspector.Hide();
                } else {
                    Inspector.Show(this.scene, { overlay: true, handleResize: true });
                }
            }
        });

        // Detect and prevent usage of EngineStore.LastCreatedScene
        B.EngineStore.LastCreatedScene
        const oldLastCreatedScene = Object.getOwnPropertyDescriptor(B.EngineStore, "LastCreatedScene");
        Object.defineProperty(B.EngineStore, "LastCreatedScene", {
            get: function () {
                console.error("Use EngineStore.LastCreatedScene is prohibited. Pass a scene to the constructor.")
                return oldLastCreatedScene?.get?.apply(B.EngineStore) ?? null
            },
        })
    }

    public static initialize() {
        const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
        this._instance = new SceneManager(canvas)
    }

    public static getInstance(): SceneManager {
        if (!this._instance) throw new Error("SceneManager not initialized. Call intialize() first.")
        return this._instance;
    }

    public start(): void {
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });
        let lastTime = performance.now();

        this.scene.onBeforeRenderObservable.add(() => {
            const currentTime = performance.now();
            const deltaTime = (currentTime - lastTime) / 1000; // Convertir en secondes
            lastTime = currentTime;

            // Mettre à jour l'interpolation des joueurs
            NetworkManager.getInstance().updatePlayers(deltaTime);
        });
    }

    public getScene(): B.Scene {
        return this.scene
    }

    public getWaveGround(): WaveGround {
        return this.waveGround
    }

    public getShadowGenerator(): B.ShadowGenerator {
        return this.shadowGenerator
    }

    public getSoundwaveEmitter(): SoundwaveEmitter {
        return this.soundwaveEmitter
    }

    /**
     * Initialize Havok physics engine
     */
    private async initializePhysics(): Promise<void> {
        try {
            console.log("[SceneManager] Initializing Havok physics...");
            const havokInstance = await HavokPhysics();
            const hk = new HavokPlugin(true, havokInstance);
            this.scene.enablePhysics(new B.Vector3(0, -9.8, 0), hk);
            this.physicsInitialized = true;
            console.log("[SceneManager] Havok physics initialized ✓");
            
            // Add physics to ground
            new B.PhysicsAggregate(
                this.ground, 
                B.PhysicsShapeType.BOX, 
                { mass: 0 }, 
                this.scene
            );
        } catch (error) {
            console.error("[SceneManager] Failed to initialize Havok physics:", error);
        }
    }

    public isPhysicsReady(): boolean {
        return this.physicsInitialized;
    }


    private initializeShadowGenerator(): B.ShadowGenerator {
        const light = new B.DirectionalLight("dir01", new B.Vector3(0, -1, 0), this.scene)
        light.position = new B.Vector3(0, 60, 0)
        light.intensity = 0.2

        const caster = new B.ShadowGenerator(1024, light)
        caster.transparencyShadow = true

        return caster
    }

    private createGround(): B.Mesh {
        // Ground dimensions
        const groundSize = { width: 100, height: 1, depth: 100 };
        const wallHeight = 2;
        const wallThickness = 1;


        // Soundwave emitter
        this.soundwaveEmitter = new SoundwaveEmitter(this.scene, -2+.5+.1, 80)

        // Ground
        const waveGround = this.waveGround = new WaveGround(20,20)
        waveGround.put(15,15,5,5,0)
        waveGround.root.scaling.copyFromFloats(groundSize.width, .1, groundSize.depth)
        waveGround.root.position.copyFromFloats(0, -2+.45, 0)

        setInterval(() => {
            waveGround.update()
        }, 50)

        setInterval(()=>{
            const x = Math.floor(Math.random()*30)
            const y = Math.floor(Math.random()*30)
            waveGround.put(x, y, Math.random()*5, Math.random()*5, Math.random()*5)
        },200)

        // Create ground
        const ground = B.MeshBuilder.CreateBox("ground", groundSize, this.scene)
        ground.position.y -= 2
        ground.checkCollisions = true
        ground.isVisible = false
        //ground.receiveShadows = true

        // Apply NodeMaterial to ground
        /*B.NodeMaterial.ParseFromSnippetAsync("I4DJ9Z", this.scene).then((nodeMaterial) => {
            ground.material = nodeMaterial;
        });*/

        // Create walls
        const halfHeight = wallHeight / 2
        const halfDepth = groundSize.depth / 2
        const halfWidth = groundSize.width / 2

        const createWall = (width: number, height: number, depth: number, posX: number, posY: number, posZ: number) => {
            const wall = B.MeshBuilder.CreateBox("wall", { width, height, depth }, this.scene)
            wall.position.set(posX, posY, posZ)
            wall.checkCollisions = true
            wall.isVisible = false
            wall.position.y -= 2
            return wall;
        };

        // Create four walls
        createWall(groundSize.width, wallHeight, wallThickness, 0, halfHeight, halfDepth) // Front
        createWall(groundSize.width, wallHeight, wallThickness, 0, halfHeight, -halfDepth) // Back
        createWall(wallThickness, wallHeight, groundSize.depth, halfWidth, halfHeight, 0) // Right
        createWall(wallThickness, wallHeight, groundSize.depth, -halfWidth, halfHeight, 0) // Left

        // Create hemispheric light
        const hemisphericLight = new B.HemisphericLight("hemisphericLight", new B.Vector3(0, 1, 0), this.scene)
        const light2 = new B.HemisphericLight("light2", new B.Vector3(0, -1, 0), this.scene)
        hemisphericLight.intensity = 0.6
        light2.intensity = 0.5

        return ground
    }



}