import {XRManager} from "../xr/XRManager.ts";
import {ActionManager, Color3, CreateBox, ExecuteCodeAction, Mesh, Nullable, StandardMaterial, TmpVectors, Vector3} from "@babylonjs/core";
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
    private transport!: WamTransportManager;

    constructor() {
        this.transport = WamTransportManager.getInstance(this.audioCtx);
        this.init();
        console.log("[HandMenu] - Initialized");
    }

    private init() {
        let leftController = this.xrManager.xrInputManager.leftController;
        if (!leftController) {
            console.error("Left controller not found");
            return;
        }

        this.baseCube = CreateBox("hand-menu-base-cube", {    width: 0.05,
    height: 0.005,
    depth: 0.1}, this.scene);
        this.baseCube.isVisible = true;
        this.baseCube.parent = leftController.grip || leftController.pointer;
        this.baseCube.position.y += 0.02;
        this.baseCube.position.z -= 0.05;

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

            const pos = this.baseCube!.getAbsolutePosition().add(new Vector3(0, -0.5, 0));
            // pos.z -= 1;
            gazeMenu.menuNode.position = pos;
            gazeMenu.menuNode.isVisible = true;
        };

        this.gazeBehavior.onGazeStop = () => {
            if(gazeMenu){
                gazeMenu.menuNode.isVisible = false;
            }
        };

        this.baseCube!.addBehavior(this.gazeBehavior);

        this.btnStartStopMenu();

    }

    private btnStartStopMenu() {
        console.log("Start/Stop button pressed");
        // create small btn mesh for the this.handmenu as parent of the menu
        const btn = CreateBox("hand-menu-btn", {    
            width: 0.02,
            height: 0.006,
            depth: 0.01
        }, 
            this.scene);
        if (!this.baseCube) return;
        btn.parent = this.baseCube;
        // add red color to btn
        const mat = new StandardMaterial("hand-menu-btn-mat", this.scene);
        mat.diffuseColor.set(1, 0, 0);
        btn.material = mat;
        
        // add action to button to toggle a behavior on the this.handmenu
        btn.actionManager = new ActionManager(this.scene);
          if (!btn.actionManager)
              btn.actionManager = new ActionManager(this.scene);
        
          btn.actionManager.registerAction(
              new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
                this.transport.toggle();
                const mat = btn.material as StandardMaterial;
                mat.diffuseColor = this.transport.getPlaying() ? Color3.Green() : Color3.Red();
              })
            );

    }


    public dispose() {
        if (this.baseCube) {
            this.baseCube.dispose();
        }
    }
}