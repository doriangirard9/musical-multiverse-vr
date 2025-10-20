import {XRManager} from "../xr/XRManager.ts";
import {ActionManager, Color3, CreateBox, ExecuteCodeAction, Mesh, Nullable, StandardMaterial, TmpVectors, Vector3} from "@babylonjs/core";
import * as B from "@babylonjs/core";
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
    private controllerAddedObs?: B.Observer<B.WebXRInputSource>;
    private controllerRemovedObs?: B.Observer<B.WebXRInputSource>;
    private beforeRenderObs?: B.Observer<B.Scene>;
    private gazeMenu: Nullable<SimpleMenu> = null;

    constructor() {
        this.transport = WamTransportManager.getInstance(this.audioCtx);
        this.init();
        console.log("[HandMenu] - Initialized");
    }

    private init() {
        this.baseCube = CreateBox("hand-menu-base-cube", {    width: 0.05,
    height: 0.005,
    depth: 0.1}, this.scene);
        this.baseCube.isVisible = true;
        this.attachToLeftController();
        this.baseCube.position.y += 0.02;
        this.baseCube.position.z -= 0.05;

        // Use class-level gazeMenu so we can maintain parenting each frame

        this.gazeBehavior.activationDelay = 500;

        this.gazeBehavior.onCustomCheck = () => {
            const leftController = this.xrManager.xrInputManager.leftController;
            const controllerNode = leftController?.pointer;
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
            if (!this.gazeMenu) {
                this.gazeMenu = new SimpleMenu("gaze-menu", UIManager.getInstance().getGui3DManager());
                this.gazeMenu.menuNode.margin = 0.1;
                this.gazeMenu.menuNode.backPlateMargin = 0.5;
                const wamTransportManager = WamTransportManager.getInstance(this.audioCtx!);
                const config: MenuConfig = {
                    label: "HandMenu",
                    buttons: [
                        { label: "Start", action: () => wamTransportManager.start() },
                        { label: "Stop", action: () => wamTransportManager.stop() }
                    ]
                };
                this.gazeMenu.setConfig(config);

                // disable follow and parent to controller
                this.gazeMenu.menuNode.defaultBehavior.followBehavior.detach();
                this.gazeMenu.menuNode.mesh!.parent = this.baseCube!;
                // local offset relative to controller
                this.gazeMenu.menuNode.position.set(0, -0.05, -0.15);
            }

            // ensure visible each activation
            this.gazeMenu.menuNode.isVisible = true;
        };

        this.gazeBehavior.onGazeStop = () => {
            if(this.gazeMenu){
                this.gazeMenu.menuNode.isVisible = false;
            }
        };

        this.baseCube!.addBehavior(this.gazeBehavior);
        // Per-frame enforcement: keep parenting to controller and baseCube
        this.beforeRenderObs = this.scene.onBeforeRenderObservable.add(() => {
            // Ensure baseCube remains parented to current left controller node
            const leftController = this.xrManager.xrInputManager.leftController;
            const desiredParent = leftController ? (leftController.grip || leftController.pointer) : null;
            if (this.baseCube && desiredParent && this.baseCube.parent !== desiredParent) {
                this.baseCube.parent = desiredParent;
            }

            // Ensure menu stays parented to baseCube with correct local offset
            if (this.gazeMenu && this.gazeMenu.menuNode.mesh) {
                const mesh = this.gazeMenu.menuNode.mesh;
                if (mesh.parent !== this.baseCube) {
                    // Re-disable follow if re-enabled internally
                    this.gazeMenu.menuNode.defaultBehavior.followBehavior.detach();
                    mesh.parent = this.baseCube!;
                    this.gazeMenu.menuNode.position.set(0, -0.05, -0.15);
                }
            }
        });

        // Re-attach when controllers are added/removed (e.g., after resume)
        const input = this.xrManager.xrHelper.input;
        this.controllerAddedObs = input.onControllerAddedObservable.add((controller) => {
            if (controller.inputSource.handedness === 'left') {
                this.attachToLeftController();
            }
        });
        this.controllerRemovedObs = input.onControllerRemovedObservable.add((controller) => {
            if (controller.inputSource.handedness === 'left') {
                // Optional: detach if needed; will reattach when added again
                // this.baseCube!.parent = null;
            }
        });

        this.btnStartStopMenu();

    }

    private attachToLeftController(): boolean {
        const leftController = this.xrManager.xrInputManager.leftController;
        if (!leftController) return false;
        // Prefer grip, fallback to pointer
        const parent = leftController.grip || leftController.pointer;
        if (!parent) return false;
        if (this.baseCube) this.baseCube.parent = parent;
        return true;
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
        if (this.beforeRenderObs) {
            this.scene.onBeforeRenderObservable.remove(this.beforeRenderObs);
            this.beforeRenderObs = undefined;
        }
        if (this.controllerAddedObs) {
            this.xrManager.xrHelper.input.onControllerAddedObservable.remove(this.controllerAddedObs);
            this.controllerAddedObs = undefined;
        }
        if (this.controllerRemovedObs) {
            this.xrManager.xrHelper.input.onControllerRemovedObservable.remove(this.controllerRemovedObs);
            this.controllerRemovedObs = undefined;
        }
        if (this.baseCube) {
            this.baseCube.dispose();
        }
    }
}