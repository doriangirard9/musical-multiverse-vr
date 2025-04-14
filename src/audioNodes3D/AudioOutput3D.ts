import {AudioNode3D} from "./AudioNode3D.ts";
import * as B from "@babylonjs/core";
import {AudioNodeState} from "../network/types.ts";
import { BoundingBox } from "./BoundingBox.ts";
import { TubeParams } from "../types.ts";
import {WamParameterDataMap} from "@webaudiomodules/api";
import {IAudioNodeConfig} from "./types.ts";
import {XRManager} from "../xr/XRManager.ts";

export class AudioOutput3D extends AudioNode3D {
    private _pannerNode: PannerNode;

    constructor(scene: B.Scene, audioCtx: AudioContext, id: string) {
        super(scene, audioCtx, id);

        // Créer le PannerNode pour la spatialisation
        this._pannerNode = this._audioCtx.createPanner();

        // Configuration du PannerNode pour une spatialisation correcte en VR
        this._pannerNode.panningModel = 'HRTF';
        this._pannerNode.distanceModel = 'inverse';
        this._pannerNode.refDistance = 1; // Distance de référence pour réduire le volume
        this._pannerNode.maxDistance = 100; // Distance maximale à laquelle le son sera réduit, passé cette distance le son ne sera pas réduit
        this._pannerNode.rolloffFactor = 0.5; // Vitesse de décroissance du volume en fonction de la distance

        // Connecter le PannerNode à la sortie
        this._pannerNode.connect(this._audioCtx.destination);

        // Enregistrer la fonction de mise à jour à chaque frame
        this._updateAudioPositionBound = this._updateAudioPosition.bind(this);
        scene.registerBeforeRender(this._updateAudioPositionBound);
    }

    // Référence à la fonction liée pour le nettoyage
    private _updateAudioPositionBound: () => void;

    public async instantiate(): Promise<void> {
        await this._createBaseMesh();

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();

        this._createInput(new B.Vector3(this.baseMesh.position.x - 0.7, this.baseMesh.position.y, this.baseMesh.position.z));

        const bo = new BoundingBox(this, this._scene, this.id, this._app);
        this.boundingBox = bo.boundingBox;

        // Initialiser la position audio
        this._updateAudioPosition();
    }

    /**
     * Met à jour la position du son selon le mesh et l'orientation du casque VR
     */
    private _updateAudioPosition(): void {
        if (!this.baseMesh) return;

        const meshWorldPosition = this.baseMesh.getAbsolutePosition();
        this._pannerNode.positionX.value = meshWorldPosition.x;
        this._pannerNode.positionY.value = meshWorldPosition.y;
        this._pannerNode.positionZ.value = -meshWorldPosition.z;


        const meshForward = this.baseMesh.forward;
        this._pannerNode.orientationX.value = meshForward.x;
        this._pannerNode.orientationY.value = meshForward.y;
        this._pannerNode.orientationZ.value = -meshForward.z;

        const xrManager = XRManager.getInstance();
        if (xrManager.xrHelper && xrManager.xrHelper.baseExperience) {
            const vrCamera = xrManager.xrHelper.baseExperience.camera;
            const listener = this._audioCtx.listener;

            listener.positionX.value = vrCamera.position.x;
            listener.positionY.value = vrCamera.position.y;
            listener.positionZ.value = -vrCamera.position.z;

            const cameraForward = vrCamera.getDirection(B.Vector3.Forward());
            const cameraUp = vrCamera.getDirection(B.Vector3.Up());

            listener.forwardX.value = cameraForward.x;
            listener.forwardY.value = cameraForward.y;
            listener.forwardZ.value = -cameraForward.z;

            listener.upX.value = cameraUp.x;
            listener.upY.value = cameraUp.y;
            listener.upZ.value = -cameraUp.z;
        }
    }

    public connect(_destination: AudioNode): void {}

    public disconnect(_destination: AudioNode): void {}

    public getAudioNode(): AudioNode {
        return this._pannerNode;
    }

    protected async _createBaseMesh(): Promise<void> {
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

    public delete(): void {
        if (this._updateAudioPositionBound) {
            this._scene.unregisterBeforeRender(this._updateAudioPositionBound);
        }

        if (this._pannerNode) {
            this._pannerNode.disconnect();
        }

        this.inputArcs.forEach((arc: TubeParams): void => {
            arc.outputNode.getAudioNode().disconnect(this._pannerNode);
        });

        super.delete();
    }
}