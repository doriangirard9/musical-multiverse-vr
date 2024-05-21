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

export type WamInstance = {
    audioNode: { _wamNode: WamAudioNode };
};

export interface WamAudioNode extends AudioNode {
    getParamValue(paramId: string): number;
    setParamValue(paramId: string, value: number): void;
    getParameterInfo(): Promise<{[name: string]: ParameterInfo}>;
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

export type IParameter = {
    onValueChangedObservable: B.Observable<number>;
    setParamValue(value: number): void;
}