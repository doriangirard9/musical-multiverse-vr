import { Scene } from "@babylonjs/core"

/**
 * Anything that wants to be ticked every frame by the runtime.
 * EffectSystem implements this structurally — no import cycle needed.
 */
export interface Tickable {
    tick(): void
}

/**
 * Singleton (per-scene) coordinator. Owns the single render-loop hook and ticks
 * every registered EffectSystem each frame. Centralizes pause/resume, debug
 * enumeration of effects in a scene, and lifecycle so individual EffectSystems don't each register
 * their own onBeforeRenderObservable.
 */
export class EffectRuntime {
    private static _byScene = new WeakMap<Scene, EffectRuntime>()

    static get(scene: Scene): EffectRuntime {
        let rt = EffectRuntime._byScene.get(scene)
        if (!rt) {
            rt = new EffectRuntime(scene)
            EffectRuntime._byScene.set(scene, rt)
        }
        return rt
    }

    private _systems = new Set<Tickable>()
    private _observer: any
    private _paused = false

    private constructor(private scene: Scene) {
        this._observer = scene.onBeforeRenderObservable.add(() => {
            if (this._paused) return
            for (const sys of this._systems) sys.tick()
        })
    }

    register(sys: Tickable):   void { this._systems.add(sys) }
    unregister(sys: Tickable): void { this._systems.delete(sys) }

    pauseAll():  void { this._paused = true }
    resumeAll(): void { this._paused = false }

    /** Number of currently-registered systems. Useful for debug overlays. */
    get size(): number { return this._systems.size }

    /** Iterate all live systems. Useful for batch ops (set profile globally, etc.). */
    *systems(): IterableIterator<Tickable> {
        for (const sys of this._systems) yield sys
    }

    /** Tear down completely — typically only on scene disposal. */
    dispose(): void {
        this.scene.onBeforeRenderObservable.remove(this._observer)
        this._systems.clear()
        EffectRuntime._byScene.delete(this.scene)
    }
}
