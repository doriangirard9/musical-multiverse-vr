import {
    Color3,
    Color4,
    DynamicTexture,
    ParticleSystem,
    Scene,
    Vector3,
} from "@babylonjs/core"
import { AudioFeature, AudioSignal, Effect, readFeature } from "./Effect"
import { AudioColorParams, audioColor } from "./EffectColor"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

/**
 * Construction parameters for the spark-burst particle effect.
 *
 * On each detected onset (triggerSource crosses triggerThreshold, modulo a
 * refractory cooldown) the system emits a burst of additively-blended sparks
 * outward from the target mesh. Particle color samples the colorSource at
 * spawn so each burst reflects the harmonic content that triggered it.
 *
 * Drives a single Babylon ParticleSystem (GPU-friendly, capacity-bounded), so
 * cost stays flat regardless of how often bursts fire.
 */
export interface AudioSparkParams extends AudioColorParams {
    /** Feature whose rise triggers a burst. Default 'flux'. */
    triggerSource?: AudioFeature
    /** Minimum source value required for a burst. Default 0.25. */
    triggerThreshold?: number
    /** Minimum ms between bursts. Default 90. */
    refractory?: number
    /** Particles emitted per burst. Default 14. */
    burstCount?: number
    /** Maximum concurrent live particles. Default 120. */
    capacity?: number
    /** Smallest particle size in world units. Default 0.04. */
    minSize?: number
    /** Largest particle size in world units. Default 0.10. */
    maxSize?: number
    /** Shortest particle lifetime in seconds. Default 0.3. */
    minLifeTime?: number
    /** Longest particle lifetime in seconds. Default 0.7. */
    maxLifeTime?: number
    /** Outward speed magnitude. Default 1.6. */
    emitPower?: number
    /** Radius (world units) of the spherical emission box around the mesh center. Default 0.12. */
    emitRadius?: number
}

const SPARK_TEXTURE_CACHE = new WeakMap<Scene, DynamicTexture>()

function sparkTexture(scene: Scene): DynamicTexture {
    const cached = SPARK_TEXTURE_CACHE.get(scene)
    if (cached !== undefined) return cached
    const size = 64
    const tex = new DynamicTexture("audio_spark_tex", size, scene, false)
    tex.hasAlpha = true
    const ctx = tex.getContext() as CanvasRenderingContext2D
    ctx.clearRect(0, 0, size, size)
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0,    "rgba(255, 255, 255, 1.00)")
    grad.addColorStop(0.25, "rgba(255, 255, 255, 0.70)")
    grad.addColorStop(0.55, "rgba(255, 255, 255, 0.18)")
    grad.addColorStop(1,    "rgba(255, 255, 255, 0)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    tex.update(false)
    SPARK_TEXTURE_CACHE.set(scene, tex)
    return tex
}

/**
 * Spark-burst particle effect anchored to a target mesh. Listens to the
 * signal for transient triggers and emits short-lived outward sparks per
 * onset; particle hue is sampled from the chosen color feature at burst time
 * so each spark cluster reads as a discrete musical event.
 *
 * Suspends on pointer-over so it never visually obscures the interaction
 * target.
 */
export class AudioSparkEffect implements Effect {

    public constructor(ctx: EffectContext, params: AudioSparkParams) {
        this.#ctx = ctx
        this.#triggerSource = params.triggerSource ?? 'flux'
        this.#triggerThreshold = params.triggerThreshold ?? 0.25
        this.#refractory = Math.max(0, params.refractory ?? 90)
        this.#burstCount = Math.max(1, params.burstCount ?? 14)
        this.#colorParams = params

        const capacity = Math.max(this.#burstCount * 2, params.capacity ?? 120)
        const minSize = params.minSize ?? 0.04
        const maxSize = params.maxSize ?? 0.10
        const minLifeTime = params.minLifeTime ?? 0.3
        const maxLifeTime = params.maxLifeTime ?? 0.7
        const emitPower = params.emitPower ?? 1.6
        const emitRadius = params.emitRadius ?? 0.12

        this.#system = new ParticleSystem(`audio_spark_${ctx.primaryMesh.name}`, capacity, ctx.scene)
        this.#system.particleTexture = sparkTexture(ctx.scene)
        // Mesh emitter: position tracked automatically each frame.
        this.#system.emitter = ctx.primaryMesh
        this.#system.minEmitBox = new Vector3(-emitRadius, -emitRadius, -emitRadius)
        this.#system.maxEmitBox = new Vector3( emitRadius,  emitRadius,  emitRadius)
        this.#system.minSize = minSize
        this.#system.maxSize = maxSize
        this.#system.minLifeTime = minLifeTime
        this.#system.maxLifeTime = maxLifeTime
        this.#system.minEmitPower = emitPower * 0.6
        this.#system.maxEmitPower = emitPower * 1.4
        this.#system.direction1 = new Vector3(-1, -1, -1)
        this.#system.direction2 = new Vector3( 1,  1,  1)
        this.#system.gravity = Vector3.Zero()
        this.#system.blendMode = ParticleSystem.BLENDMODE_ADD
        this.#system.emitRate = 0
        this.#system.manualEmitCount = 0
        this.#system.color1 = new Color4(1, 1, 1, 1)
        this.#system.color2 = new Color4(1, 1, 1, 1)
        this.#system.colorDead = new Color4(0, 0, 0, 0)
        this.#system.isBillboardBased = true
        this.#system.start()

        this.#lastSpawn = -Infinity
    }

    public update(signal: AudioSignal): void {
        if (signal.pointed === true) return
        const now = performance.now()
        const trigger = readFeature(signal, this.#triggerSource)
        if (trigger < this.#triggerThreshold) return
        if ((now - this.#lastSpawn) < this.#refractory) return

        const color = audioColor(signal, this.#colorParams)
        this.#system.color1 = new Color4(color.r,        color.g,        color.b,        1)
        this.#system.color2 = new Color4(color.r * 0.55, color.g * 0.55, color.b * 0.55, 1)
        this.#system.manualEmitCount = this.#burstCount
        this.#lastSpawn = now
    }

    public stop(): void {
        this.#system.manualEmitCount = 0
    }

    public dispose(): void {
        this.#system.stop()
        this.#system.dispose()
    }

    #ctx: EffectContext
    #triggerSource: AudioFeature
    #triggerThreshold: number
    #refractory: number
    #burstCount: number
    #colorParams: AudioColorParams
    #system: ParticleSystem
    #lastSpawn: number
}

EffectRegistry.register<AudioSparkParams>('audio_spark', (ctx, p) => new AudioSparkEffect(ctx, p))
