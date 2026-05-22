import { Color3, Color4 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Node3DConnectable } from "../../Node3DConnectable";

export class SphereScreenN3DGUI implements Node3DGUI {
    root
    display
    videoInput

    get worldSize() { return 0.5 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;
        this.root = new B.TransformNode("sphere screen root", scene);

        // A 3D Sphere for video rendering
        this.display = B.CreateSphere("sphere display", { diameter: 4 }, scene);
        this.display.parent = this.root;

        this.videoInput = B.CreateSphere("video input", { diameter: 0.5 }, scene);
        this.videoInput.parent = this.root;
        this.videoInput.position.set(-2, -2, -2);
        T.MeshUtils.setColor(this.videoInput, new B.Color4(0.8, 0.2, 0.8, 1));
    }

    async dispose() { }
}

export class SphereScreenN3D implements Node3D {
    private currentInstanceId: string | null = null;
    private _checkInterval: any = null;

    constructor(private context: Node3DContext, private gui: SphereScreenN3DGUI) {
        context.addToBoundingBox(gui.display);

        const videoColor = new Color3(0.8, 0.2, 0.8);
        const videoInput: Node3DConnectable = {
            id: "videoInput",
            label: "Video Input",
            meshes: [gui.videoInput],
            type: "video",
            direction: "input",
            color: videoColor,
            connectAsInput: (source: any) => {
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
        this.currentInstanceId = instanceId;
        this.refresh();
    }

    private stopVideo() {
        this.currentInstanceId = null;
        (this as any)._attachedInstanceId = null;
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
            if ((this as any)._attachedInstanceId !== this.currentInstanceId) {
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

export const SphereScreenN3DFactory: Node3DFactory<SphereScreenN3DGUI, SphereScreenN3D> = {
    label: "Sphere Screen",
    description: "Spherical display for video content.",
    tags: ["video", "other"],
    createGUI: async (context) => new SphereScreenN3DGUI(context),
    create: async (context, gui) => new SphereScreenN3D(context, gui),
}
