import * as B from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DGUIContext } from "../Node3DGUIContext";
import { Node3DContext } from "../Node3DContext";
import { AudioN3DConnectable, MidiN3DConnectable } from "../tools";
import { WamInitializer } from "../../app/WamInitializer";
import { WamTransportManager } from "./PianoRoll/WamTransportManager";
import { WebAudioModule } from "@webaudiomodules/api";

/**
 * Minimal 3D WAM Sampler block (e.g., Burns Audio DrumSampler)
 * - Simple base box with two spheres:
 *   • Left sphere: MIDI Input (connect PianoRoll → Sampler)
 *   • Right sphere: Audio Output (connect Sampler → FX / Destination)
 * - Exposes a WAM instance and handy getters for wiring.
 */
export class WamSamplerN3DGUI implements Node3DGUI {
  public root: B.TransformNode;
  public tool: any;

  public block!: B.AbstractMesh;
  public midiInput!: B.Mesh;    // left sphere (receives events)
  public audioOutput!: B.Mesh;  // right sphere (audio out)

  // sizing
  public width = 10;
  public height = 1;
  public depth = 4;

  constructor(public context: Node3DGUIContext) {
    const { tools: T } = context;
    this.tool = T;
    this.root = new B.TransformNode("sampler root", context.scene);
    this.root.scaling.setAll(0.1);
  }

  // Required by Node3DGUI
  public get worldSize() { return 3; }

  // Required by Node3DGUI
  public async dispose(): Promise<void> {
    try {
      this.midiInput?.dispose();
      this.audioOutput?.dispose();
      (this.block as any)?.dispose?.();
      this.root?.dispose?.();
    } catch {}
  }

  public async instantiate(): Promise<void> {
    this._createBase();
    this._createPorts();
  }

  private _createBase() {
    this.block = this.createBox(
      "wamSamplerBlock",
      { width: this.width, height: this.height, depth: this.depth },
      new B.Color3(0.25, 0.25, 0.35),
      new B.Vector3(0, 0, 0),
      this.root
    );
  }

  private _createPorts() {
    // MIDI Input (left)
    this.midiInput = B.CreateIcoSphere(
      "sampler midi input",
      { radius: 2 },
      this.context.scene
    );
    this.tool.MeshUtils.setColor(this.midiInput, MidiN3DConnectable.InputColor.toColor4());
    const halfW = (this.block.getBoundingInfo().boundingBox.extendSize.x);
    this.midiInput.position.set(-halfW - 1.5, this.block.position.y, this.block.position.z);
    this.midiInput.scaling.setAll(0.7);
    this.midiInput.parent = this.root;

    // Audio Output (right)
    this.audioOutput = B.CreateIcoSphere(
      "sampler audio output",
      { radius: 2 },
      this.context.scene
    );
    // Use OutputColor for visual consistency (even if it's audio, not MIDI)
    this.tool.MeshUtils.setColor(this.audioOutput, MidiN3DConnectable.OutputColor.toColor4());
    this.audioOutput.position.set(+halfW + 1.5, this.block.position.y, this.block.position.z);
    this.audioOutput.scaling.setAll(0.7);
    this.audioOutput.parent = this.root;
  }

  public createBox(
    name: string,
    size: { width: number; height: number; depth: number },
    color: B.Color3,
    position: B.Vector3,
    parent?: B.Node
  ): B.Mesh {
    const box = B.MeshBuilder.CreateBox(name, size, this.context.scene);
    const material = new B.StandardMaterial(`${name}_mat`, this.context.scene);
    material.diffuseColor = color;
    box.material = material;
    box.position = position.clone();
    if (parent) box.parent = parent;
    return box;
  }
}

export class WamSamplerN3D implements Node3D {
  private context: Node3DContext;
  private gui: WamSamplerN3DGUI;

  // WAM internals
  private wamInstance!: WebAudioModule;
  private transport: WamTransportManager;
  private unsubscribeTransport?: () => void;

  constructor(context: Node3DContext, gui: WamSamplerN3DGUI) {
    this.context = context;
    this.gui = gui;

    // Shared transport (useful for start/stop/tempo messages)
    this.transport = WamTransportManager.getInstance(context.audioCtx);
  }

  /** Initialize meshes/connectables safely before WAM boot */
  public async init(): Promise<void> {
    // 1) Ensure GUI meshes exist before bounding box / connectables
    await this.gui.instantiate();

    // 2) Now it's safe to reference meshes
    this.context.addToBoundingBox(this.gui.block);

    // Expose a connectable “MIDI Output” node in your tools graph (sphere in GUI)
    // const listOut = new this.context.tools. AudioN3DConnectable.ListOutput("midioutput", [this.gui.audioOutput], "MIDI Output");
    // this.context.createConnectable(listOut);

    this.wamInstance = await WamInitializer.getInstance()
      .initWamInstance("https://www.webaudiomodules.com/community/plugins/burns-audio/drumsampler/index.js");

    // MIDI Input connectable — lazily resolve audioNode once WAM is ready
    const midiIn = new this.context.tools.MidiN3DConnectable.Input(
      "midiInput",
      [this.gui.midiInput],
      "MIDI Input",
     this.wamInstance.audioNode
    );
    this.context.createConnectable(midiIn);

    // normal Output connectable — lazily resolve audioNode once WAM is ready
    const audioOut = new this.context.tools.AudioN3DConnectable.Output(
        "audioOutput",
        [this.gui.audioOutput],
        "Audio Output",
        this.wamInstance.audioNode
        );
    this.context.createConnectable(audioOut);
  }

  private async _initWam() {
    // Example: Burns Audio DrumSampler
    this.wamInstance = await WamInitializer.getInstance()
      .initWamInstance("https://www.webaudiomodules.com/community/plugins/burns-audio/drumsampler/index.js");

    // // Register with shared transport (so it receives wam-transport via scheduleEvents)
    // this.transport.register(this.wamInstance.audioNode);
    // this.unsubscribeTransport = this.transport.onChange(() => {
    //   // noop for now; could blink a light or update UI
    // });

    // // Default audio route → destination (you can rewire later)
    // try {
    //   this.wamInstance.audioNode.connect(this.context.audioCtx.destination);
    // } catch (e) {
    //   console.warn("Audio connect to destination failed (will rely on external graph wiring)", e);
    // }
  }

  /** Convenience getters for wiring */
  public get audioNode() { return this.wamInstance?.audioNode; }
  public get instanceId() { return (this.wamInstance?.audioNode as any)?.instanceId as string | undefined; }

  // Node3D persistence API (mirrors PianoRoll pattern methods)
  getStateKeys(): string[] { return ["wamState"]; }

  async getState(key: string): Promise<any> {
    if (key === "wamState") {
      try {
        const n: any = this.wamInstance?.audioNode as any;
        return await n?.getState?.();
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  async setState(key: string, state: any): Promise<void> {
    if (key === "wamState") {
      try {
        const n: any = this.wamInstance?.audioNode as any;
        await n?.setState?.(state);
      } catch {}
    }
  }

  async dispose(): Promise<void> {
    if (this.unsubscribeTransport) this.unsubscribeTransport();
    if (this.wamInstance?.audioNode) this.transport.unregister(this.wamInstance.audioNode);
  }
}

export const WamSamplerN3DFactory: Node3DFactory<WamSamplerN3DGUI, WamSamplerN3D> = {
  label: "wamsampler",
  async createGUI(context) { return new WamSamplerN3DGUI(context); },
  async create(context, gui) {
    const node = new WamSamplerN3D(context, gui);
    await node.init();                 // ← ensure meshes/ports exist before Node3DInstance touches them
    return node;
  },
};
