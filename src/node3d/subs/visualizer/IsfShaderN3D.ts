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
    labelPlane: any
    labelTexture: any

    get worldSize() { return 1.0 }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;
        this.root = new B.TransformNode("isf shader root", scene);

        this.block = B.CreateBox("isf shader box", { width: 2.2, height: 0.2, depth: 2.5 }, context.scene);
        this.block.parent = this.root;
        this.block.position.y = -0.1;
        
        const boxMat = new B.StandardMaterial("isfShaderMat", scene);
        boxMat.diffuseTexture = new B.Texture("/textures/ISFShader/ISFShaderBody.png", scene);
        boxMat.emissiveTexture = boxMat.diffuseTexture; // Make it pop more
        this.block.material = boxMat;

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

        // Menu Button — centered between video input/output connectors on the front face
        this.menuButton = B.CreateSphere("menu button", { diameter: 0.25 }, context.scene);
        this.menuButton.parent = this.root;
        this.menuButton.position.set(0, 0, -1.0);
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

        // Shader name label — standing upright on the XY plane, above the box
        this.labelPlane = B.CreatePlane("shader label", { width: 2.0, height: 0.6 }, scene);
        this.labelPlane.parent = this.root;
        this.labelPlane.position.set(0, 0.50, 1.25);   // above the box, at z = depth/2
        this.labelPlane.isPickable = false;

        this.labelTexture = new B.DynamicTexture("shaderLabelDT", { width: 1024, height: 256 }, scene, true);
        const mat = new B.StandardMaterial("shaderLabelMat", scene);
        mat.diffuseTexture = this.labelTexture;
        mat.emissiveTexture = this.labelTexture;
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.useAlphaFromDiffuseTexture = true;
        this.labelPlane.material = mat;

        this._scene = scene;
        this.updateLabel("ISF Shader");

        // Component Name Label on the front edge of the box
        const namePlane = B.CreatePlane("name label", { width: 2.2, height: 0.2 }, scene);
        namePlane.parent = this.block;
        namePlane.position.set(0, 0, -1.251); // slightly in front of the front face
        namePlane.isPickable = false;

        const nameTexture = new B.DynamicTexture("nameDT", { width: 512, height: 128 }, scene, true);
        const nameMat = new B.StandardMaterial("nameMat", scene);
        nameMat.diffuseTexture = nameTexture;
        nameMat.emissiveTexture = nameTexture;
        nameMat.disableLighting = true;
        nameMat.backFaceCulling = false;
        nameMat.useAlphaFromDiffuseTexture = true;
        namePlane.material = nameMat;

        const nctx = nameTexture.getContext();
        nctx.clearRect(0, 0, 512, 128);
        nctx.font = "bold 60px Arial";
        nctx.fillStyle = "white";
        nctx.textAlign = "center";
        nctx.textBaseline = "middle";
        nctx.fillText("ISF SHADER", 256, 64);
        nameTexture.update();
    }

    private _scene: any;
    private _scrollOffset = 0;
    private _scrollObserver: any = null;
    private _labelText = "";
    private _labelColor = "#00DDFF";
    private _textWidth = 0;

    updateLabel(text: string) {
        this._labelText = text;
        this._scrollOffset = 0;

        // Measure text width
        const ctx = this.labelTexture.getContext();
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
                if (frameCount % 3 !== 0) return;
                this._scrollOffset -= 2;
                const totalWidth = this._textWidth + 120;
                if (this._scrollOffset < -totalWidth) this._scrollOffset = canvasWidth;
                this._drawLabel();
            });
            this._scrollOffset = 20;
        }

        this._drawLabel();
    }

    private _drawLabel() {
        const ctx = this.labelTexture.getContext();
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

export class IsfShaderN3D implements Node3D {
    private activeWamNode: any = null;
    private presets: string[] = [];
    private presetMap: Map<string, number> = new Map();
    private selectedShader: string | null = null;
    private currentInputs: any[] = [];
    private paramValues: Record<string, number> = {};
    private currentPage = 0;
    private readonly itemsPerPage = 4;
    private pendingScreens: any[] = [];
    private pendingInputId: string | null = null;

    // Pending state: queued setState calls received before WAM is ready
    private pendingState = new Map<string, any>();
    private wamReady = false;

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
                    else this.pendingScreens.push(target);
                }
            },
            disconnectAsInput: () => { },
            disconnectAsOutput: () => { this.pendingScreens = []; }
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

                getMin() { return 0 },
                getMax() { return 1 },
                getStepSize() { return 0.01 },
                getExponant() { return 1 },

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
                    // Original: "https://sofiane949.github.io/DS4H-Project-2025-2026-S2/src/isf-video-wam/index.js"
                    .initWamInstance(`${window.location.origin}/isf-video-wam/index.js`);
                
                if (instance?.audioNode) {
                    this.activeWamNode = instance.audioNode;
                    audioInput.audioNode = this.activeWamNode;

                    const id = this.activeWamNode.instanceId;
                    const videoExtension = (window as any).WAMExtensions?.video;
                    if (videoExtension && this.activeWamNode.video && !videoExtension.getDelegate(id)) {
                        videoExtension.setDelegate(id, this.activeWamNode.video);
                    }

                    // Flush pending video input (Butterchurn → ISF before WAM ready)
                    if (this.pendingInputId) {
                        this.useRenderer(this.pendingInputId);
                        this.pendingInputId = null;
                    }

                    for (const screen of this.pendingScreens) {
                        screen.useRenderer(id);
                    }
                    this.pendingScreens = [];

                    this.activeWamNode.addEventListener('shader-changed', () => this.rebuildParameters());

                    // Wait for shaders to become available (awaitable with retries)
                    await this.waitForShaders();

                    // Mark WAM as ready and replay any queued state
                    await this.flushPendingState();
                }
            } catch (e) {
                console.error("[ISF] ERROR: WAM load failed:", e);
            }
        })();
    }

    /**
     * Awaitable shader list loading with retry logic.
     * Replaces the old fire-and-forget tryFetchPresets pattern.
     */
    private async waitForShaders(maxRetries = 15): Promise<void> {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const p = (this.activeWamNode.module as any)?.shaders || (this.activeWamNode as any).shaders;
                if (p && Array.isArray(p)) {
                    this.presetMap.clear();
                    this.presets = p.map((name: string, idx: number) => {
                        this.presetMap.set(name, idx);
                        return name;
                    });
                    this.rebuildParameters();
                    return;
                }
            } catch (e) {
                console.error("[ISF] ERROR: Failed to fetch shaders:", e);
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        console.warn("[ISF] Shaders never became available after retries");
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
        choices.push({ label: "❌ Cancel", click: () => this.context.closeMenu() });
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
                this.selectedShader = name;
                this.gui.updateLabel(name);
                this.context.notifyStateChange("selectedShader");
            }
            this.context.closeMenu();
        }
    }

    public useRenderer(instanceId: string) {
        console.log(`[ISF] useRenderer called with source ID: ${instanceId}, activeWamNode ID: ${this.activeWamNode?.instanceId}`);
        if (!instanceId) return;
        if (!this.activeWamNode) {
            // WAM not ready yet — queue for later
            console.log(`[ISF] WAM not ready, queuing input source: ${instanceId}`);
            this.pendingInputId = instanceId;
            return;
        }
        const videoExtension = (window as any).WAMExtensions?.video;
        if (!videoExtension) return;
        const renderer = videoExtension.getRenderer(this.gui.root.getScene(), this.activeWamNode.instanceId, this.context.audioCtx);
        console.log(`[ISF] getRenderer result:`, renderer ? 'found' : 'NULL — ID mismatch?');
        if (renderer) renderer.setInputSource(instanceId);
    }

    //// State Synchronization ////

    getStateKeys() { return ["selectedShader", "paramValues"]; }

    async getState(key: string) {
        if (key === "selectedShader") return this.selectedShader;
        if (key === "paramValues") return { ...this.paramValues };
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

    /**
     * Apply a state change from the SyncManager (remote).
     * IMPORTANT: Must NOT call notifyStateChange() to avoid sync loops.
     * For ISF, the order matters:
     * - "selectedShader" must be applied first (triggers rebuildParameters via shader-changed event)
     * - "paramValues" must be applied after the shader is loaded
     */
    private async applyState(key: string, value: any) {
        if (key === "selectedShader" && typeof value === "string") {
            // Inline the shader selection WITHOUT notifyStateChange (avoids sync loop)
            if (this.activeWamNode) {
                const index = this.presetMap.get(value);
                if (index !== undefined) {
                    if (this.activeWamNode.setParameters) {
                        await this.activeWamNode.setParameters({ shaderSelect: index });
                    } else {
                        await this.activeWamNode.setState({ shaderSelect: index });
                    }
                    this.selectedShader = value;
                    this.gui.updateLabel(value);
                }
            }
            // Wait for the shader-changed event + rebuildParameters to complete
            await new Promise(r => setTimeout(r, 500));
        }
        if (key === "paramValues" && typeof value === "object" && value !== null) {
            for (const [paramId, paramVal] of Object.entries(value)) {
                if (typeof paramVal === "number") {
                    this.paramValues[paramId] = paramVal;
                    // Apply to WAM
                    if (this.activeWamNode?.setParamsValues) {
                        this.activeWamNode.setParamsValues({ [paramId]: paramVal });
                    } else if (this.activeWamNode?.setParameters) {
                        this.activeWamNode.setParameters({ [paramId]: paramVal });
                    }
                    // Update mesh rotation
                    const idx = parseInt(paramId.replace("p", "")) - 1;
                    if (idx >= 0 && idx < this.gui.params.length) {
                        const mesh = this.gui.params[idx];
                        if (mesh) mesh.rotation.y = paramVal * Math.PI * 2;
                    }
                }
            }
        }
    }

    /**
     * Flush pending state in the correct order:
     * 1. selectedShader first (loads the shader file, rebuilds parameters)
     * 2. paramValues second (overrides the default values from rebuildParameters)
     */
    private async flushPendingState() {
        this.wamReady = true;

        // Apply selectedShader first if present
        const shader = this.pendingState.get("selectedShader");
        if (shader !== undefined) {
            await this.applyState("selectedShader", shader);
            this.context.notifyStateChange("selectedShader");
            this.pendingState.delete("selectedShader");
        }

        // Then apply remaining state (paramValues, etc.)
        for (const [key, value] of this.pendingState) {
            await this.applyState(key, value);
            // Notify SyncManager so Y.js gets the correct value
            this.context.notifyStateChange(key);
        }
        this.pendingState.clear();
    }

    async dispose() { }
}

export const IsfShaderN3DFactory: Node3DFactory<IsfShaderN3DGUI, IsfShaderN3D> = {
    label: "ISF Shader",
    description: "ISF-based video effect plugin.",
    tags: ["video", "effect"],
    createGUI: async (context) => new IsfShaderN3DGUI(context),
    create: async (context, gui) => new IsfShaderN3D(context, gui),
}
