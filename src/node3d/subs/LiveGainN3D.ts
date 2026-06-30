import { Color3, DynamicTexture, Mesh, MeshBuilder, Observer, Scene, StandardMaterial, TransformNode } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D"
import { Node3DContext } from "../Node3DContext"
import { Node3DGUIContext } from "../Node3DGUIContext"
import { AudioAnalyser } from "../../utils/AudioAnalyser"

const PANEL_WIDTH   = 0.45
const PANEL_HEIGHT  = 0.9
const PANEL_DEPTH   = 0.05
const PORT_DIAMETER = 0.18
const PORT_OFFSET   = PANEL_WIDTH / 2 + PORT_DIAMETER
const BAR_WIDTH     = PANEL_WIDTH * 0.45
/** Bar tops out below the readout area so the dB number sits cleanly above the bar. */
const BAR_FRAME     = PANEL_HEIGHT * 0.7
const BAR_BASE_Y    = -PANEL_HEIGHT * 0.42
/** Peak indicator height (a thin slab above the current level). */
const PEAK_BAR_HEIGHT = PANEL_HEIGHT * 0.018
/** ms the peak-hold indicator stays at its last maximum before drifting down. */
const PEAK_HOLD_MS = 1100
/** Fraction of full scale per second the peak descends once HOLD elapses. */
const PEAK_DECAY_PER_SECOND = 0.4
/** One-pole smoothing time constant in ms for the displayed level bar. */
const LEVEL_SMOOTH_MS = 70

/** dBFS floor — values below this read as "-∞ dB" and the bar sits at the bottom. */
const DB_FLOOR = -60
/** Re-render the dB text only when the displayed value moves by this many tenths. Keeps canvas2D cheap. */
const DB_TEXT_REDRAW_DELTA = 0.4

const READOUT_WIDTH  = PANEL_WIDTH * 0.85
const READOUT_HEIGHT = PANEL_HEIGHT * 0.18
const READOUT_Y      = PANEL_HEIGHT * 0.34
const READOUT_TEX_W  = 256
const READOUT_TEX_H  = 64

/**
 * LiveGain GUI: an upright panel with a single vertical level bar, a
 * peak-hold slab, and a numeric dBFS readout above on a DynamicTexture.
 * The bar's emissive colour shifts green → amber → red as the level rises
 * so the meter stays readable at a glance even without looking at the
 * numbers. Sums all input channels into one bar (matches Web Audio's
 * default AnalyserNode channel mixing).
 */
export class LiveGainN3DGUI implements Node3DGUI {

    public root!: TransformNode
    public panel!: Mesh
    public audioInput!: Mesh
    public audioOutput!: Mesh
    public bar: Mesh | null = null
    public peakSlab: Mesh | null = null
    public readoutPlane: Mesh | null = null
    public readoutTexture: DynamicTexture | null = null

    public get worldSize(): number { return 1.6 }

    public async init(context: Node3DGUIContext): Promise<void> {
        const scene = context.scene
        this.root = new TransformNode("livegain root", scene)

        this.#buildPanel(scene)
        this.bar      = this.#buildBar(scene)
        this.peakSlab = this.#buildPeakSlab(scene)
        this.#buildReadout(scene)
        this.audioInput  = this.#buildPort(scene, "in",  -PORT_OFFSET)
        this.audioOutput = this.#buildPort(scene, "out", +PORT_OFFSET)
    }

    public async dispose(): Promise<void> {
        // Defensive: only dispose what was actually allocated. The thumbnail
        // renderer calls gui.dispose() after rendering, and a partial init
        // (or a future GUI subset) must not throw here — that would reject
        // the whole shop-menu Promise.all and silently break item clicks.
        this.readoutTexture?.dispose()
        this.readoutTexture = null
        this.readoutPlane   = null
        this.bar            = null
        this.peakSlab       = null
    }

    #buildPanel(scene: Scene): void {
        this.panel = MeshBuilder.CreateBox("livegain panel",
            { width: PANEL_WIDTH, height: PANEL_HEIGHT, depth: PANEL_DEPTH }, scene)
        const mat = new StandardMaterial("livegain panel mat", scene)
        mat.diffuseColor  = new Color3(0.06, 0.06, 0.08)
        mat.emissiveColor = new Color3(0.02, 0.02, 0.03)
        this.panel.material = mat
        this.panel.parent = this.root
    }

    #buildBar(scene: Scene): Mesh {
        // Unit-height bar parented to the root so scaling.y maps directly to
        // a fraction of BAR_FRAME via the tick logic.
        const bar = MeshBuilder.CreateBox("livegain bar",
            { width: BAR_WIDTH, height: 1, depth: PANEL_DEPTH * 0.6 }, scene)
        const mat = new StandardMaterial("livegain bar mat", scene)
        mat.diffuseColor    = Color3.Black()
        mat.emissiveColor   = new Color3(0.1, 1.0, 0.3)
        mat.specularColor   = Color3.Black()
        mat.disableLighting = true
        bar.material = mat
        bar.parent   = this.root
        bar.position.z = -PANEL_DEPTH * 0.5
        bar.scaling.y  = 0.001
        bar.position.y = BAR_BASE_Y
        return bar
    }

    #buildPeakSlab(scene: Scene): Mesh {
        const slab = MeshBuilder.CreateBox("livegain peak slab",
            { width: BAR_WIDTH, height: PEAK_BAR_HEIGHT, depth: PANEL_DEPTH * 0.6 }, scene)
        const mat = new StandardMaterial("livegain peak slab mat", scene)
        mat.diffuseColor    = Color3.Black()
        mat.emissiveColor   = new Color3(1, 1, 1)
        mat.specularColor   = Color3.Black()
        mat.disableLighting = true
        slab.material = mat
        slab.parent   = this.root
        slab.position.z = -PANEL_DEPTH * 0.5
        slab.position.y = BAR_BASE_Y
        return slab
    }

    #buildReadout(scene: Scene): void {
        const plane = MeshBuilder.CreatePlane("livegain readout",
            { width: READOUT_WIDTH, height: READOUT_HEIGHT }, scene)
        const tex = new DynamicTexture("livegain readout texture",
            { width: READOUT_TEX_W, height: READOUT_TEX_H }, scene, false)
        tex.hasAlpha = false
        const mat = new StandardMaterial("livegain readout mat", scene)
        mat.emissiveTexture = tex
        mat.diffuseColor    = Color3.Black()
        mat.specularColor   = Color3.Black()
        mat.disableLighting = true
        plane.material = mat
        plane.parent   = this.root
        plane.position.y = READOUT_Y
        plane.position.z = -PANEL_DEPTH * 0.51

        // Paint a neutral background once at construction so the panel doesn't
        // briefly show a transparent plane before the first audio tick.
        const ctx = tex.getContext() as CanvasRenderingContext2D
        ctx.fillStyle = "rgb(10, 12, 18)"
        ctx.fillRect(0, 0, READOUT_TEX_W, READOUT_TEX_H)
        tex.update(true)

        this.readoutPlane   = plane
        this.readoutTexture = tex
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
 * bar (smoothed RMS), the peak-hold slab (true peak with hold + decay), and
 * the numeric dBFS readout (peak converted via 20·log10).
 *
 * Reads raw time-domain samples — no visualization gain, no clamp at 1 — so
 * the meter is a true dBFS reading: 0 dBFS = full digital scale, −∞ dB =
 * silent. Bar position is dB-scaled so visible movement matches perceived
 * loudness changes.
 */
export class LiveGainN3D implements Node3D {

    public async init(context: Node3DContext, gui: LiveGainN3DGUI): Promise<this> {
        const { tools: { AudioN3DConnectable }, audioCtx } = context
        this.#gui = gui

        const passthrough = audioCtx.createGain()
        this.#passthrough = passthrough
        this.#analyser = new AudioAnalyser(audioCtx, 512)
        this.#analyser.tap(passthrough)
        this.#timeBuf = new Uint8Array(this.#analyser.raw.fftSize)

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
        this.#analyser?.dispose()
        try { this.#passthrough?.disconnect() } catch { /* ignore */ }
    }

    #gui!: LiveGainN3DGUI
    #passthrough: GainNode | null = null
    #analyser: AudioAnalyser | null = null
    #timeBuf: Uint8Array<ArrayBuffer> | null = null
    #renderObserver: Observer<Scene> | null = null
    #lastTick = 0
    /** Smoothed RMS amplitude in [0, 1] — drives the bar. */
    #rms = 0
    /** Peak amplitude in [0, 1] with hold + slow decay — drives the slab and dB readout. */
    #peak = 0
    #peakLastUpdated = 0
    #lastReadoutDb = NaN

    #tick(): void {
        const analyser = this.#analyser
        const buf = this.#timeBuf
        if (analyser === null || buf === null) return

        const now = performance.now()
        const dt = Math.max(0, (now - this.#lastTick) / 1000)
        this.#lastTick = now

        analyser.readTime(buf)
        const { rms: instRms, peak: instPeak } = analyzeTimeBuffer(buf)

        // One-pole smoothing for the displayed bar so it doesn't flicker.
        const alpha = 1 - Math.exp(-dt * 1000 / LEVEL_SMOOTH_MS)
        this.#rms += alpha * (instRms - this.#rms)

        // Peak hold: snap upward instantly, decay slowly after a hold window.
        if (instPeak > this.#peak) {
            this.#peak = instPeak
            this.#peakLastUpdated = now
        } else if ((now - this.#peakLastUpdated) > PEAK_HOLD_MS) {
            this.#peak = Math.max(this.#rms, this.#peak - PEAK_DECAY_PER_SECOND * dt)
        }

        // Bar / slab positions are dB-scaled rather than linear so visible
        // movement matches perceived loudness changes (a -6 dB drop reads as
        // ~half the bar, like a hardware VU).
        const barFrac  = amplitudeToFraction(this.#rms)
        const peakFrac = amplitudeToFraction(this.#peak)

        const bar = this.#gui.bar
        if (bar !== null) {
            const barH = Math.max(0.001, barFrac * BAR_FRAME)
            bar.scaling.y  = barH
            bar.position.y = BAR_BASE_Y + barH / 2
            ;(bar.material as StandardMaterial).emissiveColor = levelToColor(barFrac)
        }

        const slab = this.#gui.peakSlab
        if (slab !== null) {
            slab.position.y = BAR_BASE_Y + peakFrac * BAR_FRAME
            ;(slab.material as StandardMaterial).emissiveColor = levelToColor(peakFrac)
        }

        const peakDb = amplitudeToDb(this.#peak)
        if (this.#shouldRedrawReadout(peakDb)) {
            this.#paintReadout(peakDb)
            this.#lastReadoutDb = peakDb
        }
    }

    #shouldRedrawReadout(db: number): boolean {
        if (Number.isNaN(this.#lastReadoutDb)) return true
        // Cross the "below floor" boundary in either direction so the "-∞" /
        // first-finite transition shows immediately.
        const wasFloor = !Number.isFinite(this.#lastReadoutDb) || this.#lastReadoutDb <= DB_FLOOR
        const isFloor  = !Number.isFinite(db) || db <= DB_FLOOR
        if (wasFloor !== isFloor) return true
        if (isFloor) return false
        return Math.abs(db - this.#lastReadoutDb) >= DB_TEXT_REDRAW_DELTA
    }

    #paintReadout(db: number): void {
        const tex = this.#gui.readoutTexture
        if (tex === null) return
        const ctx = tex.getContext() as CanvasRenderingContext2D
        ctx.fillStyle = "rgb(10, 12, 18)"
        ctx.fillRect(0, 0, READOUT_TEX_W, READOUT_TEX_H)
        ctx.font = "bold 38px ui-monospace, Menlo, monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillStyle = dbToTextColor(db)
        ctx.fillText(formatDb(db), READOUT_TEX_W / 2, READOUT_TEX_H / 2 + 2)
        tex.update(true)
    }
}

function amplitudeToDb(amp: number): number {
    if (amp <= 0) return -Infinity
    return 20 * Math.log10(amp)
}

/** Map raw amplitude to bar fraction in [0, 1] via dBFS: DB_FLOOR → 0, 0 dB → 1. */
function amplitudeToFraction(amp: number): number {
    if (amp <= 0) return 0
    const db = 20 * Math.log10(amp)
    if (db <= DB_FLOOR) return 0
    if (db >= 0) return 1
    return (db - DB_FLOOR) / -DB_FLOOR
}

/** Single linear pass over the time-domain buffer: RMS + peak abs amplitude. */
function analyzeTimeBuffer(buf: Uint8Array<ArrayBuffer>): { rms: number, peak: number } {
    let sumSq = 0
    let peakAbs = 0
    for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sumSq += v * v
        const a = v < 0 ? -v : v
        if (a > peakAbs) peakAbs = a
    }
    return { rms: Math.sqrt(sumSq / buf.length), peak: peakAbs }
}

function formatDb(db: number): string {
    if (!Number.isFinite(db) || db <= DB_FLOOR) return "-∞ dB"
    if (db >= 0) return `+${db.toFixed(1)} dB`
    return `${db.toFixed(1)} dB`
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

/** Readout text colour: echoes the bar colour at the equivalent dB-mapped fraction. */
function dbToTextColor(db: number): string {
    if (!Number.isFinite(db) || db <= DB_FLOOR) return "rgb(120, 130, 140)"
    if (db >= 0) return "rgb(255, 60, 60)"
    const frac = (db - DB_FLOOR) / -DB_FLOOR
    const c = levelToColor(frac)
    return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`
}

export const LiveGainN3DFactory: Node3DFactory<LiveGainN3DGUI, Node3D> = {
    label: "Live Gain",
    description: "Vertical level meter with peak-hold and dBFS readout. Audio passes through unchanged.",
    tags: ["visualizer", "audio", "meter", "vu", "gain", "db"],
    createGUI: async (context) => {
        const gui = new LiveGainN3DGUI()
        await gui.init(context)
        return gui
    },
    create: async (context, gui) => await new LiveGainN3D().init(context, gui),
}
