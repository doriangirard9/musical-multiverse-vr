import { Color3, Color4, StandardMaterial, DynamicTexture } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Node3DConnectable } from "../../Node3DConnectable";

export class BoxScreenN3DGUI implements Node3DGUI {
    root
    display
    videoInput

    get worldSize() { return 0.5 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;
        this.root = new B.TransformNode("box screen root", scene);

        // A 3D Cube for video rendering
        this.display = B.CreateBox("box display", { size: 4 }, scene);
        this.display.parent = this.root;

        this.videoInput = B.CreateSphere("video input", { diameter: 0.5 }, scene);
        this.videoInput.parent = this.root;
        this.videoInput.position.set(-2, -2, -2);
        T.MeshUtils.setColor(this.videoInput, new B.Color4(0.8, 0.2, 0.8, 1));
    }

    async dispose() { }
}

export class BoxScreenN3D implements Node3D {
    private currentInstanceId: string | null = null;
    private _checkInterval: any = null;

    constructor(private context: Node3DContext, private gui: BoxScreenN3DGUI) {
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
                this.showLoading();
                return this;
            },
            connectAsOutput: () => { },
            disconnectAsInput: () => {
                this.stopVideo();
            },
            disconnectAsOutput: () => { }
        };
        context.createConnectable(videoInput);

        this._checkInterval = setInterval(() => this.refresh(), 2000);
    }

    public useRenderer(instanceId: string) {
        console.log(`[BoxScreen] DEBUG: useRenderer triggered with ID: ${instanceId}`);
        this.currentInstanceId = instanceId;
        (this as any)._attachedInstanceId = null;
        this.showLoading();
        this.refresh();
    }

    private showLoading() {
        const scene = this.gui.display.getScene();
        const mat = new StandardMaterial("boxLoadingMat", scene);
        const dt = new DynamicTexture("boxLoadingDT", { width: 1024, height: 512 }, scene, false);
        mat.diffuseTexture = dt;
        mat.emissiveTexture = dt;
        mat.emissiveColor = new Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        this.gui.display.material = mat;

        const ctx = dt.getContext();
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
        this.currentInstanceId = null;
        (this as any)._attachedInstanceId = null;
        const scene = this.gui.display.getScene();
        const mat = new StandardMaterial("boxBlackMat", scene);
        mat.emissiveColor = new Color3(0, 0, 0);
        mat.disableLighting = true;
        this.gui.display.material = mat;
    }

    private refresh() {
        if (!this.currentInstanceId) return;

        const videoExtension = (window as any).WAMExtensions?.video;
        if (!videoExtension) return;

        const renderer = videoExtension.getRenderer(
            this.gui.root.getScene(),
            this.currentInstanceId,
            this.context.audioCtx
        );

        if (renderer) {
            if ((renderer as any).hasFrames && (this as any)._attachedInstanceId !== this.currentInstanceId) {
                renderer.attachToMesh(this.gui.display);
                (this as any)._attachedInstanceId = this.currentInstanceId;
            }
        }
    }

    async setState(key: string, value: any) { }
    async getState(key: string) { return undefined; }
    getStateKeys() { return []; }
    async dispose() {
        clearInterval(this._checkInterval);
    }
}

export const BoxScreenN3DFactory: Node3DFactory<BoxScreenN3DGUI, BoxScreenN3D> = {
    label: "Box Screen",
    description: "Cube-shaped display for video content.",
    tags: ["video", "other"],
    createGUI: async (context) => new BoxScreenN3DGUI(context),
    create: async (context, gui) => new BoxScreenN3D(context, gui),
}
