import {XRManager} from "../xr/XRManager.ts";
import {CreateBox, Mesh, Nullable, TmpVectors, Vector3} from "@babylonjs/core";
import {SceneManager} from "../app/SceneManager.ts";
import {MenuConfig, SimpleMenu} from "./SimpleMenu.ts";
import {GazeBehavior} from "../behaviours/GazeBehavior.ts";
import {UIManager} from "../app/UIManager.ts";
import {WamTransportManager} from "../node3d/subs/PianoRoll/WamTransportManager.ts";
import {Node3dManager} from "../app/Node3dManager.ts";

export class HandMenu {
    private xrManager = XRManager.getInstance();
    private baseCube?: Mesh;
    private scene = SceneManager.getInstance().getScene();
    private audioCtx = Node3dManager.getInstance().getAudioContext();
    private gazeBehavior = new GazeBehavior();

    constructor() {
        this.init();
        console.log("[HandMenu] - Initialized");
    }

    private init() {
        let leftController = this.xrManager.xrInputManager.leftController;
        if (!leftController) {
            console.error("Left controller not found");
            return;
        }

        this.baseCube = CreateBox("hand-menu-base-cube", {size:0.15}, this.scene);
        this.baseCube.isVisible = true;
        this.baseCube.parent = leftController.grip || leftController.pointer;

        let gazeMenu: Nullable<SimpleMenu> = null

        this.gazeBehavior.activationDelay = 500;

        this.gazeBehavior.onCustomCheck = () => {
            const controllerNode = leftController.pointer;
            const camera = this.scene.activeCamera;

            if (!controllerNode || !camera) {
                return false;
            }

            const controllerUpLocal = TmpVectors.Vector3[0];
            controllerUpLocal.set(0, 0, -1);

            const controllerMatrix = controllerNode.getWorldMatrix();
            const controllerUpWorld = TmpVectors.Vector3[1];
            Vector3.TransformNormalToRef(controllerUpLocal, controllerMatrix, controllerUpWorld);

            const toCameraDirection = TmpVectors.Vector3[2];
            camera.globalPosition.subtractToRef(controllerNode.getAbsolutePosition(), toCameraDirection);
            toCameraDirection.normalize();

            const dotProduct = Vector3.Dot(controllerUpWorld, toCameraDirection);

            const alignmentThreshold = 0.3;

            return dotProduct > alignmentThreshold;
        };

        this.gazeBehavior.onGazeActivated = () => {
            if (!gazeMenu) {
                gazeMenu = new SimpleMenu("gaze-menu", UIManager.getInstance().getGui3DManager());
                gazeMenu.menuNode.margin = 0.1;
                gazeMenu.menuNode.backPlateMargin = 0.5;
                console.log(gazeMenu.menuNode.mesh)
                const wamTransportManager = WamTransportManager.getInstance(this.audioCtx!);
                const config: MenuConfig = {
                    label: "HandMenu",
                    buttons: [
                        {
                            label: "Start",
                            action: () => {
                                wamTransportManager.start();
                            }
                        },
                        {
                            label: "Stop",
                            action: () => {
                                if(gazeMenu){
                                    wamTransportManager.stop();
                                }
                            }
                        }
                    ]
                };
                gazeMenu.setConfig(config);
            }

            const pos = this.baseCube!.getAbsolutePosition().add(new Vector3(0, 0.5, 0));
            gazeMenu.menuNode.position = pos;
            gazeMenu.menuNode.isVisible = true;
        };

        this.gazeBehavior.onGazeStop = () => {
            if(gazeMenu){
                gazeMenu.menuNode.isVisible = false;
            }
        };

        this.baseCube!.addBehavior(this.gazeBehavior);

    }

    public dispose() {
        if (this.baseCube) {
            this.baseCube.dispose();
        }
    }
}