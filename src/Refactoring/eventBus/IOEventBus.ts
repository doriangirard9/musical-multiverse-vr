import {BaseEventBus} from "./BaseEventBus.ts";
import {PortType} from "../ConnecterWAM/interfaces/EnumConnexionType.ts";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {AudioOutput3D} from "../app/AudioOutput3D.ts";
import { Node3DConnectable } from "../ConnecterWAM/node3d/Node3DConnectable.ts";
import { Node3DInstance } from "../ConnecterWAM/node3d/instance/Node3DInstance.ts";

export type IOEventType = {
    IO_CONNECT: "IO_CONNECT";
    IO_CONNECT_AUDIO_OUTPUT: "IO_CONNECT_AUDIO_OUTPUT";
}

export type IOEventPayload = {
    IO_CONNECT: {
        type: PortType,
        pickType: 'up' | 'down' | 'out',
        node : Wam3D
        portId: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut',
        isInput: boolean
    };

    IO_CONNECT_AUDIO_OUTPUT: {
        pickType: 'down' | 'up' | 'out';
        audioOutput: AudioOutput3D;
        sourceNode?: Wam3D;
    }

    // Destiné à remplacer IO_CONNECT_AUDIO_OUTPUT et IO_CONNECT
    // IO_CONNECT_AUDIO_OUTPUT m'a bien aidé
    IO_CONNECT_NODE3D: {
        pickType: 'down' | 'up' | 'out'
        instance: Node3DInstance
        connectable: Node3DConnectable
    }
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