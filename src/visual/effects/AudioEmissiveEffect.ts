import { Color3, Material, Nullable, PBRMaterial, StandardMaterial } from "@babylonjs/core"
import { AudioFeature, AudioSignal, Effect, readFeature } from "./Effect"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

/**
 * Sustained emissive breathing. Modulates the primary mesh's material emissive
 * color between {@link AudioEmissiveParams.floor} and {@link AudioEmissiveParams.intensity}
 * scaled by a smoothed read of the chosen feature. Cheap (no new mesh, no new
 * material, no extra render pass) and runs continuously — designed to make
 * nodes feel alive during sustained passages where transient effects stay quiet.
 */
export interface AudioEmissiveParams {
    /** Feature driving the emissive amount. Default 'strength'. */
    source?: AudioFeature
    /** Tint of the emissive contribution. Default white. */
    tint?: { r: number, g: number, b: number }
    /** Brightness at source = 0, in [0, 1]. Default 0.05. */
    floor?: number
    /** Brightness at source = 1, in [0, 1]+. Default 0.6. */
    intensity?: number
    /** Smoothing time constant when growing, ms. Default 60. */
    attack?: number
    /** Smoothing time constant when decaying, ms. Default 320. */
    release?: number
}

export class AudioEmissiveEffect implements Effect {

    public constructor(ctx: EffectContext, params: AudioEmissiveParams) {
        this.#ctx = ctx
        this.#source = params.source ?? 'strength'
        const tint = params.tint ?? { r: 1, g: 1, b: 1 }
        this.#tint = new Color3(tint.r, tint.g, tint.b)
        this.#floor = params.floor ?? 0.05
        this.#intensity = params.intensity ?? 0.6
        this.#attack = Math.max(1, params.attack ?? 60)
        this.#release = Math.max(1, params.release ?? 320)
        this.#level = 0
        this.#lastTick = performance.now()

        // If the mesh has no material yet, attach a minimal StandardMaterial we
        // own — emissive can't be modulated through a null material. Track
        // ownership so we restore the original on dispose.
        this.#previousMaterial = ctx.primaryMesh.material
        if (this.#previousMaterial === null) {
            const owned = new StandardMaterial(`audio_emissive_${ctx.primaryMesh.name}`, ctx.scene)
            owned.diffuseColor = Color3.Black()
            owned.specularColor = Color3.Black()
            owned.alpha = ctx.primaryMesh.visibility
            ctx.primaryMesh.material = owned
            this.#ownedMaterial = owned
        }
        this.#prevEmissive = this.#readEmissive()
        this.#applyEmissive(this.#floor)
    }

    public update(signal: AudioSignal): void {
        const now = performance.now()
        const dt = Math.max(0, now - this.#lastTick)
        this.#lastTick = now

        const target = readFeature(signal, this.#source)
        const tau = target > this.#level ? this.#attack : this.#release
        const alpha = 1 - Math.exp(-dt / tau)
        this.#level += alpha * (target - this.#level)

        const amount = this.#floor + (this.#intensity - this.#floor) * this.#level
        this.#applyEmissive(amount)
    }

    public stop(): void {
        this.#level = 0
        this.#applyEmissive(this.#floor)
    }

    public dispose(): void {
        if (this.#prevEmissive !== null) this.#applyEmissive(0, this.#prevEmissive)
        if (this.#ownedMaterial !== null) {
            if (this.#ctx.primaryMesh.material === this.#ownedMaterial) {
                this.#ctx.primaryMesh.material = this.#previousMaterial
            }
            this.#ownedMaterial.dispose()
            this.#ownedMaterial = null
        }
    }

    #ctx: EffectContext
    #source: AudioFeature
    #tint: Color3
    #floor: number
    #intensity: number
    #attack: number
    #release: number
    #level: number
    #lastTick: number
    #prevEmissive: Color3 | null
    #previousMaterial: Nullable<Material>
    #ownedMaterial: StandardMaterial | null = null

    #readEmissive(): Color3 | null {
        const mat = this.#ctx.primaryMesh.material
        if (mat instanceof StandardMaterial) return mat.emissiveColor.clone()
        if (mat instanceof PBRMaterial) return mat.emissiveColor.clone()
        return null
    }

    #applyEmissive(amount: number, override?: Color3): void {
        const mat = this.#ctx.primaryMesh.material
        const color = override ?? this.#tint.scale(amount)
        if (mat instanceof StandardMaterial) mat.emissiveColor = color
        else if (mat instanceof PBRMaterial)  mat.emissiveColor = color
    }
}

EffectRegistry.register<AudioEmissiveParams>('audio_emissive', (ctx, p) => new AudioEmissiveEffect(ctx, p))
