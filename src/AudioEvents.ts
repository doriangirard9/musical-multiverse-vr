// audioEvents.ts
import {Position3D, WamInstance} from "./audioNodes3D/types.ts";

export type AudioEventType = {
    PARAM_CHANGE: 'PARAM_CHANGE';
    POSITION_CHANGE: 'POSITION_CHANGE';
    WAM_CREATED: 'WAM_CREATED';
    WAM_LOADED: 'WAM_LOADED';
    WAM_ERROR: 'WAM_ERROR';
    CONNECT_NODES: 'CONNECT_NODES';
    DISCONNECT_NODES: 'DISCONNECT_NODES';
    NODE_CONNECTION_CHANGED: 'NODE_CONNECTION_CHANGED';
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
        configFile?: string;
    };
    WAM_LOADED: {
        nodeId: string;
        instance: WamInstance;
    };
    WAM_ERROR: {
        nodeId: string;
        error: Error;
        context: string;
    };

    CONNECT_NODES: {
        sourceId: string;
        targetId: string;
        source: 'user' | 'network';
    };
    DISCONNECT_NODES: {
        sourceId: string;
        targetId: string;
        source: 'user' | 'network';
    };
    NODE_CONNECTION_CHANGED: {
        sourceId: string;
        targetId: string;
        action: 'connected' | 'disconnected';
        source: 'user' | 'network';
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
        if (this.debugMode) {
            console.log(`[AudioEventBus] Emitting ${event}:`, payload);
        }
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