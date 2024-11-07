import * as B from "@babylonjs/core";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {CustomParameter, IParameter, IWamConfig} from "./types.ts";
import {WamParameterData, WamParameterDataMap, WamParameterInfoMap} from "@webaudiomodules/api";
import {AudioNode3D} from "./AudioNode3D.ts";
import {AudioNodeState} from "../network/types.ts";
import { BoundingBox } from "./BoundingBox.ts";
import {WebAudioModule} from "@webaudiomodules/sdk";

export class Wam3D extends AudioNode3D{
    private readonly _config: IWamConfig;
    private _usedParameters!: CustomParameter[];
    private _wamInstance!: WebAudioModule;
    private _parametersInfo!:  WamParameterInfoMap;
    private _parameter3D: {[name: string]: IParameter} = {};
    private _paramBuilder!: ParamBuilder;
    private readonly _configFile!: string;
    // public drag = new Drag(this._app)


    constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: string) {
        super(scene, audioCtx, id);
        this._config = config;
        this._configFile = configFile;


    
    }

    private async _initWamInstance(wamUrl: string): Promise<WebAudioModule> {
        // Init WamEnvironment
        const scriptUrl: string = 'https://mainline.i3s.unice.fr/wam2/packages/sdk/src/initializeWamHost.js';
        const { default: initializeWamHost } = await import(/* @vite-ignore */ scriptUrl);
        const [hostGroupId] = await initializeWamHost(this._audioCtx);

        // Import WAM
        const { default: WAM } = await import(/* @vite-ignore */ wamUrl);
        return await WAM.createInstance(hostGroupId, this.audioContext);


    }

    public async instantiate(): Promise<void> {
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

        this._initActionManager();
        this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z));
        this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));
        
        // shadow
        // this._app.shadowGenerator.addShadowCaster(this.baseMesh);
        // this._app.shadowGenerator.addShadowCaster(this.outputMesh!)
        // this._app.shadowGenerator.addShadowCaster(this.inputMesh!)

        // this.createBoundingBox();
        // @ts-ignore
        const bo  = new BoundingBox(this,this._scene,this.id,this._app)
        this.boundingBox = bo.boundingBox;
        
    }

    protected _createBaseMesh(): void {
        const size: number = this._usedParameters.length;
        this.baseMesh = B.MeshBuilder.CreateBox('box', { width: size, height: 0.2 }, this._scene);

        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0, 0, 0);
        this.baseMesh.material = material;

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
            default:
                parameter3D = this._paramBuilder.createCylinder(param, parameterStand, this._parametersInfo[fullParamName], defaultValue);
                break;
        }
        // update audio node when parameter value changes
        parameter3D.onValueChangedObservable.add((value: number): void => {
            let paramData : WamParameterData = {id:"abcd",normalized:false,value: value};
            let paramDataMap :  WamParameterDataMap = {[fullParamName]: paramData};
            this._wamInstance.audioNode.setParameterValues(paramDataMap);
        });
        parameter3D.onValueChangedObservable.notifyObservers(defaultValue);

        this._parameter3D[fullParamName] = parameter3D;
    }

    public getAudioNode(): AudioNode {
        return this._wamInstance.audioNode;
    }

    public connect(destination: AudioNode): void {
        // @ts-ignore
        this._wamInstance.audioNode.connect(destination);
    }
    public disconnect(destination: AudioNode): void {
        // @ts-ignore
        this._wamInstance.audioNode.disconnect(destination);
    }


    public async getState(): Promise<{
        inputNodes: string[];
        configFile: string;
        rotation: { x: number; y: number; z: number };
        name: string;
        id: string;
        position: { x: number; y: number; z: number };
        parameters: WamParameterDataMap
    }> {
        let parameters:  WamParameterDataMap = {};

        for (const param of this._usedParameters) {
            const fullParamName: string = `${this._config.root}${param.name}`;
            parameters = await this._wamInstance.audioNode.getParameterValues(false, fullParamName);
        }

        const inputNodes: string[] = [];
        this.inputNodes.forEach((node: AudioNode3D): void => {
            inputNodes.push(node.id);
        });

        return {
            id: this.id,
            configFile: this._configFile,
            name: this._config.name,
            position: { x: this.boundingBox.position.x, y: this.boundingBox.position.y, z: this.boundingBox.position.z },
            rotation: { x: this.boundingBox.rotation.x, y: this.boundingBox.rotation.y, z: this.boundingBox.rotation.z },
            inputNodes: inputNodes,
            parameters: parameters
        };
    }

    public setState(state: AudioNodeState): void {
        super.setState(state);

        this._usedParameters.forEach((param: CustomParameter): void => {
            const fullParamName: string = `${this._config.root}${param.name}`;
            this._parameter3D[fullParamName].setParamValue(state.parameters[fullParamName]);
        });
    }




}