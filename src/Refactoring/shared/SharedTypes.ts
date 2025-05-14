import * as B from "@babylonjs/core";

// Common types from src/types.ts
export interface MenuConfig {
    categories: {
        name: string;
        plugins: {
            "name": string,
            "configFile": string
        }[];
    }[];
}

// Modified IOEvent to break circular dependency by using interface instead of concrete class
export type IOEvent = {
    type: "input" | "output" | "inputMidi" | "outputMidi";
    pickType: "up" | "down" | "out";
    node: IAudioNode3D; // Using interface instead of concrete class
}

// Interface for AudioNode3D to break circular dependency
export interface IAudioNode3D {
    // Essential properties and methods needed for IOEvent, TubeParams, etc.
    id: string;
    position: B.Vector3;
    inputSpheres?: B.Mesh[];
    outputSpheres?: B.Mesh[];
    inputSpheresMidi?: B.Mesh[];
    outputSpheresMidi?: B.Mesh[];
}

// Modified tube params to use interface instead of concrete class
export type TubeParams = {
    options: {path: B.Vector3[]; updatable: boolean},
    TubeMesh: B.Mesh,
    OutputMesh: B.Mesh,
    inputMesh: B.Mesh,
    arrow: B.Mesh,
    outputNode: IAudioNode3D, // Using interface instead of concrete class
    inputNode: IAudioNode3D,  // Using interface instead of concrete class
}

export type TubeParamsMidi = {
    options: {path: B.Vector3[]; updatable: boolean},
    TubeMesh: B.Mesh,
    OutputMeshMidi: B.Mesh,
    inputMeshMidi: B.Mesh,
    arrow: B.Mesh,
    outputNode: IAudioNode3D, // Using interface instead of concrete class
    inputNode: IAudioNode3D,  // Using interface instead of concrete class
}

// Common types from src/audioNodes3D/types.ts
export interface IAudioNodeConfig {
    customParameters: CustomParameter[];
    defaultParameter: DefaultParameter;
    parametersInfo?: {[name: string]: ParameterInfo};
}

export interface IWamConfig extends IAudioNodeConfig {
    name: string;
    url: string;
    root: string;
}

export type CustomParameter = {
    name: string;
    used: boolean;
    type?: ParameterType;
    color?: string;
}

export type DefaultParameter = {
    type: ParameterType;
    color: string;
}

export type ParameterType = string; // "button" | "cylinder"

export type ParameterInfo = {
    defaultValue: number;
    maxValue: number;
    minValue: number;
}

export interface ParamUpdate {
    nodeId: string;
    paramId: string;
    value: number;
}

export interface PortParam {
    sourceId : string;
    targetId : string;
    portId : 'audioIn' | 'midiIn' | 'audioOut' | 'midiOut';
}

export type IParameter = {
    onValueChangedObservable: B.Observable<number>;
    setDirectValue(value: number): void;
    setParamValue(value: number, silent?: boolean): void;
}

export interface Position3D {
    x: number;
    y: number;
    z: number;
}

export type SphereTypes = {
    hasMidiInput?: boolean;
    hasMidiOutput?: boolean;
    hasAudioOutput?: boolean;
    hasAudioInput?: boolean;
}

export interface NodeTransform {
    position: Position3D;
    rotation: Position3D;
}

export type sphereInfo = {
    midi: boolean,
    type: string
}

