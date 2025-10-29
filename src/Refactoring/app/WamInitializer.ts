import {initializeWamHost, WebAudioModule} from "@webaudiomodules/sdk";
import {NoteExtension} from "../wamExtensions/notes/NoteExtension.ts";
import {PatternExtension} from "../wamExtensions/patterns/PatternExtension.ts";

export class WamInitializer {
    private static readonly DEBUG_LOG = false;
    private static hostGroupId: [string, string] | null = null;
    private static hostGroupIdPromise: Promise<[string, string]> | null = null;
    private readonly _audioCtx: AudioContext;
    private static instance: WamInitializer | null = null;
    private constructor(audioCtx: AudioContext) {
        this._audioCtx = audioCtx;
        this.initializeHostGroupId().catch((error) => {
            console.error('Failed to initialize WAM host group ID:', error);
        });
        if (WamInitializer.DEBUG_LOG) console.log("[*] WamInitializer Initialized");
        this._wamExtensionSetup();
    }
    public static getInstance(audioCtx?: AudioContext): WamInitializer {
        if (!WamInitializer.instance) {
            //@ts-ignore
            WamInitializer.instance = new WamInitializer(audioCtx);
        }
        return WamInitializer.instance;
    }

    public async getHostGroupId(): Promise<[string, string]> {
        if (!WamInitializer.hostGroupId) {
            if (!WamInitializer.hostGroupIdPromise) {
                WamInitializer.hostGroupIdPromise = this.createHostGroupId();
            }
            return WamInitializer.hostGroupIdPromise;
        }
        return WamInitializer.hostGroupId;
    }

    private async initializeHostGroupId(): Promise<void> {
        if (!WamInitializer.hostGroupIdPromise) {
            WamInitializer.hostGroupIdPromise = this.createHostGroupId();
            try {
                WamInitializer.hostGroupId = await WamInitializer.hostGroupIdPromise;
                if (WamInitializer.DEBUG_LOG) console.log('Host group ID initialized:', WamInitializer.hostGroupId);
            } catch (error) {
                console.error('Failed to initialize host group ID:', error);
                WamInitializer.hostGroupIdPromise = null;
            }
        }
    }
    public async initWamInstance(wamUrl: string): Promise<WebAudioModule> {
        const {default: WAM} = await import(/* @vite-ignore */ wamUrl);
        const [hostGroupId] = await this.getHostGroupId();
        return await WAM.createInstance(hostGroupId, this._audioCtx);
    }
    private async createHostGroupId(): Promise<[string, string]> {
        return await initializeWamHost(this._audioCtx);
    }

    private _wamExtensionSetup(){
        window.WAMExtensions = window.WAMExtensions || {};
        window.WAMExtensions.notes = new NoteExtension();
        window.WAMExtensions.patterns = new PatternExtension();

        if (WamInitializer.DEBUG_LOG) console.log("[*] WamExtension setup done");
    }
}