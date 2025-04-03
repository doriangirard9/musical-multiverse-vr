// audioEvents.ts
import {IAudioNodeConfig, Position3D} from "./audioNodes3D/types.ts";
import {WebAudioModule} from "@webaudiomodules/sdk";

export type AudioEventType = {
    PARAM_CHANGE: 'PARAM_CHANGE';
    POSITION_CHANGE: 'POSITION_CHANGE';
    WAM_CREATED: 'WAM_CREATED';
    WAM_LOADED: 'WAM_LOADED';
    WAM_ERROR: 'WAM_ERROR';
    CONNECT_NODES: 'CONNECT_NODES';
    DISCONNECT_NODES: 'DISCONNECT_NODES';
    APPLY_CONNECTION: 'APPLY_CONNECTION';
    WAM_SAMPLER_PRESET_CHANGE: 'WAM_SAMPLER_PRESET_CHANGE';
    WAM_SAMPLER_PLAY: 'WAM_SAMPLER_PLAY';
    WAM_SAMPLER_GET_PRESET: 'WAM_SAMPLER_GET_PRESET';
    WAM_SAMPLER_PRESET_RESPONSE: 'WAM_SAMPLER_PRESET_RESPONSE';
    WAM_SAMPLER_NOTE_PLAY: 'WAM_SAMPLER_NOTE_PLAY';
    WAM_SAMPLER_NOTE_TRIGGER: 'WAM_SAMPLER_NOTE_TRIGGER';

};

export type AudioEventPayload = {
    PARAM_CHANGE: {
        nodeId: string;
        paramId: string;
        value: number;
        source: 'user' | 'network';
    };
    POSITION_CHANGE: {
        nodeId: string;
        position: Position3D;
        rotation: Position3D;
        source: 'user' | 'network';
    };
    WAM_CREATED: {
        nodeId: string;
        name: string;
        configFile?: IAudioNodeConfig;
    };
    WAM_LOADED: {
        nodeId: string;
        instance: WebAudioModule;
    };
    WAM_ERROR: {
        nodeId: string;
        error: Error;
        context: string;
    };

    CONNECT_NODES: {
        sourceId: string;
        targetId: string;
        isSrcMidi: boolean;
        source: 'user' | 'network';
    };
    DISCONNECT_NODES: {
        sourceId: string;
        targetId: string;
        source: 'user' | 'network';
    };
    APPLY_CONNECTION: {
        sourceId: string;
        targetId: string;
        isSrcMidi: boolean;
    };
    WAM_SAMPLER_PRESET_CHANGE: {
        nodeId: string;
        preset: string;
        source: 'user' | 'network';
    }
    WAM_SAMPLER_PLAY: {
        nodeId: string;
        play: boolean;
        note: number;
        source: 'user' | 'network';
    }
    WAM_SAMPLER_GET_PRESET: {
        nodeId: string;
    };

    WAM_SAMPLER_PRESET_RESPONSE: {
        nodeId: string;
        preset: string | null;
    };
    "WAM_SAMPLER_NOTE_PLAY": {
        nodeId: string;
        midiNote: number;
        velocity: number;
        timestamp: number;
    };

    "WAM_SAMPLER_NOTE_TRIGGER": {
        nodeId: string;
        midiNote: number;
        velocity: number;
    };

};

export class AudioEventBus {
    private static instance: AudioEventBus;
    private listeners: Map<keyof AudioEventType, Function[]> = new Map();
    private debugMode: boolean = process.env.NODE_ENV === 'development';

    private constructor() {
        if (this.debugMode) {
            console.log('[AudioEventBus] Initialized');
        }
    }

    public static getInstance(): AudioEventBus {
        if (!AudioEventBus.instance) {
            AudioEventBus.instance = new AudioEventBus();
        }
        return AudioEventBus.instance;
    }

    public emit<K extends keyof AudioEventType>(
        event: K,
        payload: AudioEventPayload[K]
    ): void {

        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(callback => {
            try {
                callback(payload);
            } catch (error) {
                console.error(`[AudioEventBus] Error in callback for ${event}:`, error);
            }
        });
    }

    public on<K extends keyof AudioEventType>(
        event: K,
        callback: (payload: AudioEventPayload[K]) => void
    ): () => void {
        const callbacks = this.listeners.get(event) || [];
        this.listeners.set(event, [...callbacks, callback as Function]);

        return () => this.off(event, callback);
    }

    public off<K extends keyof AudioEventType>(
        event: K,
        callback: (payload: AudioEventPayload[K]) => void
    ): void {
        const callbacks = this.listeners.get(event) || [];
        this.listeners.set(
            event,
            callbacks.filter(cb => cb !== callback)
        );
    }
}