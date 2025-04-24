import {BaseEventBus} from "./BaseEventBus.ts";

export type UIEventType = {

};

export type UIEventPayload = {

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