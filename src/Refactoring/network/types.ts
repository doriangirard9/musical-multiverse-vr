import {WamParameterDataMap} from "@webaudiomodules/api";
import {Vector3} from "@babylonjs/core";
import {Position3D} from "../shared/SharedTypes.ts";


export interface INetworkObject<T> {
    getState(): Promise<AudioNodeState>;
    setState(state: T): void;
}

export type AudioNodeState = {
    id: string;
    name: string;
    configFile: string;
    position: { x: number, y: number, z: number };
    rotation: { x: number, y: number, z: number };
    parameters: WamParameterDataMap;
}
export type AudioOutputState = {
    id: string;
    position: Position3D;
    rotation: Position3D;
}
export type PlayerState = {
    id: string;
    position: { x: number, y: number, z: number };
    direction: { x: number, y: number, z: number };
    leftHandPosition: { x: number, y: number, z: number };
    rightHandPosition: { x: number, y: number, z: number };
}