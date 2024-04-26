import * as B from "@babylonjs/core";
import {IOEvent} from "../types.ts";
import * as GUI from "@babylonjs/gui";
import {App} from "../App.ts";
import {XRInputStates} from "../xr/types.ts";
import {AudioNodeState, INetworkObject} from "../network/types.ts";

export abstract class AudioNode3D implements INetworkObject<AudioNodeState> {
    public id!: string;
    protected readonly _scene: B.Scene;
    protected readonly _audioCtx: AudioContext;
    protected readonly _app: App = App.getInstance();
    public baseMesh!: B.Mesh;

    // Gizmo
    protected _rotationGizmo: B.RotationGizmo;
    protected _utilityLayer: B.UtilityLayerRenderer;

    // Menu
    protected _menu!: GUI.NearMenu;
    protected _isMenuOpen: boolean = false;

    // IO
    public inputMesh?: B.Mesh;
    public outputMesh?: B.Mesh;
    public inputNodes = new Map<string, AudioNode3D>();
    public ioObservable = new B.Observable<IOEvent>();

    protected constructor(scene: B.Scene, audioCtx: AudioContext, id: string) {
        this._scene = scene;
        this._audioCtx = audioCtx;
        this.id = id;
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);
    }

    public abstract instantiate(): any;

    public abstract connect(destination: AudioNode): void;

    public abstract getAudioNode(): AudioNode;

    public addInputNode(audioNode3D: AudioNode3D): void {
        this.inputNodes.set(audioNode3D.id, audioNode3D);
    }

    public delete(): void {
        this._hideMenu();
        this._hideRotationGizmo();
        this.baseMesh.dispose();
        this.inputMesh?.dispose();
        this.outputMesh?.dispose();
    }

    protected abstract _createBaseMesh(): void;

    protected _initActionManager(): void {
        const highlightLayer = new B.HighlightLayer(`hl${this.id}`, this._scene);

        const pointerDragBehavior = new B.PointerDragBehavior();
        this.baseMesh.actionManager = new B.ActionManager(this._scene);

        const xrLeftInputStates: XRInputStates = this._app.xrManager.xrInputManager.leftInputStates;
        this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this.baseMesh, B.Color3.Black());

            xrLeftInputStates['x-button'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
                if (component.pressed) {
                    if (this._isMenuOpen) this._hideMenu();
                    else this._showMenu();
                }
            });
        }));
        this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this.baseMesh);
            xrLeftInputStates['x-button'].onButtonStateChangedObservable.clear();
        }));

        // move the wam in the scene
        this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.baseMesh.addBehavior(pointerDragBehavior);
        }));
        this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.baseMesh.removeBehavior(pointerDragBehavior);
        }));
    }

    protected _createParameterStand(position: B.Vector3, name: string): B.Mesh {
        const parameterStand: B.Mesh = B.MeshBuilder.CreatePlane(`parameterStand${this.id}`, { size: 0.8 }, this._scene);
        parameterStand.rotate(B.Axis.X, Math.PI / 2, B.Space.WORLD);
        parameterStand.parent = this.baseMesh;
        parameterStand.position = position;

        parameterStand.material = new B.StandardMaterial('material', this._scene);
        parameterStand.material.zOffset = -1;

        const nameTextPlane: B.Mesh = B.MeshBuilder.CreatePlane(`textPlane${this.id}`, { size: 1 }, this._scene);
        nameTextPlane.parent = parameterStand;
        nameTextPlane.position.z = -0.01;
        const advancedTexture: GUI.AdvancedDynamicTexture = GUI.AdvancedDynamicTexture.CreateForMesh(nameTextPlane);
        const textBlock = new GUI.TextBlock();
        textBlock.text = name;
        textBlock.fontSize = 90;
        textBlock.top = 350;
        advancedTexture.addControl(textBlock);

        return parameterStand;
    }

    protected _createInput(position: B.Vector3): void {
        this.inputMesh = B.MeshBuilder.CreateSphere('inputSphere', { diameter: 0.5 }, this._scene);
        this.inputMesh.parent = this.baseMesh;
        this.inputMesh.position = position;

        // color
        const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
        inputSphereMaterial.diffuseColor = new B.Color3(0, 1, 0);
        this.inputMesh.material = inputSphereMaterial;

        // action manager
        this.inputMesh.actionManager = new B.ActionManager(this._scene);
        this.inputMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'input', pickType: 'down', node: this});
        }));
        this.inputMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'input', pickType: 'up', node: this});
        }));
        this.inputMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'input', pickType: 'out', node: this});
        }));
    }

    protected _createOutput(position: B.Vector3): void {
        this.outputMesh = B.MeshBuilder.CreateSphere('outputSphere', { diameter: 0.5 }, this._scene);
        this.outputMesh.parent = this.baseMesh;
        this.outputMesh.position = position;

        // color
        const outputSphereMaterial = new B.StandardMaterial('material', this._scene);
        outputSphereMaterial.diffuseColor = new B.Color3(1, 0, 0);
        this.outputMesh.material = outputSphereMaterial;

        // action manager
        this.outputMesh.actionManager = new B.ActionManager(this._scene);
        this.outputMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'output', pickType: 'down', node: this});
        }));
        this.outputMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'output', pickType: 'up', node: this});
        }));
        this.outputMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this.ioObservable.notifyObservers({type: 'output', pickType: 'out', node: this});
        }));
    }

    protected _createOptionsMenu(): void {
        this._menu = new GUI.NearMenu(`menu${this.id}`);
        this._app.guiManager.addControl(this._menu);
        this._menu.margin = 0.05;
        this._menu.isPinned = true;
        this._menu.position = this.baseMesh.position;
        this._menu.position.y += 1.5;

        const follower: B.FollowBehavior = this._menu.defaultBehavior.followBehavior;
        follower.defaultDistance = 2;
        follower.minimumDistance = 2;
        follower.maximumDistance = 2;

        const deleteButton = new GUI.TouchHolographicButton("deleteButton");
        deleteButton.text = "Delete";
        deleteButton.onPointerUpObservable.add(this.delete.bind(this));
        this._menu.addButton(deleteButton);

        const rotateButton = new GUI.TouchHolographicButton("rotateButton");
        rotateButton.text = "Rotate";
        rotateButton.isToggleButton = true;
        rotateButton.onPointerUpObservable.add((): void => {
            if (rotateButton.isToggled) this._showRotationGizmo();
            else this._hideRotationGizmo();
        });
        this._menu.addButton(rotateButton);
    }

    protected _showMenu(): void {
        this._isMenuOpen = true;
        this._createOptionsMenu();
    }

    protected _hideMenu(): void {
        this._isMenuOpen = false;
        this._hideRotationGizmo();
        if (this._menu) this._menu.dispose();
    }

    protected _showRotationGizmo(): void {
        this._rotationGizmo.attachedMesh = this.baseMesh;
    }

    protected _hideRotationGizmo(): void {
        this._rotationGizmo.attachedMesh = null;
    }

    public abstract getState(): AudioNodeState;

    public setState(state: AudioNodeState): void {
        this.baseMesh.position = new B.Vector3(state.position.x, state.position.y, state.position.z);
        this.baseMesh.rotation = new B.Vector3(state.rotation.x, state.rotation.y, state.rotation.z);

        state.inputNodes.forEach((id: string): void => {
            const inputNode: AudioNode3D | undefined = this._app.networkManager.getAudioNode3D(id);
            if (!this.inputNodes.has(id) && inputNode) {
                this._app.ioManager.connectNodes(this, inputNode);
            }
        });
    }
}