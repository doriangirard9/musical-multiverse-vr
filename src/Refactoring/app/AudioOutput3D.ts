import {AudioNodeState, AudioOutputState} from "../network/types.ts";
import {WamParameterDataMap} from "@webaudiomodules/api";

import {XRManager} from "../xr/XRManager.ts";
import {BoundingBox} from "../boundingBox/BoundingBox.ts";
import {IAudioNodeConfig} from "../shared/SharedTypes.ts";
import {AudioNode3D} from "../ConnecterWAM/AudioNode3D.ts";
import {SceneManager} from "./SceneManager.ts";
import {
    ActionManager,
    Color3, ExecuteCodeAction, HighlightLayer, Mesh,
    MeshBuilder, Nullable,
    RotationGizmo,
    Scene,
    StandardMaterial,
    UtilityLayerRenderer,
    Vector3
} from "@babylonjs/core";
import {IOEventBus} from "../eventBus/IOEventBus.ts";
import {NetworkEventBus} from "../eventBus/NetworkEventBus.ts";
import * as B from "@babylonjs/core";

export class AudioOutput3D extends AudioNode3D {
    private readonly _pannerNode: PannerNode;
    private readonly scene: Scene = SceneManager.getInstance().getScene();

    private portMesh: Nullable<Mesh> = null;
    private hitBox: Nullable<Mesh> = null;

    private ioEventBus: IOEventBus = IOEventBus.getInstance();
    constructor(audioCtx: AudioContext, id: string) {
        super(audioCtx, id);

        // Créer le PannerNode pour la spatialisation
        console.log("is audiocontext set ? ", audioCtx);
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
        SceneManager.getInstance().getScene().registerBeforeRender(this._updateAudioPositionBound);


    }

    // Référence à la fonction liée pour le nettoyage
    private readonly _updateAudioPositionBound: () => void;

    public async instantiate(): Promise<void> {
        await this._createBaseMesh();

        // gizmo
        this._utilityLayer = new UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new RotationGizmo(this._utilityLayer);

        this._initActionManager();

        this._createInput(new Vector3(this.baseMesh.position.x - 0.7, this.baseMesh.position.y, this.baseMesh.position.z));

        const bo = new BoundingBox(this, this.id);
        this.boundingBox = bo.boundingBox;

        // Initialiser la position audio
        this._updateAudioPosition();

        const state: AudioOutputState = {
            id: this.id,
            position: {
                x: this.boundingBox.position.x,
                y: this.boundingBox.position.y,
                z: this.boundingBox.position.z
            },
            rotation: {
                x: this.boundingBox.rotation.x,
                y: this.boundingBox.rotation.y,
                z: this.boundingBox.rotation.z
            }
        };

        NetworkEventBus.getInstance().emit('STORE_AUDIO_OUTPUT', {
            audioOutputId: this.id,
            state: state
        });
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

            const cameraForward = vrCamera.getDirection(Vector3.Forward());
            const cameraUp = vrCamera.getDirection(Vector3.Up());

            listener.forwardX.value = cameraForward.x;
            listener.forwardY.value = cameraForward.y;
            listener.forwardZ.value = -cameraForward.z;

            listener.upX.value = cameraUp.x;
            listener.upY.value = cameraUp.y;
            listener.upZ.value = -cameraUp.z;
        }
    }

    public connect(_destination: AudioNode): void {
    }

    public disconnect(_destination: AudioNode): void {
    }

    public getAudioNode(): AudioNode {
        return this._pannerNode;
    }
    public getPortMesh(): Nullable<Mesh> {
        return this.portMesh;
    }
    protected async _createBaseMesh(): Promise<void> {
        this.baseMesh = MeshBuilder.CreateBox('box', {width: 1, height: 1}, this._scene);
        const material = new StandardMaterial('material', this._scene);
        material.diffuseColor = new Color3(1, 0, 0);
        this.baseMesh.material = material;
    }
    public setState(state: AudioOutputState): void {
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

        this._updateAudioPosition();
    }
    public getState(): Promise<AudioNodeState> {
        let parameters: WamParameterDataMap = {}
        let config: IAudioNodeConfig = {
            defaultParameter: {
                type: "",
                color: ""
            }, customParameters: []
        }
        return Promise.resolve({
            id: this.id,
            name: "audioOutput",
            configFile: config,
            position: {x: this.boundingBox.position.x, y: this.boundingBox.position.y, z: this.boundingBox.position.z},
            rotation: {x: this.boundingBox.rotation.x, y: this.boundingBox.rotation.y, z: this.boundingBox.rotation.z},
            inputNodes: [],
            inputNodesMidi: [],
            parameters: parameters
        });
    }


    private _createInput(vec3: Vector3) {
        this.portMesh = MeshBuilder.CreateSphere("input_"+this.id, {diameter: 0.5}, this.scene);
        this.hitBox = MeshBuilder.CreateSphere("hitBoxName_input_"+this.id, {diameter: 1}, this.scene);
        this.hitBox.parent = this.portMesh;
        this.hitBox.visibility = 0;
        this.portMesh.parent = this.baseMesh;
        this.portMesh.position = vec3;
        this.portMesh.material = this.scene.getMaterialByName("audioInMaterial");

        const highlightLayer = new HighlightLayer("hl_audioOuput_"+this.id, this.scene);
        const highlightColor = Color3.Green();

        this.hitBox.actionManager = new ActionManager(this.scene);

        this.hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this.portMesh as Mesh, highlightColor);
        }));
        this.hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this.portMesh as Mesh);
        }));

        this.hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnLeftPickTrigger, (): void => {
            console.log(`pick down - on clique sur  l'entrée pour créer un tube`);
            this.ioEventBus.emit('IO_CONNECT_AUDIO_OUTPUT', {
                pickType : "down",
                audioOutput: this,
            });
        }));
        this.hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickUpTrigger, (): void => {
            console.log(`pick up - on relache le bouton sur une sortie`);
            this.ioEventBus.emit('IO_CONNECT_AUDIO_OUTPUT', {
                pickType : "up",
                audioOutput: this,
            });
        }));
        this.hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickOutTrigger, (): void => {
            console.log(`pick out - on relache sur une sortie ou dans le vide`);
            this.ioEventBus.emit('IO_CONNECT_AUDIO_OUTPUT', {
                pickType : "out",
                audioOutput: this,
            });
        }));
    }
}