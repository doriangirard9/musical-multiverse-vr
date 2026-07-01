import { Color3, Mesh, MeshBuilder, Observer, Scene, StandardMaterial, TransformNode } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D"
import { Node3DContext } from "../../Node3DContext"
import { Node3DGUIContext } from "../../Node3DGUIContext"
import { AudioAnalyser } from "../../../utils/AudioAnalyser"

const BAR_COUNT = 32
const PANEL_WIDTH = 1
const PANEL_HEIGHT = 0.6
const PANEL_DEPTH = 0.05
const BAR_MAX_HEIGHT = PANEL_HEIGHT * 0.9
const BAR_GAP = 0.005
const BAR_WIDTH = (PANEL_WIDTH - BAR_GAP * (BAR_COUNT + 1)) / BAR_COUNT
const PORT_DIAMETER = 0.18
const PORT_OFFSET = PANEL_WIDTH / 2 + PORT_DIAMETER

/**
 * Spectrum Bars GUI: a flat panel with a row of FFT-magnitude bars, a green
 * audio input port on the left edge, and a green audio output port on the right.
 */
export class SpectrumBarsN3DGUI implements Node3DGUI {

    public root!: TransformNode
    public panel!: Mesh
    public audioInput!: Mesh
    public audioOutput!: Mesh
    public bars: Mesh[] = []

    public get worldSize(): number { return 2 }

    public async init(context: Node3DGUIContext): Promise<void> {
        const scene = context.scene
        this.root = new TransformNode("visualizer root", scene)

        this.#buildPanel(scene)
        this.#buildBars(scene)
        this.audioInput  = this.#buildPort(scene, "in",  -PORT_OFFSET)
        this.audioOutput = this.#buildPort(scene, "out", +PORT_OFFSET)
    }

    public async dispose(): Promise<void> { /* meshes torn down by parent disposal */ }

    #buildPanel(scene: Scene): void {
        this.panel = MeshBuilder.CreateBox("visualizer panel",
            { width: PANEL_WIDTH, height: PANEL_HEIGHT, depth: PANEL_DEPTH }, scene)
        const mat = new StandardMaterial("visualizer panel mat", scene)
        mat.diffuseColor = new Color3(0.05, 0.05, 0.08)
        mat.emissiveColor = new Color3(0.02, 0.02, 0.04)
        this.panel.material = mat
        this.panel.parent = this.root
    }

    #buildBars(scene: Scene): void {
        const mat = new StandardMaterial("visualizer bar mat", scene)
        mat.diffuseColor = new Color3(0.25, 0.85, 1.0)
        mat.emissiveColor = new Color3(0.1, 0.4, 0.6)
        const startX = -PANEL_WIDTH / 2 + BAR_GAP + BAR_WIDTH / 2
        const baseY = -PANEL_HEIGHT / 2
        for (let i = 0; i < BAR_COUNT; i++) {
            const bar = MeshBuilder.CreateBox(`visualizer bar ${i}`,
                { width: BAR_WIDTH, height: 1, depth: PANEL_DEPTH * 0.6 }, scene)
            bar.material = mat
            bar.parent = this.root
            bar.position.x = startX + i * (BAR_WIDTH + BAR_GAP)
            bar.position.z = -PANEL_DEPTH * 0.5
            bar.scaling.y = 0.001
            bar.position.y = baseY + (1 * bar.scaling.y) / 2
            this.bars.push(bar)
        }
    }

    #buildPort(scene: Scene, suffix: string, x: number): Mesh {
        const mesh = MeshBuilder.CreateSphere(`visualizer audio ${suffix}`,
            { diameter: PORT_DIAMETER, segments: 8 }, scene)
        const mat = new StandardMaterial(`visualizer port ${suffix} mat`, scene)
        mat.diffuseColor = new Color3(0, 1, 0)
        mat.emissiveColor = new Color3(0, 0.4, 0)
        mesh.material = mat
        mesh.parent = this.root
        mesh.position.set(x, 0, 0)
        return mesh
    }
}

/**
 * Spectrum Bars Node3D: passes audio straight through (input → output) while
 * tapping a non-destructive analyser to drive the bar graph. Tagged as a
 * visualizer so it satisfies a sink role for the graph, but downstream nodes
 * can still connect to its output to chain past it.
 */
export class SpectrumBarsN3D implements Node3D {

    public async init(context: Node3DContext, gui: SpectrumBarsN3DGUI): Promise<this> {
        const { tools: { AudioN3DConnectable }, audioCtx } = context
        this.#gui = gui

        const passthrough = audioCtx.createGain()
        this.#passthrough = passthrough
        this.#analyser = new AudioAnalyser(audioCtx, 64)
        this.#analyser.tap(passthrough)
        this.#freqBuf = new Uint8Array(this.#analyser.binCount)

        context.addToBoundingBox(gui.panel)
        context.createConnectable(new AudioN3DConnectable.Input(
            "audioInput", [gui.audioInput], "Audio In", passthrough,
        ))
        context.createConnectable(new AudioN3DConnectable.Output(
            "audioOutput", [gui.audioOutput], "Audio Out", passthrough,
        ))

        const scene = gui.root.getScene()
        this.#renderObserver = scene.onBeforeRenderObservable.add(() => this.#tick())

        return this
    }

    public async setState(_key: string, _state: unknown): Promise<void> { }
    public async getState(_key: string): Promise<void> { }
    public getStateKeys(): string[] { return [] }

    public async dispose(): Promise<void> {
        if (this.#renderObserver !== null && this.#renderObserver !== undefined) {
            const scene = this.#gui.root.getScene()
            scene.onBeforeRenderObservable.remove(this.#renderObserver)
            this.#renderObserver = null
        }
        this.#analyser.dispose()
        try { this.#passthrough.disconnect() } catch { /* ignore */ }
    }

    #gui!: SpectrumBarsN3DGUI
    #passthrough!: GainNode
    #analyser!: AudioAnalyser
    #freqBuf!: Uint8Array<ArrayBuffer>
    #renderObserver: Observer<Scene> | null = null

    #tick(): void {
        this.#analyser.readFrequency(this.#freqBuf)
        const bars = this.#gui.bars
        const baseY = -PANEL_HEIGHT / 2
        const binsPerBar = Math.max(1, Math.floor(this.#freqBuf.length / bars.length))
        for (let i = 0; i < bars.length; i++) {
            let sum = 0
            const start = i * binsPerBar
            const end = Math.min(start + binsPerBar, this.#freqBuf.length)
            for (let j = start; j < end; j++) sum += this.#freqBuf[j]
            const avg = sum / Math.max(1, end - start) / 255
            const h = Math.max(0.001, avg * BAR_MAX_HEIGHT)
            const bar = bars[i]
            bar.scaling.y = h
            bar.position.y = baseY + h / 2
        }
    }
}

export const SpectrumBarsN3DFactory: Node3DFactory<SpectrumBarsN3DGUI, Node3D> = {
    label: "Spectrum Bars",
    description: "Displays the live frequency spectrum of incoming audio as a row of vertical bars while passing audio straight through.",
    tags: ["visualizer", "audio", "consumer", "spectrum", "fft"],
    createGUI: async (context) => {
        const gui = new SpectrumBarsN3DGUI()
        await gui.init(context)
        return gui
    },
    create: async (context, gui) => await new SpectrumBarsN3D().init(context, gui),
}
