import { AudioNode3D } from "./AudioNode3D.ts";
import * as B from "@babylonjs/core";
import { AudioNodeState } from "../network/types.ts";
import { BoundingBox } from "./BoundingBox.ts";
import { TubeParams } from "../types.ts";
import { StepSequencer3D } from "./StepSequencer3D.ts";
import * as Tone from "tone";
import { WamParameterDataMap } from "@webaudiomodules/api";
import { IAudioNodeConfig } from "./types.ts";
import { SpatialAudioNode } from "../SpatialAudioNode.ts";

export class AudioOutput3D extends AudioNode3D {
    protected spatialAudioNode!: SpatialAudioNode;

    constructor(scene: B.Scene, audioCtx: AudioContext, id: string) {
        super(scene, audioCtx, id);
    }

    public async instantiate(): Promise<void> {
        this._app.menu.hide();
        await this._createBaseMesh();

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();

        this._createInput(new B.Vector3(this.baseMesh.position.x - 0.7, this.baseMesh.position.y, this.baseMesh.position.z));

        const bo = new BoundingBox(this, this._scene, this.id, this._app);
        this.boundingBox = bo.boundingBox;

        // bo.addMovingBehaviourToBoundingBox();
        // shadow
        // this._app.shadowGenerator.addShadowCaster(this.baseMesh);
        
        // Spatial audio integration
        this.spatialAudioNode = new SpatialAudioNode(this._audioCtx, this.baseMesh, this._scene);
        this.spatialAudioNode.connect(this._audioCtx.destination);
    }

    public connect(source: AudioNode): void {
        source.connect(this.spatialAudioNode.getAudioNode());
    }

    public disconnect(source: AudioNode): void {
        source.disconnect(this.spatialAudioNode.getAudioNode());
    }

    public getAudioNode(): AudioNode {
        return this.spatialAudioNode.getAudioNode();
    }

    protected async _createBaseMesh(): Promise<void> {

        // const test = B.MeshBuilder.CreateBox('test', { width: 0.2, height: 4,depth:0.2 }, this._scene);
        // test.position = new B.Vector3(0, 0, 0);
        this.baseMesh = B.MeshBuilder.CreateBox('box', { width: 1, height: 1 }, this._scene);
        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(1, 0, 0);
        this.baseMesh.material = material;
    }

    public getState(): Promise<AudioNodeState> {
        let parameters : WamParameterDataMap = {}
        let config: IAudioNodeConfig = {defaultParameter: {
                type: "",
                color: ""
            }, customParameters: [] }
        return Promise.resolve({
            id: this.id,
            name: "audioOutput",
            configFile: config,
            position: { x: this.boundingBox.position.x, y: this.boundingBox.position.y, z: this.boundingBox.position.z },
            rotation: { x: this.boundingBox.rotation.x, y: this.boundingBox.rotation.y, z: this.boundingBox.rotation.z },
            inputNodes: [],
            inputNodesMidi: [],
            parameters: parameters
        });
    }

    public delete():void{
        this.inputArcs.forEach((arc: TubeParams): void => {
            arc.outputNode.getAudioNode().disconnect();
                    // Optionally delete connected nodes
        if (arc.outputNode instanceof StepSequencer3D) {
            // arc.outputNode.delete();
                 // Disconnect each synth from the merger node
     arc.outputNode._synths.forEach((synth: Tone.Synth) => {
        synth.disconnect();
    });
        }
        });

        if (this.spatialAudioNode) {
            this.spatialAudioNode.dispose(this._scene);
        }

        super.delete();
    }
}