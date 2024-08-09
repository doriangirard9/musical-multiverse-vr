import {AudioNode3D} from "./audioNodes3D/AudioNode3D.ts";
import * as B from "@babylonjs/core";

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
    type: "input" | "output";
    pickType: "up" | "down" | "out";
    node: AudioNode3D;
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