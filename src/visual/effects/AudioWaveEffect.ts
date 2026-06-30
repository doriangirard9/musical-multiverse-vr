import { Color3, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core"
import { AudioFeature, AudioSignal, Effect, readFeature } from "./Effect"
import { AudioColorParams, audioColor } from "./EffectColor"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

/**
 * Construction parameters for the audio-reactive wave ring effect.
 * Rings spawn when the chosen {@link AudioWaveParams.source} feature crosses
 * `threshold` and also exceeds a decaying running envelope by `sensitivity`,
 * so the visual locks onto the beat instead of free-running on a clock.
 *
 * `source: 'flux'` is the recommended onset trigger; `'bass'` locks to the
 * kick; `'strength'` matches overall loudness.
 */
export interface AudioWaveParams extends AudioColorParams {
    /** Which feature triggers a ring. Default 'flux'. */
    source?: AudioFeature
    /** ms each ring lives before disposal. Default 1500. */
    lifetime?: number
    /** Ring diameter at spawn, world units. Default 0.3. */
    startDiameter?: number
    /** Ring diameter at death, world units. Default 2.0. */
    endDiameter?: number
    /** Ring band width in world units. Default 0.04. */
    thickness?: number
    /** Minimum source value before a transient can register. Default 0.15. */
    threshold?: number
    /** Ratio of instant source value to moving average required to trigger. Default 1.35. */
    sensitivity?: number
    /** Minimum ms between successive ring spawns. Default 140. */
    refractory?: number
    /** Half-life in ms of the moving-average envelope used as the reference floor. Default 320. */
    envelopeHalfLife?: number
    /** Hard cap on concurrent rings to avoid runaway under sustained loud audio. Default 16. */
    maxRings?: number
    /**
     * If set, sample this feature at spawn time and scale ring thickness by
     * `1 + thicknessReactivity * value`. Lets bass-heavy hits punch out thicker
     * rings while bright hits stay slim.
     */
    thicknessSource?: AudioFeature
    /** Multiplier applied when thicknessSource saturates to 1. Default 1.5. */
    thicknessReactivity?: number
}

interface ActiveWave {
    mesh: Mesh
    mat: StandardMaterial
    born: number
    intensity: number
}

/**
 * Outward-expanding ring sprite triggered by audio transients. Spawns one
 * ring per detected beat: a beat is registered when {@link AudioSignal.strength}
 * exceeds the running envelope by `sensitivity`, subject to a `refractory`
 * cooldown so sustained loud passages don't strobe.
 *
 * Each ring's alpha scales with the transient intensity at spawn, so quiet
 * beats produce subtle rings and loud hits produce bright ones. Spawning
 * suspends while the target is pointed at; existing rings age out normally.
 */
export class AudioWaveEffect implements Effect {

    public constructor(ctx: EffectContext, params: AudioWaveParams) {
        const {
            source              = 'flux',
            lifetime            = 1500,
            startDiameter       = 0.3,
            endDiameter         = 2.0,
            thickness           = 0.04,
            threshold           = 0.15,
            sensitivity         = 1.35,
            refractory          = 140,
            envelopeHalfLife    = 320,
            maxRings            = 16,
            thicknessSource,
            thicknessReactivity = 1.5,
        } = params
        this.#ctx = ctx
        this.#source = source
        this.#lifetime = lifetime
        this.#startD = startDiameter
        this.#endD = endDiameter
        this.#thickness = thickness
        this.#colorParams = params
        this.#threshold = threshold
        this.#sensitivity = sensitivity
        this.#refractory = refractory
        this.#envelopeTau = Math.max(1, envelopeHalfLife) / Math.LN2
        this.#maxRings = maxRings
        this.#thicknessSource = thicknessSource
        this.#thicknessReactivity = thicknessReactivity
        this.#lastTick = performance.now()
        this.#lastSpawn = -Infinity
    }

    public update(signal: AudioSignal): void {
        const now = performance.now()
        const dt = Math.max(0, now - this.#lastTick)
        this.#lastTick = now

        const value = readFeature(signal, this.#source)
        const decay = Math.exp(-dt / this.#envelopeTau)
        this.#envelope = this.#envelope * decay + value * (1 - decay)

        const isPointed = signal.pointed === true
        if (isPointed === false
            && value >= this.#threshold
            && value >= this.#envelope * this.#sensitivity
            && (now - this.#lastSpawn) >= this.#refractory
            && this.#waves.length < this.#maxRings
        ) {
            const intensity = Math.min(1, Math.max(value, signal.strength))
            const color = audioColor(signal, this.#colorParams)
            const thickness = this.#sampleThickness(signal)
            this.#spawn(now, intensity, color, thickness)
            this.#lastSpawn = now
        }

        for (let i = this.#waves.length - 1; i >= 0; i--) {
            const w = this.#waves[i]
            const age = (now - w.born) / this.#lifetime
            if (age >= 1) {
                w.mesh.dispose()
                w.mat.dispose()
                this.#waves.splice(i, 1)
                continue
            }
            const d = this.#startD + (this.#endD - this.#startD) * age
            w.mesh.scaling.setAll(d / this.#startD)
            w.mat.alpha = (1 - age) * w.intensity
            w.mesh.position.copyFrom(this.#ctx.primaryMesh.absolutePosition)
        }
    }

    public stop(): void {
        for (const w of this.#waves) {
            w.mesh.dispose()
            w.mat.dispose()
        }
        this.#waves.length = 0
        this.#envelope = 0
        this.#lastSpawn = -Infinity
    }

    public dispose(): void {
        this.stop()
    }

    #ctx: EffectContext
    #source: AudioFeature
    #lifetime: number
    #startD: number
    #endD: number
    #thickness: number
    #colorParams: AudioColorParams
    #threshold: number
    #sensitivity: number
    #refractory: number
    #envelopeTau: number
    #maxRings: number
    #thicknessSource: AudioFeature | undefined
    #thicknessReactivity: number
    #waves: ActiveWave[] = []
    #envelope = 0
    #lastTick: number
    #lastSpawn: number

    #sampleThickness(signal: AudioSignal): number {
        if (this.#thicknessSource === undefined) return this.#thickness
        const v = Math.max(0, Math.min(1, readFeature(signal, this.#thicknessSource)))
        return this.#thickness * (1 + this.#thicknessReactivity * v)
    }

    #spawn(now: number, intensity: number, color: Color3, thickness: number): void {
        const mesh = this.#buildRing(now, thickness)
        mesh.position.copyFrom(this.#ctx.primaryMesh.absolutePosition)
        this.#orientToCamera(mesh)

        const mat = new StandardMaterial(`audio_wave_mat_${now}`, this.#ctx.scene)
        mat.emissiveColor = color
        mat.diffuseColor = Color3.Black()
        mat.specularColor = Color3.Black()
        mat.alpha = intensity
        mat.backFaceCulling = false
        mesh.material = mat

        this.#waves.push({ mesh, mat, born: now, intensity })
    }

    #buildRing(stamp: number, thickness: number): Mesh {
        const segments = 48
        const r = this.#startD / 2
        const halfT = thickness / 2
        const inner: Vector3[] = []
        const outer: Vector3[] = []
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2
            const cos = Math.cos(a)
            const sin = Math.sin(a)
            inner.push(new Vector3(cos * (r - halfT), 0, sin * (r - halfT)))
            outer.push(new Vector3(cos * (r + halfT), 0, sin * (r + halfT)))
        }
        const mesh = MeshBuilder.CreateRibbon(
            `audio_wave_ring_${this.#ctx.primaryMesh.name}_${stamp}`,
            { pathArray: [inner, outer], sideOrientation: Mesh.DOUBLESIDE },
            this.#ctx.scene,
        )
        mesh.isPickable = false
        mesh.receiveShadows = false
        return mesh
    }

    #orientToCamera(mesh: Mesh): void {
        const cam = this.#ctx.scene.activeCamera
        if (cam === null || cam === undefined) return
        const axis = cam.globalPosition.subtract(mesh.position)
        if (axis.lengthSquared() < 1e-6) return
        axis.normalize()
        const q = new Quaternion()
        Quaternion.FromUnitVectorsToRef(Vector3.Up(), axis, q)
        mesh.rotationQuaternion = q
    }
}

EffectRegistry.register<AudioWaveParams>('audio_wave', (ctx, p) => new AudioWaveEffect(ctx, p))
