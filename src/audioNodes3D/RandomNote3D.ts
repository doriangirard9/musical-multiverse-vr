import {Wam3D} from "./Wam3D.ts";
import * as B from "@babylonjs/core";
import {CustomParameter, IWamConfig} from "./types.ts";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {BoundingBox} from "./BoundingBox.ts";
import {Scene} from "@babylonjs/core";

export class RandomNote3D extends Wam3D {
    constructor(scene: Scene, audioCtx: AudioContext, id: string, config: IWamConfig, s: string) {;
        super(scene, audioCtx, id, config, s);
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
        this._createOutputMidi(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));

        const bo  = new BoundingBox(this,this._scene,this.id,this._app)
        this.boundingBox = bo.boundingBox;

    }


    public connect(destination: AudioNode): void {
        // @ts-ignore
            this._wamInstance.audioNode.connectEvents(destination.instanceId);
    }

    public disconnect(destination: AudioNode): void {
        // @ts-ignore
        // this._wamInstance.audioNode.disconnectEvents(destination);
        this._wamInstance.audioNode.disconnect(destination);
    }

    protected _createOutputMidi(position: B.Vector3): void {
        this.outputMeshMidi = B.MeshBuilder.CreateSphere('outputSphere', { diameter: 0.5 }, this._scene);
        this.outputMeshBigMidi = B.MeshBuilder.CreateSphere('outputSphereBig', { diameter: 1 }, this._scene);
        this.outputMeshBigMidi.parent = this.outputMeshMidi;
        this.outputMeshBigMidi.visibility = 0;
        this.outputMeshMidi.parent = this.baseMesh;
        this.outputMeshMidi.position = position;

        // color
        const outputSphereMaterial = new B.StandardMaterial('material', this._scene);
        outputSphereMaterial.diffuseColor = new B.Color3(1, 0, 1);
        this.outputMeshMidi.material = outputSphereMaterial;

        // action manager
        this.outputMeshMidi.actionManager = new B.ActionManager(this._scene);
        this.outputMeshBigMidi.actionManager = new B.ActionManager(this._scene);

        // add hightlighting on the nodes when they are survolled by the mouse

        const highlightLayer = new B.HighlightLayer(`hl-output-${this.id}`, this._scene);

        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this.outputMeshMidi as B.Mesh, B.Color3.Blue());
        }));

        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this.outputMeshMidi as B.Mesh);
        }));


        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'outputMidi', pickType: 'down', node: this});
        }));
        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'outputMidi', pickType: 'up', node: this});
        }));
        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'outputMidi', pickType: 'out', node: this});
        }));
    }


}