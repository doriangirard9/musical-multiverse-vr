import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import {IParameter, ParameterInfo} from "../types.ts";

export class ButtonParam implements IParameter {
    private readonly _scene: B.Scene;
    private _parameterInfo: ParameterInfo;
    private readonly _color: string;
    private _parentMesh!: B.Mesh;

    private _button!: GUI.MeshButton3D;
    private _cylinder!: B.AbstractMesh;
    private _isPushed: boolean = false;

    public onValueChangedObservable = new B.Observable<number>();
    constructor(scene: B.Scene, parentMesh: B.Mesh, parameterInfo: ParameterInfo, color: string) {
        this._scene = scene;
        this._parameterInfo = parameterInfo;
        this._color = color;
        this._parentMesh = parentMesh;
    }

    public async _createButton(): Promise<void> {
        const rootUrl: string = "https://david.blob.core.windows.net/babylonjs/MRTK/";
        const result: B.ISceneLoaderAsyncResult = await B.SceneLoader.ImportMeshAsync("", rootUrl, "pushButton.glb", this._scene);
        const buttonMesh = result.meshes[0] as B.Mesh;
        buttonMesh.scaling = new B.Vector3(0.45, 0.45, 0.45);

        this._cylinder = buttonMesh.getChildMeshes(false, (node: B.Node): boolean => { return node.name.indexOf("Cylinder") !== -1 })[0];
        const cylinderMaterial = new B.StandardMaterial('material', this._scene);
        cylinderMaterial.diffuseColor = B.Color3.FromHexString(this._color);
        this._cylinder.material = cylinderMaterial;

        const manager = new GUI.GUI3DManager(this._scene);

        this._button = new GUI.MeshButton3D(buttonMesh, "button");
        this._initButtonEvents();

        manager.addControl(this._button);
        buttonMesh.parent = this._parentMesh;

        this.setParamValue(this._parameterInfo.defaultValue);
    }

    private _initButtonEvents(): void {
        this._button.pointerEnterAnimation = (): void => {}
        this._button.pointerOutAnimation = (): void => {}
        this._button.pointerUpAnimation = (): void => {}
        this._button.pointerDownAnimation = (): void => {
            if (this._isPushed) this.setParamValue(0);
            else this.setParamValue(1);
        }
    }

    public setParamValue(value: number, silent: boolean = false): void {
        if (value === 1) {
            this._isPushed = true;
            this._cylinder.position.y = 0;
        } else {
            this._isPushed = false;
            this._cylinder.position.y = 0.2;
        }

        // Émettre l'événement seulement si ce n'est pas silencieux
        if (!silent) {
            this.onValueChangedObservable.notifyObservers(value);
        }
    }
    public setDirectValue(value: number): void {
        if (value === 1) {
            this._isPushed = true;
            this._cylinder.position.y = 0;
        } else {
            this._isPushed = false;
            this._cylinder.position.y = 0.2;
        }
        // Pas d'émission d'événement
    }
}