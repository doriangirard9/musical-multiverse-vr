import {
    AbstractMesh, Color3, Color4, LinesMesh, Mesh, MeshBuilder, Observer,
    Quaternion, Scene, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable } from "../../tools";
import { BoidSwarm } from "./steering/Boid";

// ── Runtime resize bounds + boid limits (same defaults as AudioPlaque) ────────
const RESIZE_MIN = 0.5;
const RESIZE_MAX = 2.0;
const RESIZE_DEFAULT = 1.0;
const BOID_MAX = 30;

// ─── Superformula math ────────────────────────────────────────────────────────
//
//   r(θ) = ( |cos(mθ/4)/a|^n2 + |sin(mθ/4)/b|^n3 )^(-1/n1)
//
//   Six parameters (a, b, m, n1, n2, n3) carve out anything from a circle to
//   stars, flowers, blobs, and asterisks.  We hold a = b = 1 throughout and
//   expose m, n1, n2, n3 as user-controlled knobs.
//
function superformula(theta: number, m: number, n1: number, n2: number, n3: number): number {
    const part1 = Math.pow(Math.abs(Math.cos((m * theta) / 4)), n2);
    const part2 = Math.pow(Math.abs(Math.sin((m * theta) / 4)), n3);
    const r = Math.pow(part1 + part2, -1 / n1);
    return Number.isFinite(r) ? r : 0;
}

// Knob value mappings — host gives us 0..1, we map to a useful parameter range.
const RANGES = {
    m:     { min: 1.0, max: 20.0, default: 5.0 },
    n1:    { min: 0.1, max: 10.0, default: 1.5 },
    n2:    { min: 0.1, max: 10.0, default: 1.5 },
    n3:    { min: 0.1, max: 10.0, default: 1.5 },
    scale: { min: 0.10, max: 0.50, default: 0.40 },   // local units inside the 1×1 frame
    speed: { min: 0.10, max: 6.00, default: 1.50 },   // radians per second
} as const;

const norm = (key: keyof typeof RANGES, value: number) =>
    (value - RANGES[key].min) / (RANGES[key].max - RANGES[key].min);
const denorm = (key: keyof typeof RANGES, t01: number) =>
    RANGES[key].min + Math.max(0, Math.min(1, t01)) * (RANGES[key].max - RANGES[key].min);

const CURVE_SEGMENTS = 256;
const CURVE_RADIUS   = 0.010;
const TUBE_TESS      = 8;
const TRAIL_POINTS   = 64;

// ─── GUI ──────────────────────────────────────────────────────────────────────

export class SuperformulaN3DGUI implements Node3DGUI {
    root!: TransformNode;
    get worldSize() { return this.factory.size; }

    plaque!:    AbstractMesh;   // a thin invisible pickable plane the size of the frame —
                                // serves as the projection target for hover hints (kept
                                // around for parity with AudioPlaque, even if unused for input)
    handle!:    AbstractMesh;   // backing plate that goes in the bounding box

    // Connectors
    audioIn!:   AbstractMesh;
    audioOut!:  AbstractMesh;

    // Eight automation outputs (every metric the source p5 sketch exposed, plus Y)
    outPosX!:           AbstractMesh;
    outPosY!:           AbstractMesh;
    outRadius!:         AbstractMesh;
    outRadiusDelta!:    AbstractMesh;
    outAngularVel!:     AbstractMesh;
    outSpeed!:          AbstractMesh;
    outAcceleration!:   AbstractMesh;
    outCurvature!:      AbstractMesh;

    // Six knobs
    knobM!:     AbstractMesh;
    knobN1!:    AbstractMesh;
    knobN2!:    AbstractMesh;
    knobN3!:    AbstractMesh;
    knobScale!: AbstractMesh;
    knobSpeed!: AbstractMesh;

    // Curve + trail + ball
    curveTube!:     Mesh;
    curveMaterial!: StandardMaterial;
    trail!:         LinesMesh | null;
    trailPoints:    Vector3[] = [];
    trailColors:    Color4[]  = [];
    ballRoot!:      TransformNode;
    ball!:          AbstractMesh;

    // Cached scene reference for trail rebuild (LinesMesh has no scene getter)
    private scene!: Scene;

    // Runtime UI (resize handle + 3 boid buttons + container for boid meshes)
    resizeHandle!:   AbstractMesh;
    btnBoidToggle!: AbstractMesh;
    btnBoidAdd!:    AbstractMesh;
    btnBoidRemove!: AbstractMesh;
    boidToggleMat!: StandardMaterial;
    boidContainer!: TransformNode;

    // Ball halo for that soft-glow look (parented to ballRoot)
    ballHalo!: AbstractMesh;

    // Five new boid-metric outputs
    outBoidCentroidX!:  AbstractMesh;
    outBoidCentroidY!:  AbstractMesh;
    outBoidDispersion!: AbstractMesh;
    outBoidAlignment!:  AbstractMesh;
    outBoidVorticity!:  AbstractMesh;

    constructor(public factory: SuperformulaN3DFactory) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: { ConnectableUtils, MeshUtils, AudioN3DConnectable } } = context;
        this.scene = context.scene;

        this.root = new B.TransformNode("superformula_root", context.scene);

        // ── Backing handle (what the bounding box wraps) ──────────────────────
        // Same trick as AudioPlaque: keep the BB tight on a small plate behind
        // the visible frame so rays reach the curve and connectors directly.
        this.handle = B.MeshBuilder.CreateBox("superformula_handle", {
            width: 0.8, height: 0.8, depth: 0.04,
        }, context.scene);
        this.handle.parent     = this.root;
        this.handle.position.set(0, 0, 0.15);
        this.handle.material   = context.materialMat;
        this.handle.isPickable = false;

        // ── Invisible plaque plane (projection target, for parity / future use) ──
        this.plaque = B.MeshBuilder.CreatePlane("superformula_plaque", {
            size: 1, sideOrientation: 2,
        }, context.scene);
        this.plaque.parent     = this.root;
        this.plaque.isPickable = false;
        this.plaque.visibility = 0;

        // ── Glowing teal frame (4 thin edge boxes, like AudioPlaque) ──────────
        const edgeMat = new B.StandardMaterial("superformula_edge_mat", context.scene);
        edgeMat.emissiveColor = new B.Color3(0, 0.9, 0.9);

        const t = 0.012, half = 0.5;
        const edgeDefs: [string, number, number, number, number][] = [
            ["top",    1 + t,     t,    0,  half],
            ["bottom", 1 + t,     t,    0, -half],
            ["left",       t, 1 + t, -half,    0],
            ["right",      t, 1 + t,  half,    0],
        ];
        for (const [name, w, h, px, py] of edgeDefs) {
            const edge = B.MeshBuilder.CreateBox(
                `superformula_edge_${name}`, { width: w, height: h, depth: t }, context.scene,
            );
            edge.position.set(px, py, -0.006);
            edge.parent     = this.root;
            edge.material   = edgeMat;
            edge.isPickable = false;
        }

        // ── Curve tube (cylindrical, glowing teal) ────────────────────────────
        // Created once with `updatable: true` and a placeholder unit-circle path.
        // The logic class calls rebuildCurveTube() to swap the geometry whenever
        // a math knob changes.
        this.curveMaterial = new StandardMaterial("superformula_curve_mat", context.scene);
        this.curveMaterial.emissiveColor = new Color3(0, 1, 1);
        this.curveMaterial.disableLighting = true;

        const placeholderPath: Vector3[] = [];
        for (let i = 0; i <= CURVE_SEGMENTS; i++) {
            const a = (i / CURVE_SEGMENTS) * Math.PI * 2;
            placeholderPath.push(new B.Vector3(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0));
        }
        this.curveTube = B.MeshBuilder.CreateTube("superformula_curve", {
            path:         placeholderPath,
            radius:       CURVE_RADIUS,
            tessellation: TUBE_TESS,
            updatable:    true,
            cap:          B.Mesh.NO_CAP,
        }, context.scene);
        this.curveTube.parent     = this.root;
        this.curveTube.material   = this.curveMaterial;
        this.curveTube.isPickable = false;

        // ── Ball (the playhead) ───────────────────────────────────────────────
        this.ballRoot = new B.TransformNode("superformula_ball_root", context.scene);
        this.ballRoot.parent = this.root;
        this.ballRoot.position.set(0, 0, 0);

        this.ball = B.MeshBuilder.CreateSphere("superformula_ball", { diameter: 0.05 }, context.scene);
        this.ball.parent = this.ballRoot;
        this.ball.position.set(0, 0, -0.04);
        this.ball.isPickable = false;
        const ballMat = new B.StandardMaterial("superformula_ball_mat", context.scene);
        ballMat.emissiveColor = new B.Color3(1, 0.4, 0.7);
        ballMat.disableLighting = true;
        this.ball.material = ballMat;

        // Halo: bigger soft-glow sphere around the ball (same trick as AudioPlaque)
        this.ballHalo = B.MeshBuilder.CreateSphere("superformula_ball_halo", { diameter: 0.14 }, context.scene);
        this.ballHalo.parent = this.ballRoot;
        this.ballHalo.position.set(0, 0, -0.04);
        this.ballHalo.isPickable = false;
        const haloMat = new B.StandardMaterial("superformula_ball_halo_mat", context.scene);
        haloMat.emissiveColor = new B.Color3(1, 0.3, 0.6);
        haloMat.alpha = 0.18;
        haloMat.disableLighting = true;
        this.ballHalo.material = haloMat;

        // ── Connectors layout ─────────────────────────────────────────────────
        //
        //   Audio in/out:  top corners
        //   Math knobs:    left   column   (m, n1, n2, n3)
        //   Motion knobs:  right  column   (scale, speed)
        //   8 outputs:     bottom row
        //
        const audioColor = (() => {
            const c = AudioN3DConnectable.Color;
            return new Color4(c.r, c.g, c.b, 1);
        })();

        // Audio in / out — top corners
        this.audioIn = ConnectableUtils.createInputMesh("superformula_audio_in", 0.08, context.scene);
        this.audioIn.parent = this.root;
        this.audioIn.position.set(-0.65, 0.6, 0);
        MeshUtils.setColor(this.audioIn, audioColor);

        this.audioOut = ConnectableUtils.createOutputMesh("superformula_audio_out", 0.08, context.scene);
        this.audioOut.parent = this.root;
        this.audioOut.position.set(0.65, 0.6, 0);
        MeshUtils.setColor(this.audioOut, audioColor);

        // ── Knob meshes (small spheres, draggable) ────────────────────────────
        const makeKnob = (name: string, color: Color4): AbstractMesh => {
            const k = B.MeshBuilder.CreateSphere(name, { diameter: 0.10 }, context.scene);
            k.parent = this.root;
            const mat = new StandardMaterial(`${name}_mat`, context.scene);
            mat.emissiveColor = new Color3(color.r * 0.6, color.g * 0.6, color.b * 0.6);
            mat.diffuseColor  = new Color3(color.r, color.g, color.b);
            k.material = mat;
            MeshUtils.setColor(k, color);
            return k;
        };

        const mathColor   = new B.Color4(0.95, 0.85, 0.20, 1);   // gold/yellow
        const motionColor = new B.Color4(1.00, 0.55, 0.10, 1);   // orange
        this.knobM     = makeKnob("knob_m",     mathColor);
        this.knobN1    = makeKnob("knob_n1",    mathColor);
        this.knobN2    = makeKnob("knob_n2",    mathColor);
        this.knobN3    = makeKnob("knob_n3",    mathColor);
        this.knobScale = makeKnob("knob_scale", motionColor);
        this.knobSpeed = makeKnob("knob_speed", motionColor);

        // Math knobs — left column at x = -0.65
        this.knobM .position.set(-0.65,  0.30, 0);
        this.knobN1.position.set(-0.65,  0.10, 0);
        this.knobN2.position.set(-0.65, -0.10, 0);
        this.knobN3.position.set(-0.65, -0.30, 0);

        // Motion knobs — right column at x = +0.65
        this.knobScale.position.set(0.65,  0.20, 0);
        this.knobSpeed.position.set(0.65, -0.20, 0);

        // ── Eight metric output meshes — bottom row, single line ──────────────
        const outColors: Record<string, Color4> = {
            posX:        new B.Color4(0.90, 0.15, 0.15, 1),  // red
            posY:        new B.Color4(0.15, 0.40, 0.95, 1),  // blue
            radius:      new B.Color4(0.15, 0.85, 0.35, 1),  // green
            radiusDelta: new B.Color4(0.85, 0.85, 0.15, 1),  // yellow
            angVel:      new B.Color4(0.85, 0.40, 0.15, 1),  // orange
            speed:       new B.Color4(0.65, 0.20, 0.85, 1),  // purple
            accel:       new B.Color4(0.85, 0.20, 0.55, 1),  // magenta
            curvature:   new B.Color4(0.20, 0.85, 0.85, 1),  // cyan
        };
        const makeOut = (name: string, color: Color4): AbstractMesh => {
            const m = ConnectableUtils.createOutputMesh(name, 0.06, context.scene);
            m.parent = this.root;
            MeshUtils.setColor(m, color);
            return m;
        };

        // Eight evenly-spaced positions along y = -0.65, x ∈ [-0.6 .. +0.6]
        const xs = [-0.60, -0.43, -0.26, -0.09, 0.09, 0.26, 0.43, 0.60];
        this.outPosX         = makeOut("out_pos_x",         outColors.posX);          this.outPosX        .position.set(xs[0], -0.65, 0);
        this.outPosY         = makeOut("out_pos_y",         outColors.posY);          this.outPosY        .position.set(xs[1], -0.65, 0);
        this.outRadius       = makeOut("out_radius",        outColors.radius);        this.outRadius      .position.set(xs[2], -0.65, 0);
        this.outRadiusDelta  = makeOut("out_radius_delta",  outColors.radiusDelta);   this.outRadiusDelta .position.set(xs[3], -0.65, 0);
        this.outAngularVel   = makeOut("out_angular_vel",   outColors.angVel);        this.outAngularVel  .position.set(xs[4], -0.65, 0);
        this.outSpeed        = makeOut("out_speed",         outColors.speed);         this.outSpeed       .position.set(xs[5], -0.65, 0);
        this.outAcceleration = makeOut("out_acceleration",  outColors.accel);         this.outAcceleration.position.set(xs[6], -0.65, 0);
        this.outCurvature    = makeOut("out_curvature",     outColors.curvature);     this.outCurvature   .position.set(xs[7], -0.65, 0);

        // ── Trail buffer — pre-fill with origin so the line mesh has TRAIL_POINTS verts from frame 1 ──
        for (let i = 0; i < TRAIL_POINTS; i++) {
            this.trailPoints.push(new Vector3(0, 0, -0.005));
            // Alpha fades from 0 (oldest) to 1 (newest). New points go at the END.
            const a = i / (TRAIL_POINTS - 1);
            this.trailColors.push(new B.Color4(1, 0.3, 0.6, a));
        }
        this.trail = MeshBuilder.CreateLines("superformula_trail", {
            points:         this.trailPoints,
            colors:         this.trailColors,
            updatable:      true,
            useVertexAlpha: true,
        }, context.scene);
        this.trail.parent     = this.root;
        this.trail.isPickable = false;
        this.trail.alpha      = 1;

        // ── Resize handle (top-right corner — outputs row uses the bottom) ────
        this.resizeHandle = B.MeshBuilder.CreateSphere("sf_resize", { diameter: 0.08 }, context.scene);
        this.resizeHandle.parent = this.root;
        this.resizeHandle.position.set(0.45, 0.45, 0);
        const resizeMat = new StandardMaterial("sf_resize_mat", context.scene);
        resizeMat.emissiveColor = new Color3(0.85, 0.3, 0.95);   // violet
        this.resizeHandle.material = resizeMat;

        // ── Boid controls — top-left area, far from the 8 motion outputs ──────
        //
        //   Cylinder discs (rotated to face +Z) read more naturally as buttons
        //   than flat boxes and match the AudioPlaque's redesigned look.
        //
        const makeDiscButton = (name: string, diameter: number, emissive: Color3): AbstractMesh => {
            const m = B.MeshBuilder.CreateCylinder(name, {
                diameter, height: 0.025, tessellation: 24,
            }, context.scene);
            m.rotation.x = Math.PI / 2;
            const mat = new StandardMaterial(`${name}_mat`, context.scene);
            mat.emissiveColor = emissive;
            mat.disableLighting = true;
            m.material = mat;
            m.parent = this.root;
            return m;
        };

        this.btnBoidToggle = makeDiscButton("sf_boid_toggle", 0.10, new Color3(0, 0.5, 0.6));
        this.btnBoidToggle.position.set(-0.45, 0.45, 0);
        this.boidToggleMat = this.btnBoidToggle.material as StandardMaterial;

        this.btnBoidAdd = makeDiscButton("sf_boid_add", 0.08, new Color3(0.2, 0.85, 0.35));
        this.btnBoidAdd.position.set(-0.55, 0.45, 0);

        this.btnBoidRemove = makeDiscButton("sf_boid_remove", 0.08, new Color3(0.85, 0.2, 0.3));
        this.btnBoidRemove.position.set(-0.35, 0.45, 0);

        // ── Five new boid-metric outputs (second row below the 8 motion ones) ──
        const boidMetricColors: Color4[] = [
            new B.Color4(1.0,  0.4,  0.7,  1),  // centroidX  — pink
            new B.Color4(0.4,  0.7,  1.0,  1),  // centroidY  — light cyan
            new B.Color4(1.0,  0.85, 0.3,  1),  // dispersion — gold
            new B.Color4(0.3,  0.9,  0.55, 1),  // alignment  — emerald
            new B.Color4(0.75, 0.4,  1.0,  1),  // vorticity  — violet
        ];
        const boidMetricXs = [-0.4, -0.2, 0, 0.2, 0.4];
        const makeMetricOut = (name: string, x: number, color: Color4): AbstractMesh => {
            const m = ConnectableUtils.createOutputMesh(name, 0.06, context.scene);
            m.parent = this.root;
            m.position.set(x, -0.85, 0);
            MeshUtils.setColor(m, color);
            return m;
        };
        this.outBoidCentroidX  = makeMetricOut("sf_boid_cx",   boidMetricXs[0], boidMetricColors[0]);
        this.outBoidCentroidY  = makeMetricOut("sf_boid_cy",   boidMetricXs[1], boidMetricColors[1]);
        this.outBoidDispersion = makeMetricOut("sf_boid_disp", boidMetricXs[2], boidMetricColors[2]);
        this.outBoidAlignment  = makeMetricOut("sf_boid_algn", boidMetricXs[3], boidMetricColors[3]);
        this.outBoidVorticity  = makeMetricOut("sf_boid_vort", boidMetricXs[4], boidMetricColors[4]);

        // Container for boid meshes so they scale with gui.root
        this.boidContainer = new B.TransformNode("sf_boid_container", context.scene);
        this.boidContainer.parent = this.root;
    }

    /**
     * Rebuild the tube along a fresh superformula path.  Reuses the existing
     * mesh via the `instance` option (no allocations) — works as long as the
     * path length is constant, which it is.
     */
    rebuildCurveTube(m: number, n1: number, n2: number, n3: number, scale: number): void {
        const path: Vector3[] = [];
        for (let i = 0; i <= CURVE_SEGMENTS; i++) {
            const theta = (i / CURVE_SEGMENTS) * Math.PI * 2;
            const r = superformula(theta, m, n1, n2, n3) * scale;
            path.push(new Vector3(r * Math.cos(theta), r * Math.sin(theta), 0));
        }
        this.curveTube = MeshBuilder.CreateTube("superformula_curve", {
            path,
            radius:       CURVE_RADIUS,
            tessellation: TUBE_TESS,
            instance:     this.curveTube,
        }, this.scene);
    }

    /**
     * Push a new ball position onto the trail.  We shift every point one slot
     * older and write the new one at the head.  Vertex alphas stay the same
     * (newest = 1, oldest = 0), so visually the trail fades behind the ball.
     */
    pushTrailPoint(x: number, y: number): void {
        // Defensive: if the trail mesh has been disposed for any reason, skip
        // the update.  Without this guard, `CreateLines({ instance: <disposed mesh> })`
        // throws "Cannot set properties of null" because the vertex buffer is gone.
        if (!this.trail || this.trail.isDisposed()) return;

        // Slide all points down by one (drop the oldest).
        for (let i = 0; i < TRAIL_POINTS - 1; i++) {
            this.trailPoints[i].copyFrom(this.trailPoints[i + 1]);
        }
        this.trailPoints[TRAIL_POINTS - 1].set(x, y, -0.005);

        this.trail = MeshBuilder.CreateLines("superformula_trail", {
            points:    this.trailPoints,
            instance:  this.trail,
        }, this.scene);
    }

    async dispose() {
        try { this.curveTube?.dispose(); } catch (_) {}
        try { this.trail?.dispose();     } catch (_) {}
    }
}

// ─── Logic ────────────────────────────────────────────────────────────────────

export class SuperformulaN3D implements Node3D {
    // Knob values — kept in their natural ranges.  Mirrors the source p5 sketch.
    private m     = RANGES.m.default as number
    private n1    = RANGES.n1.default as number
    private n2    = RANGES.n2.default as number
    private n3    = RANGES.n3.default as number
    private scale = RANGES.scale.default as number
    private speed = RANGES.speed.default as number

    // The playhead angle along the curve, advanced each frame by `speed * dt`.
    private theta = 0;

    // Set by knob `setValue` callbacks — the render loop rebuilds the tube
    // when this is true and clears the flag.  Avoids per-frame mesh churn.
    private curveDirty = true;

    // Audio passthrough
    private gainIn!:  GainNode;
    private gainOut!: GainNode;

    // Eight automation outputs
    private outPosX!:           InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outPosY!:           InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outRadius!:         InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outRadiusDelta!:    InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outAngularVel!:     InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outSpeed!:          InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outAcceleration!:   InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outCurvature!:      InstanceType<(typeof AutomationN3DConnectable)["Output"]>;

    // Five new boid-metric outputs
    private boidCxOut!:    InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private boidCyOut!:    InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private boidDispOut!:  InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private boidAlignOut!: InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private boidVortOut!:  InstanceType<(typeof AutomationN3DConnectable)["Output"]>;

    // Runtime UI state — synced across peers
    private userScale = RESIZE_DEFAULT;
    private boidMode  = false;
    private boidCount = 5;

    private swarm!: BoidSwarm;

    constructor(context: Node3DContext, private gui: SuperformulaN3DGUI) {
        const { audioCtx, tools: T } = context;
        const scene = gui.root.getScene();

        // ── Bounding box wraps only the small backing handle ──────────────────
        context.addToBoundingBox(gui.handle);

        // ── Flatten the BB's spawn tilt (same observer pattern as AudioPlaque) ──
        let orientObs: Observer<Scene> | null = null;
        orientObs = context.observe(scene.onBeforeRenderObservable, () => {
            let p: TransformNode | null = gui.root.parent as TransformNode | null;
            while (p && p.name !== "boundingBox") p = p.parent as TransformNode | null;
            if (!p) return;
            p.rotation.set(0, 0, 0);
            p.rotationQuaternion = Quaternion.Identity();
            if (orientObs) {
                scene.onBeforeRenderObservable.remove(orientObs);
                orientObs = null;
            }
        });

        // ── Audio passthrough (same idea as AudioPlaque) ──────────────────────
        this.gainIn  = audioCtx.createGain();
        this.gainOut = audioCtx.createGain();
        this.gainIn.connect(this.gainOut);

        // ── Connectables ──────────────────────────────────────────────────────
        context.createConnectable(new T.AudioN3DConnectable.Input(
            "audioIn", [gui.audioIn], "Audio In", this.gainIn,
        ));
        context.createConnectable(new T.AudioN3DConnectable.Output(
            "audioOut", [gui.audioOut], "Audio Out", this.gainOut,
        ));

        const A = T.AutomationN3DConnectable.Output;
        this.outPosX         = new A("posX",         [gui.outPosX],         "Position X",        0.5);
        this.outPosY         = new A("posY",         [gui.outPosY],         "Position Y",        0.5);
        this.outRadius       = new A("radius",       [gui.outRadius],       "Ball Radius",       0.5);
        this.outRadiusDelta  = new A("radiusDelta",  [gui.outRadiusDelta],  "Ball Radius Delta", 0.0);
        this.outAngularVel   = new A("angVel",       [gui.outAngularVel],   "Angular Velocity",  0.0);
        this.outSpeed        = new A("speed",        [gui.outSpeed],        "Ball Speed",        0.0);
        this.outAcceleration = new A("acceleration", [gui.outAcceleration], "Ball Acceleration", 0.0);
        this.outCurvature    = new A("curvature",    [gui.outCurvature],    "Ball Curvature",    0.0);

        for (const o of [
            this.outPosX, this.outPosY, this.outRadius, this.outRadiusDelta,
            this.outAngularVel, this.outSpeed, this.outAcceleration, this.outCurvature,
        ]) context.createConnectable(o);

        // Five new boid swarm metric outputs.  Defaults match what
        // BoidSwarm.computeMetrics() returns for an empty swarm.
        this.boidCxOut    = new A("boidCentroidX",  [gui.outBoidCentroidX],  "Boid Centroid X", 0.5);
        this.boidCyOut    = new A("boidCentroidY",  [gui.outBoidCentroidY],  "Boid Centroid Y", 0.5);
        this.boidDispOut  = new A("boidDispersion", [gui.outBoidDispersion], "Boid Dispersion", 0);
        this.boidAlignOut = new A("boidAlignment",  [gui.outBoidAlignment],  "Boid Alignment",  0);
        this.boidVortOut  = new A("boidVorticity",  [gui.outBoidVorticity],  "Boid Vorticity",  0);
        for (const o of [this.boidCxOut, this.boidCyOut, this.boidDispOut, this.boidAlignOut, this.boidVortOut]) {
            context.createConnectable(o);
        }

        // ── Knob parameters (6) ───────────────────────────────────────────────
        const setupKnob = (
            id: string, label: string, mesh: AbstractMesh,
            range: keyof typeof RANGES,
            stepCount: number, decimals: number,
            getter: () => number, setter: (v: number) => void,
        ) => {
            // Visual scale: bigger sphere when value is higher.
            const updateVisual = () => mesh.scaling.setAll(0.5 + norm(range, getter()) * 0.6);
            updateVisual();

            context.createParameter({
                id,
                meshes: [mesh],
                getLabel: () => label,
                getStepCount: () => stepCount,
                getValue: () => norm(range, getter()),
                setValue: (v01: number) => {
                    setter(denorm(range, v01));
                    updateVisual();
                    this.curveDirty = true;
                    context.notifyStateChange(id);
                },
                stringify: (v01: number) => {
                    const real = denorm(range, v01);
                    return `${label}: ${real.toFixed(decimals)}`;
                },
            });
        };

        setupKnob("m",     "Petals (m)",     gui.knobM,     "m",      20, 1, () => this.m,     v => this.m     = v);
        setupKnob("n1",    "Sharpness (n1)", gui.knobN1,    "n1",     50, 2, () => this.n1,    v => this.n1    = v);
        setupKnob("n2",    "Width (n2)",     gui.knobN2,    "n2",     50, 2, () => this.n2,    v => this.n2    = v);
        setupKnob("n3",    "Height (n3)",    gui.knobN3,    "n3",     50, 2, () => this.n3,    v => this.n3    = v);
        setupKnob("scale", "Scale",          gui.knobScale, "scale",  40, 2, () => this.scale, v => this.scale = v);
        setupKnob("speed", "Speed",          gui.knobSpeed, "speed",  60, 2, () => this.speed, v => this.speed = v);

        // ── Resize handle + boid controls (same pattern as AudioPlaque) ───────
        //
        //   See AudioPlaqueN3D for the long comment explaining why we don't
        //   recompute the bounding box on scale change — Node3DInstance's
        //   dispose cascade would wipe the entire mesh tree.
        //
        const applyScale = (s: number) => {
            this.userScale = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, s));
            gui.root.scaling.setAll(this.userScale);
        };
        applyScale(this.userScale);

        context.createParameter({
            id: "userScale",
            meshes: [gui.resizeHandle],
            getLabel: () => "Resize",
            getStepCount: () => 0,
            getValue: () => (this.userScale - RESIZE_MIN) / (RESIZE_MAX - RESIZE_MIN),
            setValue: (v01: number) => {
                applyScale(RESIZE_MIN + v01 * (RESIZE_MAX - RESIZE_MIN));
                context.notifyStateChange("userScale");
            },
            stringify: (v01: number) =>
                `Size: ${(RESIZE_MIN + v01 * (RESIZE_MAX - RESIZE_MIN)).toFixed(2)}x`,
        });

        this.swarm = new BoidSwarm(gui.boidContainer, scene);
        this.swarm.setCount(this.boidCount);
        this.swarm.setEnabled(this.boidMode);

        const refreshToggleColor = () => {
            gui.boidToggleMat.emissiveColor = this.boidMode
                ? new Color3(0.95, 0.75, 0.15)
                : new Color3(0, 0.5, 0.6);
        };
        refreshToggleColor();

        context.createButton({
            id: "boidToggle",
            meshes: [gui.btnBoidToggle],
            label: "Boid Mode",
            color: new Color3(0.95, 0.75, 0.15),
            press: () => {
                this.boidMode = !this.boidMode;
                this.swarm.setEnabled(this.boidMode);
                refreshToggleColor();
                context.notifyStateChange("boidMode");
            },
            release: () => {},
        });

        context.createButton({
            id: "boidAdd",
            meshes: [gui.btnBoidAdd],
            label: "+ Boid",
            color: new Color3(0.2, 0.85, 0.2),
            press: () => {
                this.boidCount = Math.min(BOID_MAX, this.boidCount + 1);
                this.swarm.setCount(this.boidCount);
                context.notifyStateChange("boidCount");
            },
            release: () => {},
        });

        context.createButton({
            id: "boidRemove",
            meshes: [gui.btnBoidRemove],
            label: "− Boid",
            color: new Color3(0.85, 0.2, 0.2),
            press: () => {
                this.boidCount = Math.max(0, this.boidCount - 1);
                this.swarm.setCount(this.boidCount);
                context.notifyStateChange("boidCount");
            },
            release: () => {},
        });

        // ── Spawn log ─────────────────────────────────────────────────────────
        const fmt = (v: Vector3) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
        const sp = context.getPosition();

        // ── Per-frame loop ────────────────────────────────────────────────────
        //
        //   1. Rebuild the curve tube if a math knob changed (cheap — same
        //      vertex count, MeshBuilder.CreateTube{instance: ...} reuses buffer).
        //   2. Advance theta by speed * dt.
        //   3. Compute ball position on the formula at the new theta.
        //   4. Push that position onto the trail.
        //   5. Compute the seven motion metrics + Position Y, normalise to 0..1
        //      with the same calibration constants the source p5 sketch used,
        //      then write to the corresponding automation output.
        //
        let prevX = 0, prevY = 0;          // for speed (velocity)
        let prevVx = 0, prevVy = 0;        // for acceleration + curvature
        let prevR = 0;                     // for radius delta
        let prevTheta = 0;                 // for angular velocity
        let firstFrame = true;
        let _lastLogTime = 0;
        const VALUE_EPS = 1e-4;
        const lastSent = {
            posX: -1, posY: -1, radius: -1, radiusDelta: -1,
            angVel: -1, speed: -1, accel: -1, curvature: -1,
        };

        const sendIfChanged = (
            out: InstanceType<(typeof AutomationN3DConnectable)["Output"]>,
            key: keyof typeof lastSent, v: number,
        ) => {
            if (Math.abs(v - lastSent[key]) > VALUE_EPS) {
                out.value = v;
                lastSent[key] = v;
            }
        };

        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000.0, 0.1);
            if (dt <= 0) return;

            // 1. Rebuild curve when knobs changed
            if (this.curveDirty) {
                gui.rebuildCurveTube(this.m, this.n1, this.n2, this.n3, this.scale);
                this.curveDirty = false;
            }

            // 2. Advance theta (wrapped to keep numerics tidy)
            this.theta = (this.theta + this.speed * dt) % (Math.PI * 2);

            // 3. Compute ball position (in plaque local space, x/y in roughly [-scale, +scale])
            const r  = superformula(this.theta, this.m, this.n1, this.n2, this.n3) * this.scale;
            const x  = r * Math.cos(this.theta);
            const y  = r * Math.sin(this.theta);
            gui.ballRoot.position.set(x, y, 0);

            // 4. Trail
            gui.pushTrailPoint(x, y);

            // 5. Metrics
            //
            //   Most ranges are calibrated for "musically interesting motion" rather
            //   than absolute physical values — same spirit as the p5 source's
            //   `map(value, 0, X, 0, 1)` calls.  Tune to taste later.
            //
            const dx = x - prevX, dy = y - prevY;
            const speedMag = firstFrame ? 0 : Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 1e-6);
            const ax = (dx / Math.max(dt, 1e-6)) - prevVx;
            const ay = (dy / Math.max(dt, 1e-6)) - prevVy;
            const accMag = firstFrame ? 0 : Math.sqrt(ax * ax + ay * ay);

            // Curvature = signed angle between current and previous velocity.
            let curvature = 0;
            if (!firstFrame) {
                const v1 = Math.sqrt(prevVx * prevVx + prevVy * prevVy);
                const v2 = Math.sqrt(dx * dx + dy * dy);
                if (v1 > 1e-5 && v2 > 1e-5) {
                    const dot = (prevVx * dx + prevVy * dy) / (v1 * v2);
                    curvature = Math.acos(Math.max(-1, Math.min(1, dot)));
                }
            }

            const angularVel = firstFrame ? 0 : Math.abs(this.theta - prevTheta) / Math.max(dt, 1e-6);
            const radiusDelta = firstFrame ? 0 : Math.abs(r - prevR) / Math.max(dt, 1e-6);

            // Normalise everything to 0..1
            const halfFrame = 0.5;     // local space goes -0.5..+0.5 inside the frame
            const nPosX        = Math.max(0, Math.min(1, (x + halfFrame)));    // 0..1
            const nPosY        = Math.max(0, Math.min(1, (y + halfFrame)));
            const nRadius      = Math.max(0, Math.min(1, r / Math.max(this.scale * 2, 1e-6)));
            const nRadiusDelta = Math.max(0, Math.min(1, radiusDelta / 5.0));
            const nAngVel      = Math.max(0, Math.min(1, angularVel / 8.0));
            const nSpeed       = Math.max(0, Math.min(1, speedMag / 8.0));
            const nAccel       = Math.max(0, Math.min(1, accMag / 50.0));
            const nCurvature   = Math.max(0, Math.min(1, curvature / (Math.PI / 2)));

            sendIfChanged(this.outPosX,         "posX",        nPosX);
            sendIfChanged(this.outPosY,         "posY",        nPosY);
            sendIfChanged(this.outRadius,       "radius",      nRadius);
            sendIfChanged(this.outRadiusDelta,  "radiusDelta", nRadiusDelta);
            sendIfChanged(this.outAngularVel,   "angVel",      nAngVel);
            sendIfChanged(this.outSpeed,        "speed",       nSpeed);
            sendIfChanged(this.outAcceleration, "accel",       nAccel);
            sendIfChanged(this.outCurvature,    "curvature",   nCurvature);

            // Boid swarm chases the playhead ball (no-op when boidMode is OFF)
            this.swarm.update(gui.ballRoot.position, dt);

            // Boid metrics → 5 automation outputs (frozen naturally when swarm is OFF)
            const bm = this.swarm.computeMetrics();
            this.boidCxOut.value    = bm.centroidX;
            this.boidCyOut.value    = bm.centroidY;
            this.boidDispOut.value  = bm.dispersion;
            this.boidAlignOut.value = bm.alignment;
            this.boidVortOut.value  = bm.vorticity;

            // Visual polish — same breathing/pulse as AudioPlaque
            const tw = performance.now() / 1000;
            const breathe = 1 + Math.sin(tw * Math.PI) * 0.06;
            gui.ball.scaling.setAll(breathe);
            gui.ballHalo.scaling.setAll(breathe * 1.05);
            if (this.boidMode) {
                const pulse = 0.6 + Math.sin(tw * Math.PI * 2) * 0.4;
                gui.boidToggleMat.emissiveColor.set(0.95 * pulse, 0.75 * pulse, 0.15 * pulse);
            }

            // Bookkeeping for next frame
            prevVx = dx / Math.max(dt, 1e-6);
            prevVy = dy / Math.max(dt, 1e-6);
            prevX = x;
            prevY = y;
            prevR = r;
            prevTheta = this.theta;
            firstFrame = false;

            // Throttled state log (every 500 ms)
            const nowMs = performance.now();
            if (nowMs - _lastLogTime >= 500) {
                _lastLogTime = nowMs;
            }
        });
    }

    async dispose() {
        try { this.gainIn.disconnect();  } catch (_) {}
        try { this.gainOut.disconnect(); } catch (_) {}
        this.swarm?.dispose();
    }

    // ── State sync — knob values + runtime UI state; theta evolves per peer ──
    getStateKeys(): string[] {
        return ["m", "n1", "n2", "n3", "scale", "speed", "userScale", "boidMode", "boidCount"];
    }

    async getState(key: string): Promise<Serializable | void> {
        switch (key) {
            case "m":         return this.m;
            case "n1":        return this.n1;
            case "n2":        return this.n2;
            case "n3":        return this.n3;
            case "scale":     return this.scale;
            case "speed":     return this.speed;
            case "userScale": return this.userScale;
            case "boidMode":  return this.boidMode;
            case "boidCount": return this.boidCount;
        }
    }

    async setState(key: string, value: Serializable | undefined): Promise<void> {
        // Runtime-UI keys handled here (boolean/integer values); knob keys fall through.
        if (key === "userScale" && typeof value === "number") {
            this.userScale = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, value));
            this.gui.root.scaling.setAll(this.userScale);
            return;
        }
        if (key === "boidMode" && typeof value === "boolean") {
            this.boidMode = value;
            this.swarm.setEnabled(value);
            this.gui.boidToggleMat.emissiveColor = value
                ? new Color3(0.95, 0.75, 0.15)
                : new Color3(0, 0.5, 0.6);
            return;
        }
        if (key === "boidCount" && typeof value === "number") {
            this.boidCount = Math.max(0, Math.min(BOID_MAX, Math.floor(value)));
            this.swarm.setCount(this.boidCount);
            return;
        }
        if (typeof value !== "number") return;
        switch (key) {
            case "m":     this.m     = value; this.curveDirty = true; break;
            case "n1":    this.n1    = value; this.curveDirty = true; break;
            case "n2":    this.n2    = value; this.curveDirty = true; break;
            case "n3":    this.n3    = value; this.curveDirty = true; break;
            case "scale": this.scale = value; this.curveDirty = true; break;
            case "speed": this.speed = value; break;
        }
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────
//
//   Same SMALL / DEFAULT / LARGE pattern as AudioPlaqueN3DFactory.
//   Each preset is registered separately in Node3DBuilder.ts.
//
export class SuperformulaN3DFactory implements Node3DFactory<SuperformulaN3DGUI, SuperformulaN3D> {
    constructor(
        public size: number,
        public label: string,
        public description: string,
    ) { }

    tags = ["automation", "controller", "superformula", "xy_pad"];

    async createGUI(context: Node3DGUIContext) {
        const gui = new SuperformulaN3DGUI(this);
        await gui.init(context);
        return gui;
    }

    async create(context: Node3DContext, gui: SuperformulaN3DGUI) {
        return new SuperformulaN3D(context, gui);
    }

    static SMALL = new SuperformulaN3DFactory(
        2.0,
        "Small Superformula",
        "Compact Gielis Superformula controller with 8 motion-metric automation outputs.",
    );

    static DEFAULT = new SuperformulaN3DFactory(
        3.0,
        "Superformula",
        "Gielis Superformula controller. Six knobs shape the parametric curve; a playhead " +
        "ball traces it autonomously. Eight motion metrics (X, Y, Radius, Speed, etc.) are " +
        "exposed as automation outputs you can wire to any WAM parameter.",
    );

    static LARGE = new SuperformulaN3DFactory(
        5.0,
        "Large Superformula",
        "Wall-sized Superformula controller for fine-grained shape and timing. Same 8 outputs as the default.",
    );
}
