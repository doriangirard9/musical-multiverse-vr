import {BaseEventBus} from "./BaseEventBus.ts";
import {AudioNodeState, PlayerState} from "../network/types.ts";

export type NetworkEventType = {
    PLAYER_ADDED: "PLAYER_ADDED";
    PLAYER_DELETED: "PLAYER_DELETED";
    PLAYER_STATE_UPDATED: "PLAYER_STATE_UPDATED"; // Nouvel événement

    SEND_NODE_TO_NETWORK: "SEND_NODE_TO_NETWORK";
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