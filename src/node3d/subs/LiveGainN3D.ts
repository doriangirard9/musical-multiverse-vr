import { Color3, Mesh, MeshBuilder, Observer, Scene, StandardMaterial, TransformNode } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D"
import { Node3DContext } from "../Node3DContext"
import { Node3DGUIContext } from "../Node3DGUIContext"
import { AudioAnalyser } from "../../utils/AudioAnalyser"

const PANEL_WIDTH  = 0.45
const PANEL_HEIGHT = 0.9
const PANEL_DEPTH  = 0.05
const PORT_DIAMETER = 0.18
const PORT_OFFSET   = PANEL_WIDTH / 2 + PORT_DIAMETER
const BAR_WIDTH = PANEL_WIDTH * 0.45
const BAR_FRAME = PANEL_HEIGHT * 0.88
/** Peak indicator height (a thin slab above the current level). */
const PEAK_BAR_HEIGHT = PANEL_HEIGHT * 0.018
/** ms the peak-hold indicator stays at its last maximum before drifting down. */
const PEAK_HOLD_MS = 1100
/** Fraction per second the peak descends once HOLD elapses. */
const PEAK_DECAY_PER_SECOND = 0.4
/** Per-channel smoothing time constant in ms for the level bar (one-pole). */
const LEVEL_SMOOTH_MS = 70

/**
 * LiveGain GUI: a small upright panel with a vertical level bar plus a
 * peak-hold slab. Low levels read green, mids amber, top red — same look as
 * a hardware VU meter. Audio passes through unchanged.
 */
export class LiveGainN3DGUI implements Node3DGUI {

    public root!: TransformNode
    public panel!: Mesh
    public audioInput!: Mesh
    public audioOutput!: Mesh
    public bar!: Mesh
    public peakSlab!: Mesh

    public get worldSize(): number { return 1.6 }

    public async init(context: Node3DGUIContext): Promise<void> {
        const scene = context.scene
        this.root = new TransformNode("livegain root", scene)

        this.#buildPanel(scene)
        this.#buildBar(scene)
        this.#buildPeakSlab(scene)
        this.audioInput  = this.#buildPort(scene, "in",  -PORT_OFFSET)
        this.audioOutput = this.#buildPort(scene, "out", +PORT_OFFSET)
    }

    public async dispose(): Promise<void> { /* meshes torn down by parent disposal */ }

    #buildPanel(scene: Scene): void {
        this.panel = MeshBuilder.CreateBox("livegain panel",
            { width: PANEL_WIDTH, height: PANEL_HEIGHT, depth: PANEL_DEPTH }, scene)
        const mat = new StandardMaterial("livegain panel mat", scene)
        mat.diffuseColor  = new Color3(0.06, 0.06, 0.08)
        mat.emissiveColor = new Color3(0.02, 0.02, 0.03)
        this.panel.material = mat
        this.panel.parent = this.root
    }

    #buildBar(scene: Scene): void {
        // Unit-height bar parented to the panel so scaling.y maps directly
        // to a fraction of BAR_FRAME via the tick logic below.
        this.bar = MeshBuilder.CreateBox("livegain bar",
            { width: BAR_WIDTH, height: 1, depth: PANEL_DEPTH * 0.6 }, scene)
        const mat = new StandardMaterial("livegain bar mat", scene)
        mat.diffuseColor  = Color3.Black()
        mat.emissiveColor = new Color3(0.1, 1.0, 0.3)
        mat.specularColor = Color3.Black()
        mat.disableLighting = true
        this.bar.material = mat
        this.bar.parent = this.root
        this.bar.position.z = -PANEL_DEPTH * 0.5
        this.bar.scaling.y = 0.001
        this.bar.position.y = -BAR_FRAME / 2
    }

    #buildPeakSlab(scene: Scene): void {
        this.peakSlab = MeshBuilder.CreateBox("livegain peak slab",
            { width: BAR_WIDTH, height: PEAK_BAR_HEIGHT, depth: PANEL_DEPTH * 0.6 }, scene)
        const mat = new StandardMaterial("livegain peak slab mat", scene)
        mat.diffuseColor  = Color3.Black()
        mat.emissiveColor = new Color3(1, 1, 1)
        mat.specularColor = Color3.Black()
        mat.disableLighting = true
        this.peakSlab.material = mat
        this.peakSlab.parent = this.root
        this.peakSlab.position.z = -PANEL_DEPTH * 0.5
        this.peakSlab.position.y = -BAR_FRAME / 2
    }

    #buildPort(scene: Scene, suffix: string, x: number): Mesh {
        const mesh = MeshBuilder.CreateSphere(`livegain audio ${suffix}`,
            { diameter: PORT_DIAMETER, segments: 8 }, scene)
        const mat = new StandardMaterial(`livegain port ${suffix} mat`, scene)
        mat.diffuseColor  = new Color3(0, 1, 0)
        mat.emissiveColor = new Color3(0, 0.4, 0)
        mesh.material = mat
        mesh.parent   = this.root
        mesh.position.set(x, 0, 0)
        return mesh
    }
}

/**
 * LiveGain Node3D: audio passthrough with a tapped analyser driving the level
 * bar (smoothed RMS) and the peak-hold slab (true peak with hold + decay).
 * The bar's emissive color shifts green → amber → red as the level rises so
 * the meter is readable at a glance.
 */
export class LiveGainN3D implements Node3D {

    public async init(context: Node3DContext, gui: LiveGainN3DGUI): Promise<this> {
        const { tools: { AudioN3DConnectable }, audioCtx } = context
        this.#gui = gui

        const passthrough = audioCtx.createGain()
        this.#passthrough = passthrough
        this.#analyser = new AudioAnalyser(audioCtx, 512)
        this.#analyser.tap(passthrough)

        context.addToBoundingBox(gui.panel)
        context.createConnectable(new AudioN3DConnectable.Input(
            "audioInput", [gui.audioInput], "Audio In", passthrough,
        ))
        context.createConnectable(new AudioN3DConnectable.Output(
            "audioOutput", [gui.audioOutput], "Audio Out", passthrough,
        ))

        const scene = gui.root.getScene()
        this.#lastTick = performance.now()
        this.#peakLastUpdated = this.#lastTick
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

    #gui!: LiveGainN3DGUI
    #passthrough!: GainNode
    #analyser!: AudioAnalyser
    #renderObserver: Observer<Scene> | null = null
    #lastTick = 0
    #level = 0
    #peak = 0
    #peakLastUpdated = 0

    #tick(): void {
        const now = performance.now()
        const dt = Math.max(0, (now - this.#lastTick) / 1000)
        this.#lastTick = now

        const snap = this.#analyser.snapshot()
        const inst = Math.max(0, Math.min(1, snap.strength))

        // One-pole smoothing for the displayed bar so it doesn't flicker.
        const alpha = 1 - Math.exp(-dt * 1000 / LEVEL_SMOOTH_MS)
        this.#level += alpha * (inst - this.#level)

        // Peak hold: snap upward instantly, decay slowly after a hold window.
        if (inst > this.#peak) {
            this.#peak = inst
            this.#peakLastUpdated = now
        } else if ((now - this.#peakLastUpdated) > PEAK_HOLD_MS) {
            this.#peak = Math.max(this.#level, this.#peak - PEAK_DECAY_PER_SECOND * dt)
        }

        const baseY = -BAR_FRAME / 2
        const bar = this.#gui.bar
        const barH = Math.max(0.001, this.#level * BAR_FRAME)
        bar.scaling.y = barH
        bar.position.y = baseY + barH / 2
        const color = levelToColor(this.#level)
        ;(bar.material as StandardMaterial).emissiveColor = color

        const peakY = baseY + this.#peak * BAR_FRAME
        const peakSlab = this.#gui.peakSlab
        peakSlab.position.y = peakY
        ;(peakSlab.material as StandardMaterial).emissiveColor = levelToColor(this.#peak)
    }
}

/** Green at 0 → amber around 0.7 → red at 1. Two-segment lerp keeps it cheap. */
function levelToColor(level: number): Color3 {
    const x = Math.max(0, Math.min(1, level))
    if (x < 0.7) {
        const t = x / 0.7
        return new Color3(0.1 + 0.9 * t, 1.0, 0.3 - 0.3 * t)
    }
    const t = (x - 0.7) / 0.3
    return new Color3(1.0, 1.0 - 0.85 * t, 0)
}

export const LiveGainN3DFactory: Node3DFactory<LiveGainN3DGUI, Node3D> = {
    label: "Live Gain",
    description: "Vertical level meter with peak-hold indicator. Audio passes through unchanged.",
    tags: ["visualizer", "audio", "meter", "vu", "gain"],
    createGUI: async (context) => {
        const gui = new LiveGainN3DGUI()
        await gui.init(context)
        return gui
    },
    create: async (context, gui) => await new LiveGainN3D().init(context, gui),
}
