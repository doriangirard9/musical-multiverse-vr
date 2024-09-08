import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import {IParameter, ParameterInfo} from "../types.ts";

export class CylinderParam implements IParameter {
    private readonly _scene: B.Scene;
    private _parameterInfo: ParameterInfo;
    private readonly _defaultValue: number;
    private readonly _color: string;

    private _currentValue: number;
    private _currentCylinder!: B.Mesh;
    private _cylinder!: B.Mesh;
    private _cylinderMaterial!: B.StandardMaterial;
    private _textValueBlock!: GUI.TextBlock;
    private _valueAdvancedTexture!: GUI.AdvancedDynamicTexture;

    public onValueChangedObservable = new B.Observable<number>();

    constructor(scene: B.Scene, parentMesh: B.Mesh, parameterInfo: ParameterInfo, defaultValue: number, color: string) {
        this._scene = scene;
        this._parameterInfo = parameterInfo;
        this._defaultValue = defaultValue;
        this._currentValue = defaultValue;
        this._color = color;

        this._createCylinder(parentMesh);
        this._currentCylinder = this._cylinder;
        this.setParamValue(this._defaultValue);
        this._initActionManager();
    }

    private _createCylinder(parentMesh: B.Mesh): void {
        this._cylinder = B.MeshBuilder.CreateCylinder('cylinder', { diameterTop: 0.5, diameterBottom: 0.5, height:2 }, this._scene);
        this._cylinder.parent = parentMesh;
        this._cylinder.rotate(B.Axis.X, -Math.PI / 2, B.Space.WORLD);
        this._cylinder.position.z = -0.75;

        // set color
        this._cylinderMaterial = new B.StandardMaterial('material', this._scene);
        this._cylinderMaterial.diffuseColor = B.Color3.FromHexString(this._color);
        this._cylinder.material = this._cylinderMaterial;

        // text value
        const textValuePlane: B.Mesh = B.MeshBuilder.CreatePlane('textPlane', { size: 1 }, this._scene);
        textValuePlane.parent = parentMesh;
        textValuePlane.rotate(B.Axis.X, -Math.PI / 2, B.Space.WORLD);
        textValuePlane.position.z = -1.7;
        this._valueAdvancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(textValuePlane);
        this._textValueBlock = new GUI.TextBlock();
        this._textValueBlock.fontSize = 200;
        this._textValueBlock.color = 'white';
        this._textValueBlock.outlineColor = 'black';
        this._textValueBlock.outlineWidth = 30;
    }

    private _initActionManager(): void {
        const highlightLayer = new B.HighlightLayer('hl', this._scene);

        this._cylinder.actionManager = new B.ActionManager(this._scene);
        this._cylinder.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this._cylinder, B.Color3.Green());
        }));
        this._cylinder.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this._cylinder);
        }));
        this._cylinder.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this._cylinderMaterial.alpha = 0.5;
            this._valueAdvancedTexture.addControl(this._textValueBlock);
            this._scaleCylinder();
        }));
        this._cylinder.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this._cylinderMaterial.alpha = 1;
            this._valueAdvancedTexture.removeControl(this._textValueBlock);
        }));
    }

    private _scaleCylinder(): void {
        const sixDofDragBehavior = new B.SixDofDragBehavior();
        this._cylinder.addBehavior(sixDofDragBehavior);

        const step: number = (this._parameterInfo.maxValue - this._parameterInfo.minValue) / 10;
        let lastDeltaY: number = 0;

        sixDofDragBehavior.onDragStartObservable.add((): void => {
            this._currentCylinder = this._cylinder.clone('cylinderClone');
            this._cylinder.setEnabled(false);
        });

        sixDofDragBehavior.onDragObservable.add((event: {delta: B.Vector3, position: B.Vector3, pickInfo: B.PickingInfo}): void => {
            if (
                this._currentValue + event.delta.y * step >= this._parameterInfo.minValue &&
                this._currentValue + event.delta.y * step <= this._parameterInfo.maxValue
            ) {
                const newValue: number = this._currentValue + (event.delta.y - lastDeltaY) * step;
                const roundedValue: number = Math.round(newValue * 1000) / 1000;
                this.setParamValue(roundedValue);
                lastDeltaY = event.delta.y;
            }
        });

        sixDofDragBehavior.onDragEndObservable.add((): void => {
            lastDeltaY = 0;
            this._cylinder.scaling.y = this._currentCylinder.scaling.y;
            this._cylinder.position = this._currentCylinder.position;
            this._cylinder.rotation = new B.Vector3(-Math.PI / 2, 0, 0);
            this._currentCylinder.dispose();
            this._cylinder.setEnabled(true);
            this._cylinder.removeBehavior(sixDofDragBehavior);
            this._currentCylinder = this._cylinder;
        });
    }

    public setParamValue(value: number): void {
        this._currentValue = value;
        this.onValueChangedObservable.notifyObservers(value);
        this._textValueBlock.text = value.toFixed(1).toString();

        let scalingY: number = (value - this._parameterInfo.minValue) / (this._parameterInfo.maxValue - this._parameterInfo.minValue);
        if (scalingY < 0.05) {
            scalingY = 0.05;
        }

        this._currentCylinder.scaling.y = scalingY;
        this._currentCylinder.position.z = -(this._currentCylinder.scaling.y * 1.5) / 2;
    }
}