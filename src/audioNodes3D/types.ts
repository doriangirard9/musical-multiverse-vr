import * as B from "@babylonjs/core";

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
   hasMidiInput?:boolean, hasMidiOutput?: boolean, hasAudioOutput?: boolean, hasAudioInput?: boolean
}

export interface NodeTransform {
    position: Position3D;
    rotation: Position3D;
}
export type sphereInfo = {
    midi: boolean,
    type : string
}