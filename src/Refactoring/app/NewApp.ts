import {SceneManager} from "./SceneManager.ts";
import {WamInitializer} from "./WamInitializer.ts";
import {AppOrchestrator} from "./AppOrchestrator.ts";
import {XRManager} from "../xr/XRManager.ts";
import {AudioManager} from "./AudioManager.ts";
import { TestN3DFactory } from "../ConnecterWAM/node3d/subs/TestN3D.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { OscillatorN3DFactory } from "../ConnecterWAM/node3d/subs/OscillatorN3D.ts";

export class NewApp {
    private audioCtx: AudioContext | undefined;
    private sceneManager: SceneManager;
    private xrManager: XRManager | null = null;
    private audioManager: AudioManager | null = null;
    private appOrchestrator: AppOrchestrator | null = null;
    private wamInitializer: WamInitializer | null = null;
    private static instance: NewApp;

    private constructor(audioContext?: AudioContext) {
        const canvas: HTMLCanvasElement = document.getElementById('renderCanvas') as HTMLCanvasElement;
        this.sceneManager = SceneManager.getInstance(canvas);
        if (audioContext !== undefined) {
            this.audioCtx = audioContext;
            this.audioManager = AudioManager.getInstance(this.sceneManager.getScene(),this.audioCtx);
            this.wamInitializer = WamInitializer.getInstance(this.audioCtx);
            this.xrManager = XRManager.getInstance();
            this.appOrchestrator = AppOrchestrator.getInstance();

            ;(async()=>{
                const instance = await this.audioManager!!.createNode3D("testid", "testid", TestN3DFactory)
                NetworkManager.getInstance().getAudioNodeComponent().addAudioNode("testid", instance)

                const instance2 = await this.audioManager!!.createNode3D("occ", "occ", OscillatorN3DFactory)
                NetworkManager.getInstance().getAudioNodeComponent().addAudioNode("occ", instance2)
            })()
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
        this.appOrchestrator = AppOrchestrator.getInstance();
        this.sceneManager.start();
        await this.xrManager!!.init(this.sceneManager.getScene());
    }

}