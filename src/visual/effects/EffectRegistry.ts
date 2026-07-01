import { Effect } from "./Effect"
import { EffectContext } from "./EffectContext"

type EffectFactory<P> = (ctx: EffectContext, params: P) => Effect

/**
 * Registry of effect factories keyed by string id. Factories are typed at
 * registration so effect files declare their own params type without casting.
 * The single type erasure happens here, in the registry storage.
 */
export class EffectRegistry {
    private static readonly _factories = new Map<string, EffectFactory<unknown>>()

    static register<P>(id: string, factory: EffectFactory<P>): void {
        this._factories.set(id, factory as EffectFactory<unknown>)
    }

    static create(id: string, ctx: EffectContext, params: unknown): Effect {
        const factory = this._factories.get(id)
        if (!factory) throw new Error(`EffectRegistry: unknown effect "${id}"`)
        return factory(ctx, params)
    }

    static has(id: string): boolean {
        return this._factories.has(id)
    }
}
