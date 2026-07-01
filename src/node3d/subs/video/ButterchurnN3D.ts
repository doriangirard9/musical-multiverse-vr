import { Color3 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Node3DConnectable } from "../../Node3DConnectable";
import type { Node3DButton } from "../../Node3DButton";
import { WamInitializer } from "../../../app/WamInitializer";

export class ButterchurnN3DGUI implements Node3DGUI {
    root
    block
    audioInput
    videoOutput
    menuButton
    labelPlane: any
    labelTexture: any

    get worldSize() { return 1.5 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;
        this.root = new B.TransformNode("butterchurn root", scene);

        this.block = B.CreateBox("butterchurn box", { width: 1.8, height: 0.3, depth: 1.5 }, context.scene);
        this.block.parent = this.root;
        this.block.position.y = -0.15;
        
        const boxMat = new B.StandardMaterial("butterchurnMat", scene);
        boxMat.diffuseTexture = new B.Texture("/textures/butterchurn/ButterchurnBody.png", scene);
        boxMat.emissiveTexture = boxMat.diffuseTexture; // Make it pop more
        this.block.material = boxMat;

        this.audioInput = T.ConnectableUtils.createInputMesh("audio input", 0.3, context.scene);
        this.audioInput.parent = this.root;
        this.audioInput.position.set(-0.6, 0, 0.55);
        T.MeshUtils.setColor(this.audioInput, T.AudioN3DConnectable.Color.toColor4());

        this.videoOutput = T.ConnectableUtils.createOutputMesh("video output", 0.3, context.scene);
        this.videoOutput.parent = this.root;
        this.videoOutput.position.set(0.6, 0, 0.55);
        T.MeshUtils.setColor(this.videoOutput, new B.Color4(0.8, 0.2, 0.8, 1));

        this.menuButton = B.CreateSphere("menu button", { diameter: 0.2 }, context.scene);
        this.menuButton.parent = this.root;
        this.menuButton.position.set(0, 0.15, -0.55);
        T.MeshUtils.setColor(this.menuButton, new B.Color4(1, 1, 0, 1));

        // Preset name label — standing upright on the XY plane, above the box
        this.labelPlane = B.CreatePlane("preset label", { width: 2.0, height: 0.6 }, scene);
        this.labelPlane.parent = this.root;
        this.labelPlane.position.set(0, 0.30, 0.75);   // above the box, at z = depth/2
        this.labelPlane.isPickable = false;

        this.labelTexture = new B.DynamicTexture("presetLabelDT", { width: 1024, height: 256 }, scene, true);
        const mat = new B.StandardMaterial("presetLabelMat", scene);
        mat.diffuseTexture = this.labelTexture;
        mat.emissiveTexture = this.labelTexture;
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.useAlphaFromDiffuseTexture = true;
        this.labelPlane.material = mat;

        this._scene = scene;
        this.updateLabel("Butterchurn");

        // Component Name Label on the front edge of the box
        const namePlane = B.CreatePlane("name label", { width: 1.8, height: 0.3 }, scene);
        namePlane.parent = this.block;
        namePlane.position.set(0, 0, -0.751); // slightly in front of the front face
        namePlane.isPickable = false;

        const nameTexture = new B.DynamicTexture("nameDT", { width: 512, height: 128 }, scene, true);
        const nameMat = new B.StandardMaterial("nameMat", scene);
        nameMat.diffuseTexture = nameTexture;
        nameMat.emissiveTexture = nameTexture;
        nameMat.disableLighting = true;
        nameMat.backFaceCulling = false;
        nameMat.useAlphaFromDiffuseTexture = true;
        namePlane.material = nameMat;

        const nctx = nameTexture.getContext() as CanvasRenderingContext2D;
        nctx.clearRect(0, 0, 512, 128);
        nctx.font = "bold 60px Arial";
        nctx.fillStyle = "white";
        nctx.textAlign = "center";
        nctx.textBaseline = "middle";
        nctx.fillText("BUTTERCHURN", 256, 64);
        nameTexture.update();
    }

    private _scene: any;
    private _scrollOffset = 0;
    private _scrollObserver: any = null;
    private _labelText = "";
    private _labelColor = "#FFD700";
    private _textWidth = 0;

    updateLabel(text: string) {
        this._labelText = text;
        this._scrollOffset = 0;

        // Measure text width
        const ctx = this.labelTexture.getContext() as CanvasRenderingContext2D;
        ctx.font = "bold 80px Arial";
        this._textWidth = ctx.measureText(text).width;
        const canvasWidth = this.labelTexture.getSize().width;

        // Remove previous scroll observer
        if (this._scrollObserver) {
            this._scene.onBeforeRenderObservable.remove(this._scrollObserver);
            this._scrollObserver = null;
        }

        if (this._textWidth > canvasWidth - 40) {
            // Text too wide — start scrolling
            let frameCount = 0;
            this._scrollObserver = this._scene.onBeforeRenderObservable.add(() => {
                frameCount++;
                if (frameCount % 3 !== 0) return; // throttle: update every 3 frames
                this._scrollOffset -= 2;
                const totalWidth = this._textWidth + 120; // gap before repeat
                if (this._scrollOffset < -totalWidth) this._scrollOffset = canvasWidth;
                this._drawLabel();
            });
            this._scrollOffset = 20;
        }

        this._drawLabel();
    }

    private _drawLabel() {
        const ctx = this.labelTexture.getContext() as CanvasRenderingContext2D;
        const size = this.labelTexture.getSize();
        ctx.clearRect(0, 0, size.width, size.height);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.roundRect(4, 4, size.width - 8, size.height - 8, 16);
        ctx.fill();
        ctx.font = "bold 80px Arial";
        ctx.fillStyle = this._labelColor;
        ctx.textBaseline = "middle";
        if (this._scrollObserver) {
            ctx.textAlign = "left";
            ctx.fillText(this._labelText, this._scrollOffset, size.height / 2);
        } else {
            ctx.textAlign = "center";
            ctx.fillText(this._labelText, size.width / 2, size.height / 2);
        }
        this.labelTexture.update();
    }

    async dispose() { }
}

export class ButterchurnN3D implements Node3D {
    private activeWamNode: any = null;
    private presets: string[] = [];
    private selectedPreset: string | null = null;
    private pendingScreens: any[] = [];

    // Pending state: queued setState calls received before WAM is ready
    private pendingState = new Map<string, any>();
    private wamReady = false;

    constructor(private context: Node3DContext, private gui: ButterchurnN3DGUI) {
        const { tools: T } = context;
        context.addToBoundingBox(gui.block);

        const placeholderInput = context.audioCtx.createGain();
        const audioInput = new T.AudioN3DConnectable.DynamicInput(
            "audioInput",
            [gui.audioInput],
            "Audio Input",
            placeholderInput
        );
        context.createConnectable(audioInput);

        const videoColor = new Color3(0.8, 0.2, 0.8);
        const videoOutput: Node3DConnectable = {
            id: "videoOutput",
            label: "Video Output",
            meshes: [gui.videoOutput],
            type: "video",
            direction: "output",
            color: videoColor,
            connectAsInput: () => {
                const id = this.activeWamNode?.instanceId;
                console.log("[Butterchurn] DEBUG: connectAsInput requested. Current ID:", id);
                return id;
            },
            connectAsOutput: (target: any) => {
                if (target && typeof target.useRenderer === "function") {
                    const id = this.activeWamNode?.instanceId;
                    if (id) target.useRenderer(id);
                    else this.pendingScreens.push(target);
                }
            },
            disconnectAsInput: () => { },
            disconnectAsOutput: () => {
                this.pendingScreens = [];
            }
        };
        context.createConnectable(videoOutput);

        const shaderButton: Node3DButton = {
            id: "shaderMenu",
            label: "Select Shader",
            meshes: [gui.menuButton],
            color: new Color3(1, 1, 0),
            press: () => this.openShaderMenu(),
            release: () => { }
        };
        context.createButton(shaderButton);

        // Unique WAM instance per Node3D
        (async () => {
            try {
                const instance = await WamInitializer.getInstance()
                    .initWamInstance("https://www.webaudiomodules.com/community/plugins/burns-audio/video_butterchurn/index.js");
                
                if (instance?.audioNode) {
                    this.activeWamNode = instance.audioNode;
                    audioInput.audioNode = this.activeWamNode;

                    const id = this.activeWamNode.instanceId;
                    const videoExtension = (window as any).WAMExtensions?.video;
                    if (videoExtension && this.activeWamNode.video && !videoExtension.getDelegate(id)) {
                        videoExtension.setDelegate(id, this.activeWamNode.video);
                    }

                    for (const screen of this.pendingScreens) {
                        screen.useRenderer(id);
                    }
                    this.pendingScreens = [];

                    // Wait for presets to become available (awaitable with retries)
                    await this.waitForPresets();

                    // Mark WAM as ready and replay any queued state
                    await this.flushPendingState();
                }
            } catch (e) {
                console.error("[Butterchurn] ERROR: WAM load failed:", e);
            }
        })();
    }

    /**
     * Awaitable preset loading with retry logic.
     * Replaces the old fire-and-forget tryFetchPresets pattern.
     */
    private async waitForPresets(maxRetries = 15): Promise<void> {
        for (let i = 0; i < maxRetries; i++) {
            const state = await this.activeWamNode.getState();
            const p = state?.presets || this.activeWamNode.presets || (this.activeWamNode.module as any)?.presets;
            if (p) {
                this.presets = Object.keys(p).sort();
                return;
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        console.warn("[Butterchurn] Presets never became available after retries");
    }

    private openShaderMenu() {
        if (this.presets.length === 0) {
            this.context.showMessage("Presets not ready...");
            return;
        }
        
        const choices: any[] = [];
        this.presets.forEach(name => {
            const shortName = name.length > 30 ? name.substring(0, 27) + "..." : name;
            choices.push({ label: shortName, click: () => this.selectPreset(name) });
        });
        
        this.context.openMenu(choices, { showCloseBar: true, dragToScroll: true });
    }

    private async selectPreset(name: string) {
        if (this.activeWamNode) {
            await this.activeWamNode.setState({ preset: name });
            this.selectedPreset = name;
            this.gui.updateLabel(name);
            this.context.notifyStateChange("selectedPreset");
        }
    }

    //// State Synchronization ////

    getStateKeys() { return ["selectedPreset"]; }

    async getState(key: string) {
        if (key === "selectedPreset") return this.selectedPreset;
        return undefined;
    }

    async setState(key: string, value: any) {
        if (!this.wamReady) {
            // WAM not ready yet — queue for later
            this.pendingState.set(key, value);
            return;
        }
        await this.applyState(key, value);
    }

    private async applyState(key: string, value: any) {
        if (key === "selectedPreset" && typeof value === "string" && this.activeWamNode) {
            await this.activeWamNode.setState({ preset: value });
            this.selectedPreset = value;
            this.gui.updateLabel(value);
        }
    }

    private async flushPendingState() {
        this.wamReady = true;
        for (const [key, value] of this.pendingState) {
            await this.applyState(key, value);
            // Notify SyncManager so Y.js gets the correct value
            // (the initial send_changes may have read null before the WAM was ready)
            this.context.notifyStateChange(key);
        }
        this.pendingState.clear();
    }

    async dispose() { }
}

export const ButterchurnN3DFactory: Node3DFactory<ButterchurnN3DGUI, ButterchurnN3D> = {
    label: "Butterchurn",
    description: "GPU-accelerated visualizer.",
    tags: ["video", "generator"],
    createGUI: async (context) => new ButterchurnN3DGUI(context),
    create: async (context, gui) => new ButterchurnN3D(context, gui),
}
