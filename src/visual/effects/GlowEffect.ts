import { Color3, HighlightLayer, Mesh } from "@babylonjs/core"
import { AudioSignal, Effect } from "./Effect"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

export interface GlowParams {
    /** rad/s multiplier — default 4 (~1.6s period) */
    pulseSpeed?: number
    /** peak blur radius in pixels — bigger = brighter halo — default 24 */
    intensity?: number
    /** floor blur radius — keeps a constant base glow even at pulse trough — default 4 */
    floor?: number
    /** glow color. If omitted, falls back to HSV(signal.tone * 360, 1, 1). */
    tint?: { r: number, g: number, b: number }
}

/**
 * Real outer-glow effect via Babylon HighlightLayer. The layer adds a blurred
 * silhouette around the primaryMesh — animated by pulsing the blur radius.
 *
 * Each effect owns its own HighlightLayer so its color and pulse don't collide
 * with the shared selection layer (one extra render pass per glowing node;
 * acceptable at current node counts).
 */
export class GlowEffect implements Effect {
    private readonly _layer: HighlightLayer
    private readonly _mesh: Mesh | null
    private readonly _pulseSpeed: number
    private readonly _intensity: number
    private readonly _floor: number
    private readonly _tint: Color3 | null

    constructor(private readonly ctx: EffectContext, params: GlowParams = {}) {
        const { pulseSpeed = 4, intensity = 24, floor = 4, tint } = params
        this._pulseSpeed = pulseSpeed
        this._intensity = intensity
        this._floor = floor
        this._tint = tint ? new Color3(tint.r, tint.g, tint.b) : null

        this._layer = new HighlightLayer(`glow_${ctx.primaryMesh.name}`, ctx.scene)
        this._layer.outerGlow = true
        this._layer.innerGlow = false
        this._layer.blurHorizontalSize = 0
        this._layer.blurVerticalSize = 0

        // HighlightLayer.addMesh requires a Mesh, not AbstractMesh — guard.
        this._mesh = ctx.primaryMesh instanceof Mesh ? ctx.primaryMesh : null
        if (this._mesh) {
            this._layer.addMesh(this._mesh, this._tint ?? Color3.White())
        }
    }

    update(signal: AudioSignal) {
        if (!this._mesh) return

        const t = performance.now() / 1000 * this._pulseSpeed
        const pulse = 0.5 + 0.5 * Math.sin(t)
        const size = (this._floor + (this._intensity - this._floor) * pulse) * signal.strength
        this._layer.blurHorizontalSize = size
        this._layer.blurVerticalSize = size

        // Without an explicit tint, follow the signal — re-tag the mesh with the
        // current hue. Cheap: layer just stores a per-mesh color reference.
        if (!this._tint) {
            const c = Color3.FromHSV(signal.tone * 360, 1, 1)
            this._layer.removeMesh(this._mesh)
            this._layer.addMesh(this._mesh, c)
        }
    }

    stop() {
        this._layer.blurHorizontalSize = 0
        this._layer.blurVerticalSize = 0
    }

    dispose() {
        if (this._mesh) this._layer.removeMesh(this._mesh)
        this._layer.dispose()
    }
}

EffectRegistry.register<GlowParams>('glow', (ctx, p) => new GlowEffect(ctx, p))
