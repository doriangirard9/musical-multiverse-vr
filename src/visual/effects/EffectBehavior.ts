import { AbstractMesh, Behavior, Color4, Nullable } from "@babylonjs/core"
import { EffectContext } from "./EffectContext"
import { EffectSystem, ProfileSource } from "./EffectSystem"

export interface EffectBehaviorOptions {
    /** Static profile or pull-based provider — the system polls each frame and rebuilds on id change. */
    source: ProfileSource
    /** Color source — read each frame by effects that respect ctx.getColor(). */
    getColor: () => Color4
    /** Optional second mesh exposed to effects (e.g. arrow on a connection). */
    secondaryMesh?: Nullable<AbstractMesh>
}

/**
 * Babylon Behavior that hosts an EffectSystem on whatever mesh it's attached to.
 * Lifecycle is automatic: addBehavior() spins up the system, mesh disposal
 * (or removeBehavior) tears it down. Owners don't field-track or dispose anything.
 *
 * Composition: any mesh in the scene can have effects via one line —
 *   mesh.addBehavior(new EffectBehavior({ source, getColor }))
 */
export class EffectBehavior implements Behavior<AbstractMesh> {
    public readonly name = "effect"
    public attachedNode: Nullable<AbstractMesh> = null
    private _system: EffectSystem | null = null

    constructor(private readonly opts: EffectBehaviorOptions) {}

    init(): void {}

    attach(target: AbstractMesh): void {
        this.attachedNode = target
        const scene = target.getScene()
        const ctx: EffectContext = {
            primaryMesh:  target,
            secondaryMesh: this.opts.secondaryMesh ?? null,
            getColor:      this.opts.getColor,
            scene,
        }
        this._system = new EffectSystem(scene, this.opts.source, ctx)
        this._system.activate({ strength: 1, tone: 0 })
    }

    detach(): void {
        this._system?.dispose()
        this._system = null
        this.attachedNode = null
    }
}
