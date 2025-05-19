import {AudioOutputState} from "../../types.ts";
import {AudioNodeComponent} from "./AudioNodeComponent.ts";
import * as Y from 'yjs';
import {NetworkEventBus, NetworkEventPayload} from "../../../eventBus/NetworkEventBus.ts";
import {AudioOutput3D} from "../../../app/AudioOutput3D.ts";
import {IOEventBus} from "../../../eventBus/IOEventBus.ts";

export class AudioOutputComponent {
    private readonly parent: AudioNodeComponent;
    private readonly networkAudioOutputs: Y.Map<AudioOutputState>;
    private networkEventBus = NetworkEventBus.getInstance();
    private ioEventBus = IOEventBus.getInstance();

    // Map locale des AudioOutput3D
    private audioOutputs = new Map<string, AudioOutput3D>();

    constructor(parent: AudioNodeComponent) {
        this.parent = parent;
        this.networkAudioOutputs = parent.getAudioOutputsMap();
    }

    public initialize(): void {
        this.setupEventListeners();
        this.setupNetworkObservers();
        console.log(`[AudioOutputComponent] Initialized`);
    }

    private setupEventListeners() {
        this.networkEventBus.on('STORE_AUDIO_OUTPUT', payload => {
            if (!this.parent.isProcessingLocalEvent) {
                this.parent.withLocalProcessing(() => this.storeAudioOutput(payload));
            }
        });

        this.networkEventBus.on('REMOVE_AUDIO_OUTPUT', payload => {
            if (!this.parent.isProcessingLocalEvent) {
                this.parent.withLocalProcessing(() => this.removeAudioOutput(payload));
            }
        });
    }

    private setupNetworkObservers() {
        this.networkAudioOutputs.observe((event) => {
            if (!this.parent.isProcessingLocalEvent) {
                console.log("[AudioOutputComponent] Network AudioOutput change detected");
                this.parent.withNetworkProcessing(() => this.handleAudioOutputUpdates(event));
            }
        });
    }

    private storeAudioOutput(payload: NetworkEventPayload['STORE_AUDIO_OUTPUT']): void {
        console.log('[AudioOutputComponent] Storing AudioOutput:', payload.audioOutputId);
        this.networkAudioOutputs.set(payload.audioOutputId, payload.state);
    }

    private removeAudioOutput(payload: NetworkEventPayload['REMOVE_AUDIO_OUTPUT']): void {
        console.log('[AudioOutputComponent] Removing AudioOutput:', payload.audioOutputId);
        this.networkAudioOutputs.delete(payload.audioOutputId);
        this.audioOutputs.delete(payload.audioOutputId);
    }

    private handleAudioOutputUpdates(event: Y.YMapEvent<AudioOutputState>): void {
        event.changes.keys.forEach((change, key) => {
            if (change.action === "add") {
                const state = this.networkAudioOutputs.get(key);
                if (state) {
                    console.log('[AudioOutputComponent] New AudioOutput from network:', key);
                    this.ioEventBus.emit('NETWORK_AUDIO_OUTPUT_ADDED', {
                        audioOutputId: key,
                        state: state
                    });
                }
            } else if (change.action === "delete") {
                console.log('[AudioOutputComponent] AudioOutput removed from network:', key);
                this.ioEventBus.emit('NETWORK_AUDIO_OUTPUT_REMOVED', {
                    audioOutputId: key
                });
            }
        });
    }

    // Méthodes publiques
    public getAudioOutput(id: string): AudioOutput3D | undefined {
        return this.audioOutputs.get(id);
    }

    public addAudioOutput(id: string, audioOutput: AudioOutput3D): void {
        this.audioOutputs.set(id, audioOutput);
    }

}