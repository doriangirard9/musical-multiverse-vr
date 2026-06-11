import { Color3 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Node3DConnectable } from "../../Node3DConnectable";
import { WamInitializer } from "../../../app/WamInitializer";

export class IsfShaderN3DGUI implements Node3DGUI {
    root
    block
    audioInput
    videoInput
    videoOutput
    automationInput
    menuButton
    params: any[] = []

    get worldSize() { return 1.0 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;
        this.root = new B.TransformNode("isf shader root", scene);

        this.block = B.CreateBox("isf shader box", { width: 2.2, height: 0.2, depth: 2.5 }, context.scene);
        this.block.parent = this.root;
        this.block.position.y = -0.1;
        T.MeshUtils.setColor(this.block, new B.Color4(0.3, 0.2, 0.4, 1));

        // Audio Input
        this.audioInput = T.ConnectableUtils.createInputMesh("audio input", 0.3, context.scene);
        this.audioInput.parent = this.root;
        this.audioInput.position.set(-0.8, 0, 1.0);
        T.MeshUtils.setColor(this.audioInput, T.AudioN3DConnectable.Color.toColor4());

        // Video Input
        this.videoInput = B.CreateSphere("video input", { diameter: 0.3 }, context.scene);
        this.videoInput.parent = this.root;
        this.videoInput.position.set(-0.8, 0, -1.0);
        T.MeshUtils.setColor(this.videoInput, new B.Color4(0.8, 0.2, 0.8, 1));

        // Video Output
        this.videoOutput = T.ConnectableUtils.createOutputMesh("video output", 0.3, context.scene);
        this.videoOutput.parent = this.root;
        this.videoOutput.position.set(0.8, 0, -1.0);
        T.MeshUtils.setColor(this.videoOutput, new B.Color4(0.8, 0.2, 0.8, 1));

        // Automation Input
        this.automationInput = B.CreateBox("automation input", { size: 0.25 }, context.scene);
        this.automationInput.parent = this.root;
        this.automationInput.position.set(0.8, 0, 1.0);
        T.MeshUtils.setColor(this.automationInput, new B.Color4(0.2, 0.8, 0.8, 1));

        // Menu Button
        this.menuButton = B.CreateSphere("menu button", { diameter: 0.25 }, context.scene);
        this.menuButton.parent = this.root;
        this.menuButton.position.set(0, 0.1, 0.8);
        T.MeshUtils.setColor(this.menuButton, new B.Color4(1, 1, 0, 1));

        // 15 Parameter Rotators
        for (let i = 0; i < 15; i++) {
            const row = Math.floor(i / 5);
            const col = i % 5;
            const param = B.CreateCylinder(`param_${i}`, { diameter: 0.25, height: 0.4 }, scene);
            param.parent = this.root;
            param.position.set(-0.8 + (col * 0.4), 0.2, -0.4 + (row * 0.4));
            T.MeshUtils.setColor(param, new B.Color4(0.5, 0.5, 0.5, 1));
            this.params.push(param);
        }
    }

    async dispose() { }
}

export class IsfShaderN3D implements Node3D {
    private activeWamNode: any = null;
    private presets: string[] = [];
    private presetMap: Map<string, number> = new Map();
    private currentInputs: any[] = [];
    private paramValues: Record<string, number> = {};
    private currentPage = 0;
    private readonly itemsPerPage = 4;
    private pendingScreen: any = null;

    constructor(private context: Node3DContext, private gui: IsfShaderN3DGUI) {
        const { tools: T, babylon: B } = context;
        context.addToBoundingBox(gui.block);

        // Audio Input
        const placeholderAudio = context.audioCtx.createGain();
        const audioInput = new T.AudioN3DConnectable.DynamicInput(
            "audioInput",
            [gui.audioInput],
            "Audio Input",
            placeholderAudio
        );
        context.createConnectable(audioInput);

        // Video Input
        const videoInput: Node3DConnectable = {
            id: "videoInput",
            label: "Video Input",
            meshes: [gui.videoInput],
            type: "video",
            direction: "input",
            color: new Color3(0.8, 0.2, 0.8),
            connectAsInput: () => { return this; },
            connectAsOutput: () => { },
            disconnectAsInput: () => { },
            disconnectAsOutput: () => { }
        };
        context.createConnectable(videoInput);

        // Video Output
        const videoOutput: Node3DConnectable = {
            id: "videoOutput",
            label: "Video Output",
            meshes: [gui.videoOutput],
            type: "video",
            direction: "output",
            color: new Color3(0.8, 0.2, 0.8),
            connectAsInput: () => this.activeWamNode?.instanceId,
            connectAsOutput: (target: any) => {
                if (target && typeof target.useRenderer === "function") {
                    const id = this.activeWamNode?.instanceId;
                    if (id) target.useRenderer(id);
                    else this.pendingScreen = target;
                }
            },
            disconnectAsInput: () => { },
            disconnectAsOutput: () => { this.pendingScreen = null; }
        };
        context.createConnectable(videoOutput);

        // Automation Input
        const automationInput: Node3DConnectable = {
            id: "automationInput",
            label: "Automation Input",
            meshes: [gui.automationInput],
            type: "automation",
            direction: "input",
            color: new Color3(0.2, 0.8, 0.8),
            connectAsInput: () => { return {}; },
            connectAsOutput: () => { },
            disconnectAsInput: () => { },
            disconnectAsOutput: () => { }
        };
        context.createConnectable(automationInput);

        // Shader Menu Button
        const shaderButton: any = {
            id: "shaderMenu",
            label: "Select Shader",
            meshes: [gui.menuButton],
            color: new Color3(1, 1, 0),
            press: () => this.openShaderMenu(),
            release: () => { }
        };
        context.createButton(shaderButton);

        // Generic parameter rotators p1-p15
        for (let i = 0; i < 15; i++) {
            const paramId = `p${i + 1}`;
            this.paramValues[paramId] = 0.5;
            
            context.createParameter({
                id: paramId,
                getLabel: () => {
                    const input = this.currentInputs[i];
                    return input ? input.NAME : `Param ${i + 1}`;
                },
                getStepCount() { return 100 },
                getValue: () => {
                    return this.paramValues[paramId];
                },
                setValue: (value: number) => {
                    this.paramValues[paramId] = value;
                    
                    if (this.activeWamNode) {
                        if (this.activeWamNode.setParamsValues) {
                            this.activeWamNode.setParamsValues({ [paramId]: value });
                        } else if (this.activeWamNode.setParameters) {
                            this.activeWamNode.setParameters({ [paramId]: value });
                        }
                        
                        const mesh = gui.params[i];
                        if (mesh) {
                            mesh.rotation.y = value * Math.PI * 2;
                        }
                        
                        context.notifyStateChange(paramId);
                    }
                },
                fromOffset: (posOffset, dirOffset) => {
                    return -(dirOffset.y * 2 + posOffset.y);
                },
                meshes: [gui.params[i]],
                stringify: (value: number) => {
                    const input = this.currentInputs[i];
                    if (input) {
                        const min = input.MIN !== undefined ? input.MIN : 0;
                        const max = input.MAX !== undefined ? input.MAX : 1;
                        const realVal = min + (max - min) * value;
                        return `${input.NAME}: ${realVal.toFixed(2)}`;
                    }
                    return `${Math.round(value * 100)}%`;
                },
            });
        }

        // Unique WAM instance per Node3D
        (async () => {
            try {
                const instance = await WamInitializer.getInstance()
                    .initWamInstance("https://sofiane949.github.io/DS4H-Project-2025-2026-S2/src/isf-video-wam/index.js");
                
                if (instance?.audioNode) {
                    this.activeWamNode = instance.audioNode;
                    audioInput.audioNode = this.activeWamNode;
                    this.activeWamNode.connect(this.context.audioCtx.destination);

                    const id = this.activeWamNode.instanceId;
                    const videoExtension = (window as any).WAMExtensions?.video;
                    if (videoExtension && this.activeWamNode.video && !videoExtension.getDelegate(id)) {
                        videoExtension.setDelegate(id, this.activeWamNode.video);
                    }

                    if (this.pendingScreen) {
                        this.pendingScreen.useRenderer(id);
                        this.pendingScreen = null;
                    }

                    this.activeWamNode.addEventListener('shader-changed', () => this.rebuildParameters());

                    const tryFetchPresets = async () => {
                        try {
                            const p = (this.activeWamNode.module as any)?.shaders || (this.activeWamNode as any).shaders;
                            if (p && Array.isArray(p)) {
                                this.presetMap.clear();
                                this.presets = p.map((name, idx) => {
                                    this.presetMap.set(name, idx);
                                    return name;
                                });
                                this.rebuildParameters();
                            } else {
                                setTimeout(tryFetchPresets, 1000);
                            }
                        } catch (e) {
                            console.error("[ISF] ERROR: Failed to fetch presets:", e);
                        }
                    };
                    tryFetchPresets();
                }
            } catch (e) {
                console.error("[ISF] ERROR: WAM load failed:", e);
            }
        })();
    }

    private rebuildParameters() {
        const module = this.activeWamNode?.module;
        if (!module || !module.parser) return;

        this.currentInputs = module.parser.inputs.filter((i: any) => i.TYPE !== 'image');
        
        for (let i = 0; i < 15; i++) {
            const input = this.currentInputs[i];
            const mesh = this.gui.params[i];
            if (input) {
                mesh.setEnabled(true);
                mesh.isVisible = true;
                
                const def = input.DEFAULT !== undefined ? (Array.isArray(input.DEFAULT) ? input.DEFAULT[0] : input.DEFAULT) : 0.5;
                const min = input.MIN !== undefined ? input.MIN : 0;
                const max = input.MAX !== undefined ? input.MAX : 1;
                const normVal = (def - min) / (max - min || 1);
                this.paramValues[`p${i+1}`] = normVal;
                mesh.rotation.y = normVal * Math.PI * 2;
            } else {
                mesh.setEnabled(false);
                mesh.isVisible = false;
            }
        }
    }

    private openShaderMenu() {
        if (this.presets.length === 0) {
            this.context.showMessage("Shaders not ready...");
            return;
        }
        this.context.closeMenu();
        const start = this.currentPage * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageItems = this.presets.slice(start, end);
        const choices: any[] = [];
        if (this.currentPage > 0) {
            choices.push({ label: "[ PREV ]", click: () => { this.currentPage--; this.openShaderMenu(); } });
        }
        pageItems.forEach(name => {
            const shortName = name.length > 30 ? name.substring(0, 27) + "..." : name;
            choices.push({ label: shortName, click: () => this.selectPreset(name) });
        });
        if (end < this.presets.length) {
            choices.push({ label: "[ NEXT ]", click: () => { this.currentPage++; this.openShaderMenu(); } });
        }
        this.context.openMenu(choices);
    }

    private async selectPreset(name: string) {
        if (this.activeWamNode) {
            const index = this.presetMap.get(name);
            if (index !== undefined) {
                if (this.activeWamNode.setParameters) {
                    await this.activeWamNode.setParameters({ shaderSelect: index });
                } else {
                    await this.activeWamNode.setState({ shaderSelect: index });
                }
                this.context.showMessage(`Active: ${name}`);
            }
            this.context.closeMenu();
        }
    }

    public useRenderer(instanceId: string) {
        if (!this.activeWamNode || !instanceId) return;
        const videoExtension = (window as any).WAMExtensions?.video;
        if (!videoExtension) return;
        const renderer = videoExtension.getRenderer(this.context.scene, this.activeWamNode.instanceId, this.context.audioCtx);
        if (renderer) renderer.setInputSource(instanceId);
    }

    async setState(key: string, value: any) { }
    async getState(key: string) { return undefined; }
    getStateKeys() { return []; }
    async dispose() { }
}

export const IsfShaderN3DFactory: Node3DFactory<IsfShaderN3DGUI, IsfShaderN3D> = {
    label: "ISF Shader",
    description: "ISF-based video effect plugin.",
    tags: ["video", "effect"],
    createGUI: async (context) => new IsfShaderN3DGUI(context),
    create: async (context, gui) => new IsfShaderN3D(context, gui),
}
