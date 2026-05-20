import {
    AbstractMesh, Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";

// ─── Boid: a single self-steering agent ──────────────────────────────────────
//
//   Operates in a parent TransformNode's local space.  Designed for plaque-style
//   nodes whose local space spans [-0.5, +0.5] in X and Y (Z stays near 0).
//
//   Behaviours:
//     • seek(target)   — steer toward a point, scaled by maxSpeed/maxForce
//     • separate(boids) — push away from neighbors within `separationRadius`
//
//   Translated from the p5.js source in 3D-Audio-Canvas/boid.js, retuned for
//   the [-0.5, +0.5] coordinate range (the original p5 sketch used pixels).

export interface BoidConfig {
    maxSpeed?: number;          // max velocity magnitude  (local units / sec)
    maxForce?: number;          // max steering acceleration (local units / sec^2)
    separationRadius?: number;  // neighbors closer than this contribute to separation
    boundsHalfSize?: number;    // X/Y are clamped to ±this
}

const DEFAULTS: Required<BoidConfig> = {
    maxSpeed:         1.5,
    maxForce:         4.0,
    separationRadius: 0.08,
    boundsHalfSize:   0.5,
};

export class Boid {
    public pos: Vector3;
    public vel: Vector3;
    private acc: Vector3 = Vector3.Zero();
    public  mesh: AbstractMesh;

    private cfg: Required<BoidConfig>;

    constructor(parent: TransformNode, scene: Scene, config: BoidConfig = {}) {
        this.cfg = { ...DEFAULTS, ...config };
        const b = this.cfg.boundsHalfSize;

        this.pos = new Vector3(
            (Math.random() - 0.5) * 2 * b * 0.8,
            (Math.random() - 0.5) * 2 * b * 0.8,
            0,
        );
        this.vel = new Vector3(
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.4,
            0,
        );

        // Triangle-ish disc (3 segments → tetra silhouette, looks "fishy" enough)
        this.mesh = MeshBuilder.CreateDisc("boid", { radius: 0.025, tessellation: 3 }, scene);
        this.mesh.parent     = parent;
        this.mesh.isPickable = false;
        this.mesh.position.set(this.pos.x, this.pos.y, -0.03);   // hover in front of the plane

        const mat = new StandardMaterial("boid_mat", scene);
        mat.emissiveColor = new Color3(0, 0.8, 0.95);
        mat.disableLighting = true;
        this.mesh.material = mat;
    }

    private static _tmpDesired = new Vector3();
    private static _tmpDiff    = new Vector3();
    private static _tmpSteer   = new Vector3();

    seek(target: Vector3): Vector3 {
        const d = Boid._tmpDesired;
        d.copyFrom(target).subtractInPlace(this.pos);
        const lenSq = d.lengthSquared();
        if (lenSq < 1e-8) return Vector3.Zero();
        d.normalize().scaleInPlace(this.cfg.maxSpeed);
        d.subtractInPlace(this.vel);
        return clampMag(d, this.cfg.maxForce);
    }

    separate(others: Boid[]): Vector3 {
        const steer = Boid._tmpSteer.set(0, 0, 0);
        let count = 0;
        const r = this.cfg.separationRadius;
        for (const o of others) {
            if (o === this) continue;
            const dist = Vector3.Distance(this.pos, o.pos);
            if (dist > 0 && dist < r) {
                const diff = Boid._tmpDiff.copyFrom(this.pos)
                    .subtractInPlace(o.pos)
                    .normalize()
                    .scaleInPlace(1 / dist);
                steer.addInPlace(diff);
                count++;
            }
        }
        if (count === 0) return Vector3.Zero();
        steer.scaleInPlace(1 / count);
        if (steer.lengthSquared() < 1e-8) return Vector3.Zero();
        steer.normalize().scaleInPlace(this.cfg.maxSpeed).subtractInPlace(this.vel);
        return clampMag(steer, this.cfg.maxForce * 1.5);
    }

    /**
     * One simulation step.
     *   seek(target)   — scaled ×1.0
     *   separate(...)  — scaled ×2.0 (separation must dominate, else boids pile up)
     */
    apply(neighbors: Boid[], target: Vector3, dt: number): void {
        const sep  = this.separate(neighbors);
        const sk   = this.seek(target);
        this.acc.addInPlace(sep.scale(2.0)).addInPlace(sk.scale(1.0));

        // Integrate
        this.vel.addInPlace(this.acc.scale(dt));
        if (this.vel.lengthSquared() > this.cfg.maxSpeed * this.cfg.maxSpeed) {
            this.vel.normalize().scaleInPlace(this.cfg.maxSpeed);
        }
        this.pos.addInPlace(this.vel.scale(dt));
        this.acc.setAll(0);

        // Clamp to plaque bounds with a soft bounce
        const b = this.cfg.boundsHalfSize;
        if (this.pos.x >  b) { this.pos.x =  b; this.vel.x = -Math.abs(this.vel.x) * 0.5; }
        if (this.pos.x < -b) { this.pos.x = -b; this.vel.x =  Math.abs(this.vel.x) * 0.5; }
        if (this.pos.y >  b) { this.pos.y =  b; this.vel.y = -Math.abs(this.vel.y) * 0.5; }
        if (this.pos.y < -b) { this.pos.y = -b; this.vel.y =  Math.abs(this.vel.y) * 0.5; }

        // Update mesh
        this.mesh.position.set(this.pos.x, this.pos.y, -0.03);
        if (this.vel.lengthSquared() > 0.001) {
            // Face the velocity direction. Disc's "up" axis is +Y so subtract π/2.
            this.mesh.rotation.z = Math.atan2(this.vel.y, this.vel.x) - Math.PI / 2;
        }
    }

    dispose(): void {
        this.mesh.dispose();
    }
}

// ─── BoidSwarm: collection + toggle + count management ────────────────────────

export class BoidSwarm {
    public boids: Boid[] = [];
    public enabled = false;

    constructor(
        private parent: TransformNode,
        private scene: Scene,
        private config: BoidConfig = {},
    ) {}

    setCount(count: number): void {
        count = Math.max(0, Math.min(40, Math.floor(count)));
        while (this.boids.length < count) {
            const b = new Boid(this.parent, this.scene, this.config);
            b.mesh.isVisible = this.enabled;
            this.boids.push(b);
        }
        while (this.boids.length > count) {
            this.boids.pop()!.dispose();
        }
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        for (const b of this.boids) b.mesh.isVisible = enabled;
    }

    update(target: Vector3, dt: number): void {
        if (!this.enabled) return;
        for (const b of this.boids) b.apply(this.boids, target, dt);
    }

    /**
     * Compute aggregate motion metrics for the whole swarm.  Each returned value
     * is normalised to 0..1 so it can feed straight into an
     * AutomationN3DConnectable.Output without further scaling.
     *
     * Translated from the p5 source's `updateSwarmMetrics()`:
     *   centroidX/Y  — average boid position, mapped from [-0.5,+0.5] to 0..1
     *   dispersion   — average distance from centroid (how spread out)
     *   alignment    — |Σ velocity_unit| / N   (1 = perfectly unified flock)
     *   vorticity    — |Σ (r × v)| / N  rotational motion around centroid
     *
     * When the swarm is empty or disabled, returns calm defaults (0.5 centroid,
     * 0 motion metrics) so downstream parameters don't get spammed with noise.
     */
    computeMetrics(): {
        centroidX: number,
        centroidY: number,
        dispersion: number,
        alignment: number,
        vorticity: number,
    } {
        const n = this.boids.length;
        if (n === 0) {
            return { centroidX: 0.5, centroidY: 0.5, dispersion: 0, alignment: 0, vorticity: 0 };
        }

        // 1. Centroid (still in plaque-local space, [-0.5, +0.5])
        let cx = 0, cy = 0;
        for (const b of this.boids) { cx += b.pos.x; cy += b.pos.y; }
        cx /= n;  cy /= n;

        // 2. Single pass for dispersion / alignment / vorticity
        let dispersionSum = 0;
        let alignSumX = 0, alignSumY = 0;
        let vorticitySum = 0;
        for (const b of this.boids) {
            const dx = b.pos.x - cx;
            const dy = b.pos.y - cy;
            dispersionSum += Math.sqrt(dx * dx + dy * dy);

            const vmag = Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y);
            if (vmag > 1e-6) {
                alignSumX += b.vel.x / vmag;
                alignSumY += b.vel.y / vmag;
            }

            vorticitySum += dx * b.vel.y - dy * b.vel.x;
        }
        const dispersion = dispersionSum / n;
        const alignment  = Math.sqrt(alignSumX * alignSumX + alignSumY * alignSumY) / n;
        const vorticity  = Math.abs(vorticitySum / n);

        // 3. Normalise to 0..1
        //    centroid:    -0.5..+0.5  →  0..1
        //    dispersion:  0..0.5      →  0..1   (max diag from centre ≈ 0.7, halved for sensitivity)
        //    alignment:   0..1        →  0..1   (already)
        //    vorticity:   0..0.5      →  0..1   (empirical scale for "musically interesting motion")
        return {
            centroidX:  Math.max(0, Math.min(1, cx + 0.5)),
            centroidY:  Math.max(0, Math.min(1, cy + 0.5)),
            dispersion: Math.max(0, Math.min(1, dispersion / 0.5)),
            alignment:  Math.max(0, Math.min(1, alignment)),
            vorticity:  Math.max(0, Math.min(1, vorticity / 0.5)),
        };
    }

    dispose(): void {
        for (const b of this.boids) b.dispose();
        this.boids.length = 0;
    }
}

function clampMag(v: Vector3, max: number): Vector3 {
    const lenSq = v.lengthSquared();
    if (lenSq > max * max) return v.normalizeToNew().scaleInPlace(max);
    return v;
}
