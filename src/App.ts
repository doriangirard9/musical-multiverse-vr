import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { Inspector } from '@babylonjs/inspector';
// // Enable GLTF/GLB loader for loading controller models from WebXR Input registry
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Materials/Node/Blocks';
import {Menu} from "./Menu.ts";
import menuJson from "./menuConfig.json";
import {MenuConfig} from "./types.ts";
import {IOManager} from "./IOManager.ts";
import {XRManager} from "./xr/XRManager.ts";
import {XRInputStates} from "./xr/types.ts";
import {NetworkManager} from "./network/NetworkManager.ts";
import {AdvancedDynamicTexture} from "@babylonjs/gui";
import {AudioNode3DBuilder} from "./audioNodes3D/AudioNode3DBuilder.ts";
import {AudioNode3D} from "./audioNodes3D/AudioNode3D.ts";
import {AudioNodeState, PlayerState} from "./network/types.ts";
import { v4 as uuid } from 'uuid';
import {Player} from "./Player.ts";

export class App {
    public canvas: HTMLCanvasElement;
    public engine: B.Engine;
    public scene: B.Scene;
    public guiManager: GUI.GUI3DManager;
    public xrManager: XRManager = XRManager.getInstance();
    public networkManager: NetworkManager;
    public shadowGenerator!: B.ShadowGenerator;
    public gui: AdvancedDynamicTexture;
    private readonly _audioCtx: AudioContext;
    private _audioNode3DBuilder: AudioNode3DBuilder;
    private static _instance: App;
    public readonly ioManager!: IOManager;
    public id: string = uuid();
    public menu!: Menu;
    private constructor(audioCtx: AudioContext) {
        this.canvas = document.querySelector('#renderCanvas') as HTMLCanvasElement;
        this.engine = new B.Engine(this.canvas, true);
        this.scene = new B.Scene(this.engine);
        this.gui = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

        this._audioCtx = audioCtx;

        this._audioNode3DBuilder = new AudioNode3DBuilder(this.scene, this._audioCtx);

        this.guiManager = new GUI.GUI3DManager(this.scene);
        this.guiManager.controlScaling = 0.5;

        this.ioManager = new IOManager(this.scene);

        this.networkManager = new NetworkManager(this.id);

        
    }

    public static getInstance(audioCtx?: AudioContext): App {
        if (!this._instance) {
            this._instance = new App(audioCtx!);
        }
        return this._instance;
    }

    public async startScene(): Promise<void> {
        await this.xrManager.init(this.scene);

        this.engine.runRenderLoop((): void => {
            this._sendPlayerState();
            this.scene.render();
        });

        window.addEventListener('resize', (): void => {
            this.engine.resize();
        });

        const hemisphericLight = new B.HemisphericLight("hemisphericLight", new B.Vector3(0, 1, 0), this.scene);
        hemisphericLight.intensity = 0.5;

        const light = new B.DirectionalLight("dir01", new B.Vector3(0, -1, 0), this.scene);
        light.position = new B.Vector3(0, 60, 0);
        light.intensity = 0.2;

        this.shadowGenerator = new B.ShadowGenerator(1024, light);

        const ground: B.Mesh = B.MeshBuilder.CreateGround('ground', {width: 30, height: 30}, this.scene);
        ground.receiveShadows = true;

        this.menu = new Menu(menuJson as MenuConfig);
        this.menu.show();

        // display menu on right controller A button press
        const xrRightInputStates: XRInputStates = this.xrManager.xrInputManager.rightInputStates;
        if (xrRightInputStates) {
            xrRightInputStates['a-button'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
                if (component.pressed) {
                    if (!this.menu.isMenuOpen) this.menu.show();
                    else this.menu.hide();
                }
            });
        }

        // display inspector on U key press
        window.addEventListener('keydown', (event: KeyboardEvent): void => {
            if (event.code === 'KeyU') {
                if (Inspector.IsVisible) Inspector.Hide();
                else Inspector.Show(this.scene, {overlay: true, handleResize: true});
            }
        });

        this.networkManager.connect('musical-multiverse');
        this.networkManager.onAudioNodeChangeObservable.add(this._onRemoteAudioNodeChange.bind(this));
        this.networkManager.onPlayerChangeObservable.add(this._onRemotePlayerChange.bind(this));
    }

    public async createAudioNode3D(name: string, id: string, configFile?: string): Promise<void> {
        const audioNode3D: AudioNode3D = await this._audioNode3DBuilder.create(name, id, configFile);
        await audioNode3D.instantiate();
        audioNode3D.ioObservable.add(this.ioManager.onIOEvent.bind(this.ioManager));
        this.networkManager.createNetworkAudioNode3D(audioNode3D);
    }

    private async _onRemoteAudioNodeChange(change: {action: 'add' | 'delete', state: AudioNodeState}): Promise<void> {
        if (change.action === 'add') {
            const audioNode3D: AudioNode3D = await this._audioNode3DBuilder.create(change.state.name, change.state.id, change.state.configFile);
            await audioNode3D.instantiate();
            audioNode3D.ioObservable.add(this.ioManager.onIOEvent.bind(this.ioManager));
            this.networkManager.addRemoteAudioNode3D(audioNode3D);
            audioNode3D.setState(change.state);
        }
        else {

        }
    }

    private _onRemotePlayerChange(change: {action: 'add' | 'delete', state: PlayerState}): void {
        if (change.action === 'add') {
            const player = new Player(this.scene, change.state.id);
            this.networkManager.addRemotePlayer(player);
            player.setState(change.state);
        }
        else {
            // delete player
        }
    }

    public _sendPlayerState(): PlayerState {
        const xrCameraPosition: B.Vector3 = this.xrManager.xrHelper.baseExperience.camera.position;
        const xrCameraDirection: B.Vector3 = this.xrManager.xrHelper.baseExperience.camera.getDirection(B.Axis.Z);
        const xrLeftControllerPosition: B.Vector3 = this.xrManager.xrInputManager.leftController.grip!.position;
        const xrRightControllerPosition: B.Vector3 = this.xrManager.xrInputManager.rightController.grip!.position;

        const playerState: PlayerState = {
            id: this.id,
            position: {x: xrCameraPosition.x, y: xrCameraPosition.y, z: xrCameraPosition.z},
            direction: {x: xrCameraDirection.x, y: xrCameraDirection.y, z: xrCameraDirection.z},
            leftHandPosition: {x: xrLeftControllerPosition.x + 0.05, y: xrLeftControllerPosition.y, z: xrLeftControllerPosition.z - 0.2},
            rightHandPosition: {x: xrRightControllerPosition.x - 0.05, y: xrRightControllerPosition.y, z: xrRightControllerPosition.z - 0.2},
        }

        this.networkManager.updatePlayerState(playerState);
        return playerState;
    }
}