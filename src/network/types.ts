import {WamParameterDataMap} from "@webaudiomodules/api";

export interface INetworkObject<T> {
    getState(): Promise<{
        inputNodes: string[];
        configFile: string;
        rotation: { x: number; y: number; z: number };
        name: string;
        id: string;
        position: { x: number; y: number; z: number };
        parameters: WamParameterDataMap
    }>;
    setState(state: T): void;
}

export type AudioNodeState = {
    id: string;
    name: string;
    configFile?: string;
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