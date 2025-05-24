import {SceneManager} from "./SceneManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {AudioManager} from "./AudioManager.ts";
import { AppOrchestrator } from "./AppOrchestrator.ts";
import { SyncBlock } from "../network/sync/test/SyncBlock.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { Color3 } from "@babylonjs/core";
import { SyncLink } from "../network/sync/test/SyncLink.ts";

export class NewApp {
    private audioCtx: AudioContext | undefined;
    private sceneManager: SceneManager;
    private xrManager: XRManager | null = null;
    private audioManager: AudioManager | null = null;
    private static instance: NewApp;

    private constructor(audioContext?: AudioContext) {
        const canvas: HTMLCanvasElement = document.getElementById('renderCanvas') as HTMLCanvasElement;
        this.sceneManager = SceneManager.getInstance(canvas);
        if (audioContext !== undefined) {
            this.audioCtx = audioContext;
            this.audioManager = AudioManager.getInstance(this.audioCtx);
            this.xrManager = XRManager.getInstance();
            AppOrchestrator.getInstance()
        }

    }

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
        
        /*;(async()=>{
            await this.audioManager!!.createAudioNode3D("samuel", "oscillator")
            await this.audioManager!!.createAudioNode3D("salade", "audiooutput")
        })()*/

        // Test Block
        {
            const scene = this.sceneManager.getScene()
            const doc = NetworkManager.getInstance().getAudioNodeComponent().getYjsDoc()

            const block_manager = SyncBlock.getSyncManager(scene,doc)
            const link_manager = SyncLink.getSyncManager(scene,doc,block_manager)
        
            const block_from = new SyncBlock(this.sceneManager.getScene(), block_manager)
            block_from.color = Color3.Red()
            block_manager.add(""+Math.random(), block_from)
            
            const block_to = new SyncBlock(this.sceneManager.getScene(), block_manager)
            block_to.color = Color3.Green()
            block_manager.add(""+Math.random(), block_to)

            const link = new SyncLink(scene, block_manager)
            link.setPath(block_from,block_to)
            link_manager.add("link"+Math.random(), link)
        }
    }

}