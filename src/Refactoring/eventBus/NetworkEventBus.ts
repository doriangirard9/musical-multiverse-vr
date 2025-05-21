import {BaseEventBus} from "./BaseEventBus.ts";
import {AudioNodeState, AudioOutputState, PlayerState} from "../network/types.ts";
import {PortParam} from "../shared/SharedTypes.ts";

export type NetworkEventType = {
    PLAYER_ADDED: "PLAYER_ADDED";
    PLAYER_DELETED: "PLAYER_DELETED";
    PLAYER_STATE_UPDATED: "PLAYER_STATE_UPDATED";

    SEND_NODE_TO_NETWORK: "SEND_NODE_TO_NETWORK";
    STORE_CONNECTION_TUBE: "STORE_CONNECTION_TUBE";
    REMOVE_CONNECTION_TUBE: "REMOVE_CONNECTION_TUBE";

    STORE_AUDIO_OUTPUT: "STORE_AUDIO_OUTPUT";
    REMOVE_AUDIO_OUTPUT: "REMOVE_AUDIO_OUTPUT";
};

export type NetworkEventPayload = {
    PLAYER_ADDED: {
        playerId: string
    };
    PLAYER_DELETED: {
        playerId: string;
    };
    PLAYER_STATE_UPDATED: {
        playerState: PlayerState;
    };
    SEND_NODE_TO_NETWORK: {
        state : AudioNodeState;
    };
    STORE_CONNECTION_TUBE: {
        connectionId : string;
        portParam : PortParam;
    };
    REMOVE_CONNECTION_TUBE: {
        connectionId: string;
    };
    STORE_AUDIO_OUTPUT: {
        audioOutputId : string;
        state : AudioOutputState;
    };
    REMOVE_AUDIO_OUTPUT: {
        audioOutputId : string
    };

};

export class NetworkEventBus extends BaseEventBus<NetworkEventPayload> {
    private static instance: NetworkEventBus;

    private constructor() {
        super();
    }

    public static getInstance(): NetworkEventBus {
        if (!NetworkEventBus.instance) {
            NetworkEventBus.instance = new NetworkEventBus();
        }
        return NetworkEventBus.instance;
    }
}