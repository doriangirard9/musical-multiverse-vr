import * as B from "@babylonjs/core";
import { ParamBuilder } from "../parameters/ParamBuilder.ts";
import { CustomParameter, IAudioNodeConfig, IParameter, IWamConfig } from "../types.ts";
import { WamParameterDataMap, WamParameterInfoMap } from "@webaudiomodules/api";
import { AudioNode3D } from "../AudioNode3D.ts";
import { AudioNodeState } from "../../network/types.ts";
import { BoundingBox } from "../BoundingBox.ts";
import { WebAudioModule } from "@webaudiomodules/sdk";
import { App } from "../../App.ts";
import { AudioEventBus } from "../../AudioEvents.ts";
import { PianoRoll3D } from "../PianoRoll3D.ts";

export class PianoRoll3D54 extends AudioNode3D {
  public getState(): Promise<AudioNodeState> {
    throw new Error("Method not implemented.");
  }
  protected readonly _config: IWamConfig;
  protected _usedParameters!: CustomParameter[];
  protected _wamInstance!: WebAudioModule;
  protected _parametersInfo!: WamParameterInfoMap;
  protected _parameter3D: { [name: string]: IParameter } = {};
  protected _paramBuilder!: ParamBuilder;
  private readonly _configFile!: IAudioNodeConfig;
  protected eventBus = AudioEventBus.getInstance();
  private _pianoRoll3D!: PianoRoll3D;

  constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: IAudioNodeConfig) {
    super(scene, audioCtx, id);
    this._config = config;
    this._configFile = configFile;
    this.eventBus.emit("WAM_CREATED", { nodeId: this.id, name: config.name, configFile });
  }

  protected async _initWamInstance(wamUrl: string): Promise<WebAudioModule> {
    const [hostGroupId] = await App.getHostGroupId();
    const { default: WAM } = await import(/* @vite-ignore */ wamUrl);
    return await WAM.createInstance(hostGroupId, this.audioContext);
  }

  public async instantiate(): Promise<void> {
    console.log("[PianoRoll] Instantiating:", this.id);
    this._app.menu.hide();
    this._wamInstance = await this._initWamInstance(this._config.url);
    this._parametersInfo = await this._wamInstance.audioNode.getParameterInfo();
    this._paramBuilder = new ParamBuilder(this._scene, this._config);
    this._usedParameters = this._config.customParameters.filter((param) => param.used);

    this._createBaseMesh();

    this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
    this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

    this._initActionManager();
    this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z));
    this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));

    // Create and attach bounding box
    const bounding = new BoundingBox(this, this._scene, this.id, this._app);
    this.boundingBox = bounding.boundingBox;
    this.baseMesh.parent = this.boundingBox;

    // Create PianoRoll3D and attach to baseMesh
    this._pianoRoll3D = new PianoRoll3D(
      this._scene,
      24,
      32,
      120,
      this._audioCtx,
      {
        pianoRollInstance: { instanceId: this.id },
        synthInstance: this._wamInstance
      }
    );
    this._pianoRoll3D.setParent(this.baseMesh);

    this.eventBus.emit("WAM_LOADED", { nodeId: this.id, instance: this._wamInstance });
  }

  protected _createBaseMesh(): void {
    this.baseMesh = B.MeshBuilder.CreateBox("base", { width: 25, height: 0.2, depth: 10 }, this._scene);
    const material = new B.StandardMaterial("material", this._scene);
    material.diffuseColor = new B.Color3(0.1, 0.1, 0.1);
    this.baseMesh.material = material;
  }


  public getAudioNode(): AudioNode {
    return this._wamInstance.audioNode;
  }

  public connect(destination: AudioNode): void {
    this._wamInstance.audioNode.connect(destination);
  }

  public disconnect(destination: AudioNode): void {
    this._wamInstance.audioNode.disconnect(destination);
  }

  public update(): void {
    this._pianoRoll3D?.update();
  }

  public start(): void {
    this._pianoRoll3D?.start();
  }

  public stop(): void {
    this._pianoRoll3D?.stop();
  }

  
  // public async getState(): Promise<AudioNodeState> {
  //   let parameters: WamParameterDataMap = {};
  //   const parameterPromises = this._usedParameters.map(async (param) => {
  //     const fullParamName = `${this._config.root}${param.name}`;
  //     return this._wamInstance.audioNode.getParameterValues(false, fullParamName);
  //   });

  //   const resolvedParameters = await Promise.all(parameterPromises);
  //   resolvedParameters.forEach((paramValues) => {
  //     parameters = { ...parameters, ...paramValues };
  //   });

  //   const inputNodes = Array.from(this.inputNodes, (node) => node.id);
  //   const inputNodesMidi = Array.from(this.inputNodesMidi, (node) => node.id);

  //   const params: WamParameterDataMap = {};
  //   for (const [key, value] of Object.entries(parameters)) {
  //     params[key] = { id: key, value: value.value, normalized: false };
  //   }

  //   return {
  //     id: this.id,
  //     configFile: this._configFile,
  //     name: this._config.name,
  //     position: this.boundingBox.position.clone(),
  //     rotation: this.boundingBox.rotation.clone(),
  //     inputNodes,
  //     inputNodesMidi,
  //     parameters: params
  //   };
  // }

  public setState(state: AudioNodeState): void {
    this.boundingBox.position = new B.Vector3(state.position.x, state.position.y, state.position.z);
    this.boundingBox.rotation = new B.Vector3(state.rotation.x, state.rotation.y, state.rotation.z);
  }

  public async updateSingleParameter(paramId: string, value: number): Promise<void> {
    try {
      const paramDataMap = {
        [paramId]: { id: paramId, value, normalized: false }
      };
      await this._wamInstance.audioNode.setParameterValues(paramDataMap);

      if (this._parameter3D[paramId]) {
        this._parameter3D[paramId].setParamValue(value, true);
      }
    } catch (err) {
      console.error("Error updating parameter:", err);
    }
  }
}
