import {
    AbstractMesh,
    Color3,
    DynamicTexture,
    Mesh,
    MeshBuilder,
    Scene,
    StandardMaterial,
    Vector3,
} from "@babylonjs/core"
import { AudioFeature, AudioSignal, Effect, readFeature } from "./Effect"
import { AudioColorParams, audioColor } from "./EffectColor"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

/**
 * Construction parameters for the note-flow cable effect.
 *
 * Notes are events: each one is spawned when `triggerSource` crosses
 * `triggerThreshold` (subject to a refractory cooldown), then travels from
 * the cable's output end to its input end at a speed modulated by
 * `speedSource`. Color comes from {@link AudioColorParams} — choose
 * `colorMode: 'spectrum'` for "RGB = bass/mid/treble" musical mixing,
 * `'palette'` for discrete 12-color musical wheel, or `'hue'` for a simple
 * single-feature gradient.
 *
 * Always fully opaque while in flight; despawns on arrival. No background
 * stream, no fading — silence shows nothing.
 */
export interface CableNoteFlowParams extends AudioColorParams {
    /** Feature that triggers a new note. Default 'flux'. */
    triggerSource?: AudioFeature
    /** Minimum source value required to spawn. Default 0.18. */
    triggerThreshold?: number
    /** Minimum ms between successive spawns. Default 90. */
    refractory?: number
    /** Maximum concurrent notes. Older triggers are dropped when the pool is full. Default 14. */
    maxCount?: number

    /** Feature driving travel speed. Default 'strength'. */
    speedSource?: AudioFeature
    /** Base travel speed in cable-lengths per second when speedSource = 0. Default 0.3. */
    baseSpeed?: number
    /** Extra speed added when speedSource saturates to 1. Default 1.6. */
    reactivity?: number
    /** One-pole smoothing time constant in ms applied to speed. Default 90. */
    smoothing?: number

    /**
     * Feature mapped onto perpendicular-to-cable height, so notes ride above
     * or below the cable axis like a five-line staff. Default 'tone'.
     */
    heightSource?: AudioFeature
    /**
     * World-space spread of the height offset. Feature value 0 sits at
     * `-heightSpread`, 1 at `+heightSpread`, 0.5 on-cable. Default 0.18.
     */
    heightSpread?: number

    /** World-space sprite size. Default 0.12. */
    size?: number
}

const GLYPHS = ['\u266A', '\u266B', '\u266C', '\u2669'] as const
const GLYPH_TEXTURE_SIZE = 128

/** Shared per-scene glyph textures, lazily built once. */
const GLYPH_TEXTURE_CACHE = new WeakMap<Scene, DynamicTexture[]>()

function glyphTextures(scene: Scene): DynamicTexture[] {
    const cached = GLYPH_TEXTURE_CACHE.get(scene)
    if (cached !== undefined) return cached
    const textures: DynamicTexture[] = []
    for (let i = 0; i < GLYPHS.length; i++) {
        const tex = new DynamicTexture(`note_glyph_${i}`, GLYPH_TEXTURE_SIZE, scene, true)
        tex.hasAlpha = true
        const ctx = tex.getContext() as CanvasRenderingContext2D
        ctx.clearRect(0, 0, GLYPH_TEXTURE_SIZE, GLYPH_TEXTURE_SIZE)
        ctx.font = `bold ${Math.round(GLYPH_TEXTURE_SIZE * 0.92)}px Arial, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.lineWidth = 6
        ctx.strokeStyle = "rgba(0, 0, 0, 0.9)"
        ctx.strokeText(GLYPHS[i], GLYPH_TEXTURE_SIZE / 2, GLYPH_TEXTURE_SIZE / 2)
        ctx.fillStyle = "white"
        ctx.fillText(GLYPHS[i], GLYPH_TEXTURE_SIZE / 2, GLYPH_TEXTURE_SIZE / 2)
        tex.update(false)
        textures.push(tex)
    }
    GLYPH_TEXTURE_CACHE.set(scene, textures)
    return textures
}

interface NoteSprite {
    mesh: Mesh
    mat: StandardMaterial
    active: boolean
    t: number
    /** Signed height offset in [-1, +1], sampled at spawn from the height feature. */
    heightFraction: number
}

/**
 * Event-driven sprite flow along a cable. The host tube is a cylinder whose
 * local +Y was constructed to point from output to input
 * (see N3DConnectionInstance), so sprites lerp from
 * `tubeCenter − axis × halfLength` to `tubeCenter + axis × halfLength`.
 *
 * One material per pool slot (re-tinted on spawn) keeps the per-note color
 * cheap and avoids allocating in the hot path.
 */
export class CableNoteFlowEffect implements Effect {

    public constructor(ctx: EffectContext, params: CableNoteFlowParams) {
        this.#ctx = ctx
        this.#triggerSource = params.triggerSource ?? 'flux'
        this.#triggerThreshold = params.triggerThreshold ?? 0.18
        this.#refractory = Math.max(0, params.refractory ?? 90)
        this.#maxCount = Math.max(1, params.maxCount ?? 14)
        this.#speedSource = params.speedSource ?? 'strength'
        this.#baseSpeed = params.baseSpeed ?? 0.3
        this.#reactivity = params.reactivity ?? 1.6
        this.#smoothingTau = Math.max(1, params.smoothing ?? 90)
        // Color params carried in `params` itself via AudioColorParams extension.
        // Boost default brightness so the emissive note pops against scene lighting.
        this.#colorParams = { brightness: 1.6, ...params }
        this.#heightSource = params.heightSource ?? 'tone'
        this.#heightSpread = params.heightSpread ?? 0.18
        this.#size = params.size ?? 0.12

        this.#glyphs = glyphTextures(ctx.scene)
        this.#sprites = []
        for (let i = 0; i < this.#maxCount; i++) {
            const mat = new StandardMaterial(`note_flow_mat_${ctx.primaryMesh.name}_${i}`, ctx.scene)
            const tex = this.#glyphs[0]
            mat.emissiveTexture = tex
            mat.emissiveColor = Color3.White()
            mat.opacityTexture = tex
            mat.diffuseColor = Color3.Black()
            mat.specularColor = Color3.Black()
            mat.ambientColor = Color3.Black()
            mat.disableLighting = true
            mat.backFaceCulling = false
            mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
            const mesh = MeshBuilder.CreatePlane(
                `note_flow_${ctx.primaryMesh.name}_${i}`,
                { size: this.#size },
                ctx.scene,
            )
            mesh.material = mat
            mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL
            mesh.isPickable = false
            mesh.isVisible = false
            this.#sprites.push({ mesh, mat, active: false, t: 0, heightFraction: 0 })
        }

        this.#lastTick = performance.now()
        this.#lastSpawn = -Infinity
    }

    public update(signal: AudioSignal): void {
        const now = performance.now()
        const dt = Math.max(0, now - this.#lastTick) / 1000
        this.#lastTick = now

        const rawSpeed = readFeature(signal, this.#speedSource)
        const alpha = 1 - Math.exp(-dt * 1000 / this.#smoothingTau)
        this.#smoothedSpeed += alpha * (rawSpeed - this.#smoothedSpeed)
        const speed = this.#baseSpeed + this.#reactivity * this.#smoothedSpeed

        const isPointed = signal.pointed === true
        const triggerValue = readFeature(signal, this.#triggerSource)
        if (isPointed === false
            && triggerValue >= this.#triggerThreshold
            && (now - this.#lastSpawn) >= this.#refractory
        ) {
            const color = audioColor(signal, this.#colorParams)
            const heightValue = readFeature(signal, this.#heightSource)
            // Glyph index quantized off the spawn moment so two cables
            // triggering on the same audio frame pick the same glyph — the
            // visual reads as the same event, not two independent randoms.
            const glyphIdx = Math.floor(now / GLYPH_PICK_QUANTUM_MS) % this.#glyphs.length
            this.#spawn(color, heightValue, glyphIdx)
            this.#lastSpawn = now
        }

        const tube = this.#ctx.primaryMesh
        // tube.getDirection(Up) returns a vector whose length equals the tube's
        // world Y-extent (scaling is baked in by TransformNormal). Read length
        // from it directly, normalize, then derive endpoints.
        const axisScaled = tube.getDirection(Vector3.Up())
        const tubeLength = axisScaled.length()
        const halfLength = tubeLength / 2
        const axis = axisScaled.scaleInPlace(1 / tubeLength)
        const center = tube.absolutePosition
        const inputEnd  = center.add(axis.scale(halfLength))
        const outputEnd = center.subtract(axis.scale(halfLength))
        const perpUp = this.#perpendicularUp(axis)

        for (const sprite of this.#sprites) {
            if (sprite.active === false) continue
            sprite.t += speed * dt
            if (sprite.t >= 1) {
                sprite.active = false
                sprite.mesh.isVisible = false
                continue
            }
            const along = Vector3.Lerp(outputEnd, inputEnd, sprite.t)
            const offset = perpUp.scale(sprite.heightFraction * this.#heightSpread)
            sprite.mesh.position.copyFrom(along.addInPlace(offset))
            // Scale envelope: spawn-grow → hold → despawn-shrink. Keeps notes
            // from popping into/out of existence; reads as organic, not static.
            const env = sprite.t < FADE_IN
                ? sprite.t / FADE_IN
                : sprite.t > FADE_OUT
                    ? (1 - sprite.t) / (1 - FADE_OUT)
                    : 1
            sprite.mesh.scaling.setAll(env)
        }
    }

    public stop(): void {
        for (const sprite of this.#sprites) {
            sprite.active = false
            sprite.mesh.isVisible = false
        }
    }

    public dispose(): void {
        for (const sprite of this.#sprites) {
            sprite.mesh.dispose()
            sprite.mat.dispose()
        }
        this.#sprites.length = 0
    }

    #ctx: EffectContext
    #triggerSource: AudioFeature
    #triggerThreshold: number
    #refractory: number
    #maxCount: number
    #speedSource: AudioFeature
    #baseSpeed: number
    #reactivity: number
    #smoothingTau: number
    #smoothedSpeed = 0
    #colorParams: AudioColorParams
    #heightSource: AudioFeature
    #heightSpread: number
    #size: number
    #glyphs: DynamicTexture[]
    #sprites: NoteSprite[]
    #lastTick: number
    #lastSpawn: number

    #spawn(color: Color3, heightValue: number, glyphIdx: number): void {
        const slot = this.#sprites.find(s => s.active === false)
        if (slot === undefined) return  // pool full → drop trigger
        const tex = this.#glyphs[glyphIdx]
        slot.mat.emissiveColor = color
        slot.mat.emissiveTexture = tex
        slot.mat.opacityTexture = tex
        slot.t = 0
        slot.heightFraction = Math.max(0, Math.min(1, heightValue)) * 2 - 1
        slot.active = true
        slot.mesh.isVisible = true
    }

    /**
     * World-Up projected onto the plane perpendicular to the cable axis, then
     * normalized. Falls back to a stable horizontal vector when the cable
     * itself is vertical (Up is parallel to the axis), so notes still spread
     * predictably on vertical cables instead of collapsing to a point.
     */
    #perpendicularUp(axis: Vector3): Vector3 {
        const up = Vector3.Up()
        const dot = Vector3.Dot(up, axis)
        const proj = up.subtract(axis.scale(dot))
        if (proj.lengthSquared() < 1e-6) {
            // Vertical cable: pick any axis-perpendicular world direction.
            return Vector3.Cross(axis, Vector3.Right()).normalize()
        }
        return proj.normalize()
    }
}

/** Quantum used to map spawn time → glyph index. Two cables triggering within this window pick the same glyph. */
const GLYPH_PICK_QUANTUM_MS = 80

/** Fractions of the travel during which the sprite scales up from 0 and back down to 0. */
const FADE_IN = 0.15
const FADE_OUT = 0.85

EffectRegistry.register<CableNoteFlowParams>('cable_note_flow', (ctx, p) => new CableNoteFlowEffect(ctx, p))
