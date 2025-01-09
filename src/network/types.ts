import {WamParameterDataMap} from "@webaudiomodules/api";
import {IAudioNodeConfig} from "../audioNodes3D/types.ts";

export interface INetworkObject<T> {
    getState(): Promise<{
        id: string;
        configFile: IAudioNodeConfig;
        name: string;
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        inputNodes: string[];
        parameters: WamParameterDataMap
    }>;
    setState(state: T): void;
}

export type AudioNodeState = {
    id: string;
    name: string;
    configFile: IAudioNodeConfig;
    position: { x: number, y: number, z: number };
    rotation: { x: number, y: number, z: number };
    inputNodes: string[];
    parameters: WamParameterDataMap;
}

export type PlayerState = {
    id: string;
    position: { x: number, y: number, z: number };
    direction: { x: number, y: number, z: number };
    leftHandPosition: { x: number, y: number, z: number };
    rightHandPosition: { x: number, y: number, z: number };
}