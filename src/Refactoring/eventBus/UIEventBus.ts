import {BaseEventBus} from "./BaseEventBus.ts";
import {Position3D} from "../shared/SharedTypes.ts";

export type UIEventPayload = {
    WAM_POSITION_CHANGE: {
        nodeId: string;
        position: Position3D;
        rotation: Position3D;
        source: "user" | "network";
    };
};

export class UIEventBus extends BaseEventBus<UIEventPayload> {
    private static instance: UIEventBus;

    private constructor() {
        super();
    }

    public static getInstance(): UIEventBus {
        if (!UIEventBus.instance) {
            UIEventBus.instance = new UIEventBus();
        }
        return UIEventBus.instance;
    }
}