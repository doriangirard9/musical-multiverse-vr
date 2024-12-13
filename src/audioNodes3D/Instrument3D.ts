import {Wam3D} from "./Wam3D.ts";
import * as B from "@babylonjs/core";
import {CustomParameter, IParameter, IWamConfig, ParameterInfo} from "./types.ts";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {BoundingBox} from "./BoundingBox.ts";

export class Instrument3D extends Wam3D {

    constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: string) {
        super(scene, audioCtx, id, config, configFile);


    }

    public async instantiate(): Promise<void> {
        this._app.menu.hide();
        this._wamInstance = await this._initWamInstance(this._config.url);
        this._parametersInfo = await this._wamInstance.audioNode._wamNode.getParameterInfo() as {[name: string]: ParameterInfo};
        this._paramBuilder = new ParamBuilder(this._scene, this._config);

        this._usedParameters = this._config.customParameters.filter((param: CustomParameter): boolean => param.used);

        this._createBaseMesh();
        for (let i: number = 0; i < this._usedParameters.length; i++) {
            await this._createParameter(this._usedParameters[i], i);
        }

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();
        this._createInputMidi(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z+1));

        this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z-1));

        this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));


        const bo  = new BoundingBox(this,this._scene,this.id,this._app)
        this.boundingBox = bo.boundingBox;

    }

    private async _createParameter(param: CustomParameter, index: number): Promise<void> {
        const parameterStand: B.Mesh = this._createParameterStand(new B.Vector3(index - (this._usedParameters.length - 1) / 2, 0.1, this.baseMesh.position.z), param.name);

        // create 3D parameter according to its type
        let parameter3D: IParameter;
        const paramType: string = param.type ?? this._config.defaultParameter.type;
        const fullParamName: string = `${this._config.root}${param.name}`;
        const defaultValue: number = this._parametersInfo[fullParamName].defaultValue;
        switch (paramType) {
            case 'button':
                parameter3D = await this._paramBuilder.createButton(param, parameterStand, this._parametersInfo[fullParamName]);
                break;
            case 'menu':
                parameter3D = this._paramBuilder.createMenu(param, parameterStand, this._parametersInfo[fullParamName], defaultValue,["test","1","2","3"] );// TODO : this._parametersInfo[fullParamName].choices);
                break;
            default:
                parameter3D = this._paramBuilder.createCylinder(param, parameterStand, this._parametersInfo[fullParamName], defaultValue);
                break;
        }
        // update audio node when parameter value changes
        parameter3D.onValueChangedObservable.add((value: number): void => {
            this._wamInstance.audioNode._wamNode.setParamValue(fullParamName, value);
        });
        parameter3D.onValueChangedObservable.notifyObservers(defaultValue);

        this._parameter3D[fullParamName] = parameter3D;
    }

    public connect(destination: AudioNode): void {
        // @ts-ignore
        this._wamInstance.audioNode.connect(destination);
    }

    protected _createInputMidi(position: B.Vector3): void {
        this.inputMeshMidi = B.MeshBuilder.CreateSphere('inputSphereMidi', { diameter: 0.5 }, this._scene);
        this.inputMeshBigMidi = B.MeshBuilder.CreateSphere('inputBigSphereMidi', { diameter: 1 }, this._scene);
        this.inputMeshBigMidi.parent = this.inputMeshMidi;
        this.inputMeshBigMidi.visibility = 0;
        this.inputMeshMidi.parent = this.baseMesh;
        this.inputMeshMidi.position = position;

        // color
        const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
        inputSphereMaterial.diffuseColor = new B.Color3(0, 0, 1);
        this.inputMeshMidi.material = inputSphereMaterial;

        this.inputMeshMidi.actionManager = new B.ActionManager(this._scene);
        this.inputMeshBigMidi.actionManager = new B.ActionManager(this._scene);

        const highlightLayer = new B.HighlightLayer(`hl-input-${this.id}`, this._scene);

        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this.inputMeshMidi as B.Mesh, B.Color3.Blue());
        }));

        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this.inputMeshMidi as B.Mesh);
        }));

        // action manager
        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'down', node: this });
        }));
        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'up', node: this });
        }));
        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'out', node: this });
        }));
    }


    public disconnect(destination: AudioNode): void {
        // @ts-ignore
        this._wamInstance.audioNode.disconnectEvents(destination);
    }

}