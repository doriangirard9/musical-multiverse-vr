import { AudioFeature, AudioSignal, Effect, readFeature } from "./Effect"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

/**
 * Construction parameters for an audio-reactive scale pulse.
 * Maps the chosen {@link AudioScaleParams.source} feature to a mesh scale
 * between {@link AudioScaleParams.baseScale} and {@link AudioScaleParams.peakScale},
 * with separate attack and release time constants so transients punch in
 * quickly and decay smoothly.
 */
export interface AudioScaleParams {
    /**
     * Which feature drives the scale. Default 'strength'.
     * - 'bass' for a kick-driven thump
     * - 'treble' for a hi-hat sparkle
     * - 'flux'  for onset-locked pops
     * - 'peak'  for transient-sensitive RMS alternative
     */
    source?: AudioFeature
    /** Resting scale when the signal is silent. Default 1. */
    baseScale?: number
    /** Scale reached when the smoothed level saturates to 1. */
    peakScale: number
    /** Smoothing time constant for growth, ms. Default 30. */
    attack?: number
    /** Smoothing time constant for decay, ms. Default 260. */
    release?: number
    /** Noise floor below which the source feature reads as silence. Default 0.01. */
    threshold?: number
    /**
     * Auto-normalize against a decaying recent peak so the effect uses its full
     * range regardless of source loudness. Default true. Disable for raw
     * absolute-amplitude response.
     */
    autoNormalize?: boolean
    /** Half-life in ms for the running peak when autoNormalize is on. Default 1800. */
    peakHalfLife?: number
    /**
     * Manual gain applied after threshold subtraction. Ignored when
     * autoNormalize is on. Default 1.
     */
    gain?: number
    /** Easing curve. 'linear' tracks level; 'pow2' emphasizes peaks. Default 'linear'. */
    response?: 'linear' | 'pow2'
}

/**
 * Audio-reactive scaling. Reads {@link AudioSignal.strength} each tick and
 * eases the mesh scale toward `baseScale + (peakScale - baseScale) * level`.
 *
 * Auto-normalization tracks a decaying running peak so quiet sources still
 * cover the full visual range. A one-pole smoother with asymmetric attack and
 * release gives a punchy boom-and-decay feel.
 *
 * Freezes at `baseScale` while the target is being pointed at so it never
 * disrupts interaction.
 */
export class AudioScaleEffect implements Effect {

    public constructor(ctx: EffectContext, params: AudioScaleParams) {
        this.#ctx = ctx
        this.#source = params.source ?? 'strength'
        this.#base = params.baseScale ?? 1
        this.#peak = params.peakScale
        this.#attack = Math.max(1, params.attack ?? 30)
        this.#release = Math.max(1, params.release ?? 260)
        this.#threshold = params.threshold ?? 0.01
        this.#autoNormalize = params.autoNormalize ?? true
        this.#peakDecayTau = Math.max(1, params.peakHalfLife ?? 1800) / Math.LN2
        this.#gain = params.gain ?? 1
        this.#response = params.response ?? 'linear'
        this.#level = 0
        this.#runningPeak = this.#peakFloor
        this.#lastTick = performance.now()
    }

    public update(signal: AudioSignal): void {
        const now = performance.now()
        const dt = Math.max(0, now - this.#lastTick)
        this.#lastTick = now

        if (signal.pointed === true) {
            this.#level = 0
            this.#ctx.primaryMesh.scaling.setAll(this.#base)
            return
        }

        const raw = readFeature(signal, this.#source)
        const above = Math.max(0, raw - this.#threshold)

        let target: number
        if (this.#autoNormalize === true) {
            const decay = Math.exp(-dt / this.#peakDecayTau)
            this.#runningPeak = Math.max(this.#runningPeak * decay, above, this.#peakFloor)
            target = above / this.#runningPeak
        } else {
            target = Math.min(1, above * this.#gain)
        }

        if (this.#response === 'pow2') target = target * target

        const tau = target > this.#level ? this.#attack : this.#release
        const alpha = 1 - Math.exp(-dt / tau)
        this.#level += alpha * (target - this.#level)

        const scale = this.#base + (this.#peak - this.#base) * this.#level
        this.#ctx.primaryMesh.scaling.setAll(scale)
    }

    public stop(): void {
        this.#level = 0
        this.#runningPeak = this.#peakFloor
        this.#ctx.primaryMesh.scaling.setAll(this.#base)
    }

    public dispose(): void {
        this.stop()
    }

    #ctx: EffectContext
    #source: AudioFeature
    #base: number
    #peak: number
    #attack: number
    #release: number
    #threshold: number
    #autoNormalize: boolean
    #peakDecayTau: number
    #gain: number
    #response: 'linear' | 'pow2'
    #level: number
    #runningPeak: number
    #lastTick: number
    readonly #peakFloor = 0.05
}

EffectRegistry.register<AudioScaleParams>('audio_scale', (ctx, p) => new AudioScaleEffect(ctx, p))
