import { WebAudioModule } from "@webaudiomodules/sdk";
import {BaseEventBus} from "./BaseEventBus.ts";
import {Position3D} from "../shared/SharedTypes.ts";
import {AudioNodeState} from "../network/types.ts";

export type AudioEventType = {
    PARAM_CHANGE: "PARAM_CHANGE";
    POSITION_CHANGE: "POSITION_CHANGE";
    WAM_CREATED: "WAM_CREATED";
    WAM_LOADED: "WAM_LOADED";
    WAM_ERROR: "WAM_ERROR";
    CONNECT_NODES: "CONNECT_NODES";
    DISCONNECT_NODES: "DISCONNECT_NODES";
    APPLY_CONNECTION: "APPLY_CONNECTION";

    REMOTE_AUDIO_NODE_ADDED: "REMOTE_AUDIO_NODE_ADDED";
    REMOTE_AUDIO_NODE_DELETED: "REMOTE_AUDIO_NODE_DELETED";
    AUDIO_OUTPUT_ADDED : "AUDIO_OUTPUT_ADDED";

    WAM_SAMPLER_PRESET_CHANGE: "WAM_SAMPLER_PRESET_CHANGE";
    WAM_SAMPLER_PLAY: "WAM_SAMPLER_PLAY";
    WAM_SAMPLER_GET_PRESET: "WAM_SAMPLER_GET_PRESET";
    WAM_SAMPLER_PRESET_RESPONSE: "WAM_SAMPLER_PRESET_RESPONSE";
    WAM_SAMPLER_NOTE_PLAY: "WAM_SAMPLER_NOTE_PLAY";
    WAM_SAMPLER_NOTE_TRIGGER: "WAM_SAMPLER_NOTE_TRIGGER";

};

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
    WAM_CREATED: {
        nodeId: string;
        name: string;
        configFile?: string;
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
        source: "user" | "network";
    };
    DISCONNECT_NODES: {
        sourceId: string;
        targetId: string;
        source: "user" | "network";
    };
    APPLY_CONNECTION: {
        sourceId: string;
        targetId: string;
        isSrcMidi: boolean;
    };
    WAM_SAMPLER_PRESET_CHANGE: {
        nodeId: string;
        preset: string;
        source: "user" | "network";
    };
    WAM_SAMPLER_PLAY: {
        nodeId: string;
        play: boolean;
        note: number;
        source: "user" | "network";
    };
    WAM_SAMPLER_GET_PRESET: {
        nodeId: string;
    };
    WAM_SAMPLER_PRESET_RESPONSE: {
        nodeId: string;
        preset: string | null;
    };
    WAM_SAMPLER_NOTE_PLAY: {
        nodeId: string;
        midiNote: number;
        velocity: number;
        timestamp: number;
    };
    WAM_SAMPLER_NOTE_TRIGGER: {
        nodeId: string;
        midiNote: number;
        velocity: number;
    };

    REMOTE_AUDIO_NODE_ADDED: {
        state : AudioNodeState
    };

    REMOTE_AUDIO_NODE_DELETED: {
        nodeId : string
    };
    AUDIO_OUTPUT_ADDED: {
        nodeId: string;
        name: string;
    }
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