import {SceneManager} from "./SceneManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {AudioManager} from "./AudioManager.ts";

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
        
        ;(async()=>{
            await this.audioManager!!.createAudioNode3D("samuel", "oscillator")
            await this.audioManager!!.createAudioNode3D("salade", "audiooutput")
        })()
    }

}