import { Color3, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core"
import { AudioFeature, AudioSignal, Effect, readFeature } from "./Effect"
import { AudioColorParams, audioColor } from "./EffectColor"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

/**
 * Construction parameters for a continuously-modulated halo ring sprite.
 *
 * Unlike {@link AudioWaveEffect} which spawns ephemeral rings on transients,
 * the corona is a single ring whose radius, hue, and brightness all move
 * continuously with chosen audio features. Designed as the "always-on"
 * liveness for sink-class nodes, with optional secondary inner ring counter-
 * phasing so the visual reads as breathing rather than static.
 */
export interface AudioCoronaParams extends AudioColorParams {
    /** Feature driving overall ring radius. Default 'strength'. */
    radiusSource?: AudioFeature
    /** Radius at radiusSource = 0. Default 0.5. */
    baseRadius?: number
    /** Radius at radiusSource = 1. */
    peakRadius: number
    /** Ring band width (geometric, in world units). Default 0.04. */
    thickness?: number
    /** Feature mapped to alpha. Default 'strength'. */
    brightnessSource?: AudioFeature
    /** Alpha at brightnessSource = 0. Default 0.0 (silent = invisible). */
    floorBrightness?: number
    /** Alpha at brightnessSource = 1. Default 1.0. */
    peakBrightness?: number
    /** Counter-phase inner ring for breathing effect. Default true. */
    secondary?: boolean
    /** Inner ring radius scale relative to primary. Default 0.62. */
    secondaryScale?: number
    /** One-pole smoothing time constant in ms applied to all sources. Default 90. */
    smoothing?: number
}

/**
 * Continuously-modulated halo ring around a target mesh. Sustained presence
 * (no spawning, no aging), with radius/hue/brightness all reading from the
 * live signal. Always camera-facing.
 *
 * The optional secondary inner ring counter-phases its scaling vs. the
 * primary so the corona "breathes" instead of just expanding uniformly. Both
 * rings share the modulated color so the harmonic content is unambiguous.
 */
export class AudioCoronaEffect implements Effect {

    public constructor(ctx: EffectContext, params: AudioCoronaParams) {
        this.#ctx = ctx
        this.#radiusSource = params.radiusSource ?? 'strength'
        this.#baseRadius = params.baseRadius ?? 0.5
        this.#peakRadius = params.peakRadius
        this.#thickness = params.thickness ?? 0.04
        this.#colorParams = params
        this.#brightnessSource = params.brightnessSource ?? 'strength'
        this.#floorBrightness = params.floorBrightness ?? 0.0
        this.#peakBrightness = params.peakBrightness ?? 1.0
        this.#secondaryEnabled = params.secondary ?? true
        this.#secondaryScale = params.secondaryScale ?? 0.62
        this.#smoothingTau = Math.max(1, params.smoothing ?? 90)
        this.#lastTick = performance.now()

        this.#primary = this.#buildRingPair('primary')
        this.#secondary = this.#secondaryEnabled
            ? this.#buildRingPair('secondary')
            : null
    }

    public update(signal: AudioSignal): void {
        const now = performance.now()
        const dt = Math.max(0, now - this.#lastTick)
        this.#lastTick = now

        const rawRadius = readFeature(signal, this.#radiusSource)
        const rawBright = readFeature(signal, this.#brightnessSource)

        const alpha = 1 - Math.exp(-dt / this.#smoothingTau)
        this.#smoothedRadius += alpha * (rawRadius - this.#smoothedRadius)
        this.#smoothedBright += alpha * (rawBright - this.#smoothedBright)

        const isPointed = signal.pointed === true
        const visibility = isPointed === true ? 0 :
            this.#floorBrightness + (this.#peakBrightness - this.#floorBrightness) * this.#smoothedBright

        const radius = this.#baseRadius + (this.#peakRadius - this.#baseRadius) * this.#smoothedRadius
        const scale = radius / this.#baseRadius
        // Color computed per frame from the (already-snapshot-cached) signal,
        // so corona hue tracks the live spectrum under whichever color mode
        // the profile selected.
        const color = audioColor(signal, this.#colorParams)
        const center = this.#ctx.primaryMesh.absolutePosition

        this.#applyRing(this.#primary, center, scale, color, visibility)
        if (this.#secondary !== null) {
            // Counter-phase: secondary expands as primary contracts and vice
            // versa, so the corona feels alive rather than monotonic.
            const counterScale = scale * this.#secondaryScale * (1 + (1 - this.#smoothedRadius) * 0.25)
            this.#applyRing(this.#secondary, center, counterScale, color, visibility * 0.75)
        }
    }

    public stop(): void {
        this.#primary.material.alpha = 0
        if (this.#secondary !== null) this.#secondary.material.alpha = 0
    }

    public dispose(): void {
        this.#primary.mesh.dispose()
        this.#primary.material.dispose()
        if (this.#secondary !== null) {
            this.#secondary.mesh.dispose()
            this.#secondary.material.dispose()
        }
    }

    #ctx: EffectContext
    #radiusSource: AudioFeature
    #baseRadius: number
    #peakRadius: number
    #thickness: number
    #colorParams: AudioColorParams
    #brightnessSource: AudioFeature
    #floorBrightness: number
    #peakBrightness: number
    #secondaryEnabled: boolean
    #secondaryScale: number
    #smoothingTau: number
    #smoothedRadius = 0
    #smoothedBright = 0
    #lastTick: number
    #primary!: { mesh: Mesh, material: StandardMaterial }
    #secondary: { mesh: Mesh, material: StandardMaterial } | null

    #buildRingPair(label: string): { mesh: Mesh, material: StandardMaterial } {
        const mesh = this.#buildRingMesh(label)
        const material = new StandardMaterial(
            `audio_corona_${label}_${this.#ctx.primaryMesh.name}`, this.#ctx.scene)
        material.emissiveColor = Color3.White()
        material.diffuseColor = Color3.Black()
        material.specularColor = Color3.Black()
        material.ambientColor = Color3.Black()
        material.disableLighting = true
        material.backFaceCulling = false
        material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        material.alpha = 0
        mesh.material = material
        return { mesh, material }
    }

    #buildRingMesh(label: string): Mesh {
        const segments = 64
        const r = this.#baseRadius
        const halfT = this.#thickness / 2
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
            `audio_corona_${label}_${this.#ctx.primaryMesh.name}`,
            { pathArray: [inner, outer], sideOrientation: Mesh.DOUBLESIDE },
            this.#ctx.scene,
        )
        mesh.isPickable = false
        mesh.receiveShadows = false
        return mesh
    }

    #applyRing(ring: { mesh: Mesh, material: StandardMaterial }, center: Vector3, scale: number, color: Color3, alpha: number): void {
        ring.mesh.position.copyFrom(center)
        ring.mesh.scaling.setAll(scale)
        ring.material.emissiveColor = color
        ring.material.alpha = alpha
        this.#orientToCamera(ring.mesh)
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

EffectRegistry.register<AudioCoronaParams>('audio_corona', (ctx, p) => new AudioCoronaEffect(ctx, p))
