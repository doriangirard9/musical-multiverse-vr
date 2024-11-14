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
        const parameterStand: B.Mesh = this._createParameterStand(
            new B.Vector3(index - (this._usedParameters.length - 1) / 2, 0.1, this.baseMesh.position.z),
            param.name
        );

        // Création du paramètre 3D selon son type
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

        // Mise à jour du module audio lorsque la valeur du paramètre change
        parameter3D.onValueChangedObservable.add((value: number): void => {
            const paramData: WamParameterData = {
                id: fullParamName,
                normalized: false,
                value: value,
            };
            const paramDataMap: WamParameterDataMap = { [fullParamName]: paramData };
            this._wamInstance.audioNode.setParameterValues(paramDataMap);
        });

        // Initialisation de la valeur par défaut
        parameter3D.onValueChangedObservable.notifyObservers(defaultValue);

        // Stocke le paramètre 3D avec le bon identifiant
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


    public async getState(): Promise<AudioNodeState> {
        let parameters: WamParameterDataMap = {};

        // Create an array of promises to fetch all parameter values concurrently
        const parameterPromises = this._usedParameters.map(async (param) => {
            const fullParamName: string = `${this._config.root}${param.name}`;
            return this._wamInstance.audioNode.getParameterValues(false, fullParamName);
        });

        // Wait for all promises to resolve and merge results into `parameters`
        const resolvedParameters = await Promise.all(parameterPromises);
        resolvedParameters.forEach(paramValues => {
            parameters = { ...parameters, ...paramValues }; // Merge each parameter set
        });

        const inputNodes: string[] = [];
        this.inputNodes.forEach((node: AudioNode3D): void => {
            inputNodes.push(node.id);
        });

        // create variable with this type { [name: string]: number };
        const params: {[name: string]: number} = {};

        //loop on parameters of type WamParameterDataMap and fill params
        for (const [key, value] of Object.entries(parameters)) {
            params[key] = value.value;
        }

        return {
            id: this.id,
            configFile: this._configFile,
            name: this._config.name,
            position: {
                x: this.boundingBox.position.x,
                y: this.boundingBox.position.y,
                z: this.boundingBox.position.z,
            },
            rotation: {
                x: this.boundingBox.rotation.x,
                y: this.boundingBox.rotation.y,
                z: this.boundingBox.rotation.z,
            },
            inputNodes: inputNodes,
            parameters: params,
        };
    }



    public async setState(state: AudioNodeState): Promise<void> {
       super.setState(state);

        // Met à jour les représentations 3D des paramètres
        console.log(state.parameters)
         for (const paramId in state.parameters) {
            const paramData = state.parameters[paramId];
            if (this._parameter3D[paramId]) {
                this._parameter3D[paramId].setParamValue(paramData);
            } else {
                console.warn(`Paramètre manquant pour ${paramId}`);
            }
        }
        // Met à jour les valeurs des paramètres dans le module audio
        let p : WamParameterDataMap = {}


        for (const [key, value] of Object.entries(state.parameters)) {
            p[key] = {
                id: this.id,
                value: value,
                normalized: false
            }
        }
        await this._wamInstance.audioNode.setParameterValues(p);

    }






}