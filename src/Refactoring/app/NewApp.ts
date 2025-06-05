import {SceneManager} from "./SceneManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {Node3dManager} from "./Node3dManager.ts";
import { AppOrchestrator } from "./AppOrchestrator.ts";
import { N3DPreviewer } from "../node3d/instance/N3DPreviewer.ts";
import { LivePianoN3DFactory } from "../node3d/subs/LivePianoN3D.ts";
import { createStandCollection, Node3DStand } from "../world/Node3DStand.ts";

export class NewApp {
    private audioCtx: AudioContext | undefined;
    private sceneManager: SceneManager;
    private xrManager: XRManager | null = null;
    private audioManager: Node3dManager | null = null;

    private constructor(audioContext?: AudioContext) {
        const canvas: HTMLCanvasElement = document.getElementById('renderCanvas') as HTMLCanvasElement;
        this.sceneManager = SceneManager.getInstance(canvas);
        if (audioContext !== undefined) {
            this.audioCtx = audioContext;
            this.audioManager = Node3dManager.getInstance(this.audioCtx);
            this.xrManager = XRManager.getInstance();
            AppOrchestrator.getInstance()
        }

    }

    private static instance?: NewApp

    public static getInstance(audioContext? : AudioContext): NewApp {
        if (!NewApp.instance) {
            if (!audioContext) {
                throw new Error("AudioContext is required for first instantiation");
            }
            NewApp.instance = new NewApp(audioContext);
        }
        return NewApp.instance;
    }

    public async start(): Promise<void> {
        this.sceneManager.start();
        await this.xrManager!!.init(this.sceneManager.getScene());
        
        await this.audioManager!!.createNode3d("notesbox")
        await this.audioManager!!.createNode3d("audiooutput")

        const shared = this.audioManager?.builder?.shared!!
        const {root} = await createStandCollection(shared,Node3dManager.getInstance())
        root.position.set(0, -1, 40)
    }

}