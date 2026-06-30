import { Color3, Color4, StandardMaterial, DynamicTexture } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Node3DConnectable } from "../../Node3DConnectable";

export class ScreenN3DGUI implements Node3DGUI {
    root
    display
    videoInput
    get worldSize() { return 0.3 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;
        this.root = new B.TransformNode("screen root", scene);

        // Larger internal size + smaller worldSize = tight bounding box
        this.display = B.CreatePlane("display surface", { width: 25, height: 18.75 }, scene);
        this.display.parent = this.root;
        this.display.position.z = 0;

        this.videoInput = B.CreateSphere("video input", { diameter: 3.0 }, scene);
        this.videoInput.parent = this.root;
        this.videoInput.position.set(-12.5, -9.5, 0.2);
        T.MeshUtils.setColor(this.videoInput, new B.Color4(0.8, 0.2, 0.8, 1));
    }

    async dispose() { }
}

export class ScreenN3D implements Node3D {
    private currentInstanceId: string | null = null;
    private _checkInterval: any = null;

    constructor(private context: Node3DContext, private gui: ScreenN3DGUI) {
        context.addToBoundingBox(gui.display);

        const videoColor = new Color3(0.8, 0.2, 0.8);
        const videoInput: Node3DConnectable = {
            id: "videoInput",
            label: "Video Input",
            meshes: [gui.videoInput],
            type: "video",
            direction: "input",
            color: videoColor,
            connectAsInput: () => {
                console.log("[Screen] DEBUG: connectAsInput called (providing self)");
                this.showLoading();
                return this;
            },
            connectAsOutput: () => { },
            disconnectAsInput: () => {
                console.log("[Screen] DEBUG: disconnectAsInput called");
                this.stopVideo();
            },
            disconnectAsOutput: () => { }
        };
        context.createConnectable(videoInput);

        this._checkInterval = setInterval(() => {
            if (this.currentInstanceId) this.refresh();
        }, 2000);
    }

    /**
     * Entry point for video signal
     */
    public useRenderer(instanceId: string) {
        console.log(`[Screen] DEBUG: useRenderer triggered with ID: ${instanceId}`);
        if (!instanceId) {
            console.error("[Screen] ERROR: useRenderer received empty/undefined ID");
            return;
        }
        this.currentInstanceId = instanceId;
        (this as any)._hasLoggedMissing = false;
        (this as any)._attachedInstanceId = null;
        // Show loading in case we're restoring a session (connectAsInput may not fire)
        this.showLoading();
        this.refresh();
    }

    private showLoading() {
        const scene = this.gui.display.getScene();
        const mat = new StandardMaterial("screenLoadingMat", scene);
        const dt = new DynamicTexture("screenLoadingDT", { width: 1024, height: 512 }, scene, false);
        mat.diffuseTexture = dt;
        mat.emissiveTexture = dt;
        mat.emissiveColor = new Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        this.gui.display.material = mat;

        const ctx = dt.getContext();
        // Flip the drawing context vertically to counter the plane's UV mapping
        ctx.translate(0, 512);
        ctx.scale(1, -1);
        
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, 1024, 512);
        ctx.font = "bold 60px Arial";
        ctx.fillStyle = "#BB66FF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Loading, wait a few seconds...", 512, 256);
        dt.update(false);
    }

    private stopVideo() {
        console.log("[Screen] DEBUG: stopping video");
        this.currentInstanceId = null;
        (this as any)._attachedInstanceId = null;
        const scene = this.gui.display.getScene();
        const mat = new StandardMaterial("screenBlackMat", scene);
        mat.emissiveColor = new Color3(0, 0, 0);
        mat.disableLighting = true;
        this.gui.display.material = mat;
    }

    private refresh() {
        if (!this.currentInstanceId) return;

        const videoExtension = (window as any).WAMExtensions?.video;
        if (!videoExtension) {
            console.warn("[Screen] DEBUG: WAMExtensions.video NOT FOUND on window");
            return;
        }

        const renderer = videoExtension.getRenderer(
            this.gui.root.getScene(),
            this.currentInstanceId,
            this.context.audioCtx
        );

        if (renderer) {
            if ((renderer as any).hasFrames && (this as any)._attachedInstanceId !== this.currentInstanceId) {
                console.log(`[Screen] DEBUG: Shared renderer found for ${this.currentInstanceId} AND has frames. Attaching to mesh.`);
                renderer.attachToMesh(this.gui.display);
                (this as any)._attachedInstanceId = this.currentInstanceId;
            }
        } else {
            if (!(this as any)._hasLoggedMissing) {
                console.log(`[Screen] DEBUG: Renderer for ${this.currentInstanceId} NOT READY in extension yet`);
                (this as any)._hasLoggedMissing = true;
            }
        }
    }

    async setState(key: string, value: any) { }
    async getState(key: string) { return undefined; }
    getStateKeys() { return []; }
    async dispose() {
        if (this._checkInterval) clearInterval(this._checkInterval);
    }
}

export const ScreenN3DFactory: Node3DFactory<ScreenN3DGUI, ScreenN3D> = {
    label: "Screen",
    description: "External display for video content.",
    tags: ["video", "Other"],
    createGUI: async (context) => new ScreenN3DGUI(context),
    create: async (context, gui) => new ScreenN3D(context, gui),
}
