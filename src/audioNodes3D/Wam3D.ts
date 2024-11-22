import * as B from "@babylonjs/core";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {CustomParameter, IParameter, IWamConfig, ParameterInfo, WamInstance} from "./types.ts";
import {AudioNode3D} from "./AudioNode3D.ts";
import {AudioNodeState} from "../network/types.ts";
import { BoundingBox } from "./BoundingBox.ts";
import {AudioEventBus} from "../AudioEvents.ts";

export class Wam3D extends AudioNode3D {
    private readonly _config: IWamConfig;
    private _usedParameters!: CustomParameter[];
    private _wamInstance!: WamInstance;
    private _parametersInfo!: {[name: string]: ParameterInfo};
    private _parameter3D: {[name: string]: IParameter} = {};
    private _paramBuilder!: ParamBuilder;
    private readonly _configFile!: string;
    // public drag = new Drag(this._app)

    private eventBus = AudioEventBus.getInstance();
    constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: string) {
        super(scene, audioCtx, id);
        this._config = config;
        this._configFile = configFile;


        this.eventBus.emit('WAM_CREATED', {nodeId: this.id, name: config.name, configFile: configFile});

    }

    private async _initWamInstance(wamUrl: string): Promise<WamInstance> {
        // Init WamEnvironment
        const scriptUrl: string = 'https://mainline.i3s.unice.fr/wam2/packages/sdk/src/initializeWamHost.js';
        const { default: initializeWamHost } = await import(/* @vite-ignore */ scriptUrl);
        const [hostGroupId] = await initializeWamHost(this._audioCtx);

        // Import WAM
        const { default: WAM } = await import(/* @vite-ignore */ wamUrl);
        return await WAM.createInstance(hostGroupId, this._audioCtx) as WamInstance;
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
        this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z));
        this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));
        
        // shadow
        // this._app.shadowGenerator.addShadowCaster(this.baseMesh);
        // this._app.shadowGenerator.addShadowCaster(this.outputMesh!)
        // this._app.shadowGenerator.addShadowCaster(this.inputMesh!)

        // this.createBoundingBox();
        const bo  = new BoundingBox(this,this._scene,this.id,this._app)
        this.boundingBox = bo.boundingBox;
        this.eventBus.emit('WAM_LOADED', {nodeId: this.id, instance: this._wamInstance});
        
    }
    public async instantiateAtPosition(networkPosition: any | undefined): Promise<void> {
        this._wamInstance = await this._initWamInstance(this._config.url);
        this._parametersInfo = await this._wamInstance.audioNode._wamNode.getParameterInfo();
        this._paramBuilder = new ParamBuilder(this._scene, this._config);
        this._usedParameters = this._config.customParameters.filter((param: CustomParameter): boolean => param.used);

        this._createBaseMesh();
        for (let i: number = 0; i < this._usedParameters.length; i++) {
            await this._createParameter(this._usedParameters[i], i);
        }

        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();
        this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z));
        this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));

        const bo = new BoundingBox(this, this._scene, this.id, this._app, networkPosition);
        this.boundingBox = bo.boundingBox;

        this.eventBus.emit('WAM_LOADED', {
            nodeId: this.id,
            instance: this._wamInstance
        });
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
            this._wamInstance.audioNode._wamNode.setParamValue(fullParamName, value);
        });
        parameter3D.onValueChangedObservable.notifyObservers(defaultValue);

        this._parameter3D[fullParamName] = parameter3D;


        parameter3D.onValueChangedObservable.add((value: number): void => {
            this.eventBus.emit('PARAM_CHANGE', {nodeId: this.id, paramId: fullParamName, value: value, source: 'user'});
        });
    }

    public getAudioNode(): AudioNode {
        // @ts-ignore
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


    public getState(): AudioNodeState {
        const parameters: {[name: string]: number} = {};

        this._usedParameters.forEach((param: CustomParameter): void => {
            const fullParamName: string = `${this._config.root}${param.name}`;
            parameters[fullParamName] = this._wamInstance.audioNode._wamNode.getParamValue(fullParamName);
        });

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
        this.boundingBox.position = new B.Vector3(
            state.position.x,
            state.position.y,
            state.position.z
        );
        this.boundingBox.rotation = new B.Vector3(
            state.rotation.x,
            state.rotation.y,
            state.rotation.z
        );

        // Gestion des connexions uniquement
        state.inputNodes.forEach((id: string): void => {
            const inputNode = this._app.networkManager.getAudioNode3D(id);
            if (!this.inputNodes.has(id) && inputNode) {
                this._app.ioManager.connectNodes(this, inputNode);
            }
        });

    }



    public updateSingleParameter(paramId: string, value: number): void {
        // Mise à jour directe du WAM
        this._wamInstance.audioNode._wamNode.setParamValue(paramId, value);

        // Mise à jour visuelle
        if (this._parameter3D[paramId]) {
            this._parameter3D[paramId].setDirectValue(value);
        }

        if (process.env.NODE_ENV === 'development') {
            console.log(`Single parameter update: ${paramId} = ${value}`);
        }
    }
    public updatePosition(position: B.Vector3, rotation: B.Vector3): void {
        this.boundingBox.position = position.clone();
        this.boundingBox.rotation = rotation.clone();
    }
}