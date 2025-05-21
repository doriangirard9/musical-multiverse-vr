import {BaseEventBus} from "./BaseEventBus.ts";

export type NetworkEventType = {
    PLAYER_ADDED : "PLAYER_ADDED";
};

export type NetworkEventPayload = {
    PLAYER_ADDED : {
        playerId : string
    };
    PLAYER_DELETED : {
        playerId : string;
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