import * as B from "@babylonjs/core";
import {CylinderParam} from "./CylinderParam.ts";
import {ButtonParam} from "./ButtonParam.ts";
import {CustomParameter, IAudioNodeConfig, ParameterInfo} from "../types.ts";
import {MenuParam} from "./MenuParam.ts";
import {Sphere} from "./Sphere.ts";
import {SphereCylinderParam} from "./SphereCylinderParam.ts";

export class ParamBuilder {
    private readonly _scene: B.Scene;
    private readonly _config: IAudioNodeConfig;

    constructor(scene: B.Scene, config: IAudioNodeConfig) {
        this._scene = scene;
        this._config = config;
    }

    public async createButton(param: CustomParameter, parentMesh: B.Mesh, parameterInfo: ParameterInfo): Promise<ButtonParam> {
        const button: ButtonParam = new ButtonParam(this._scene, parentMesh, parameterInfo, this._getColor(param));
        await button._createButton();
        return button;
    }

    public createCylinder(param: CustomParameter, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number): CylinderParam {
        return new CylinderParam(this._scene, parentMesh, parameterInfo, defaultValue, this._getColor(param));
    }

    public createSphereCylinder(param: CustomParameter, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number): CylinderParam {
        return new SphereCylinderParam(this._scene, parentMesh, parameterInfo, defaultValue, this._getColor(param));
    }

    public createMenu(param: CustomParameter, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number, choice:string[]): MenuParam {
        return new MenuParam(this._scene, parentMesh, parameterInfo, defaultValue, this._getColor(param), choice);
    }
    public createSphere (param: CustomParameter, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number ): Sphere {
        return new Sphere(this._scene, parentMesh, parameterInfo, defaultValue, this._getColor(param));
    }
    private _getColor(param: CustomParameter): string {
        return param.color ?? this._config.defaultParameter.color;
    }
}