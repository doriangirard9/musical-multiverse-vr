import {BaseEventBus} from "./BaseEventBus.ts";
import {PortType} from "../ConnecterWAM/interfaces/EnumConnexionType.ts";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";

export type IOEventType = {
    IO_CONNECT: "IO_CONNECT";
}

export type IOEventPayload = {
    IO_CONNECT: {
        type: PortType,
        pickType: 'up' | 'down' | 'out',
        node : Wam3D
        portId: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut',
        isInput: boolean
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