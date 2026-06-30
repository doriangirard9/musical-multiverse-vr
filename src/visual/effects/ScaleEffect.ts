import { AudioSignal, Effect } from "./Effect"
import { Easing, EASINGS } from "./Easing"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

/**
 * Description of one scale animation cycle. The mesh starts at baseScale,
 * ramps up to expandTo, holds, ramps back down, then rests. The cycle loops
 * indefinitely from construction time.
 */
export interface ScaleParams {
    /** Resting scale at the start and end of each cycle. Default 1. */
    baseScale?: number
    /** Peak scale reached at the top of the expand phase. */
    expandTo: number
    /** ms from baseScale to expandTo. */
    expandDuration: number
    /** Curve for the expand ramp. Default 'easeOut'. */
    expandEasing?: Easing
    /** ms held at expandTo. Default 0. */
    hold?: number
    /** ms from expandTo back to baseScale. */
    retractDuration: number
    /** Curve for the retract ramp. Default 'easeIn'. */
    retractEasing?: Easing
    /** ms held at baseScale before the next cycle starts. Default 0. */
    rest?: number
}

/**
 * Self-contained looping scale animation. Owns its clock; no orchestrator
 * drives it. Freezes at baseScale while the target is being pointed at.
 */
export class ScaleEffect implements Effect {

    public constructor(ctx: EffectContext, params: ScaleParams) {
        this.#ctx = ctx
        this.#base = params.baseScale ?? 1
        this.#peak = params.expandTo
        this.#expandDur = params.expandDuration
        this.#expandEasing = params.expandEasing ?? 'easeOut'
        this.#hold = params.hold ?? 0
        this.#retractDur = params.retractDuration
        this.#retractEasing = params.retractEasing ?? 'easeIn'
        this.#rest = params.rest ?? 0
        this.#cycle = this.#expandDur + this.#hold + this.#retractDur + this.#rest
        this.#start = performance.now()
    }

    public update(signal: AudioSignal): void {
        if (signal.pointed === true) {
            this.#ctx.primaryMesh.scaling.setAll(this.#base)
            return
        }
        const t = this.#cycle > 0 ? (performance.now() - this.#start) % this.#cycle : 0
        this.#ctx.primaryMesh.scaling.setAll(this.#scaleAt(t))
    }

    public stop(): void {
        this.#ctx.primaryMesh.scaling.setAll(this.#base)
    }

    public dispose(): void {
        this.stop()
    }

    #ctx: EffectContext
    #base: number
    #peak: number
    #expandDur: number
    #expandEasing: Easing
    #hold: number
    #retractDur: number
    #retractEasing: Easing
    #rest: number
    #cycle: number
    #start: number

    #scaleAt(t: number): number {
        const expandEnd = this.#expandDur
        if (t < expandEnd) {
            const phase = this.#expandDur > 0 ? t / this.#expandDur : 1
            const eased = EASINGS[this.#expandEasing](phase)
            return this.#base + (this.#peak - this.#base) * eased
        }
        const holdEnd = expandEnd + this.#hold
        if (t < holdEnd) {
            return this.#peak
        }
        const retractEnd = holdEnd + this.#retractDur
        if (t < retractEnd) {
            const phase = this.#retractDur > 0 ? (t - holdEnd) / this.#retractDur : 1
            const eased = EASINGS[this.#retractEasing](phase)
            return this.#peak + (this.#base - this.#peak) * eased
        }
        return this.#base
    }
}

EffectRegistry.register<ScaleParams>('scale', (ctx, p) => new ScaleEffect(ctx, p))
