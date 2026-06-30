import { Color3, Material, MaterialPluginBase, Nullable, PBRMaterial } from "@babylonjs/core"
import { AudioFeature, AudioSignal, Effect, readFeature } from "./Effect"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

export type PBRWaveMode = 'forward' | 'converging'

export interface PBRWaveParams {
    speed?: number
    waveFreq?: number
    sharpness?: number
    floor?: number
    tint?: { r: number, g: number, b: number }
    metallic?: number
    roughness?: number
    /**
     * 'forward'    → wave travels from y=0 (output) to y=1 (input).
     * 'converging' → two waves travel from both ends toward the midpoint;
     *                used for bidirectional tubes where neither end is "the source".
     */
    mode?: PBRWaveMode
    /**
     * Audio feature that modulates wave speed and brightness floor.
     * Default 'strength'. Set to 'bass' for kick-pumping cables.
     */
    source?: AudioFeature
    /**
     * How much the source feature accelerates the wave. Final speed multiplier
     * is `1 + reactivity * source`. 0 = fully self-driven (legacy). Default 2.5.
     */
    reactivity?: number
    /**
     * Maximum boost added to `floor` when source saturates to 1. Brightens the
     * cable during loud passages. Default 0.35.
     */
    floorBoost?: number
    /**
     * One-pole smoothing time constant in ms applied to the source value before
     * it feeds speed/floor. Prevents jittery cables on noisy signals. Default 90.
     */
    smoothing?: number
    /**
     * If set, sample this feature each frame and shift the wave tint through
     * the hueLow→hueHigh range. Cables paint themselves by the harmonic content
     * flowing through them — bass-heavy material reads warm, brightness cool.
     */
    tintSource?: AudioFeature
    /** HSV hue at tintSource = 0. Default 30 (warm). */
    hueLow?: number
    /** HSV hue at tintSource = 1. Default 220 (cool). */
    hueHigh?: number
    /**
     * Feature whose value adds to the wave's sharpness (peakiness). Transients
     * make the wave "snap" while sustained material stays smooth. Default 'flux'.
     */
    sharpnessSource?: AudioFeature
    /** Maximum sharpness boost added on top of `sharpness` when source = 1. Default 4. */
    sharpnessReactivity?: number
}

class WavePlugin extends MaterialPluginBase {
    private _enabled = false

    time = 0
    waveFreq = 6
    sharpness = 4
    floor = 0.05
    tintR = 0.55
    tintG = 0.78
    tintB = 1.0
    converging = 0   // 0 = forward, 1 = converging — passed as float for cheap shader branch

    constructor(material: PBRMaterial) {
        super(material, "WavePlugin", 200, { WAVE_PLUGIN: false })
    }

    get isEnabled() { return this._enabled }
    set isEnabled(v: boolean) {
        if (this._enabled === v) return
        this._enabled = v
        this.markAllDefinesAsDirty()
        this._enable(v)
    }

    prepareDefines(defines: any) {
        defines["WAVE_PLUGIN"] = this._enabled
    }

    getClassName() { return "WavePlugin" }

    getUniforms() {
        return {
            ubo: [
                { name: "wpTime",       size: 1, type: "float" },
                { name: "wpWaveFreq",   size: 1, type: "float" },
                { name: "wpSharpness",  size: 1, type: "float" },
                { name: "wpFloor",      size: 1, type: "float" },
                { name: "wpTint",       size: 3, type: "vec3"  },
                { name: "wpConverging", size: 1, type: "float" },
            ],
            fragment: `
                #ifdef WAVE_PLUGIN
                uniform float wpTime;
                uniform float wpWaveFreq;
                uniform float wpSharpness;
                uniform float wpFloor;
                uniform vec3  wpTint;
                uniform float wpConverging;
                #endif
            `,
        }
    }

    bindForSubMesh(uniformBuffer: any) {
        if (!this._enabled) return
        uniformBuffer.updateFloat("wpTime",       this.time)
        uniformBuffer.updateFloat("wpWaveFreq",   this.waveFreq)
        uniformBuffer.updateFloat("wpSharpness",  this.sharpness)
        uniformBuffer.updateFloat("wpFloor",      this.floor)
        uniformBuffer.updateFloat3("wpTint",      this.tintR, this.tintG, this.tintB)
        uniformBuffer.updateFloat("wpConverging", this.converging)
    }

    getCustomCode(shaderType: string): Nullable<Record<string, string>> {
        if (shaderType === "vertex") {
            return {
                CUSTOM_VERTEX_DEFINITIONS: `
                    #ifdef WAVE_PLUGIN
                    varying float vWpY;
                    #endif
                `,
                CUSTOM_VERTEX_MAIN_END: `
                    #ifdef WAVE_PLUGIN
                    vWpY = position.y + 0.5;
                    #endif
                `,
            }
        }
        if (shaderType === "fragment") {
            return {
                CUSTOM_FRAGMENT_DEFINITIONS: `
                    #ifdef WAVE_PLUGIN
                    varying float vWpY;
                    #endif
                `,
                CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
                    #ifdef WAVE_PLUGIN
                    // forward: coord = vWpY (peak travels y=0 → y=1, output → input)
                    // converging: coord = 1 - 2*|y-0.5| (peaks at center, 0 at both ends —
                    //             so two peaks travel from each endpoint toward the middle)
                    float wpCoord = mix(vWpY, 1.0 - 2.0 * abs(vWpY - 0.5), wpConverging);
                    float wpSmooth = 0.5 + 0.5 * sin(wpTime - wpCoord * 3.14159 * wpWaveFreq);
                    float wpWave = pow(wpSmooth, wpSharpness);
                    float wpB = wpFloor + (1.0 - wpFloor) * wpWave;
                    finalColor.rgb += wpTint * wpB;
                    #endif
                `,
            }
        }
        return null
    }
}

export class PBRWaveEffect implements Effect {
    private _material: PBRMaterial
    private _plugin: WavePlugin
    private _previousMaterial: Nullable<Material>
    private readonly _speed: number
    private readonly _source: AudioFeature
    private readonly _reactivity: number
    private readonly _baseFloor: number
    private readonly _floorBoost: number
    private readonly _smoothingTau: number
    private readonly _tintSource: AudioFeature | undefined
    private readonly _hueLow: number
    private readonly _hueHigh: number
    private readonly _sharpnessSource: AudioFeature | undefined
    private readonly _baseSharpness: number
    private readonly _sharpnessReactivity: number
    private _smoothed = 0
    private _smoothedHue = 0
    private _smoothedSharpness = 0
    private _phase = 0
    private _lastTick = performance.now()

    constructor(private readonly ctx: EffectContext, params: PBRWaveParams = {}) {
        const {
            speed                = 700,
            waveFreq             = 6,
            sharpness            = 4,
            floor                = 0.05,
            tint                 = { r: 0.55, g: 0.78, b: 1 },
            metallic             = 0.4,
            roughness            = 0.55,
            mode                 = 'forward',
            source               = 'strength',
            reactivity           = 2.5,
            floorBoost           = 0.35,
            smoothing            = 90,
            tintSource,
            hueLow               = 30,
            hueHigh              = 220,
            sharpnessSource,
            sharpnessReactivity  = 4,
        } = params

        this._speed = speed
        this._source = source
        this._reactivity = reactivity
        this._baseFloor = floor
        this._floorBoost = floorBoost
        this._smoothingTau = Math.max(1, smoothing)
        this._tintSource = tintSource
        this._hueLow = hueLow
        this._hueHigh = hueHigh
        this._sharpnessSource = sharpnessSource
        this._baseSharpness = sharpness
        this._sharpnessReactivity = sharpnessReactivity
        this._previousMaterial = ctx.primaryMesh.material

        const base = ctx.getColor()
        this._material = new PBRMaterial(`pbr_wave_${ctx.primaryMesh.name}`, ctx.scene)
        this._material.albedoColor = new Color3(base.r, base.g, base.b)
        this._material.metallic    = metallic
        this._material.roughness   = roughness

        this._plugin = new WavePlugin(this._material)
        this._plugin.waveFreq   = waveFreq
        this._plugin.sharpness  = sharpness
        this._plugin.floor      = floor
        this._plugin.tintR      = tint.r
        this._plugin.tintG      = tint.g
        this._plugin.tintB      = tint.b
        this._plugin.converging = mode === 'converging' ? 1 : 0
        this._plugin.isEnabled  = true   // triggers shader recompile with our injection

        ctx.primaryMesh.material = this._material
    }

    update(signal: AudioSignal) {
        const now = performance.now()
        const dt = Math.max(0, now - this._lastTick)
        this._lastTick = now

        const raw = readFeature(signal, this._source)
        const alpha = 1 - Math.exp(-dt / this._smoothingTau)
        this._smoothed += alpha * (raw - this._smoothed)

        const speedMul = 1 + this._reactivity * this._smoothed
        this._phase += (dt / this._speed) * speedMul
        this._plugin.time = this._phase
        this._plugin.floor = this._baseFloor + this._floorBoost * this._smoothed

        if (this._tintSource !== undefined) {
            const rawHue = readFeature(signal, this._tintSource)
            this._smoothedHue += alpha * (rawHue - this._smoothedHue)
            const hue = this._hueLow + (this._hueHigh - this._hueLow) * this._smoothedHue
            const color = Color3.FromHSV(((hue % 360) + 360) % 360, 1, 1)
            this._plugin.tintR = color.r
            this._plugin.tintG = color.g
            this._plugin.tintB = color.b
        }

        if (this._sharpnessSource !== undefined) {
            const rawSharp = readFeature(signal, this._sharpnessSource)
            this._smoothedSharpness += alpha * (rawSharp - this._smoothedSharpness)
            this._plugin.sharpness = this._baseSharpness + this._sharpnessReactivity * this._smoothedSharpness
        }
    }

    stop() { }

    dispose() {
        if (this.ctx.primaryMesh.material === this._material) {
            this.ctx.primaryMesh.material = this._previousMaterial
        }
        this._material.dispose()
    }
}

EffectRegistry.register<PBRWaveParams>('pbrWave', (ctx, p) => new PBRWaveEffect(ctx, p))
