import {CylinderParam} from "./CylinderParam.ts";
import * as B from "@babylonjs/core";
import {IParameter, ParameterInfo} from "../types.ts";
import {Color3, MeshBuilder, StandardMaterial, Vector3} from "@babylonjs/core";


export class SphereCylinderParam extends CylinderParam implements IParameter{

    private _sphere!: B.Mesh;
   // private _dragOffset = Vector3.Zero();

    private _sphereMaterial!: B.StandardMaterial;
    private isDragging: boolean;
    private angularSpeed : number =0.01;
    private radius : number = 3;
    private angle : number = 0;
    private intervalUpdate =10;
    private timeElapsed = 0;
  //  private havokInterface;
    //private pluginHavok;

    constructor(scene: B.Scene, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number, color: string) {
        super(scene, parentMesh, parameterInfo, defaultValue, color);
        this.isDragging=false;
        this.createSphere(parentMesh);
        this.setParamValue(this._defaultValue);
       this._initActionManagerSphere(parentMesh);


    }
/*
    public async instentianteHavok() {
        this.havokInterface = await HavokPhysics();
        this.pluginHavok = new HavokPlugin(undefined /* or the value that fits your usecase *//*, this.havokInterface);
        /*this._scene.enablePhysics(undefined /* or the value that fits your usecase, for example: new Vector3(0, -9.81, 0) *//*,this.pluginHavok);
    }*/


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

            //this._sphere.physicsImpostor("SphereImpostor", { mass: 1, restitution: 0.9 }, this._scene);

    }

    protected _initActionManagerSphere(parentMesh: B.Mesh): void {
      //  const highlightLayer = new B.HighlightLayer('hl', this._scene);

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
        let deltaTime = this._scene.getEngine().getDeltaTime();
        this.timeElapsed += deltaTime;

        if (!this.isDragging) {
            this.angle += this.angularSpeed;
            this._sphere.position = new Vector3(
                parentMesh.position.x + this.radius * Math.cos(this.angle),
                parentMesh.position.y + 0.5,
                parentMesh.position.z + this.radius * Math.sin(this.angle)
            );
        } else {
            this.angle = this.calculateAngleFromPosition(parentMesh);
            this._currentValue = this._parameterInfo.maxValue * ((Math.cos(this.angle) + 1) / 2);
            this.setParamValue(this._currentValue);
        }

        if (this.timeElapsed>this.intervalUpdate ) {
            this.timeElapsed = 0;
            this._currentValue = this._parameterInfo.maxValue * ((Math.cos(this.angle) + 1) / 2);
            this.setParamValue(this._currentValue);
            //  console.log(`Valeur oscillante: ${this._currentValue.toFixed(2)}`);
        }
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
        this._textValueBlock.text = value.toFixed(1).toString();

        let scalingY: number = (value - this._parameterInfo.minValue) / (this._parameterInfo.maxValue - this._parameterInfo.minValue);
        if (scalingY < 0.05) {
            scalingY = 0.05;
        }

        this._currentCylinder.scaling.y = scalingY;
        this._currentCylinder.position.z = -(this._currentCylinder.scaling.y * 1.5) / 2;
        this._currentValue = value;
        this.onValueChangedObservable.notifyObservers(value);
        //this._textValueBlock.text = value.toFixed(1).toString();
    }

    addModulation(moduleName: string): void {
        switch (moduleName) {
            case "oscillator":
                break;
            default:
                break;
        }
    }
}