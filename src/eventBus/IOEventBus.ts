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
    // [YASSINE_CEST_LA] private activeConnectionPointer: PointerInput | null = null;

    private constructor() {
        super();
    }

    public static getInstance(): IOEventBus {
        if (!IOEventBus.instance) {
            IOEventBus.instance = new IOEventBus();
        }
        return IOEventBus.instance;
    }

    // [YASSINE_CEST_LA]
    // Ca n'a rien à faire là, c'est complètement aléatoire comme emplacement.
    // 
    // Dejà corrigé en plus, voir : AbstractPointerInput.PickPredicate
    // public setActiveConnectionPointer(pointer: PointerInput | null): void {
    //     this.activeConnectionPointer = pointer;
    // }

    // public getActiveConnectionPointer(): PointerInput | null {
    //     return this.activeConnectionPointer;
    // }

    // public isConnectionDragActive(): boolean {
    //     return this.activeConnectionPointer !== null;
    // }
}
