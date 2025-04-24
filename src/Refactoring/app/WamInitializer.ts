import {WebAudioModule} from "@webaudiomodules/sdk";
import {NoteExtension} from "../wamExtensions/notes/NoteExtension.ts";
import {PatternExtension} from "../wamExtensions/patterns/PatternExtension.ts";

export class WamInitializer {
    private hostGroupId: [string, string] | null = null;
    private hostGroupIdPromise: Promise<[string, string]> | null = null;
    private readonly _audioCtx: AudioContext;
    private static instance: WamInitializer | null = null;

    private constructor(audioCtx: AudioContext) {
        this._audioCtx = audioCtx;
        this.initializeHostGroupId().catch((error) => {
            console.error('Failed to initialize WAM host group ID:', error);
        });
        this._wamExtensionSetup();
    }
    public static getInstance(audioCtx: AudioContext): WamInitializer {
        if (!WamInitializer.instance) {
            WamInitializer.instance = new WamInitializer(audioCtx);
        }
        return WamInitializer.instance;
    }

    public async getHostGroupId(): Promise<[string, string]> {
        if (!this.hostGroupId) {
            if (!this.hostGroupIdPromise) {
                this.hostGroupIdPromise = this.createHostGroupId();
            }
            return this.hostGroupIdPromise;
        }
        return this.hostGroupId;
    }

    private async initializeHostGroupId(): Promise<void> {
        if (!this.hostGroupIdPromise) {
            this.hostGroupIdPromise = this.createHostGroupId();
            try {
                this.hostGroupId = await this.hostGroupIdPromise;
                console.log('Host group ID initialized:', this.hostGroupId);
            } catch (error) {
                console.error('Failed to initialize host group ID:', error);
                this.hostGroupIdPromise = null;
            }
        }
    }
    public async initWamInstance(wamUrl: string): Promise<WebAudioModule> {
        const {default: WAM} = await import(/* @vite-ignore */ wamUrl);
        return await WAM.createInstance(this.hostGroupId, this._audioCtx);
    }
    private async createHostGroupId(): Promise<[string, string]> {
        const scriptUrl: string = 'https://mainline.i3s.unice.fr/wam2/packages/sdk/src/initializeWamHost.js';
        const {default: initializeWamHost} = await import(/* @vite-ignore */ scriptUrl);
        return await initializeWamHost(this._audioCtx);
    }

    private _wamExtensionSetup(){
        window.WAMExtensions = window.WAMExtensions || {};
        window.WAMExtensions.notes = new NoteExtension();
        window.WAMExtensions.patterns = new PatternExtension();
    }
}