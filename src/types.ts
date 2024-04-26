import {AudioNode3D} from "./audioNodes3D/AudioNode3D.ts";

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