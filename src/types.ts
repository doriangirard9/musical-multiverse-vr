import {AudioNode3D} from "./audioNodes3D/AudioNode3D.ts";
import * as B from "@babylonjs/core";
import { Pedal3DObject } from "./audioNodes3D/pedal3d/Pedal3DObject.ts";

export interface MenuConfig {
    categories: {
        name: string;
        plugins: {
            "name": string,
            "configFile": string
        }[];
    }[];
}

export type IOEvent = {
    type: "input" | "output" | "inputMidi"| "outputMidi";
    pickType: "up" | "down" | "out";
    node: AudioNode3D;
} | {
    type: "input" | "output",
    pickType: "up"|"down"|"out",
    index: number,
    pedal: Pedal3DObject,
}


export type TubeParams = {
    options: {path: B.Vector3[]; updatable: boolean},
    TubeMesh: B.Mesh,
    OutputMesh: B.Mesh,
    inputMesh: B.Mesh,
    arrow: B.Mesh,
    outputNode: AudioNode3D,
    inputNode: AudioNode3D,

}

export type TubeParamsMidi = {
    options: {path: B.Vector3[]; updatable: boolean},
    TubeMesh: B.Mesh,
    OutputMeshMidi: B.Mesh,
    inputMeshMidi: B.Mesh,
    arrow: B.Mesh,
    outputNode: AudioNode3D,
    inputNode: AudioNode3D,

}