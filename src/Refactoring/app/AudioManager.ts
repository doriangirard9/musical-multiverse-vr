import {AudioEventBus,AudioEventPayload} from "../eventBus/AudioEventBus.ts"
import {Scene} from "@babylonjs/core";
import {AudioNode3DBuilder} from "./AudioNode3DBuilder.ts";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {AudioOutput3D} from "./AudioOutput3D.ts";

export class AudioManager {
    private static _instance: AudioManager | null = null;

    private readonly scene: Scene;
    private readonly audioCtx: AudioContext;
    private audioNode3DBuilder: AudioNode3DBuilder;
    private audioEventBus: AudioEventBus;

    private constructor(scene: Scene, audioCtx: AudioContext) {
        this.scene = scene;
        this.audioCtx = audioCtx;
        this.audioNode3DBuilder = new AudioNode3DBuilder(this.audioCtx);
        this.audioEventBus = AudioEventBus.getInstance();
        this.setupEventListeners();
    }

    public static getInstance(scene?: Scene, audioCtx?: AudioContext): AudioManager {
        if (!AudioManager._instance) {
            if (!scene || !audioCtx) {
                throw new Error("Scene and AudioContext are required for first instantiation");
            }
            AudioManager._instance = new AudioManager(scene, audioCtx);
        }
        return AudioManager._instance;
    }


    private setupEventListeners(): void {
        // Handle remote audio node creation
        this.audioEventBus.on("REMOTE_AUDIO_NODE_ADDED", this.onRemoteAudioNodeAdded.bind(this));
        this.audioEventBus.on("REMOTE_AUDIO_NODE_DELETED", this.onRemoteAudioNodeDeleted.bind(this));
    }

    public async createAudioNode3D(name: string, id: string, configFile?: string): Promise<Wam3D> {
        const node: Wam3D = await this.audioNode3DBuilder.create(id, configFile);
        this.audioEventBus.emit("WAM_CREATED", { nodeId: id, name, configFile });
        await node.instantiate();
        return node;
    }

    public async createAudioOutput3D(id: string): Promise<AudioOutput3D> {
        const node: AudioOutput3D = await this.audioNode3DBuilder.createAudioOutput(id);
        this.audioEventBus.emit("AUDIO_OUTPUT_ADDED", { nodeId: id, name: id });
        await node.instantiate();
        return node;
    }

    private async onRemoteAudioNodeAdded(payload: AudioEventPayload["REMOTE_AUDIO_NODE_ADDED"]): Promise<void> {
        console.log('Creating remote audio node:', payload.state);
        
        const node = await this.audioNode3DBuilder.create(payload.state.id, payload.state.configFile);
        await node.instantiate();

        // Appliquer l'état reçu
        node.setState(payload.state);

        console.log('Remote audio node created successfully:', payload.state.id);
    }
    private async onRemoteAudioNodeDeleted(payload: AudioEventPayload["REMOTE_AUDIO_NODE_DELETED"]): Promise<void> {
        console.log('Remote audio node change detected:', payload);

    }

    /**
     * private async _onRemoteAudioNodeChange(change: { action: 'add' | 'delete', state: AudioNodeState }): Promise<void> {
     *         console.log('Remote audio node change detected:', change);
     *
     *         if (change.action === 'add') {
     *             console.log('Adding audio node:', change.state);
     *             const audioNode3D: AudioNode3D = await this._audioNode3DBuilder.create(change.state.name, change.state.id, change.state.configFile);
     *             await audioNode3D.instantiate();
     *             // @@ MB CHECK : no await here !!!
     *
     *             audioNode3D.ioObservable.add(this.ioManager.onIOEvent.bind(this.ioManager));
     *             this.networkManager.addRemoteAudioNode3D(audioNode3D);
     *             audioNode3D.setState(change.state);
     *             console.log('Audio node added successfully.');
     *
     *         } else if (change.action === 'delete') {
     */

    public getAudioContext(): AudioContext {
        return this.audioCtx;
    }


}