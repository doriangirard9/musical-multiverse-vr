import { Color3 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Node3DConnectable } from "../../Node3DConnectable";
import type { Node3DButton } from "../../Node3DButton";
import { WamInitializer } from "../../../app/WamInitializer";

// Static cache to prevent duplicate AudioWorklet registration
let butterchurnWamPromise: Promise<any> | null = null;

export class ButterchurnN3DGUI implements Node3DGUI {
    root
    block
    audioInput
    videoOutput
    menuButton

    get worldSize() { return 1 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;
        this.root = new B.TransformNode("butterchurn root", scene);

        this.block = B.CreateBox("butterchurn box", { width: 1.2, height: 0.2, depth: 1 }, context.scene);
        this.block.parent = this.root;
        this.block.position.y = -0.1;
        T.MeshUtils.setColor(this.block, new B.Color4(0.2, 0.2, 0.2, 1));

        this.audioInput = T.ConnectableUtils.createInputMesh("audio input", 0.3, context.scene);
        this.audioInput.parent = this.root;
        this.audioInput.position.set(-0.4, 0, 0.3);
        T.MeshUtils.setColor(this.audioInput, T.AudioN3DConnectable.Color.toColor4());

        this.videoOutput = T.ConnectableUtils.createOutputMesh("video output", 0.3, context.scene);
        this.videoOutput.parent = this.root;
        this.videoOutput.position.set(0.4, 0, 0.3);
        T.MeshUtils.setColor(this.videoOutput, new B.Color4(0.8, 0.2, 0.8, 1));

        this.menuButton = B.CreateSphere("menu button", { diameter: 0.2 }, context.scene);
        this.menuButton.parent = this.root;
        this.menuButton.position.set(0, 0.1, -0.3);
        T.MeshUtils.setColor(this.menuButton, new B.Color4(1, 1, 0, 1));
    }

    async dispose() { }
}

export class ButterchurnN3D implements Node3D {
    private activeWamNode: any = null;
    private presets: string[] = [];
    private currentPage = 0;
    private readonly itemsPerPage = 4;
    private pendingScreen: any = null;

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
                console.log("[Butterchurn] DEBUG: connectAsOutput triggered. Target has useRenderer?", !!(target && target.useRenderer));

                if (target && typeof target.useRenderer === "function") {
                    const id = this.activeWamNode?.instanceId;
                    if (id) {
                        console.log(`[Butterchurn] DEBUG: Pushing ID ${id} to connected Screen`);
                        target.useRenderer(id);
                    } else {
                        console.log("[Butterchurn] DEBUG: ID not ready yet, storing Screen for deferred notification");
                        this.pendingScreen = target;
                    }
                } else {
                    console.warn("[Butterchurn] DEBUG: connectAsOutput target is NOT a valid Screen/Receiver");
                }
            },
            disconnectAsInput: () => { },
            disconnectAsOutput: () => {
                console.log("[Butterchurn] DEBUG: disconnectAsOutput - clearing pending screen");
                this.pendingScreen = null;
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

        if (!butterchurnWamPromise) {
            butterchurnWamPromise = (async () => {
                try {
                    console.log("[Butterchurn] DEBUG: Starting WAM initialization...");
                    const instance = await WamInitializer.getInstance()
                        .initWamInstance("https://www.webaudiomodules.com/community/plugins/burns-audio/video_butterchurn/index.js");
                    console.log("[Butterchurn] DEBUG: WAM Load SUCCESS");
                    return instance;
                } catch (e) {
                    console.error("[Butterchurn] ERROR: WAM load failed:", e);
                    butterchurnWamPromise = null;
                    throw e;
                }
            })();
        }

        butterchurnWamPromise.then(async (instance) => {
            if (instance?.audioNode) {
                this.activeWamNode = instance.audioNode;
                audioInput.audioNode = this.activeWamNode;

                // Ensure the node is connected to destination so it "ticks" and processes video
                this.activeWamNode.connect(this.context.audioCtx.destination);

                const id = this.activeWamNode.instanceId;
                console.log(`[Butterchurn] DEBUG: activeWamNode is READY. ID: ${id}`);

                // Explicitly check for video delegate if not already registered
                const videoExtension = (window as any).WAMExtensions?.video;
                if (videoExtension && this.activeWamNode.video && !videoExtension.getDelegate(id)) {
                    console.log("[Butterchurn] DEBUG: Manually registering video delegate");
                    videoExtension.setDelegate(id, this.activeWamNode.video);
                }

                // If a screen connected while we were loading, notify it now
                if (this.pendingScreen) {
                    console.log(`[Butterchurn] DEBUG: Notifying DEFERRED Screen with ID: ${id}`);
                    this.pendingScreen.useRenderer(id);
                    this.pendingScreen = null;
                }

                const tryFetchPresets = async () => {
                    const state = await this.activeWamNode.getState();
                    const p = state?.presets || this.activeWamNode.presets || (this.activeWamNode.module as any)?.presets;
                    if (p) {
                        this.presets = Object.keys(p).sort();
                    } else {
                        setTimeout(tryFetchPresets, 1000);
                    }
                };
                tryFetchPresets();
            }
        });
    }

    private openShaderMenu() {
        if (this.presets.length === 0) {
            this.context.showMessage("Presets not ready...");
            return;
        }
        this.context.closeMenu();
        const start = this.currentPage * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageItems = this.presets.slice(start, end);
        const choices: any[] = [];
        if (this.currentPage > 0) {
            choices.push({ label: "[ PREV ]", action: () => { this.currentPage--; this.openShaderMenu(); } });
        }
        pageItems.forEach(name => {
            const shortName = name.length > 30 ? name.substring(0, 27) + "..." : name;
            choices.push({ label: shortName, action: () => this.selectPreset(name) });
        });
        if (end < this.presets.length) {
            choices.push({ label: "[ NEXT ]", action: () => { this.currentPage++; this.openShaderMenu(); } });
        }
        this.context.openMenu(choices);
    }

    private async selectPreset(name: string) {
        if (this.activeWamNode) {
            await this.activeWamNode.setState({ preset: name });
            this.context.showMessage(`Active: ${name}`);
            this.context.closeMenu();
        }
    }

    async setState(key: string, value: any) { }
    async getState(key: string) { return undefined; }
    getStateKeys() { return []; }
    async dispose() { }
}

export const ButterchurnN3DFactory: Node3DFactory<ButterchurnN3DGUI, ButterchurnN3D> = {
    label: "Butterchurn",
    description: "GPU-accelerated visualizer.",
    tags: ["video", "generator"],
    createGUI: async (context) => new ButterchurnN3DGUI(context),
    create: async (context, gui) => new ButterchurnN3D(context, gui),
}
