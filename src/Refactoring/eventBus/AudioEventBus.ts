import {BaseEventBus} from "./BaseEventBus.ts";
import {Position3D} from "../shared/SharedTypes.ts";
import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";


export type AudioEventPayload = {
    PARAM_CHANGE: {
        nodeId: string;
        paramId: string;
        value: number;
        source: "user" | "network";
    };
    POSITION_CHANGE: {
        nodeId: string;
        position: Position3D;
        rotation: Position3D;
        source: "user" | "network";
    };
    AUDIO_NODE_CREATED: {
        nodeId: string;
        kind: string;
    };
    AUDIO_NODE_LOADED: {
        nodeId: string;
        kind: string;
        instance: Node3DInstance;
    };
    AUDIO_NODE_ERROR: {
        nodeId: string;
        kind: string;
        error_message: string;
    };
    CONNECT_NODES: {
        sourceId: string;
        targetId: string;
        isSrcMidi: boolean;
        source: "user" | "network";
    };
    DISCONNECT_NODES: {
        sourceId: string;
        targetId: string;
        source: "user" | "network";
    };
};

export class AudioEventBus extends BaseEventBus<AudioEventPayload> {
    private static instance: AudioEventBus;

    private constructor() {
        super();
    }

    public static getInstance(): AudioEventBus {
        if (!AudioEventBus.instance) {
            AudioEventBus.instance = new AudioEventBus();
        }
        return AudioEventBus.instance;
    }
}