import { Color4, VertexBuffer } from "@babylonjs/core"
import { MeshUtils } from "../../node3d/tools"
import { AudioSignal, Effect } from "./Effect"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

export interface PulseParams {
    /** ms per scroll cycle — lower = faster — default 400 */
    speed?: number
    /** wave repetitions along the tube — higher = more visible bands — default 2 */
    waveFreq?: number
    /** peak sharpness — 1 = smooth sine, 3-5 = narrow bright bands — default 1 */
    sharpness?: number
    /** baseline brightness so troughs aren't pitch-black — 0 to 1 — default 0 */
    floor?: number
    /** override color (else uses ctx.getColor()) — useful for neutral idle flow */
    tint?: { r: number, g: number, b: number }
}

export class TravelingPulseEffect implements Effect {
    private _yNorm: Float32Array | null = null
    private _colors: Float32Array | null = null
    private _tempColor = new Color4(1, 1, 1, 1)
    private readonly _speed: number
    private readonly _waveFreq: number
    private readonly _sharpness: number
    private readonly _floor: number
    private readonly _tint: { r: number, g: number, b: number } | null

    constructor(private readonly ctx: EffectContext, params: PulseParams = {}) {
        const { speed = 400, waveFreq = 2, sharpness = 1, floor = 0, tint } = params
        this._speed = speed
        this._waveFreq = waveFreq
        this._sharpness = sharpness
        this._floor = floor
        this._tint = tint ?? null

        const positions = ctx.primaryMesh.getVerticesData(VertexBuffer.PositionKind)
        if (positions) {
            const count = positions.length / 3
            let minY = Infinity, maxY = -Infinity
            for (let i = 0; i < count; i++) {
                const y = positions[i * 3 + 1]
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
            const range = maxY - minY
            this._yNorm = new Float32Array(count)
            for (let i = 0; i < count; i++) {
                this._yNorm[i] = range > 0 ? (positions[i * 3 + 1] - minY) / range : 0.5
            }
            this._colors = new Float32Array(count * 4)
        }
    }

    update(_signal: AudioSignal) {
        const yNorm = this._yNorm
        const colors = this._colors
        if (!yNorm || !colors) return

        const c = this._tint ?? this.ctx.getColor()
        const t = performance.now() / this._speed
        const sharp = this._sharpness
        const floor = this._floor
        const span = 1 - floor

        for (let i = 0; i < yNorm.length; i++) {
            const smooth = 0.5 + 0.5 * Math.sin(t - yNorm[i] * Math.PI * this._waveFreq)
            const wave = sharp === 1 ? smooth : Math.pow(smooth, sharp)
            const b = floor + span * wave
            colors[i * 4 + 0] = c.r * b
            colors[i * 4 + 1] = c.g * b
            colors[i * 4 + 2] = c.b * b
            colors[i * 4 + 3] = 1
        }
        this.ctx.primaryMesh.setVerticesData(VertexBuffer.ColorKind, colors)

        if (this.ctx.secondaryMesh) {
            const smooth = 0.5 + 0.5 * Math.sin(t - Math.PI * this._waveFreq)
            const wave = sharp === 1 ? smooth : Math.pow(smooth, sharp)
            const b = floor + span * wave
            this._tempColor.set(c.r * b, c.g * b, c.b * b, 1)
            MeshUtils.setColor(this.ctx.secondaryMesh, this._tempColor)
        }
    }

    stop() {
        MeshUtils.setColor(this.ctx.primaryMesh, this.ctx.getColor())
        if (this.ctx.secondaryMesh) MeshUtils.setColor(this.ctx.secondaryMesh, this.ctx.getColor())
    }

    dispose() {
        this.stop()
    }
}

EffectRegistry.register<PulseParams>('pulse', (ctx, p) => new TravelingPulseEffect(ctx, p))
