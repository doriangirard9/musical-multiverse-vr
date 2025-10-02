import {BaseEventBus} from "./BaseEventBus.ts";
import {PlayerState} from "../network/types.ts";

export type NetworkEventType = {
    PLAYER_ADDED: "PLAYER_ADDED";
    PLAYER_DELETED: "PLAYER_DELETED";
    PLAYER_STATE_UPDATED: "PLAYER_STATE_UPDATED";
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