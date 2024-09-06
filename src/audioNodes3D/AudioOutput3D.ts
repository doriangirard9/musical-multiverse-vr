import {AudioNode3D} from "./AudioNode3D.ts";
import * as B from "@babylonjs/core";
import {AudioNodeState} from "../network/types.ts";
import { BoundingBox } from "./BoundingBox.ts";
import { TubeParams } from "../types.ts";
import { StepSequencer3D } from "./StepSequencer3D.ts";
import * as Tone from "tone";

export class AudioOutput3D extends AudioNode3D {
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
    }

    public connect(_destination: AudioNode): void {}
    public disconnect(_destination: AudioNode): void {}

    public getAudioNode(): AudioNode {
        return this._audioCtx.destination;
    }

    protected async _createBaseMesh(): Promise<void> {
        this.baseMesh = B.MeshBuilder.CreateBox('box', { width: 1, height: 1 }, this._scene);
        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(1, 0, 0);
        this.baseMesh.material = material;
    }

    public getState(): AudioNodeState {
        return {
            id: this.id,
            name: 'audioOutput',
            position: { x: this.boundingBox.position.x, y: this.boundingBox.position.y, z: this.boundingBox.position.z },
            rotation: { x: this.boundingBox.rotation.x, y: this.boundingBox.rotation.y, z: this.boundingBox.rotation.z },
            inputNodes: [],
            parameters: {}
        };
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
        super.delete();


    }
}