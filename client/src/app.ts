import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import Player from "./player";
// // Enable GLTF/GLB loader for loading controller models from WebXR Input registry
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Materials/Node/Blocks';
import {NetworkPlayer, NetworkStepSequencer} from "./models";
import StepSequencer from "./stepSequencer";
import Network from "./network";

export default class App {
    private canvas: HTMLCanvasElement;
    private engine: B.Engine;
    private scene: B.Scene;
    private gui: B.AbstractMesh;

    // XR
    private xrHelper: B.WebXRDefaultExperience;
    private featuresManager: B.WebXRFeaturesManager;
    private leftController: B.AbstractMesh;
    private rightController: B.AbstractMesh;

    // Objects
    private stepSequencers: StepSequencer[] = [];
    private players: Player[] = [];

    // Network
    private network: Network = new Network(this);

    private id: string = Math.random().toString(36).substring(7);

    async startScene(): Promise<void> {
        this.canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
        this.engine = new B.Engine(this.canvas, true);
        this.scene = new B.Scene(this.engine);

        const light: B.HemisphericLight = new B.HemisphericLight('light', new B.Vector3(0, 1, 0), this.scene);

        B.SceneLoader.Append("./assets/low_poly_living_room/", "scene.gltf", this.scene, function (scene) {
            // Code à exécuter après le chargement du modèle
            console.log("scene loaded");
            // Accéder à l'objet du modèle
            const modele = scene.meshes[0];

            // Ajuster la taille du modèle
            modele.scaling = new B.Vector3(0.018, 0.018, 0.018);
            modele.position = new B.Vector3(0, 0, 0);
        });

        // // create ground
        // const ground: B.GroundMesh = B.MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, this.scene);
        // const groundMaterial: B.StandardMaterial = new B.StandardMaterial('groundMaterial', this.scene);
        // groundMaterial.diffuseColor = B.Color3.Gray();
        // ground.material = groundMaterial;

        this.initXR().then((): void => {
            this.engine.runRenderLoop((): void => {
                this.update();
            });
        });
    }

    async initXR(): Promise<void> {
        const isSupported = await B.WebXRSessionManager.IsSessionSupportedAsync('immersive-ar');
        if (!isSupported) {
            alert('WebXR is not supported on this browser');
            return;
        }

        this.xrHelper = await this.scene.createDefaultXRExperienceAsync();
        this.featuresManager = this.xrHelper.baseExperience.featuresManager;

        this.featuresManager.disableFeature(B.WebXRFeatureName.TELEPORTATION);
        this.featuresManager.enableFeature(B.WebXRFeatureName.MOVEMENT, "latest", {
            xrInput: this.xrHelper.input,
            movementSpeed: 0.2,
            rotationSpeed: 0.3,
        });

        this.xrHelper.input.onControllerAddedObservable.add((controller : B.WebXRInputSource) => {
            controller.onMotionControllerInitObservable.add((motionController: B.WebXRAbstractMotionController) => {
                if (motionController.handedness === 'left') {
                    this.leftController = controller.grip;
                } else if (motionController.handedness === 'right') {
                    this.rightController = controller.grip;
                    const xr_ids = motionController.getComponentIds();
                    let abuttonComponent = motionController.getComponent(xr_ids[3]);//a-button
                    abuttonComponent.onButtonStateChangedObservable.add(() => {
                        if (abuttonComponent.pressed) {
                            if (this.gui) {
                                this.deleteGUI();
                            }
                            else {
                                // the position is in front of the camera
                                const position: B.Vector3 = this.xrHelper.baseExperience.camera.getFrontPosition(0.5);
                                const target: B.Vector3 = this.xrHelper.baseExperience.camera.position;
                                this.displayGUI(position, target);
                            }
                        }
                    });
                }
            });
        });
    }

    update(): void {
        // update network
        const xrCameraPosition = this.xrHelper.baseExperience.camera.position;
        const xrCameraDirection = this.xrHelper.baseExperience.camera.getDirection(B.Axis.Z);
        if (this.leftController && this.rightController) {
            this.network.updatePlayer({
                id: this.id,
                position: {
                    x: xrCameraPosition.x,
                    y: xrCameraPosition.y,
                    z: xrCameraPosition.z
                },
                direction: {
                    x: xrCameraDirection.x,
                    y: xrCameraDirection.y,
                    z: xrCameraDirection.z
                },
                leftHandPosition: {
                    x: this.leftController.position.x + 0.05,
                    y: this.leftController.position.y,
                    z: this.leftController.position.z - 0.2
                },
                rightHandPosition: {
                    x: this.rightController.position.x - 0.05,
                    y: this.rightController.position.y,
                    z: this.rightController.position.z - 0.2
                }
            });
        }

        this.scene.render();
    }

    displayGUI(position: B.Vector3, target: B.Vector3): void {
        this.gui = B.MeshBuilder.CreatePlane('gui', { width: 1, height: 1 }, this.scene);
        this.gui.position = position;
        this.gui.lookAt(target);
        this.gui.rotate(B.Axis.Y, Math.PI, B.Space.LOCAL);

        const advancedDynamicTexture: GUI.AdvancedDynamicTexture = GUI.AdvancedDynamicTexture.CreateForMesh(this.gui, 1024, 1024, false);

        const button: GUI.Button = GUI.Button.CreateSimpleButton('button', 'Create sequencer');
        button.width = '150px';
        button.height = '40px';
        button.color = 'white';
        button.cornerRadius = 20;
        button.background = 'green';
        button.onPointerUpObservable.add(() => {
            const stepSequencerID: string = Math.random().toString(36).substring(7);
            // add new audio object to network
            this.network.updateStepSequencer({
                id: stepSequencerID,
                position: {
                    x: 0,
                    y: 1.5,
                    z: 0
                },
                isPlaying: false,
                grid: [
                    [false, false, false, false, false, false, false, false],
                    [false, false, false, false, false, false, false, false],
                    [false, false, false, false, false, false, false, false],
                    [false, false, false, false, false, false, false, false],
                    [false, false, false, false, false, false, false, false],
                    [false, false, false, false, false, false, false, false],
                    [false, false, false, false, false, false, false, false],
                    [false, false, false, false, false, false, false, false]
                ],
                bpm: 120
            } as NetworkStepSequencer);
        });
        advancedDynamicTexture.addControl(button);
    }

    deleteGUI(): void {
        if (this.gui) {
            this.gui.dispose();
            this.gui = null;
        }
    }

    addRemotePlayer(playerData: NetworkPlayer): void {
        if (playerData.id === this.id) return;
        // create new player
        const player = new Player(playerData.id, this.scene);
        player.update(playerData);
        this.players.push(player);
    }

    updateRemotePlayer(playerData: NetworkPlayer): void {
        const player = this.players.find((player) => player.id === playerData.id);
        if (player) {
            player.update(playerData);
        }
    }

    addRemoteStepSequencer(stepSequencerData: NetworkStepSequencer): void {
        // create new audio object
        const stepSequencer: StepSequencer = new StepSequencer(this.scene, stepSequencerData.id, this.network);
        stepSequencer.update(stepSequencerData);
        this.stepSequencers.push(stepSequencer);
    }

    updateRemoteStepSequencer(stepSequencerData: NetworkStepSequencer): void {
        const stepSequencer = this.stepSequencers.find((stepSequencer) => stepSequencer.id === stepSequencerData.id);
        if (stepSequencer) {
            stepSequencer.update(stepSequencerData);
        }
    }
}