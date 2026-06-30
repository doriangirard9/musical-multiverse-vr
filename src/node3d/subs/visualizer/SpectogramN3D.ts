import { Color3, DynamicTexture, Mesh, MeshBuilder, Observer, Scene, StandardMaterial, TransformNode } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D"
import { Node3DContext } from "../../Node3DContext"
import { Node3DGUIContext } from "../../Node3DGUIContext"
import { AudioAnalyser } from "../../../utils/AudioAnalyser"

const PANEL_WIDTH  = 1.2
const PANEL_HEIGHT = 0.6
const PANEL_DEPTH  = 0.05
const PORT_DIAMETER = 0.18
const PORT_OFFSET   = PANEL_WIDTH / 2 + PORT_DIAMETER
const SCREEN_WIDTH_PX  = 320     // time-history columns
const SCREEN_HEIGHT_PX = 256     // frequency bins shown (low at bottom → high at top)
const FFT_SIZE = 512             // analyser FFT size; binCount = 256, matches screen height

/**
 * Spectogram GUI: a flat panel whose screen is a scrolling time × frequency
 * heatmap. Each new column = the current frame's FFT magnitudes painted with
 * a perceptual blue → cyan → yellow → red gradient. The existing image is
 * shifted left by one pixel column per frame so older content scrolls off.
 */
export class SpectogramN3DGUI implements Node3DGUI {

    public root!: TransformNode
    public panel!: Mesh
    public audioInput!: Mesh
    public audioOutput!: Mesh
    public texture!: DynamicTexture

    public get worldSize(): number { return 2 }

    public async init(context: Node3DGUIContext): Promise<void> {
        const scene = context.scene
        this.root = new TransformNode("spectogram root", scene)

        this.#buildPanel(scene)
        this.audioInput  = this.#buildPort(scene, "in",  -PORT_OFFSET)
        this.audioOutput = this.#buildPort(scene, "out", +PORT_OFFSET)
    }

    public async dispose(): Promise<void> {
        this.texture.dispose()
    }

    #buildPanel(scene: Scene): void {
        this.panel = MeshBuilder.CreateBox("spectogram panel",
            { width: PANEL_WIDTH, height: PANEL_HEIGHT, depth: PANEL_DEPTH }, scene)
        this.panel.rotation.x = Math.PI/2
        this.panel.parent = this.root

        this.texture = new DynamicTexture("spectogram screen",
            { width: SCREEN_WIDTH_PX, height: SCREEN_HEIGHT_PX }, scene, false)
        const ctx = this.texture.getContext() as CanvasRenderingContext2D
        ctx.fillStyle = "rgb(2, 4, 16)"
        ctx.fillRect(0, 0, SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX)
        this.texture.update(false)

        const mat = new StandardMaterial("spectogram screen mat", scene)
        mat.emissiveTexture = this.texture
        mat.diffuseColor    = Color3.Black()
        mat.specularColor   = Color3.Black()
        mat.disableLighting = true
        this.panel.material = mat
    }

    #buildPort(scene: Scene, suffix: string, x: number): Mesh {
        const mesh = MeshBuilder.CreateSphere(`spectogram audio ${suffix}`,
            { diameter: PORT_DIAMETER, segments: 8 }, scene)
        const mat = new StandardMaterial(`spectogram port ${suffix} mat`, scene)
        mat.diffuseColor  = new Color3(0, 1, 0)
        mat.emissiveColor = new Color3(0, 0.4, 0)
        mesh.material = mat
        mesh.parent   = this.root
        mesh.position.set(x, 0, 0)
        return mesh
    }
}

/**
 * Spectogram Node3D: passes audio straight through while scrolling a
 * time × frequency heatmap onto the panel. Tagged as a visualizer;
 * downstream nodes can chain past its output.
 */
export class SpectogramN3D implements Node3D {

    public async init(context: Node3DContext, gui: SpectogramN3DGUI): Promise<this> {
        const { tools: { AudioN3DConnectable }, audioCtx } = context
        this.#gui = gui

        const passthrough = audioCtx.createGain()
        this.#passthrough = passthrough
        this.#analyser = new AudioAnalyser(audioCtx, FFT_SIZE)
        this.#analyser.tap(passthrough)
        this.#freqBuf = new Uint8Array(this.#analyser.binCount)

        // Pre-allocated one-pixel-wide column we paint each frame, then blit.
        // Avoids re-creating ImageData per tick.
        const ctx = gui.texture.getContext() as CanvasRenderingContext2D
        this.#columnData = ctx.createImageData(1, SCREEN_HEIGHT_PX)

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
        if (this.#renderObserver !== null) {
            this.#gui.root.getScene().onBeforeRenderObservable.remove(this.#renderObserver)
            this.#renderObserver = null
        }
        this.#analyser.dispose()
        try { this.#passthrough.disconnect() } catch { /* ignore */ }
    }

    #gui!: SpectogramN3DGUI
    #passthrough!: GainNode
    #analyser!: AudioAnalyser
    #freqBuf!: Uint8Array<ArrayBuffer>
    #columnData!: ImageData
    #renderObserver: Observer<Scene> | null = null

    #tick(): void {
        this.#analyser.readFrequency(this.#freqBuf)
        const ctx = this.#gui.texture.getContext() as CanvasRenderingContext2D

        // Scroll the existing image one pixel to the left. Copies a w-1 × h
        // slice onto x=0 (the source starts at x=1). Browser canvas2D handles
        // overlap correctly with same-canvas drawImage.
        ctx.globalAlpha = 1
        ctx.drawImage(ctx.canvas, 1, 0, SCREEN_WIDTH_PX - 1, SCREEN_HEIGHT_PX,
                                  0, 0, SCREEN_WIDTH_PX - 1, SCREEN_HEIGHT_PX)

        // Paint the new rightmost column from the current FFT. Map bin index
        // (low → high freq) to pixel Y (bottom → top of screen).
        const pixels = this.#columnData.data
        const bins = this.#freqBuf.length
        for (let y = 0; y < SCREEN_HEIGHT_PX; y++) {
            const bin = Math.floor(((SCREEN_HEIGHT_PX - 1 - y) / SCREEN_HEIGHT_PX) * bins)
            const mag = this.#freqBuf[bin] / 255
            const [r, g, b] = magnitudeToColor(mag)
            const o = y * 4
            pixels[o    ] = r
            pixels[o + 1] = g
            pixels[o + 2] = b
            pixels[o + 3] = 255
        }
        ctx.putImageData(this.#columnData, SCREEN_WIDTH_PX - 1, 0)
        this.#gui.texture.update(false)
    }
}

/**
 * Perceptual magnitude → color: dark blue (silent) → cyan → yellow → red (loud).
 * Mirrors the "viridis"/"jet"-style palette used in most audio spectograms;
 * cheap piecewise-linear interpolation, ~5 ns per pixel.
 */
function magnitudeToColor(m: number): [number, number, number] {
    const x = Math.max(0, Math.min(1, m))
    if (x < 0.25) {
        const t = x / 0.25
        return [Math.round(0 + 0   * t), Math.round(0 +   0 * t), Math.round(20 + 235 * t)]
    }
    if (x < 0.50) {
        const t = (x - 0.25) / 0.25
        return [Math.round(0 + 0   * t), Math.round(0 + 255 * t), Math.round(255 - 100 * t)]
    }
    if (x < 0.75) {
        const t = (x - 0.50) / 0.25
        return [Math.round(0 + 255 * t), Math.round(255 + 0 * t), Math.round(155 - 155 * t)]
    }
    const t = (x - 0.75) / 0.25
    return [Math.round(255), Math.round(255 - 200 * t), Math.round(0)]
}

export const SpectogramN3DFactory: Node3DFactory<SpectogramN3DGUI, Node3D> = {
    label: "Spectogram",
    description: "Scrolling time × frequency heatmap of incoming audio. Passes audio straight through.",
    tags: ["visualizer", "audio", "consumer", "spectrum", "fft", "spectogram"],
    createGUI: async (context) => {
        const gui = new SpectogramN3DGUI()
        await gui.init(context)
        return gui
    },
    create: async (context, gui) => await new SpectogramN3D().init(context, gui),
}
