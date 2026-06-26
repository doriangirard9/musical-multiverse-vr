import { AbstractMesh, Color4, Scene } from "@babylonjs/core"
import { AudioSignal, Effect } from "./Effect"
import { EffectContext } from "./EffectContext"
import { EffectProfile } from "./EffectProfile"
import { EffectRegistry } from "./EffectRegistry"
import { EffectRuntime, Tickable } from "./EffectRuntime"
import { InputManager } from "../../xr/inputs/InputManager"

const EMPTY_PROFILE: EffectProfile = { id: 'empty', effects: {} }

function _isProfile(v: unknown): v is EffectProfile {
    return !!v && typeof v === 'object' && 'effects' in (v as object)
}

export type ProfileSource = EffectProfile | (() => EffectProfile)
export type SignalSource = AudioSignal | (() => AudioSignal)

/**
 * Per-target effect bundle. Mounts a set of Effect modules described by a
 * profile, sharing a context (mesh, color, scene). The render loop is owned
 * by EffectRuntime; tick() is called per frame.
 *
 * Provider mode: if `source` is a function, the system polls it each tick and
 * rebuilds when the profile id changes. Pull-based reactivity.
 *
 * Effects own their own animation; this system just wires construction,
 * per-tick update, and disposal.
 */
export class EffectSystem implements Tickable {
    private _active = false
    private _paused = false
    private _signal: AudioSignal = { strength: 1, tone: 0 }
    private _signalProvider: (() => AudioSignal) | null = null
    private _effects: Effect[] = []
    private _provider: (() => EffectProfile) | null = null
    private _currentProfileId = ""

    constructor(private scene: Scene, source: ProfileSource, private _ctx: EffectContext) {
        const initial = typeof source === 'function' ? (this._provider = source, source()) : source
        this._currentProfileId = initial.id
        this._buildEffects(initial)
        EffectRuntime.get(scene).register(this)
    }

    private _buildEffects(profile: EffectProfile) {
        for (const e of this._effects) e.dispose()
        this._effects = Object.entries(profile.effects)
            .filter(([id]) => EffectRegistry.has(id))
            .map(([id, params]) => EffectRegistry.create(id, this._ctx, params))
    }

    /** Manual override; bypasses the provider for one swap. */
    setProfile(profile: EffectProfile) {
        this._currentProfileId = profile.id
        this._buildEffects(profile)
    }

    /** Called by EffectRuntime each frame. */
    tick(): void {
        if (this._provider) {
            const next = this._provider()
            if (next.id !== this._currentProfileId) {
                this._currentProfileId = next.id
                this._buildEffects(next)
            }
        }
        if (!this._active || this._paused) return
        if (this._signalProvider !== null) {
            const sig = this._signalProvider()
            this._signal.strength = sig.strength
            this._signal.tone     = sig.tone
            this._signal.peak     = sig.peak
            this._signal.bass     = sig.bass
            this._signal.mid      = sig.mid
            this._signal.treble   = sig.treble
            this._signal.flux     = sig.flux
            this._signal.onset    = sig.onset
            this._signal.pitch    = sig.pitch
            this._signal.velocity = sig.velocity
            this._signal.activity = sig.activity
        }
        this._signal.pointed = InputManager.getInstance().isPointedAt(this._ctx.primaryMesh)
        for (const e of this._effects) e.update(this._signal)
    }

    /**
     * Activate with a static signal or a per-tick provider.
     * Provider mode lets the system pull live audio analysis (RMS / spectral
     * features) into signal.strength and signal.tone each frame, so effects
     * become audio-reactive without any per-effect plumbing.
     */
    activate(source: SignalSource = { strength: 1, tone: 0 }) {
        this._active = true
        if (typeof source === 'function') {
            this._signalProvider = source
        } else {
            this._signalProvider = null
            this._signal.strength = source.strength
            this._signal.tone = source.tone
        }
    }

    deactivate() {
        if (!this._active) return
        this._active = false
        for (const e of this._effects) e.stop()
    }

    pause()  { this._paused = true }
    resume() { this._paused = false }

    dispose() {
        this.deactivate()
        EffectRuntime.get(this.scene).unregister(this)
        for (const e of this._effects) e.dispose()
    }

    static forMesh(
        scene: Scene,
        primaryMesh: AbstractMesh,
        secondaryMesh: AbstractMesh | null,
        getColor: () => Color4,
        source?: ProfileSource
    ): EffectSystem {
        const ctx: EffectContext = { primaryMesh, secondaryMesh, getColor, scene }
        const resolved: ProfileSource =
            typeof source === 'function' ? source
            : _isProfile(source)         ? source
            :                              EMPTY_PROFILE
        return new EffectSystem(scene, resolved, ctx)
    }
}
