import {BaseEventBus} from "./BaseEventBus.ts";
import {PortType} from "../ConnecterWAM/interfaces/EnumConnexionType.ts";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import { Node3DConnectable } from "../ConnecterWAM/node3d/Node3DConnectable.ts";
import { Node3DInstance } from "../ConnecterWAM/node3d/instance/Node3DInstance.ts";
import {PortParam} from "../shared/SharedTypes.ts";
import {AudioOutputState} from "../network/types.ts";

export type IOEventType = {
    IO_CONNECT: "IO_CONNECT";

    NETWORK_CONNECTION_ADDED: "NETWORK_CONNECTION_ADDED";
    NETWORK_CONNECTION_REMOVED: "NETWORK_CONNECTION_REMOVED";

    NETWORK_AUDIO_OUTPUT_ADDED: "NETWORK_AUDIO_OUTPUT_ADDED";
    NETWORK_AUDIO_OUTPUT_REMOVED: "NETWORK_AUDIO_OUTPUT_REMOVED";
}

export type IOEventPayload = {
    IO_CONNECT: {
        type: PortType,
        pickType: 'up' | 'down' | 'out',
        node : Wam3D
        portId: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut',
        isInput: boolean,
    }|{
        pickType: 'down' | 'up' | 'out'
        instance: Node3DInstance
        connectable: Node3DConnectable
    };

    NETWORK_CONNECTION_ADDED: {
        connectionId: string;
        portParam: PortParam;
    };

    NETWORK_CONNECTION_REMOVED: {
        connectionId: string;
    };

    NETWORK_AUDIO_OUTPUT_ADDED: {
        audioOutputId: string;
        state: AudioOutputState;
    };
    NETWORK_AUDIO_OUTPUT_REMOVED: {
        audioOutputId: string;
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