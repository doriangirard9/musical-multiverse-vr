import * as B from "@babylonjs/core";
import {IParameter, ParameterInfo} from "../types.ts";
import {Color3, MeshBuilder, StandardMaterial, Vector3} from "@babylonjs/core";

export class Sphere2 implements IParameter {
    private readonly _scene: B.Scene;
    private _parameterInfo: ParameterInfo;
    private readonly _defaultValue: number;
    //@ts-ignore
    private readonly _color: string;

    private _currentValue: number;

    private _sphere!: B.Mesh;

    public onValueChangedObservable = new B.Observable<number>();
    private _sphereMaterial!: B.StandardMaterial;
    private radius : number = 3;
    private angle : number = 0;
    private _parentMesh !: B.Mesh;

    constructor(scene: B.Scene, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number) {
        this._scene = scene;
        this._parameterInfo = parameterInfo;
        this._defaultValue = defaultValue;
        this._currentValue = defaultValue;
        this._parentMesh= parentMesh;
        this.createSphere();
        this.setParamValue(this._defaultValue);
        this._initActionManagerSphere();

    }

    private createSphere(){
        this._sphere = MeshBuilder.CreateSphere("sphere", { diameter: 0.5 }, this._scene);
        this._sphereMaterial = new StandardMaterial("sphereMat", this._scene);
        this._sphereMaterial.diffuseColor = Color3.Red();
        this._sphere.material = this._sphereMaterial;
        this._sphere.parent = this._parentMesh;
        let angle = 0;

        this._sphere.position = new Vector3(
            this._parentMesh.position.x + this.radius * Math.cos(angle),
            this._parentMesh.position.y,
            this._parentMesh.position.z + this.radius * Math.sin(angle)* Math.cos(angle)
        );

    }


    private _initActionManagerSphere(): void {
        this._sphere.actionManager = new B.ActionManager(this._scene);
        /*
        this._scene.onBeforeRenderObservable.add(() => {
            if (this.start) {
                this.updateSpherePosition(angle);
            }
        });*/
    }



    public updateSpherePosition(angle:number){

        this.angle =angle;
        this._sphere.position = new Vector3(
            this._parentMesh.position.x + this.radius * Math.cos(this.angle),
            this._parentMesh.position.y,
            this._parentMesh.position.z + this.radius * Math.sin(this.angle)*Math.cos(this.angle)
        );
        this._currentValue =  this._parameterInfo.maxValue *((Math.cos(this.angle) + 1) / 2);
        this.setParamValue(this._currentValue);
        console.log(`Valeur oscillante: ${this._currentValue.toFixed(2)}`);
    }

    public setParamValue(value: number): void {
        this._currentValue = value;
        this.onValueChangedObservable.notifyObservers(value);
        //this._textValueBlock.text = value.toFixed(1).toString();
    }


    public setDirectValue(value: number): void {
        this.setParamValue(value);
    }

}