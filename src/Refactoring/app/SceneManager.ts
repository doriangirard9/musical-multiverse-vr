import * as B from "@babylonjs/core";
import {Inspector} from "@babylonjs/inspector";
import {GridMaterial} from "@babylonjs/materials";
// // Enable GLTF/GLB loader for loading controller models from WebXR Input registry
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Materials/Node/Blocks';
import {NetworkManager} from "../network/NetworkManager.ts";

export class SceneManager {
    private static _instance: SceneManager | null = null;

    private readonly canvas: HTMLCanvasElement;
    private readonly engine: B.Engine;
    private readonly scene: B.Scene;
    private readonly shadowGenerator: B.ShadowGenerator;
    //@ts-ignore
    private readonly ground: B.Mesh;


    private constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new B.Engine(this.canvas, true);
        this.scene = new B.Scene(this.engine);
        this.shadowGenerator = this.initializeShadowGenerator();
        this.ground = this.createGround();

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

    }

    public static getInstance(canvas?: HTMLCanvasElement): SceneManager {
        if (!SceneManager._instance) {
            if (!canvas) {
                throw new Error("Canvas is required for first instantiation");
            }
            SceneManager._instance = new SceneManager(canvas);
        }
        return SceneManager._instance;
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
        return this.scene;
    }

    public getShadowGenerator(): B.ShadowGenerator {
        return this.shadowGenerator;
    }


    private initializeShadowGenerator(): B.ShadowGenerator {
        const light = new B.DirectionalLight("dir01", new B.Vector3(0, -1, 0), this.scene);
        light.position = new B.Vector3(0, 60, 0);
        light.intensity = 0.2;

        return new B.ShadowGenerator(1024, light);
    }

    private createGround(): B.Mesh {
        // Create grid material
        const grid = new GridMaterial("grid", this.scene);
        grid.gridRatio = 0.1;
        grid.majorUnitFrequency = 5;
        grid.mainColor = new B.Color3(0.5, 0.5, 0.5);
        grid.lineColor = new B.Color3(1, 1, 1);

        const wallGrid = grid.clone("wallgrid");
        wallGrid.mainColor = new B.Color3(0, 0, 0);

        // Ground dimensions
        const groundSize = { width: 100, height: 1, depth: 100 };
        const wallHeight = 2;
        const wallThickness = 1;

        // Create ground
        const ground = B.MeshBuilder.CreateBox("ground", groundSize, this.scene);
        ground.position.y -= 2;
        ground.checkCollisions = true;
        ground.receiveShadows = true;

        // Apply NodeMaterial to ground
        B.NodeMaterial.ParseFromSnippetAsync("I4DJ9Z", this.scene).then((nodeMaterial) => {
            ground.material = nodeMaterial;
        });

        // Create walls
        const halfHeight = wallHeight / 2;
        const halfDepth = groundSize.depth / 2;
        const halfWidth = groundSize.width / 2;

        const createWall = (width: number, height: number, depth: number, posX: number, posY: number, posZ: number) => {
            const wall = B.MeshBuilder.CreateBox("wall", { width, height, depth }, this.scene);
            wall.material = wallGrid;
            wall.position.set(posX, posY, posZ);
            wall.checkCollisions = true;
            wall.position.y -= 2;
            return wall;
        };

        // Create four walls
        createWall(groundSize.width, wallHeight, wallThickness, 0, halfHeight, halfDepth); // Front
        createWall(groundSize.width, wallHeight, wallThickness, 0, halfHeight, -halfDepth); // Back
        createWall(wallThickness, wallHeight, groundSize.depth, halfWidth, halfHeight, 0); // Right
        createWall(wallThickness, wallHeight, groundSize.depth, -halfWidth, halfHeight, 0); // Left

        // Create hemispheric light
        const hemisphericLight = new B.HemisphericLight("hemisphericLight", new B.Vector3(0, 1, 0), this.scene);
        const light2 = new B.HemisphericLight("light2", new B.Vector3(0, -1, 0), this.scene);
        hemisphericLight.intensity = 0.6;
        light2.intensity = 0.5;

        return ground;
    }

}