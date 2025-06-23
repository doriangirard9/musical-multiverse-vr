import {BaseEventBus} from "./BaseEventBus.ts";
import { N3DConnectableInstance } from "../ConnecterWAM/node3d/instance/N3DConnectableInstance.ts";

export type IOEventPayload = {
    IO_CONNECT: {
        pickType: 'down' | 'up' | 'out'
        connectable: N3DConnectableInstance
    };
};
export class IOEventBus extends BaseEventBus<IOEventPayload> {
    private static instance: IOEventBus;

    private constructor() {
        super();
    }

    public static getInstance(): IOEventBus {
        if (!IOEventBus.instance) {
            IOEventBus.instance = new IOEventBus();
        }
        return IOEventBus.instance;
    }
}