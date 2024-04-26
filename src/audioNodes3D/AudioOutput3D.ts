import {AudioNode3D} from "./AudioNode3D.ts";
import * as B from "@babylonjs/core";
import {AudioNodeState} from "../network/types.ts";

export class AudioOutput3D extends AudioNode3D {
    constructor(scene: B.Scene, audioCtx: AudioContext, id: string) {
        super(scene, audioCtx, id);
    }

    public async instantiate(): Promise<void> {
        await this._createBaseMesh();

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();

        this._createInput(new B.Vector3(this.baseMesh.position.x - 0.7, this.baseMesh.position.y, this.baseMesh.position.z));

        // shadow
        this._app.shadowGenerator.addShadowCaster(this.baseMesh);
    }

    public connect(_destination: AudioNode): void {}

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
            position: { x: this.baseMesh.position.x, y: this.baseMesh.position.y, z: this.baseMesh.position.z },
            rotation: { x: this.baseMesh.rotation.x, y: this.baseMesh.rotation.y, z: this.baseMesh.rotation.z },
            inputNodes: [],
            parameters: {}
        };
    }
}