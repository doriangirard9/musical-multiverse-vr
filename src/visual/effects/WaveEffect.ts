import { Color3, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core"
import { AudioSignal, Effect } from "./Effect"
import { EffectContext } from "./EffectContext"
import { EffectRegistry } from "./EffectRegistry"

/**
 * Construction parameters for a wave ring sprite.
 */
export interface WaveParams {
    /** ms between successive ring spawns. Required. */
    period: number
    /** ms before the first ring spawns, measured from construction. Default 0. */
    offset?: number
    /** ms each ring lives before disposal. Default 1500. */
    lifetime?: number
    /** Ring diameter at spawn, world units. Default 0.3. */
    startDiameter?: number
    /** Ring diameter at death, world units. Default 2.0. */
    endDiameter?: number
    /** Ring band width (inner-to-outer radius gap) in world units. Default 0.04. */
    thickness?: number
    /** Ring color. Default white. */
    tint?: { r: number, g: number, b: number }
}

interface ActiveWave {
    mesh: Mesh
    mat: StandardMaterial
    born: number
}

/**
 * Outward expanding flat ring sprite. Spawns one ring every `period` ms
 * (first one at `offset` ms from construction). Each ring is a 2D annulus
 * built from two concentric circle paths via CreateRibbon, oriented at spawn
 * so its plane faces the active camera. Scales up and fades over its
 * lifetime, then disposes itself.
 *
 * Self-driven: knows nothing about other effects. Tune `period` and `offset`
 * manually to align visually with whatever else is animating.
 *
 * Spawning suspends while the target is being pointed at; existing rings
 * still age out so the screen never freezes mid-wave.
 */
export class WaveEffect implements Effect {

    public constructor(ctx: EffectContext, params: WaveParams) {
        const {
            period,
            offset        = 0,
            lifetime      = 1500,
            startDiameter = 0.3,
            endDiameter   = 2.0,
            thickness     = 0.04,
            tint          = { r: 1, g: 1, b: 1 },
        } = params
        this.#ctx = ctx
        this.#period = period
        this.#offset = offset
        this.#lifetime = lifetime
        this.#startD = startDiameter
        this.#endD = endDiameter
        this.#thickness = thickness
        this.#tint = new Color3(tint.r, tint.g, tint.b)
        this.#start = performance.now()
    }

    public update(signal: AudioSignal): void {
        const now = performance.now()
        const elapsed = now - this.#start

        const isPointed = signal.pointed === true
        if (isPointed === false && elapsed >= this.#offset && this.#period > 0) {
            const cycleIdx = Math.floor((elapsed - this.#offset) / this.#period)
            if (cycleIdx > this.#lastCycleIdx) {
                this.#spawn(now)
                this.#lastCycleIdx = cycleIdx
            }
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
            w.mat.alpha = (1 - age) * signal.strength
            w.mesh.position.copyFrom(this.#ctx.primaryMesh.absolutePosition)
        }
    }

    public stop(): void {
        for (const w of this.#waves) {
            w.mesh.dispose()
            w.mat.dispose()
        }
        this.#waves.length = 0
    }

    public dispose(): void {
        this.stop()
    }

    #ctx: EffectContext
    #period: number
    #offset: number
    #lifetime: number
    #startD: number
    #endD: number
    #thickness: number
    #tint: Color3
    #waves: ActiveWave[] = []
    #start: number
    #lastCycleIdx = -1

    #spawn(now: number): void {
        const mesh = this.#buildRing(now)
        mesh.position.copyFrom(this.#ctx.primaryMesh.absolutePosition)
        this.#orientToCamera(mesh)

        const mat = new StandardMaterial(`wave_mat_${now}`, this.#ctx.scene)
        mat.emissiveColor = this.#tint
        mat.diffuseColor = Color3.Black()
        mat.specularColor = Color3.Black()
        mat.alpha = 1
        mat.backFaceCulling = false
        mesh.material = mat

        this.#waves.push({ mesh, mat, born: now })
    }

    #buildRing(stamp: number): Mesh {
        const segments = 48
        const r = this.#startD / 2
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
            `wave_ring_${this.#ctx.primaryMesh.name}_${stamp}`,
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

EffectRegistry.register<WaveParams>('wave', (ctx, p) => new WaveEffect(ctx, p))
