import {CylinderParam} from "../parameters/CylinderParam.ts";
import * as B from "@babylonjs/core";
import {ParameterInfo} from "../types.ts";

export class CylinderModulation extends CylinderParam {
    constructor(scene: B.Scene, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number, color: string) {
        super(scene,parentMesh, parameterInfo, defaultValue, color);
    }

    public changeColor(color: string): void {
        this._cylinderMaterial.diffuseColor = B.Color3.FromHexString(color);
    }
}
