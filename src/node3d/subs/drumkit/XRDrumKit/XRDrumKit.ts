import { Scene } from "@babylonjs/core/scene";
import { PhysicsViewer } from "@babylonjs/core";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core";
import { WebXRDefaultExperience } from "@babylonjs/core";
import { AssetsManager } from "@babylonjs/core";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import XRDrumComponent from "./XRDrumComponent/XRDrumComponent";
import XRDrumstick from "./XRDrumstick";
import XRDrum from "./XRDrumComponent/XRDrum";
import XRCymbal from "./XRDrumComponent/XRCymbal"
import XRHiHat from "./XRDrumComponent/XRHiHat";
//import XRLogger from "./XRLogger";
import { DRUMKIT_CONFIG } from "./XRDrumKitConfig";
import ThroneController from "./ThroneController";
import ThroneUI from "./ThroneUI";

//TODO : 
    //Ajouter option pour sortir un enregistrement sous forme de piano roll / liste d'évènements MIDI
    //Ajuster vélocité IHM
    //Sons différents en bordure / au centre de la peau ? (+ bordure métallique)
    //Pédale Grosse caisse / Hi-Hat ? (appuyer sur un bouton en attendant d'ajouter des pédales midi ?)
    //Tenir les baguettes avec la gachette interne plutôt ? (permet d'avoir une autre position de main, plus adaptée ?)
    //Use a 0 distance constraint to snap drumsticks to hands ? 
    
//Intégration avec Musical Metaverse (interface PedalNode3D) :
    //EventBus Emitter
    //Ajouter signature de la batterie

class XRDrumKit {
    audioContext?: AudioContext;
    hk: any;
    scene: Scene;
    eventMask: number; //retirer ?
    wamInstance: any;
    drumComponents: XRDrumComponent[];
    drumContainer: TransformNode;
    xr: WebXRDefaultExperience;
    assetsManager: AssetsManager;
    drumsticks: XRDrumstick[] = [];
    drumSoundsEnabled: boolean;
    loadedMeshes: AbstractMesh[] | undefined; // Store loaded meshes
    kick : XRDrum | undefined;
    snare: XRDrum | undefined;
    snareKey: number = 38;
    rimshotKey: number = 37;
    floorTom: XRDrum | undefined;
    midTom: XRDrum | undefined;
    highTom: XRDrum | undefined;
    crashCymbal1: XRCymbal | undefined;
    crashCymbal2: XRCymbal | undefined;
    rideCymbal: XRCymbal | undefined;
    hiHat: XRHiHat | undefined;
    closedHiHatKey: number = 42;
    openHiHatKey: number = 46;
    throne : TransformNode | undefined;
    throneController: ThroneController | undefined; // Controller for sitting/standing functionality
    throneUI: ThroneUI | undefined; // UI for throne interaction prompts
    path = DRUMKIT_CONFIG.model.path; // Path to the 3D model folder
    log = false;
    scaleFactor: number = DRUMKIT_CONFIG.model.scaleFactor; // Scale factor for physics trigger shapes (0.7 = 70% of visual size)
    //xrLogger: XRLogger;

    constructor(scene: Scene, eventMask: number, xr: WebXRDefaultExperience, hk: any, assetsManager: AssetsManager) {
        this.hk = hk;
        this.xr = xr;
        this.scene = scene;
        this.eventMask = eventMask;
        this.assetsManager = assetsManager;
        this.wamInstance = null;
        this.drumComponents = [];
        this.drumContainer = new TransformNode("drumContainer", this.scene);
        this.drumSoundsEnabled = true;
        //this.xrLogger = new XRLogger(xr, scene);
    
    }

    /**
     * Load the drum kit mesh from the assets manager
     * @returns Promise that resolves with the loaded meshes
     */
    async loadMesh(): Promise<AbstractMesh[]> {
        return new Promise((resolve, reject) => {
            const meshTask = this.assetsManager.addMeshTask("drum3DModel", "", this.path, DRUMKIT_CONFIG.model.fileName);
            
            //@ts-ignore
            meshTask.onError = (task, message, exception) => {
                console.error(`Failed to load mesh for drum kit:`, message, exception);
                reject(new Error(`Failed to load mesh: ${message}`));
            };

            meshTask.onSuccess = (task) => {
                this.loadedMeshes = task.loadedMeshes;
                if(this.log){
                    console.log("Available meshes:", this.loadedMeshes.map(mesh => mesh.name));
                }
                this.drumContainer.addChild(this.loadedMeshes[0]);
                resolve(this.loadedMeshes);
            };

            this.assetsManager.load();
        });
    }

    /**
     * Initialize the drum kit components from the loaded mesh
     * This should be called after loadMesh() has successfully completed
     */
    initializeDrumKit(): void {
        if (!this.loadedMeshes) {
            console.error("Cannot initialize drum kit: meshes not loaded. Call loadMesh() first.");
            return;
        }

        this.drumContainer.removeChild(this.loadedMeshes[0]); // Clear any existing children

         for (var i = 0; i < 2; i++) {
            this.drumsticks[i] = new XRDrumstick(this.xr, this, this.scene, this.eventMask, i+1, /*this.xrLogger*/);
        }
        
        // Set references so drumsticks can detect collisions with each other (only if feature enabled)
        if (DRUMKIT_CONFIG.drumstick.enableCollisionDetection) {
            this.drumsticks[0].setOtherDrumstick(this.drumsticks[1]);
            this.drumsticks[1].setOtherDrumstick(this.drumsticks[0]);
        }

        const drumMeshes = this.loadedMeshes;

        // Create drum components
        this.kick = new XRDrum("kick", DRUMKIT_CONFIG.midi.keys.kick, this, drumMeshes); //Create kick
        this.snare = new XRDrum("snare", DRUMKIT_CONFIG.midi.keys.snare, this, drumMeshes); // Create snare drum
        this.floorTom = new XRDrum("floorTom", DRUMKIT_CONFIG.midi.keys.floorTom, this, drumMeshes); // Create floor tom
        this.midTom = new XRDrum("midTom", DRUMKIT_CONFIG.midi.keys.midTom, this, drumMeshes); // Create mid tom
        this.highTom = new XRDrum("highTom", DRUMKIT_CONFIG.midi.keys.highTom, this, drumMeshes); // Create high tom
        this.crashCymbal1 = new XRCymbal("crashCymbal1", DRUMKIT_CONFIG.midi.keys.crashCymbal, this, drumMeshes); // Create crash cymbal
        this.crashCymbal2 = new XRCymbal("crashCymbal2", DRUMKIT_CONFIG.midi.keys.crashCymbal, this, drumMeshes); // Create crash cymbal
        this.rideCymbal = new XRCymbal("rideCymbal", DRUMKIT_CONFIG.midi.keys.rideCymbal, this, drumMeshes); // Create ride cymbal
        this.hiHat = new XRHiHat("hiHat", DRUMKIT_CONFIG.midi.keys.closedHiHat, this, drumMeshes); // Create Hi-Hat with tremble animation
    
        //Stands
        const stands = drumMeshes.filter(mesh => mesh.name.startsWith("stand") || mesh.name.startsWith("kickPedal") || mesh.name.startsWith("hiHatPedal")); // Find all primitives
        if (stands.length === 0) {
            console.error(`Failed to find a mesh with name starting with 'stand'`);
            if(this.log){
                console.log("Available meshes:", drumMeshes.map(mesh => mesh.name)); // Log available meshes for debugging
            }
            return;
        }
    
        stands.forEach(stand => this.drumContainer.addChild(stand)); // Attach primitives to the parent node

        //Throne
        const thronePrimitives = drumMeshes.filter(mesh => (mesh.name === "throne" || mesh.name.startsWith("throne_primitive"))); // Find all primitives
        if (thronePrimitives.length === 0) {
            console.error(`Failed to find the main body mesh with name 'throne' or its primitives in the provided drum3Dmodel.`);
            if(this.log){
                console.log("Available meshes:", drumMeshes.map(mesh => mesh.name)); // Log available meshes for debugging
            }
            return;
        }
        const throneContainer = new TransformNode("throneContainer", this.scene);
        this.drumContainer.addChild(throneContainer); // Attach the throne container to the drum container
        throneContainer.position.setAll(0)
        thronePrimitives.forEach(primitive => throneContainer.addChild(primitive)); // Attach primitives to the parent node
        
        this.throne = throneContainer; // Store the throne container
        
        // Initialize throne controller for sit/stand functionality
        this.throneController = new ThroneController(this.xr, this, throneContainer, this.scene);
        
        // Initialize throne UI for visual feedback
        this.throneUI = new ThroneUI(this.scene, this.xr, this.throneController);
    
        //RESCALE: 
        this.drumContainer.scaling = new Vector3(
            DRUMKIT_CONFIG.model.scaleFactor, 
            DRUMKIT_CONFIG.model.scaleFactor, 
            DRUMKIT_CONFIG.model.scaleFactor
        ); // Rescale the drum container
        //this.crashCymbal1.drumComponentContainer.scaling = new Vector3(0.7, 0.7, 0.7); // Rescale crash cymbal 1
        // PERFORMANCE OPTIMIZATIONS for rendering
        // 1. Freeze materials to prevent unnecessary shader recompilations
        this.drumContainer.getChildMeshes().forEach(mesh => {
            if (mesh.material) {
                mesh.material.freeze();
            }
            
            // 2. Disable frustum culling - drumkit is always in view when playing
            // This prevents meshes from disappearing when user gets close
            mesh.alwaysSelectAsActiveMesh = true;
            
            // 3. Disable unnecessary features for static meshes
            mesh.doNotSyncBoundingInfo = true; // Static meshes don't need bounding updates
        });
        
        // Note: World matrix freezing is done AFTER initial positioning in add6DofBehavior
        // to prevent the "jump" issue when unfreezing
    
        /*
        //TEST FOR COLLISIONS
        console.log(this.drumContainer.getChildMeshes());
        this.drumContainer.getChildMeshes().forEach(mesh => mesh.isVisible = false);
        */
        
        // Enable physics viewer for ALL drum components after they're created
        if (DRUMKIT_CONFIG.debug.enablePhysicsViewer) {
            this.enablePhysicsViewerForAll();
        }
    }

    async initializeWAMPlugin(audioContext: AudioContext) {
        this.audioContext = audioContext;
        
        const hostGroupId = await setupWamHost(this.audioContext);
        //const wamURIDrumSampler = 'https://www.webaudiomodules.com/community/plugins/burns-audio/drumsampler/index.js';
        const wamURIDrumSampler = DRUMKIT_CONFIG.wam.wamUri;
        const wamInstance = await loadDynamicComponent(wamURIDrumSampler, hostGroupId, this.audioContext);

        // Exemple de selection d'un autre son
        let state = await wamInstance.audioNode.getState();
        //state.values.patchName = "Drum Sampler WAM";
        await wamInstance.audioNode.setState(state);

        this.wamInstance = wamInstance;

        return wamInstance;
    }

    move(displacementVector: Vector3) {
        this.drumContainer.position.addInPlace(displacementVector);
    }

    // Enable physics viewer for all drum components (drums, cymbals, hi-hat, drumsticks)
    enablePhysicsViewerForAll() {
        const physicsViewer = new PhysicsViewer(this.scene);


        console.log("[XRDrumKit] Enabling physics viewer for all components...");
        
        // Show physics for all drums
        const drums = [this.kick, this.snare, this.floorTom, this.midTom, this.highTom];
        drums.forEach(drum => {
            if (drum && (drum as any).drumComponentContainer) {
                const meshes = (drum as any).drumComponentContainer.getChildMeshes();
                meshes.forEach((mesh: any) => {
                    if (mesh._physicsBody) {
                        physicsViewer!.showBody(mesh._physicsBody);
                        console.log(`  [${(drum as any).name}] Physics shape visualized`);
                    }
                });
            }
        });

        // Show physics for all cymbals
        const cymbals = [this.crashCymbal1, this.crashCymbal2, this.rideCymbal];
        cymbals.forEach(cymbal => {
            if (cymbal && (cymbal as any).cymbalAggregate) {
                physicsViewer!.showBody((cymbal as any).cymbalAggregate.body);
                console.log(`  [${(cymbal as any).name}] Physics shape visualized`);
            }
        });

        // Show physics for hi-hat
        if (this.hiHat && (this.hiHat as any).drumComponentContainer) {
            const meshes = (this.hiHat as any).drumComponentContainer.getChildMeshes();
            meshes.forEach((mesh: any) => {
                if (mesh._physicsBody) {
                    physicsViewer!.showBody(mesh._physicsBody);
                    console.log(`  [hiHat] Physics shape visualized`);
                }
            });
        }

        // Show physics for drumsticks
        this.drumsticks.forEach(drumstick => {
            if (drumstick && drumstick.drumstickAggregate) {
                physicsViewer!.showBody(drumstick.drumstickAggregate.body);
                console.log(`  [${drumstick.name}] Physics shape visualized`);
            }
        });

        console.log("[XRDrumKit] Physics viewer enabled for all components ✓");
    }
}

export default XRDrumKit;

async function setupWamHost(audioContext: AudioContext): Promise<string> {
    //@ts-ignore
    const { default: initializeWamHost } = await import("https://www.webaudiomodules.com/sdk/2.0.0-alpha.6/src/initializeWamHost.js");
    const [hostGroupId] = await initializeWamHost(audioContext);
    return hostGroupId;
}

async function loadDynamicComponent(wamURI: string, hostGroupId: string, audioContext: AudioContext) {
    try {
        const { default: WAM } = await import(wamURI);
        const wamInstance = await WAM.createInstance(hostGroupId, audioContext);
        return wamInstance;
    } catch (error) {
        console.error('Erreur lors du chargement du Web Component :', error);
    }
}