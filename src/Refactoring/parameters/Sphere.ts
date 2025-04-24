import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import {Color3, MeshBuilder, StandardMaterial, Vector3} from "@babylonjs/core";
import {IParameter, ParameterInfo} from "../shared/SharedTypes.ts";

export class Sphere implements IParameter {
    private readonly _scene: B.Scene;
    private _parameterInfo: ParameterInfo;
    private readonly _defaultValue: number;
    //@ts-ignore
    private readonly _color: string;

    private _currentValue: number;

    private _sphere!: B.Mesh;
    //@ts-ignore
    private _textValueBlock!: GUI.TextBlock;
    //@ts-ignore
    private _dragOffset = Vector3.Zero();

    public onValueChangedObservable = new B.Observable<number>();
    private _sphereMaterial!: B.StandardMaterial;
    private isDragging: boolean;
    private angularSpeed : number =0.01;
    private radius : number = 3;
    private angle : number = 0;

    constructor(scene: B.Scene, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number, color: string) {
        this._scene = scene;
        this._parameterInfo = parameterInfo;
        this._defaultValue = defaultValue;
        this._currentValue = defaultValue;
        this._color = color;
        this.isDragging=false;
        this.createSphere(parentMesh);
        this.setParamValue(this._defaultValue);
        this._initActionManagerSphere(parentMesh);
    }

    private createSphere(parentMesh: B.Mesh){
        this._sphere = MeshBuilder.CreateSphere("sphere", { diameter: 0.5 }, this._scene);
        this._sphereMaterial = new StandardMaterial("sphereMat", this._scene);
        this._sphereMaterial.diffuseColor = Color3.Red();
        this._sphere.material = this._sphereMaterial;
        this._sphere.parent = parentMesh;
        let angle = 0;

        this._sphere.position = new Vector3(
            parentMesh.position.x + this.radius * Math.cos(angle),
            parentMesh.position.y + 0.5,
            parentMesh.position.z + this.radius * Math.sin(angle)
        );

    }

/*
    private _initActionManager(parentMesh: B.Mesh): void {
        this._sphere.actionManager = new B.ActionManager(this._scene);


        this._sphere.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            this._sphere.material = new StandardMaterial("highlightMat", this._scene);
            (this._sphere.material as StandardMaterial).diffuseColor = Color3.Yellow();
        }));

        this._sphere.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, () => {
            this._moveSphere(parentMesh);
        }));
        this._sphere.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this._sphere.material = this._sphereMaterial
        }));

        this._scene.onBeforeRenderObservable.add(() => {
            this.updateSpherePosition(parentMesh);
        });
    }
*/
    private _initActionManagerSphere(parentMesh: B.Mesh): void {
        this._sphere.actionManager = new B.ActionManager(this._scene);


        this._sphere.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            this._sphere.material = new StandardMaterial("highlightMat", this._scene);
            (this._sphere.material as StandardMaterial).diffuseColor = Color3.Yellow();
        }));

        this._sphere.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, () => {
            this._moveSphere(parentMesh);
        }));
        this._sphere.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this._sphere.material = this._sphereMaterial
        }));

        this._scene.onBeforeRenderObservable.add(() => {
            this.updateSpherePosition(parentMesh);
        });
    }
    private updateSpherePosition(parentMesh: B.Mesh){
        if (!this.isDragging) {
            this.angle += this.angularSpeed;
            this._sphere.position = new Vector3(
                parentMesh.position.x + this.radius * Math.cos(this.angle),
                parentMesh.position.y + 0.5,
                parentMesh.position.z + this.radius * Math.sin(this.angle)
            );
        } else {
            this.angle = this.calculateAngleFromPosition(parentMesh);
        }

        this._currentValue =  this._parameterInfo.maxValue *((Math.cos(this.angle) + 1) / 2);
        this.setParamValue(this._currentValue);
        console.log(`Valeur oscillante: ${this._currentValue.toFixed(2)}`);
    }

    private calculateAngleFromPosition(parentMesh: B.Mesh):number {
        const dx = this._sphere.position.x - parentMesh.position.x;
        const dz = this._sphere.position.z - parentMesh.position.z;
        return Math.atan2(dz, dx);
    };

    private _moveSphere(parentMesh: B.Mesh): void {
        const sixDofDragBehavior = new B.SixDofDragBehavior();
        this._sphere.addBehavior(sixDofDragBehavior);

        sixDofDragBehavior.onDragEndObservable.add(() => {
            this.angle = this.calculateAngleFromPosition(parentMesh);
        });

        this.isDragging = false;

        sixDofDragBehavior.onDragStartObservable.add(() => {
            this.isDragging = true;
        });

        sixDofDragBehavior.onDragEndObservable.add(() => {
            this.isDragging = false;
        });

        this._scene.onBeforeRenderObservable.add(() => {
            this.updateSpherePosition(parentMesh);
        });
    }

    public setParamValue(value: number): void {
        this._currentValue = value;
        this.onValueChangedObservable.notifyObservers(value);
        //this._textValueBlock.text = value.toFixed(1).toString();


    }

    setDirectValue(value: number): void {
        this.setParamValue(value);
    }


}