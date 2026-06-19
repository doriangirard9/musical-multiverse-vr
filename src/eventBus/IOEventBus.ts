import {BaseEventBus} from "./BaseEventBus.ts";
import { PointerInput } from "../xr/inputs/PointerInput.ts";
import { N3DConnectableInstance } from "../node3d/instance/N3DConnectableInstance.ts";

export type IOEventPayload = {
    IO_CONNECT: {
        pickType: 'down' | 'up' | 'out'
        pointer: PointerInput
        connectable: N3DConnectableInstance
    };
};
export class IOEventBus extends BaseEventBus<IOEventPayload> {
    private static instance: IOEventBus;
    private activeConnectionPointer: PointerInput | null = null;

    private constructor() {
        super();
    }

    public static getInstance(): IOEventBus {
        if (!IOEventBus.instance) {
            IOEventBus.instance = new IOEventBus();
        }
        return IOEventBus.instance;
    }

    public setActiveConnectionPointer(pointer: PointerInput | null): void {
        this.activeConnectionPointer = pointer;
    }

    public getActiveConnectionPointer(): PointerInput | null {
        return this.activeConnectionPointer;
    }

    public isConnectionDragActive(): boolean {
        return this.activeConnectionPointer !== null;
    }
}
