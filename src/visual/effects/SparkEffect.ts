import { Color3, Color4, DynamicTexture, ParticleSystem, Scene, Vector3 } from "@babylonjs/core"
import { AudioSignal, Effect } from "./Effect"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

export interface SparkParams {
    maxParticles?: number  // default 80
    maxEmitRate?: number   // default 60 — scaled by signal.strength at runtime
    minSize?: number       // default 0.005
    maxSize?: number       // default 0.015
    minLifeTime?: number   // default 0.2
    maxLifeTime?: number   // default 0.5
}

export class SparkEffect implements Effect {
    private _ps: ParticleSystem
    private readonly _maxEmitRate: number

    private static _textureByScene = new WeakMap<Scene, DynamicTexture>()

    private static getTexture(scene: Scene): DynamicTexture {
        if (!SparkEffect._textureByScene.has(scene)) {
            const size = 32
            const tex = new DynamicTexture("spark_particle_tex", { width: size, height: size }, scene, false)
            const ctx = tex.getContext()
            const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
            grad.addColorStop(0, "rgba(255,255,255,1)")
            grad.addColorStop(1, "rgba(255,255,255,0)")
            ctx.fillStyle = grad
            ctx.fillRect(0, 0, size, size)
            tex.update()
            SparkEffect._textureByScene.set(scene, tex)
        }
        return SparkEffect._textureByScene.get(scene)!
    }

    constructor(ctx: EffectContext, params: SparkParams = {}) {
        const { primaryMesh: tube, scene } = ctx
        const {
            maxParticles = 80,
            maxEmitRate = 60,
            minSize = 0.005,
            maxSize = 0.015,
            minLifeTime = 0.2,
            maxLifeTime = 0.5,
        } = params
        this._maxEmitRate = maxEmitRate

        const ps = this._ps = new ParticleSystem("sparks", maxParticles, scene)
        ps.particleTexture = SparkEffect.getTexture(scene)
        ps.emitter = tube

        ps.minEmitBox = new Vector3(-0.01, -0.5, -0.01)
        ps.maxEmitBox = new Vector3(0.01, 0.5, 0.01)

        ps.color1 = new Color4(1, 0.9, 0.3, 1)
        ps.color2 = new Color4(1, 0.4, 0.1, 1)
        ps.colorDead = new Color4(0.2, 0.05, 0, 0)

        ps.minSize = minSize
        ps.maxSize = maxSize
        ps.minLifeTime = minLifeTime
        ps.maxLifeTime = maxLifeTime

        ps.emitRate = 0
        ps.minEmitPower = 0.3
        ps.maxEmitPower = 1.5
        ps.updateSpeed = 0.02
        ps.gravity = new Vector3(0, -1.5, 0)
        ps.direction1 = new Vector3(-1, 1, -1)
        ps.direction2 = new Vector3(1, 2, 1)

        ps.start()
    }

    update(signal: AudioSignal) {
        const c = Color3.FromHSV(signal.tone * 360, 1, 1)
        this._ps.color1 = c.toColor4(1)
        this._ps.color2 = c.scale(0.6).toColor4(0.8)
        this._ps.colorDead = c.scale(0.1).toColor4(0)
        this._ps.emitRate = signal.strength * this._maxEmitRate
    }

    stop() {
        this._ps.emitRate = 0
    }

    dispose() {
        this._ps.dispose()
        // Shared texture is intentionally not disposed here
    }
}

EffectRegistry.register<SparkParams>('spark', (ctx, p) => new SparkEffect(ctx, p))
