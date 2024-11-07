import * as B from "@babylonjs/core";
import {WamParameterData} from "@webaudiomodules/api";

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

export type IParameter = {
    onValueChangedObservable: B.Observable<number>;
    setParamValue(value: WamParameterData): void;
}