import {Wam3D} from "./Wam3D.ts";
import * as B from "@babylonjs/core";
import {CustomParameter, IAudioNodeConfig, IParameter, IWamConfig} from "./types.ts";

import {WamParameterData, WamParameterDataMap} from "@webaudiomodules/api";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {BoundingBox} from "./BoundingBox.ts";

export class Instrument3D extends Wam3D {
    constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: IAudioNodeConfig) {
        super(scene, audioCtx, id, config, configFile);


    }

    protected async instantiate(): Promise<void> {
        console.error("-------------INSTRUMENT3D INSTANTIATE-----------------");
        this._app.menu.hide();
        this._wamInstance = await this._initWamInstance(this._config.url);
        this._parametersInfo = await this._wamInstance.audioNode.getParameterInfo();
        this._paramBuilder = new ParamBuilder(this._scene, this._config);

        this._usedParameters = this._config.customParameters.filter((param: CustomParameter): boolean => param.used);

        this._createBaseMesh();
        for (let i: number = 0; i < this._usedParameters.length; i++) {
            await this._createParameter(this._usedParameters[i], i);
        }

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this.configureSphers();
        this._initActionManager();

        const bo  = new BoundingBox(this,this._scene,this.id,this._app)
        this.boundingBox = bo.boundingBox;


        this.eventBus.emit('WAM_LOADED', {nodeId: this.id, instance: this._wamInstance});
    }

    protected async configureSphers(): Promise<void> {
        // Load the descriptor from the WAM instance
        const descriptor = this._wamInstance.descriptor;
        console.log(descriptor);
        const baseY = this.baseMesh.position.y;
        const baseZ = this.baseMesh.position.z;

        // Configure MIDI Input
        if (descriptor.hasMidiInput) {
            this._createInputMidi(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), baseY, baseZ + 1));
        }

        // Configure MIDI Output
        if (descriptor.hasMidiOutput) {
            this._createOutputMidi(new B.Vector3(this._usedParameters.length / 2 + 0.2, baseY, baseZ + 1));
        }

        // Configure Audio Input
        if (descriptor.hasAudioInput) {
            this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), baseY, baseZ - 1));
        }

        // Configure Audio Output
        if (descriptor.hasAudioOutput) {
            this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, baseY, baseZ));
        }
    }
    

    protected async _createParameter(param: CustomParameter, index: number): Promise<void> {
        const parameterStand: B.Mesh = this._createParameterStand(
            new B.Vector3(index - (this._usedParameters.length - 1) / 2, 0.1, this.baseMesh.position.z),
            param.name
        );

        let parameter3D: IParameter;
        const paramType: string = param.type ?? this._config.defaultParameter.type;
        const fullParamName: string = `${this._config.root}${param.name}`;
        const defaultValue: number = this._parametersInfo[fullParamName].defaultValue;
        switch (paramType) {
            case 'sphere':
                parameter3D = this._paramBuilder.createSphere(param, parameterStand, this._parametersInfo[fullParamName], defaultValue);
                break;
            case 'sphereCylinder':
                parameter3D = this._paramBuilder.createSphereCylinder(param, parameterStand, this._parametersInfo[fullParamName], defaultValue);
                break
            case 'button':
                parameter3D = await this._paramBuilder.createButton(param, parameterStand, this._parametersInfo[fullParamName]);
                break;
            case 'menu':
                parameter3D = this._paramBuilder.createMenu(param, parameterStand, this._parametersInfo[fullParamName], defaultValue, this._parametersInfo[fullParamName].choices);
                break;
            default:
                parameter3D = this._paramBuilder.createCylinder(param, parameterStand, this._parametersInfo[fullParamName], defaultValue);
                break;
        }

        parameter3D.onValueChangedObservable.add((value: number): void => {
            const paramData: WamParameterData = {
                id: fullParamName,
                normalized: false,
                value: value,
            };
            const paramDataMap: WamParameterDataMap = { [fullParamName]: paramData };
            this._wamInstance.audioNode.setParameterValues(paramDataMap);
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
    protected _createOutputMidi(position: B.Vector3): void {
        this.outputMeshMidi = B.MeshBuilder.CreateSphere('outputSphereMidi', { diameter: 0.5 }, this._scene);
        this.outputMeshBigMidi = B.MeshBuilder.CreateSphere('outputBigSphereMidi', { diameter: 1 }, this._scene);
        this.outputMeshBigMidi.parent = this.outputMeshMidi;
        this.outputMeshBigMidi.visibility = 0;
        this.outputMeshMidi.parent = this.baseMesh;
        this.outputMeshMidi.position = position;

        // color
        const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
        inputSphereMaterial.diffuseColor = new B.Color3(0, 0, 1);
        this.outputMeshMidi.material = inputSphereMaterial;

        this.outputMeshMidi.actionManager = new B.ActionManager(this._scene);
        this.outputMeshBigMidi.actionManager = new B.ActionManager(this._scene);

        const highlightLayer = new B.HighlightLayer(`hl-outputMidi-${this.id}`, this._scene);

        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this.inputMeshMidi as B.Mesh, B.Color3.Blue());
        }));

        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this.inputMeshMidi as B.Mesh);
        }));

        // action manager
        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'down', node: this });
        }));
        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'up', node: this });
        }));
        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'out', node: this });
        }));
    }

    public disconnect(destination: AudioNode): void {
        // @ts-ignore
        this._wamInstance.audioNode.disconnectEvents(destination);
    }

}