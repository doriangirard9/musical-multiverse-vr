import * as B from "@babylonjs/core";
import {
    WamParameterData,
    WamParameterDataMap,
    WamParameterInfoMap,
} from "@webaudiomodules/api";
import {WebAudioModule} from "@webaudiomodules/sdk";
import {IWamPort} from "./interfaces/IWamPort.ts";
import {AudioInputPort, AudioOutputPort, MidiInputPort, MidiOutputPort} from "./WamPort.ts";
import {WamInitializer} from "../app/WamInitializer.ts";
import {BoundingBox} from "../boundingBox/BoundingBox.ts";
import {AudioNode3D} from "./AudioNode3D.ts";
import {AudioEventBus} from "../eventBus/AudioEventBus.ts";
import {CustomParameter, IParameter, IWamConfig} from "../shared/SharedTypes.ts";
import {ParamBuilder} from "../parameters/ParamBuilder.ts";
import {Wam3DGUI} from "./Wam3DGUI.ts";

export class Wam3D extends AudioNode3D{
    protected readonly _config: IWamConfig;
    public _usedParameters!: CustomParameter[];
    protected _wamInstance!: WebAudioModule;
    protected _parametersInfo!: WamParameterInfoMap;
    protected _parameter3D: { [name: string]: IParameter } = {};
    protected _paramBuilder!: ParamBuilder;
    private readonly _configFile!: string;
    // public drag = new Drag(this._app)

    protected eventBus = AudioEventBus.getInstance();
    private wamInitializer: WamInitializer;
    //@ts-ignore
    private wam3DGUI: Wam3DGUI;
    constructor(audioCtx: AudioContext, id: string, config: IWamConfig, kind: string) {
        super(audioCtx, id, kind);
        this._config = config;
        this.wamInitializer = WamInitializer.getInstance(audioCtx);
    }

    public async instantiate(): Promise<void> {
        console.log('[Wam3D] Starting instantiation:', this.id);
        this._wamInstance = await this.wamInitializer.initWamInstance(this._config.url);
        console.log('[Wam3D] WAM instance created:', this.id);
        console.log('[Wam3D] WAM instance descriptor:', this._wamInstance.descriptor);
        this._parametersInfo = await this._wamInstance.audioNode.getParameterInfo();
        this._paramBuilder = new ParamBuilder(this._scene, this._config);
        this._usedParameters = this._config.customParameters.filter((param: CustomParameter): boolean => param.used);
        this.initializePorts();


        this._createBaseMesh();
        for (let i: number = 0; i < this._usedParameters.length; i++) {
            await this._createParameter(this._usedParameters[i], i);
        }

        this.wam3DGUI = new Wam3DGUI(this);
        this.wam3DGUI.initialize()

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();
        //this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z));
        //this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));

        // shadow
        // this._app.shadowGenerator.addShadowCaster(this.baseMesh);
        // this._app.shadowGenerator.addShadowCaster(this.outputMesh!)
        // this._app.shadowGenerator.addShadowCaster(this.inputMesh!)

        // this.createBoundingBox();
        const bo = new BoundingBox(this, this.id)
        this.boundingBox = bo.boundingBox;
        this.eventBus.emit('AUDIO_NODE_LOADED', {nodeId: this.id, instance: this._wamInstance});

        console.log(this)

    }
    private ports = new Map<string, IWamPort>();

    public initializePorts(): void {
        if (this._wamInstance.descriptor.hasAudioInput) {
            //@ts-ignore Type string is not assignable to type "audioIn" | "audioOut" | "midiIn" | "midiOut" pareil pour les 3 autres
            this.addPort(new AudioInputPort('audioIn', this._wamInstance.audioNode));
        }

        if (this._wamInstance.descriptor.hasAudioOutput) {
            //@ts-ignore
            this.addPort(new AudioOutputPort('audioOut', this._wamInstance.audioNode));
        }

        if (this._wamInstance.descriptor.hasMidiInput) {
            //@ts-ignore
            this.addPort(new MidiInputPort('midiIn', this._wamInstance.audioNode));
        }

        if (this._wamInstance.descriptor.hasMidiOutput) {
            //@ts-ignore
            this.addPort(new MidiOutputPort('midiOut', this._wamInstance.audioNode));
        }
    }

    private addPort(port: IWamPort) : void {
        this.ports.set(port.id, port);
    }
    private getPort(id: string): IWamPort | undefined {
        return this.ports.get(id);
    }
    public getPorts(): Map<string, IWamPort> {
        return this.ports;
    }
    public getPortMesh(portId: string): B.Mesh | undefined {
        return this.wam3DGUI.inputOutputMeshs?.get(portId);
    }

    public connectPorts(outputPortId: string, targetNode: Wam3D, inputPortId: string): boolean {
        const outputPort = this.getPort(outputPortId);
        if (!outputPort) {
            console.warn(`Output port "${outputPortId}" not found on node ${this.id}`);
            return false;
        }

        const inputPort = targetNode.getPort(inputPortId);
        if (!inputPort) {
            console.warn(`Input port "${inputPortId}" not found on node ${targetNode.id}`);
            return false;
        }

        try {
            outputPort.connect(inputPort);
            this.eventBus.emit('CONNECT_NODES', {
                sourceId: this.id,
                targetId: targetNode.id,
                isSrcMidi: outputPort instanceof MidiOutputPort, // pour pas broken mais a changé
                source: 'user'
            });

            return true;
        }
        catch (error) {
            console.error(`Failed to connect ${this.id}.${outputPortId} to ${targetNode.id}.${inputPortId}:`, error);
            return false;
        }
    }
    protected _createBaseMesh(): void {
        const size: number = this._usedParameters.length;
        this.baseMesh = B.MeshBuilder.CreateBox('box', {width: size, height: 0.2}, this._scene);

        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0, 0, 0);
        this.baseMesh.material = material;

    }

    protected async _createParameter(param: CustomParameter, index: number): Promise<void> {
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
            const paramData: WamParameterData = {
                id: fullParamName,
                normalized: false,
                value: value,
            };
            const paramDataMap: WamParameterDataMap = {[fullParamName]: paramData};
            this._wamInstance.audioNode.setParameterValues(paramDataMap);
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

    public override async getState(key: string): Promise<any>{
        return await this._wamInstance.audioNode.getParameterValues(false, key)
    }

    public override async setState(key: string, value: any){
        await this._wamInstance.audioNode.setParameterValues({key:{id:key, value:value as number, normalized:false}})
    }

    public override getStateKeys(): Iterable<string>{
        return this._usedParameters.map(it=>`${this._config.root}${it.name}`);
    }

    public async updateSingleParameter(paramId: string, value: number): Promise<void> {
        try {
            // Mise à jour directe du WAM
            const paramData = {
                id: paramId,
                value: value,
                normalized: false
            };

            const paramDataMap = {[paramId]: paramData};
            await this._wamInstance.audioNode.setParameterValues(paramDataMap);

            // Mise à jour visuelle silencieuse (sans déclencher d'événement)
            if (this._parameter3D[paramId]) {
                this._parameter3D[paramId].setParamValue(value, true);
            }
        } catch (error) {
            console.error('Error updating parameter:', error);
        }
    }



    dispose(): void {
    }

}