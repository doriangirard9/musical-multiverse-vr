import { TransformNode, AbstractMesh, AssetsManager } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import XRDrumKit from "./XRDrumKit/XRDrumKit";
import { XRManager } from "../../../xr/XRManager";

/**
 * GUI component for the VR Drum Kit Node3D
 * Wraps the existing XRDrumKit from Batterie_VR_Musical_Metaverse
 */
export class DrumKitN3DGUI implements Node3DGUI {
    root!: TransformNode;
    midiOutputMesh!: AbstractMesh;
    drumKit?: XRDrumKit;
    baseMesh!: AbstractMesh; // For Node3D system to use
    
    // Store context for later initialization
    private context!: Node3DGUIContext;
    
    get worldSize() { return 5; } // Large size for the drumkit

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;
        this.context = context;
        
        // Create a temporary root
        this.root = new B.TransformNode("drumkit-root", scene);
        
        // Create a bounding box mesh for the Node3D system (invisible)
        this.baseMesh = B.CreateBox("drumkit-boundingbox", { size: 1.5, height:.1 }, scene);
        //this.baseMesh.isVisible = false;
        this.baseMesh.parent = this.root;
        this.baseMesh.position.y = -0.1; // Center it at drum height
        
        // Create MIDI output sphere
        this.midiOutputMesh = B.CreateSphere(
            "drumkit-midi-output", 
            { diameter: 0.3 }, 
            scene
        );

        this.midiOutputMesh.parent = this.root;
        this.midiOutputMesh.position.set(.75, -0.05, 0);
        
        T.MeshUtils.setColor(this.midiOutputMesh, T.MidiN3DConnectable.OutputColor.toColor4());
    }

    /**
     * Initialize the actual drumkit (called from Node3D constructor with audioContext)
     */
    async initDrumKit(audioContext: AudioContext) {
        const { scene } = this.context;

        // CRITICAL: Wait for physics to be ready
        const sceneManager = (await import('../../../app/SceneManager')).SceneManager.getInstance();
        let attempts = 0;
        while (!sceneManager.isPhysicsReady() && attempts < 50) {
            console.log("[DrumKitN3DGUI] Waiting for physics engine...");
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!sceneManager.isPhysicsReady()) {
            console.error("[DrumKitN3DGUI] Physics engine failed to initialize!");
            throw new Error("Physics engine not available - cannot create drumkit");
        }
        
        console.log("[DrumKitN3DGUI] Physics engine ready, initializing drumkit...");

        // Get XR instance from XRManager
        const xrManager = XRManager.getInstance();
        const xr = xrManager.xrHelper;
        
        // Get physics plugin
        let hk = scene.getPhysicsEngine()?.getPhysicsPlugin();
        
        // Calculate eventMask for collision events
        let eventMask = 0;
        if (hk && (hk as any)._hknp) {
            const started = (hk as any)._hknp.EventType.COLLISION_STARTED.value;
            const continued = (hk as any)._hknp.EventType.COLLISION_CONTINUED.value;
            const finished = (hk as any)._hknp.EventType.COLLISION_FINISHED.value;
            eventMask = started | continued | finished;
            console.log("[DrumKitN3DGUI] Calculated eventMask:", eventMask);
        } else {
            console.warn("[DrumKitN3DGUI] Could not calculate eventMask - hk._hknp not available");
        }
        
        // Create AssetsManager for loading drum models
        const assetsManager = new AssetsManager(scene);
        
        // Initialize the drumkit
        console.log("[DrumKitN3DGUI] Initializing XRDrumKit...");
        this.drumKit = new XRDrumKit(
            audioContext,
            scene,
            eventMask,
            xr,
            hk,
            assetsManager
        );

        await this.drumKit.loadMesh();
        this.drumKit.initializeDrumKit();
        
        // The drumContainer is created in XRDrumKit constructor
        // Re-parent everything to the drumContainer
        this.midiOutputMesh.parent = this.drumKit.drumContainer;
        
        this.drumKit.drumContainer.parent = this.root;
        this.drumKit.drumContainer.position.setAll(0)
        this.drumKit.drumContainer.rotation.setAll(0)
        this.drumKit.drumContainer.scaling.setAll(.5)
        
        // Wait for the drumkit assets to load
        // await new Promise<void>((resolve) => {
        //     setTimeout(() => {
        //         console.log("[DrumKitN3DGUI] XRDrumKit initialization complete");
                
        //         // Reposition MIDI output near throne if it exists
        //         if (this.drumKit && this.drumKit.throne) {
        //             const thronePos = this.drumKit.throne.getAbsolutePosition();
        //             this.midiOutputMesh.position.set(
        //                 thronePos.x + 0.8,  // Right of throne
        //                 thronePos.y + 1.2,  // At chest height
        //                 thronePos.z
        //             );
        //         }
                
        //         resolve();
        //     }, 2000); // Increased wait time for asset loading
        // });

        console.log("[DrumKitN3DGUI] Fully initialized with MIDI output");
    }

    async dispose() {
        this.midiOutputMesh?.dispose();
        // Note: Don't dispose drumKit here as it manages its own resources
    }
}


/**
 * Logic component for the VR Drum Kit Node3D
 * Manages MIDI connections and event routing
 */
export class DrumKitN3D implements Node3D {
    private midiOutput: InstanceType<typeof import("../../tools").MidiN3DConnectable.ListOutput>;
    private drumKit?: XRDrumKit;
    private midiInterceptionSetup = false;

    constructor(
        context: Node3DContext, 
        private gui: DrumKitN3DGUI
    ) {
        const { tools: T } = context;
            
        this.drumKit = gui.drumKit;
        this.setupMidiRouting();

        // Add the bounding box to the Node3D system for dragging
       context.addToBoundingBox(this.gui.baseMesh);
        
        // Create MIDI output connectable
        this.midiOutput = new T.MidiN3DConnectable.ListOutput(
            "drumkit-midi-output",
            [gui.midiOutputMesh],
            "MIDI Output",
            (wamNode) => {
                console.log("[DrumKitN3D] MIDI output connected to:", wamNode.instanceId);
            },
            (wamNode) => {
                console.log("[DrumKitN3D] MIDI output disconnected from:", wamNode.instanceId);
            }
        );
        context.createConnectable(this.midiOutput);

        console.log("[DrumKitN3D] Initialized with MIDI output");
    }

    /**
     * Set up MIDI event routing from drum hits to connected nodes
     * Intercepts the drumkit's WAM instance scheduleEvents to also route to Node3D connections
     */
    private setupMidiRouting() {
        // Check if drumkit is ready
        if (!this.drumKit) {
            console.log("[DrumKitN3D] Drumkit not ready, will retry...");
            setTimeout(() => {
                this.setupMidiRouting();
            }, 500);
            return;
        }
        
        const drumKit = this.drumKit; // Capture for type narrowing
        
        // Check if WAM instance is ready
        if (!drumKit.wamInstance) {
            console.log("[DrumKitN3D] WAM instance not ready, will retry...");
            setTimeout(() => {
                this.setupMidiRouting();
            }, 500);
            return;
        }

        if (this.midiInterceptionSetup) {
            console.log("[DrumKitN3D] MIDI interception already set up");
            return;
        }

        console.log("[DrumKitN3D] Setting up MIDI interception...");

        // Store original scheduleEvents method
        const originalScheduleEvents = drumKit.wamInstance.audioNode.scheduleEvents.bind(
            drumKit.wamInstance.audioNode
        );

        // Override scheduleEvents to intercept MIDI events
        drumKit.wamInstance.audioNode.scheduleEvents = (event: any) => {
            // Call original method first (for audio feedback)
            originalScheduleEvents(event);

            // Also send to connected Node3D nodes
            if (event.type === 'wam-midi' && this.midiOutput.connections.length > 0) {
                this.midiOutput.connections.forEach((conn) => {
                    try {
                        conn.scheduleEvents(event);
                    } catch (error) {
                        console.error("[DrumKitN3D] Error sending MIDI to connection:", error);
                    }
                });
            }
        };

        this.midiInterceptionSetup = true;
        console.log("[DrumKitN3D] MIDI interception setup complete");
    }

    /**
     * Send a MIDI note event to all connected nodes
     * This can be used to manually trigger MIDI events
     */
    sendMidiNote(noteNumber: number, velocity: number, duration: number, time: number) {
        if (this.midiOutput.connections.length === 0) {
            return;
        }

        // Send Note ON
        this.midiOutput.connections.forEach((conn) => {
            conn.scheduleEvents({
                type: "wam-midi",
                time: time,
                data: { bytes: [0x90, noteNumber, velocity] }
            });
        });

        // Send Note OFF
        this.midiOutput.connections.forEach((conn) => {
            conn.scheduleEvents({
                type: "wam-midi",
                time: time + duration,
                data: { bytes: [0x80, noteNumber, velocity] }
            });
        });
    }

    getStateKeys(): string[] {
        return [];
    }

    async setState(_key: string, _value: any): Promise<void> {
        // Could save/restore drumkit position, configuration, etc.
    }

    async getState(_key: string): Promise<any> {
        return undefined;
    }

    async dispose() {
        await this.gui.dispose();
    }
}

/**
 * Factory for creating VR Drum Kit Node3D instances
 */
export const DrumKitN3DFactory: Node3DFactory<DrumKitN3DGUI, DrumKitN3D> = {
    label: "VR Drum Kit",

    description: "A fully playable VR drum kit with MIDI output. Play drums with VR controllers and route MIDI to other instruments or sequencers.",

    tags: ["drums", "midi", "generator", "live_instrument", "percussion", "vr"],

    createGUI: async (context: Node3DGUIContext) => {
        return new DrumKitN3DGUI(context);
    },

    create: async (context: Node3DContext, gui: DrumKitN3DGUI) => {
        await gui.initDrumKit(context.audioCtx);
        return new DrumKitN3D(context, gui);
    }
};
