import { Color3, DynamicTexture, Mesh, MeshBuilder, Observer, Scene, StandardMaterial, TransformNode } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D"
import { Node3DContext } from "../Node3DContext"
import { Node3DGUIContext } from "../Node3DGUIContext"
import { AudioAnalyser } from "../../utils/AudioAnalyser"

const PANEL_WIDTH  = 1.2
const PANEL_HEIGHT = 0.6
const PANEL_DEPTH  = 0.05
const PORT_DIAMETER = 0.18
const PORT_OFFSET   = PANEL_WIDTH / 2 + PORT_DIAMETER
const SCREEN_WIDTH_PX  = 512
const SCREEN_HEIGHT_PX = 256
/** FFT size that drives the analyser's time-domain buffer. Larger = more samples drawn per frame. */
const FFT_SIZE = 1024
/** ms of phosphor afterglow — older waveforms fade out under the new one for a CRT-style trail. */
const TRAIL_FADE_PER_SECOND = 6
const TRACE_COLOR = "rgb(150, 255, 110)"
const TRACE_BG    = "rgb(6, 14, 8)"
const GRID_COLOR  = "rgba(60, 110, 70, 0.45)"

/**
 * Oscilloscope GUI: a flat panel whose front face is a DynamicTexture that
 * draws the live audio waveform (time-domain). Green phosphor look with a
 * subtle grid and a soft afterglow trail.
 */
export class OscilloscopeN3DGUI implements Node3DGUI {

    public root!: TransformNode
    public panel!: Mesh
    public audioInput!: Mesh
    public audioOutput!: Mesh
    public texture!: DynamicTexture

    public get worldSize(): number { return 2 }

    public async init(context: Node3DGUIContext): Promise<void> {
        const scene = context.scene
        this.root = new TransformNode("oscilloscope root", scene)

        this.#buildPanel(scene)
        this.audioInput  = this.#buildPort(scene, "in",  -PORT_OFFSET)
        this.audioOutput = this.#buildPort(scene, "out", +PORT_OFFSET)
    }

    public async dispose(): Promise<void> {
        this.texture.dispose()
    }

    #buildPanel(scene: Scene): void {
        this.panel = MeshBuilder.CreateBox("oscilloscope panel",
            { width: PANEL_WIDTH, height: PANEL_HEIGHT, depth: PANEL_DEPTH }, scene)
        this.panel.parent = this.root

        this.texture = new DynamicTexture("oscilloscope screen",
            { width: SCREEN_WIDTH_PX, height: SCREEN_HEIGHT_PX }, scene, false)
        const ctx = this.texture.getContext() as CanvasRenderingContext2D
        ctx.fillStyle = TRACE_BG
        ctx.fillRect(0, 0, SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX)
        this.texture.update(false)

        const mat = new StandardMaterial("oscilloscope screen mat", scene)
        mat.emissiveTexture = this.texture
        mat.diffuseColor    = Color3.Black()
        mat.specularColor   = Color3.Black()
        mat.disableLighting = true
        this.panel.material = mat
    }

    #buildPort(scene: Scene, suffix: string, x: number): Mesh {
        const mesh = MeshBuilder.CreateSphere(`oscilloscope audio ${suffix}`,
            { diameter: PORT_DIAMETER, segments: 8 }, scene)
        const mat = new StandardMaterial(`oscilloscope port ${suffix} mat`, scene)
        mat.diffuseColor  = new Color3(0, 1, 0)
        mat.emissiveColor = new Color3(0, 0.4, 0)
        mesh.material = mat
        mesh.parent   = this.root
        mesh.position.set(x, 0, 0)
        return mesh
    }
}

/**
 * Oscilloscope Node3D: passes audio straight through while drawing its
 * time-domain waveform onto the panel's screen texture. Tagged as a
 * visualizer; downstream nodes can chain past its output.
 */
export class OscilloscopeN3D implements Node3D {

    public async init(context: Node3DContext, gui: OscilloscopeN3DGUI): Promise<this> {
        const { tools: { AudioN3DConnectable }, audioCtx } = context
        this.#gui = gui

        const passthrough = audioCtx.createGain()
        this.#passthrough = passthrough
        this.#analyser = new AudioAnalyser(audioCtx, FFT_SIZE)
        this.#analyser.tap(passthrough)
        this.#timeBuf = new Uint8Array(this.#analyser.raw.fftSize)

        context.addToBoundingBox(gui.panel)
        context.createConnectable(new AudioN3DConnectable.Input(
            "audioInput", [gui.audioInput], "Audio In", passthrough,
        ))
        context.createConnectable(new AudioN3DConnectable.Output(
            "audioOutput", [gui.audioOutput], "Audio Out", passthrough,
        ))

        // Background + grid baked once into the texture; subsequent frames
        // only darken the previous frame for trail, then draw the new trace.
        this.#paintGrid()

        const scene = gui.root.getScene()
        this.#lastTick = performance.now()
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

    #gui!: OscilloscopeN3DGUI
    #passthrough!: GainNode
    #analyser!: AudioAnalyser
    #timeBuf!: Uint8Array
    #renderObserver: Observer<Scene> | null = null
    #lastTick = 0

    #paintGrid(): void {
        const ctx = this.#gui.texture.getContext() as CanvasRenderingContext2D
        ctx.fillStyle = TRACE_BG
        ctx.fillRect(0, 0, SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX)
        ctx.strokeStyle = GRID_COLOR
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let i = 1; i < 4; i++) {
            const x = (SCREEN_WIDTH_PX * i) / 4
            ctx.moveTo(x, 0); ctx.lineTo(x, SCREEN_HEIGHT_PX)
        }
        for (let i = 1; i < 4; i++) {
            const y = (SCREEN_HEIGHT_PX * i) / 4
            ctx.moveTo(0, y); ctx.lineTo(SCREEN_WIDTH_PX, y)
        }
        ctx.stroke()
        this.#gui.texture.update(false)
    }

    #tick(): void {
        const now = performance.now()
        const dt = Math.max(0, (now - this.#lastTick) / 1000)
        this.#lastTick = now

        this.#analyser.readTime(this.#timeBuf)
        const ctx = this.#gui.texture.getContext() as CanvasRenderingContext2D

        // Phosphor fade: darken the existing pixels toward the background a
        // bit each frame, then overdraw the new trace. globalAlpha cheaper
        // than per-pixel manipulation and gives the CRT-style soft trail.
        ctx.globalAlpha = Math.min(0.95, TRAIL_FADE_PER_SECOND * dt)
        ctx.fillStyle = TRACE_BG
        ctx.fillRect(0, 0, SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX)
        ctx.globalAlpha = 1

        ctx.strokeStyle = TRACE_COLOR
        ctx.lineWidth = 2
        ctx.beginPath()
        const samples = this.#timeBuf.length
        const xStep = SCREEN_WIDTH_PX / (samples - 1)
        for (let i = 0; i < samples; i++) {
            // 0..255 sample, centered at 128. Normalize to [-1, 1] then to pixel Y.
            const v = (this.#timeBuf[i] - 128) / 128
            const x = i * xStep
            const y = SCREEN_HEIGHT_PX * 0.5 - v * SCREEN_HEIGHT_PX * 0.45
            if (i === 0) ctx.moveTo(x, y)
            else         ctx.lineTo(x, y)
        }
        ctx.stroke()
        this.#gui.texture.update(false)
    }
}

export const OscilloscopeN3DFactory: Node3DFactory<OscilloscopeN3DGUI, Node3D> = {
    label: "Oscilloscope",
    description: "Live time-domain waveform display with phosphor trail. Passes audio straight through.",
    tags: ["visualizer", "audio", "oscilloscope", "waveform"],
    createGUI: async (context) => {
        const gui = new OscilloscopeN3DGUI()
        await gui.init(context)
        return gui
    },
    create: async (context, gui) => await new OscilloscopeN3D().init(context, gui),
}
