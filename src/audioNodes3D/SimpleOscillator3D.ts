import * as B from "@babylonjs/core";
import * as Tone from "tone";
import {CustomParameter, IAudioNodeConfig, IParameter, ParameterInfo} from "./types.ts";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {AudioNode3D} from "./AudioNode3D.ts";
import {AudioNodeState} from "../network/types.ts";
import { BoundingBox } from "./BoundingBox.ts";

export class SimpleOscillator3D extends AudioNode3D {
    private _oscillator!: Tone.Oscillator;
    private _parametersInfo!: {[name: string]: ParameterInfo};
    private _usedParameters!: CustomParameter[];
    private _parameter3D: {[name: string]: IParameter} = {};
    private readonly _config: IAudioNodeConfig;
    private _paramBuilder!: ParamBuilder;

    constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IAudioNodeConfig) {
        super(scene, audioCtx, id);
        this._config = config;
    }

    public instantiate(): void {
        this._app.menu.hide();
        if (!this._config.parametersInfo) throw new Error("Missing parametersInfo in config");

        this._parametersInfo = this._config.parametersInfo;
        this._paramBuilder = new ParamBuilder(this._scene, this._config);

        this._usedParameters = this._config.customParameters.filter((param: CustomParameter) => param.used);

        this._oscillator = new Tone.Oscillator();
        this._oscillator.start();

        this._createBaseMesh();
        this._usedParameters.forEach((param: CustomParameter, index: number): void => {
            this._createParameter(param, index);
        });

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();

        this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));
        const bo = new BoundingBox(this, this._scene, this.id, this._app);
        this.boundingBox = bo.boundingBox;
        // bo.addMovingBehaviourToBoundingBox();
        // shadow
        // this._app.shadowGenerator.addShadowCaster(this.baseMesh);
    }

    // disconnect each synth from the merger node
    public disconnect(_destination: AudioNode): void {
        this._oscillator.disconnect();

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
        const defaultValue: number = this._parametersInfo[param.name].defaultValue;
        switch (paramType) {
            case 'button':
                parameter3D = await this._paramBuilder.createButton(param, parameterStand, this._parametersInfo[param.name]);
                break;
            default:
                parameter3D = this._paramBuilder.createCylinder(param, parameterStand, this._parametersInfo[param.name], defaultValue);
                break;
        }

        // update audio node when parameter value changes
        parameter3D.onValueChangedObservable.add((value: number): void => {
            switch (param.name) {
                case 'frequency':
                    this._oscillator.frequency.value = value;
                    break;
                case 'detune':
                    this._oscillator.detune.value = value;
                    break;
                case 'volume':
                    this._oscillator.volume.value = value;
                    break;
                default:
                    break;
            }
        });
        parameter3D.onValueChangedObservable.notifyObservers(defaultValue);

        this._parameter3D[param.name] = parameter3D;
    }

    public connect(destination: AudioNode): void {
        this._oscillator.connect(destination);
    }

    public getAudioNode(): AudioNode {
        return this._oscillator.output as AudioNode;
    }

    public getState(): AudioNodeState {
        const parameters: {[name: string]: number} = {};

        this._usedParameters.forEach((param: CustomParameter): void => {
            switch (param.name) {
                case 'frequency':
                    parameters[param.name] = this._oscillator.frequency.value as number;
                    break;
                case 'detune':
                    parameters[param.name] = this._oscillator.detune.value;
                    break;
                case 'volume':
                    parameters[param.name] = this._oscillator.volume.value;
                    break;
                default:
                    break;
            }
        });

        const inputNodes: string[] = [];
        this.inputNodes.forEach((node: AudioNode3D): void => {
            inputNodes.push(node.id);
        });

        return {
            id: this.id,
            name: 'simpleOscillator',
            // position: { x: this.baseMesh.position.x, y: this.baseMesh.position.y, z: this.baseMesh.position.z },
            // rotation: { x: this.baseMesh.rotation.x, y: this.baseMesh.rotation.y, z: this.baseMesh.rotation.z },
            position: { x: this.boundingBox.position.x, y: this.boundingBox.position.y, z: this.boundingBox.position.z },
            rotation: { x: this.boundingBox.rotation.x, y: this.boundingBox.rotation.y, z: this.boundingBox.rotation.z },
            inputNodes: inputNodes,
            parameters: parameters
        };
    }

    public setState(state: AudioNodeState): void {
        super.setState(state);

        this._usedParameters.forEach((param: CustomParameter): void => {
            this._parameter3D[param.name].setParamValue(state.parameters[param.name]);
        });
    }
}