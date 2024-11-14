// import {WamParameterDataMap} from "@webaudiomodules/api";

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
    inputNodes: string[];
    parameters: { [name: string]: number };
}

export type PlayerState = {
    id: string;
    position: { x: number, y: number, z: number };
    direction: { x: number, y: number, z: number };
    leftHandPosition: { x: number, y: number, z: number };
    rightHandPosition: { x: number, y: number, z: number };
}