import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import {IOEvent} from "../iomanager/IOEvent.ts";
import {SceneManager} from "../app/SceneManager.ts";
import {NetworkManager} from "../network/NetworkManager.ts";
import {AudioEventBus} from "../eventBus/AudioEventBus.ts";
import {UIManager} from "../app/UIManager.ts";
import {AudioNodeState, INetworkObject} from "../network/types.ts";
import {TubeParams, TubeParamsMidi} from "../shared/SharedTypes.ts";

export abstract class AudioNode3D implements INetworkObject<AudioNodeState> {
    static menuOnScene: boolean = false;
    public static currentMenuInstance: AudioNode3D | null = null;

    public id!: string;
    protected readonly _scene: B.Scene;
    protected readonly _audioCtx: AudioContext;
    protected readonly _pointerDragBehavior: B.PointerDragBehavior;
    public baseMesh!: B.Mesh;
    public boundingBox! : B.AbstractMesh;

    public inputArcs: TubeParams[] = [];
    public outputArcs: TubeParams[] = [];
    public inputArcsMidi: TubeParamsMidi[] = [];
    public outputArcsMidi: TubeParamsMidi[] = [];

    public tubeMesh?: B.Mesh;

    // Gizmo
    protected _rotationGizmo: B.RotationGizmo;
    protected _utilityLayer: B.UtilityLayerRenderer;

    // Menu
    protected _menu!: GUI.NearMenu;
    public _isMenuOpen: boolean = false;

    // IO
    public inputMesh?: B.Mesh;
    public outputMesh?: B.Mesh;
    public outputMeshBig?: B.Mesh;
    public inputMeshBig?: B.Mesh;
    public inputMeshMidi?: B.Mesh;
    public inputMeshBigMidi?: B.Mesh;
    public outputMeshMidi?: B.Mesh;
    public outputMeshBigMidi?: B.Mesh;


    public inputNodes = new Map<string, AudioNode3D>();
    public inputNodesMidi = new Map<string, AudioNode3D>();
    public ioObservable = new B.Observable<IOEvent>();

    protected constructor(audioCtx: AudioContext, id: string) {
        this._scene = SceneManager.getInstance().getScene();
        this._audioCtx = audioCtx;
        this.id = id;
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);
        this._pointerDragBehavior = new B.PointerDragBehavior();

    }

    protected abstract instantiate(): any;

    public abstract getAudioNode(): AudioNode;

    protected _initActionManager(): void {
        // const highlightLayer = new B.HighlightLayer(`hl${this.id}`, this._scene);
        // this.baseMesh.actionManager = new B.ActionManager(this._scene);

        // const xrLeftInputStates: XRInputStates = this._app.xrManager.xrInputManager.leftInputStates;
        // this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
        //     highlightLayer.addMesh(this.baseMesh, B.Color3.Black());

        //     xrLeftInputStates['x-button'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
        //         if (component.pressed) {
        //             if (this._isMenuOpen) this._hideMenu();
        //             else this._showMenu();
        //         }
        //     });
        // }));
        // this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
        //     highlightLayer.removeMesh(this.baseMesh);
        //     xrLeftInputStates['x-button'].onButtonStateChangedObservable.clear();
        // }));

        // // move the wam in the scene
        // this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
        //     this.baseMesh.addBehavior(this._pointerDragBehavior);
        // }));
        // this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
        //     this.baseMesh.removeBehavior(this._pointerDragBehavior);
        // }));
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

    protected _createOptionsMenu(): void {
        this._menu = new GUI.NearMenu(`menu${this.id}`);
        console.log("options menu = bouton delete ?")
        UIManager.getInstance().getGui3DManager().addControl(this._menu);
        this._menu.margin = 0.05;
        this._menu.isPinned = false;
        this._menu.position = this.boundingBox.getAbsolutePosition().clone();//position.clone();
        this._menu.position.y += 1.5;

        const follower: B.FollowBehavior = this._menu.defaultBehavior.followBehavior;
        follower.defaultDistance = 2;
        follower.minimumDistance = 2;
        follower.maximumDistance = 2;

        // Confirmation button for deletion
        const yesButton = new GUI.TouchHolographicButton("yesButton");
        yesButton.text = "Delete";
        yesButton.onPointerUpObservable.add((): void => {
            //this.delete();
        });
        this._menu.addButton(yesButton);

        const noButton = new GUI.TouchHolographicButton("noButton");
        noButton.text = "Cancel";
        noButton.onPointerUpObservable.add((): void => {
            this._hideMenu();
        });
        this._menu.addButton(noButton);

    }

    public static hideAllMenus(): void {
        // Check if any menu is open and close it
        if (AudioNode3D.menuOnScene) {
            // close stored reference to the menu that is currently open and close it her
            AudioNode3D.currentMenuInstance?._hideMenu();
        }
    }

    public _showMenu(): void {
        // First, hide all menus from the scene
        AudioNode3D.hideAllMenus();

        // Now open the clicked menu
        this._isMenuOpen = true;
        AudioNode3D.menuOnScene = true;
        AudioNode3D.currentMenuInstance = this; // Keep reference to the current menu instance

        this._createOptionsMenu();
    }

    public _hideMenu(): void {
        if (!this._isMenuOpen) {
            return; // If no menu is open, do nothing
        }

        this._isMenuOpen = false;
        AudioNode3D.menuOnScene = false;
        this._hideRotationGizmo();
        if (this._menu) this._menu.dispose();
    }

    protected _showRotationGizmo(): void {
        this._rotationGizmo.attachedMesh = this.baseMesh;
    }

    protected _hideRotationGizmo(): void {
        this._rotationGizmo.attachedMesh = null;
        this._rotationGizmo.onDragStartObservable.clear();
        this._rotationGizmo.onDragEndObservable.clear();
    }

    public abstract getState(): Promise<AudioNodeState>;

    public setState(state: AudioNodeState): void {
        this.boundingBox.position = new B.Vector3(state.position.x, state.position.y, state.position.z);
        this.boundingBox.rotation = new B.Vector3(state.rotation.x, state.rotation.y, state.rotation.z);
        // this.baseMesh.position = new B.Vector3(this.boundingBox.position.x, this.boundingBox.position.y, this.boundingBox.position.z);
        // this.baseMesh.rotation = new B.Vector3(this.boundingBox.rotation.x, this.boundingBox.rotation.y, this.boundingBox.rotation.z);
        for (const id of state.inputNodes) {
            const inputNode: AudioNode3D | undefined = NetworkManager.getInstance().getAudioNode3D(id);
            if (!this.inputNodes.has(id) && inputNode) {
                //this._app.ioManager.connectNodes(this, inputNode);
                AudioEventBus.getInstance().emit('CONNECT_NODES', {
                    sourceId: this.id,
                    targetId: id,
                    isSrcMidi: false,
                    source: 'user'
                })
            }

        }
        for (const id of state.inputNodesMidi) {
            const inputNodeMidi: AudioNode3D | undefined = NetworkManager.getInstance().getAudioNode3D(id);
            if (!this.inputNodesMidi.has(id) && inputNodeMidi) {
                //this._app.ioManager.connectNodesMidi(this, inputNodeMidi);
                AudioEventBus.getInstance().emit('CONNECT_NODES', {
                    sourceId: this.id,
                    targetId: id,
                    isSrcMidi: true,
                    source: 'user'
                })
            }
        }

    }
    public updatePosition(position: B.Vector3, rotation: B.Vector3): void {
        this.boundingBox.position = position;
        this.boundingBox.rotation = rotation;
    }

}