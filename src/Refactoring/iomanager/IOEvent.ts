import {Wam3D} from "../ConnecterWAM/Wam3D.ts";


export type IOEvent = {
    type: "input" | "output";
    pickType: "up" | "down" | "out";
    node: Wam3D;
    portId: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut';
}