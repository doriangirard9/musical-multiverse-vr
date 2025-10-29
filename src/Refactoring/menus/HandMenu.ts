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
        
        // Create label that will be updated
        const label = this.createLabelForMesh(btn, "Paused", {
            textColor: "#fff",
            width: 0.015,  // Make label smaller to fit button
            height: 0.005,
            padding: 0.001
        });
        
        // add action to button to toggle a behavior on the this.handmenu
        btn.actionManager = new ActionManager(this.scene);
          if (!btn.actionManager)
              btn.actionManager = new ActionManager(this.scene);
        
          btn.actionManager.registerAction(
              new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
                this.transport.toggle();
                const mat = btn.material as StandardMaterial;
                mat.diffuseColor = this.transport.getPlaying() ? Color3.Green() : Color3.Red();
                
                // Update label text based on transport state
                this.updateLabelText(label, this.transport.getPlaying() ? "Playing" : "Paused");
              })
            );
    }

    /**
     * Create a text label and attach it to a single mesh.
     * - Uses DynamicTexture (same approach as keyboard labels).
     * - By default, positions slightly above the mesh center on Y.
     */
    public createLabelForMesh(
        target: B.Mesh,
        text: string,
        options?: {
            textColor?: string;
            background?: string;
            // If not provided, the plane will auto-fit the mesh top face (X/Z)
            width?: number;    // plane width in target local space (maps to X when rotated flat)
            height?: number;   // plane height in target local space (maps to Z when rotated flat)
            font?: string;     // base font family/weight, size will be auto-fit
            offset?: B.Vector3;
            textureSize?: { width: number; height: number };
            rotateFlatLikeKeyboard?: boolean; // default true
            padding?: number;  // padding on plane in local units (applied on X/Z)
            textPaddingPx?: number; // padding inside the texture in pixels
        }
    ): B.Mesh {
        const scene = this.scene;
    
        // Local half-extents of target (X, Y, Z) in target space
        const bi = target.getBoundingInfo();
        const ext = bi?.boundingBox.extendSize ?? new B.Vector3(0.5, 0.5, 0.5);
    
        // Plane should cover the top face: width -> X, height -> Z (since we rotate it flat)
        const padding = options?.padding ?? 0.02;
        const planeWidth  = options?.width  ?? Math.max(0.05, ext.x * 2 - padding * 2);
        const planeHeight = options?.height ?? Math.max(0.05, ext.z * 2 - padding * 2);
    
        const dtSize = options?.textureSize ?? { width: 1024, height: 512 }; // higher res to keep text crisp
        const dt = new B.DynamicTexture(`meshLabelDT_${target.name}_${Date.now()}`, dtSize, scene, true);
        dt.hasAlpha = true;
    
        const mat = new B.StandardMaterial(`meshLabelMat_${target.name}_${Date.now()}`, scene);
        mat.disableLighting = true;
        mat.emissiveTexture = dt;
        mat.opacityTexture  = dt;
    
        const plane = B.MeshBuilder.CreatePlane(
            `meshLabel_${target.name}_${Date.now()}`,
            { width: planeWidth, height: planeHeight },
            scene
        );
        plane.material   = mat;
        plane.isPickable = false;
    
        // Attach to mesh and place just above the top surface
        plane.parent = target;
        const defaultOffset = new B.Vector3(0, ext.y + 0.001, 0); // tiny lift to avoid z-fighting
        plane.position.copyFrom(options?.offset ?? defaultOffset);
    
        // Match keyboard behavior: fixed to mesh, lying flat
        plane.billboardMode = B.AbstractMesh.BILLBOARDMODE_NONE;
        if (options?.rotateFlatLikeKeyboard !== false) {
            plane.rotation.x = Math.PI / 2;
        }
    
        // Draw text and auto-fit inside the texture with padding
        const ctx = dt.getContext();
        const W = dt.getSize().width;
        const H = dt.getSize().height;
        const textPadding = options?.textPaddingPx ?? Math.floor(Math.min(W, H) * 0.08);
        const availW = W - textPadding * 2;
        const availH = H - textPadding * 2;
    
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = options?.background ?? "rgba(255,255,255,0)";
        ctx.fillRect(0, 0, W, H);
    
        // Auto-fit font size to available width/height
        const baseFont = options?.font ?? "bold 300px sans-serif";
        const fitFontSize = (maxW: number, maxH: number): number => {
            // quick binary search for font size
            let lo = 10, hi = 400, best = 10;
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                ctx.font = baseFont.replace(/\d+px/, `${mid}px`);
                const m = ctx.measureText(text);
                const textW = m.width;
                // approximate text height via metrics if available; fallback to mid
                const ascent = (m as any).actualBoundingBoxAscent ?? mid;
                const descent = (m as any).actualBoundingBoxDescent ?? mid * 0.25;
                const textH = ascent + descent;
                if (textW <= maxW && textH <= maxH) {
                    best = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            return best;
        };
    
        const fontPx = fitFontSize(availW, availH);
        ctx.font = baseFont.replace(/\d+px/, `${fontPx}px`);
        ctx.fillStyle = options?.textColor ?? "#000";
        const anyCtx = ctx as any;
        anyCtx.textAlign = "center";
        anyCtx.textBaseline = "middle";
        anyCtx.fillText(text, W / 2, H / 2);
    
        dt.update();
    
        return plane;
    }

    /**
     * Update the text of an existing label mesh
     */
    private updateLabelText(labelMesh: B.Mesh, newText: string): void {
        const material = labelMesh.material as B.StandardMaterial;
        if (!material || !material.emissiveTexture) return;
        
        const dt = material.emissiveTexture as B.DynamicTexture;
        const ctx = dt.getContext();
        const W = dt.getSize().width;
        const H = dt.getSize().height;
        
        // Clear and redraw with new text
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255,255,255,0)";
        ctx.fillRect(0, 0, W, H);
        
        // Use the same font sizing logic as createLabelForMesh
        const textPadding = Math.floor(Math.min(W, H) * 0.08);
        const availW = W - textPadding * 2;
        const availH = H - textPadding * 2;
        
        const baseFont = "bold 300px sans-serif";
        const fitFontSize = (maxW: number, maxH: number): number => {
            let lo = 10, hi = 400, best = 10;
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                ctx.font = baseFont.replace(/\d+px/, `${mid}px`);
                const m = ctx.measureText(newText);
                const textW = m.width;
                const ascent = (m as any).actualBoundingBoxAscent ?? mid;
                const descent = (m as any).actualBoundingBoxDescent ?? mid * 0.25;
                const textH = ascent + descent;
                if (textW <= maxW && textH <= maxH) {
                    best = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            return best;
        };
        
        const fontPx = fitFontSize(availW, availH);
        ctx.font = baseFont.replace(/\d+px/, `${fontPx}px`);
        ctx.fillStyle = "#fff";
        const anyCtx = ctx as any;
        anyCtx.textAlign = "center";
        anyCtx.textBaseline = "middle";
        anyCtx.fillText(newText, W / 2, H / 2);
        
        dt.update();
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