import {
    AbstractMesh, Color3, Color4, LinesMesh, Mesh, MeshBuilder, Observer,
    Quaternion, Scene, StandardMaterial, TransformNode, Vector3, VertexBuffer, VertexData,
} from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable } from "../../tools";
import { BoidSwarm } from "./steering/Boid";
import { setupInstrumentControls, makeClusterButtons, OutputPulser, type TunableParam, type ClusterButtons } from "./instrumentControls";

// 3D Gielis supershape automation controller: a playhead spirals over the
// surface and its motion metrics drive automation outputs. The shape is the
// spherical product of two superformulas (r1 longitudinal, r2 latitudinal).
// Knob changes morph the surface smoothly each frame (updatable mesh, ~1200
// verts), vertices are coloured by radius, and a back handle plate is the only
// bounding-box target so rays reach the knobs/connectors in front.

function superformula(angle: number, m: number, n1: number, n2: number, n3: number): number {
    const p1 = Math.pow(Math.abs(Math.cos((m * angle) / 4)), n2);
    const p2 = Math.pow(Math.abs(Math.sin((m * angle) / 4)), n3);
    const r = Math.pow(p1 + p2, -1 / n1);
    return Number.isFinite(r) ? r : 0;
}

// Knob ranges — 2 profiles x (m, n1, n2, n3) + scale + speed
const RANGES = {
    mA:  { min: 1.0,  max: 20.0, default: 6.0 },
    n1A: { min: 0.1,  max: 10.0, default: 1.0 },
    n2A: { min: 0.1,  max: 10.0, default: 1.8 },
    n3A: { min: 0.1,  max: 10.0, default: 1.8 },
    mB:  { min: 1.0,  max: 20.0, default: 3.0 },
    n1B: { min: 0.1,  max: 10.0, default: 1.0 },
    n2B: { min: 0.1,  max: 10.0, default: 1.5 },
    n3B: { min: 0.1,  max: 10.0, default: 1.5 },
    scale: { min: 0.10, max: 0.45, default: 0.32 },
    speed: { min: 0.10, max: 6.00, default: 1.20 },
    // Ball steering (0.5 = centred). Off-centre, the three knobs define a
    // direction the ball glides toward on the surface; all centred → automatic
    // spiral. Automatable like any parameter.
    ballX: { min: 0, max: 1, default: 0.5 },
    ballY: { min: 0, max: 1, default: 0.5 },
    ballZ: { min: 0, max: 1, default: 0.5 },
} as const;
type RangeKey = keyof typeof RANGES;

// Only these keys trigger a surface rebuild; the ball knobs can be modulated
// continuously without rebuilding ~4700 vertices per frame.
const SHAPE_KEYS: RangeKey[] = ["mA", "n1A", "n2A", "n3A", "mB", "n1B", "n2B", "n3B", "scale"];

const BOID_MAX = 30;

// Shape presets (REAL values within the RANGES). The morph smoothing makes
// transitions between presets fluid.
const SF3D_PRESETS: Record<string, Record<string, number>> = {
    "Sphere":   { mA: 8,  n1A: 8,   n2A: 8,   n3A: 8,   mB: 8,  n1B: 8,   n2B: 8,   n3B: 8,   scale: 0.34, speed: 0.5 },
    "Flower":   { mA: 6,  n1A: 1,   n2A: 1.7, n3A: 1.7, mB: 3,  n1B: 1,   n2B: 1.5, n3B: 1.5, scale: 0.32, speed: 0.6 },
    "Star":     { mA: 7,  n1A: 0.3, n2A: 0.4, n3A: 0.4, mB: 7,  n1B: 0.3, n2B: 0.4, n3B: 0.4, scale: 0.30, speed: 0.8 },
    "Crystal":  { mA: 3,  n1A: 0.4, n2A: 0.5, n3A: 0.5, mB: 4,  n1B: 0.4, n2B: 0.5, n3B: 0.5, scale: 0.30, speed: 1.0 },
    "Asteroid": { mA: 5,  n1A: 1.2, n2A: 2.5, n3A: 0.6, mB: 6,  n1B: 1.5, n2B: 0.6, n3B: 2.2, scale: 0.30, speed: 0.4 },
    "Galaxy":   { mA: 12, n1A: 0.6, n2A: 1,   n3A: 1,   mB: 2,  n1B: 2,   n2B: 1,   n3B: 1,   scale: 0.36, speed: 2.5 },
};

const norm   = (key: RangeKey, v: number) => (v - RANGES[key].min) / (RANGES[key].max - RANGES[key].min);
const denorm = (key: RangeKey, t: number) => RANGES[key].min + Math.max(0, Math.min(1, t)) * (RANGES[key].max - RANGES[key].min);

// Resizing is two-handed (host-level); no per-instrument handle.

// Surface resolution. ~97x49 (~4750 verts) is needed so the displayed surface
// matches the formula closely; a coarser mesh made the ball "float" off the
// facets once m exceeded ~6. Rebuilt only while morphing.
const U_SEGS = 96;   // θ : -π..π
const V_SEGS = 48;   // φ : -π/2..π/2
const TRAIL_POINTS = 90;

// Colour gradient by normalized radius
const COLOR_INNER = new Color3(0.30, 0.10, 0.55);   // deep violet
const COLOR_OUTER = new Color3(0.20, 0.95, 1.00);   // cyan

// ─── GUI ──────────────────────────────────────────────────────────────────────

export class Superformula3DN3DGUI implements Node3DGUI {
    root!: TransformNode;
    get worldSize() { return this.factory.size; }

    handle!: AbstractMesh;          // back plate — only bounding-box target
    shapeRoot!: TransformNode;      // carries the surface (auto-rotation)
    surface!: Mesh;                 // updatable supershape mesh
    wire!: Mesh;                    // wireframe clone (shared geometry)
    wireMat!: StandardMaterial;
    edgeMat!: StandardMaterial;     // shared material for the 12 cage edges

    // Playhead
    ballRoot!: TransformNode;
    ball!: AbstractMesh;
    ballHalo!: AbstractMesh;
    trail!: LinesMesh | null;
    trailPoints: Vector3[] = [];

    // Connectors / knobs
    audioIn!: AbstractMesh;
    audioOut!: AbstractMesh;
    knobs: Record<string, AbstractMesh> = {};

    outPosX!: AbstractMesh;  outPosY!: AbstractMesh;  outPosZ!: AbstractMesh;
    outRadius!: AbstractMesh; outRadiusDelta!: AbstractMesh;
    outSpeed!: AbstractMesh; outAcceleration!: AbstractMesh; outCurvature!: AbstractMesh;

    // Boids
    boidContainer!: TransformNode;
    btnBoidToggle!: AbstractMesh;
    btnBoidAdd!: AbstractMesh;
    btnBoidRemove!: AbstractMesh;
    boidToggleMat!: StandardMaterial;
    outBoidCx!: AbstractMesh;  outBoidCy!: AbstractMesh;  outBoidCz!: AbstractMesh;
    outBoidDisp!: AbstractMesh; outBoidAlign!: AbstractMesh; outBoidVort!: AbstractMesh;

    // Standard cluster
    cluster!: ClusterButtons;

    // Reused mesh buffers (positions/normals/colors; fixed indices)
    private positions!: Float32Array;
    private normals!: Float32Array;
    private colors!: Float32Array;

    private scene!: Scene;

    constructor(public factory: Superformula3DN3DFactory) {}

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: { ConnectableUtils, MeshUtils, AudioN3DConnectable } } = context;
        const scene = this.scene = context.scene;

        this.root = new B.TransformNode("sf3d_root", scene);

        // Backing handle (bounding box)
        this.handle = B.MeshBuilder.CreateBox("sf3d_handle", {
            width: 1.7, height: 1.7, depth: 0.06,
        }, scene);
        this.handle.parent = this.root;
        this.handle.position.set(0, 0, 0.62);
        this.handle.material = context.materialMat;
        this.handle.isPickable = false;

        // Cage: 12 glowing edges (pulse while morphing)
        this.edgeMat = new StandardMaterial("sf3d_edge_mat", scene);
        this.edgeMat.emissiveColor = new Color3(0, 0.75, 0.85);
        this.edgeMat.disableLighting = true;
        const h = 0.5, et = 0.012;
        const mkEdge = (name: string, w: number, hgt: number, d: number, x: number, y: number, z: number) => {
            const e = B.MeshBuilder.CreateBox(name, { width: w, height: hgt, depth: d }, scene);
            e.parent = this.root;
            e.position.set(x, y, z);
            e.material = this.edgeMat;
            e.isPickable = false;
        };
        for (const sy of [-h, h]) for (const sz of [-h, h]) mkEdge(`sf3d_ex_${sy}_${sz}`, 1 + et, et, et, 0, sy, sz);
        for (const sx of [-h, h]) for (const sz of [-h, h]) mkEdge(`sf3d_ey_${sx}_${sz}`, et, 1 + et, et, sx, 0, sz);
        for (const sx of [-h, h]) for (const sy of [-h, h]) mkEdge(`sf3d_ez_${sx}_${sy}`, et, et, 1 + et, sx, sy, 0);

        // Supershape surface (custom updatable mesh)
        this.shapeRoot = new B.TransformNode("sf3d_shape_root", scene);
        this.shapeRoot.parent = this.root;

        const vertCount = (U_SEGS + 1) * (V_SEGS + 1);
        this.positions = new Float32Array(vertCount * 3);
        this.normals   = new Float32Array(vertCount * 3);
        this.colors    = new Float32Array(vertCount * 4);
        const indices: number[] = [];
        for (let v = 0; v < V_SEGS; v++) {
            for (let u = 0; u < U_SEGS; u++) {
                const a = v * (U_SEGS + 1) + u;
                const b = a + 1;
                const c = a + (U_SEGS + 1);
                const d = c + 1;
                indices.push(a, b, c, b, d, c);
            }
        }

        this.surface = new Mesh("sf3d_surface", scene);
        this.surface.parent = this.shapeRoot;
        this.surface.isPickable = false;
        const vd = new VertexData();
        vd.positions = this.positions;
        vd.indices   = indices;
        vd.normals   = this.normals;
        vd.colors    = this.colors;
        vd.applyToMesh(this.surface, true);

        const surfMat = new StandardMaterial("sf3d_surface_mat", scene);
        surfMat.diffuseColor  = new Color3(1, 1, 1);          // modulated by vertex colors
        surfMat.emissiveColor = new Color3(0.18, 0.20, 0.28); // readable without direct light
        surfMat.specularColor = new Color3(0.4, 0.4, 0.45);
        surfMat.backFaceCulling = false;                      // concave shapes show their inside
        this.surface.material = surfMat;
        this.surface.hasVertexAlpha = false;
        // Buffers change every morph without refreshing bounding info, so disable
        // frustum culling (cheap mesh, always rendered).
        this.surface.alwaysSelectAsActiveMesh = true;

        // Wireframe overlay — geometry shared with the surface (clone), so it
        // updates for free on every morph.
        this.wire = this.surface.clone("sf3d_wire");
        this.wire.parent = this.shapeRoot;
        this.wire.isPickable = false;
        this.wire.scaling.setAll(1.015);
        // The clone keeps the degenerate bounding info from clone time and never
        // refreshes it, so without this flag it would cull at some view angles.
        this.wire.alwaysSelectAsActiveMesh = true;
        this.wireMat = new StandardMaterial("sf3d_wire_mat", scene);
        this.wireMat.emissiveColor = new Color3(0.2, 0.9, 1.0);
        this.wireMat.disableLighting = true;
        this.wireMat.wireframe = true;
        this.wireMat.alpha = 0.16;
        this.wireMat.backFaceCulling = false;
        this.wire.material = this.wireMat;

        // Playhead: ball + halo + 3D trail
        this.ballRoot = new B.TransformNode("sf3d_ball_root", scene);
        this.ballRoot.parent = this.shapeRoot;   // follows the shape's auto-rotation

        this.ball = B.MeshBuilder.CreateSphere("sf3d_ball", { diameter: 0.05 }, scene);
        this.ball.parent = this.ballRoot;
        this.ball.isPickable = false;
        const ballMat = new StandardMaterial("sf3d_ball_mat", scene);
        ballMat.emissiveColor = new Color3(1, 0.4, 0.7);
        ballMat.disableLighting = true;
        this.ball.material = ballMat;

        this.ballHalo = B.MeshBuilder.CreateSphere("sf3d_ball_halo", { diameter: 0.13 }, scene);
        this.ballHalo.parent = this.ballRoot;
        this.ballHalo.isPickable = false;
        const haloMat = new StandardMaterial("sf3d_ball_halo_mat", scene);
        haloMat.emissiveColor = new Color3(1, 0.3, 0.6);
        haloMat.alpha = 0.18;
        haloMat.disableLighting = true;
        this.ballHalo.material = haloMat;

        const trailColors: Color4[] = [];
        for (let i = 0; i < TRAIL_POINTS; i++) {
            this.trailPoints.push(new Vector3(0, 0, 0));
            trailColors.push(new Color4(1, 0.3, 0.6, i / (TRAIL_POINTS - 1)));
        }
        this.trail = MeshBuilder.CreateLines("sf3d_trail", {
            points: this.trailPoints, colors: trailColors,
            updatable: true, useVertexAlpha: true,
        }, scene);
        this.trail.parent = this.shapeRoot;
        this.trail.isPickable = false;
        // Same reason as the wire: per-instance updates don't refresh bounding
        // info, so without this flag culling is erratic.
        this.trail.alwaysSelectAsActiveMesh = true;

        // Audio in/out — top corners
        const audioColor = (() => { const c = AudioN3DConnectable.Color; return new Color4(c.r, c.g, c.b, 1); })();
        this.audioIn = ConnectableUtils.createInputMesh("sf3d_audio_in", 0.08, scene);
        this.audioIn.parent = this.root;
        this.audioIn.position.set(-0.68, 0.68, 0);
        MeshUtils.setColor(this.audioIn, audioColor);

        this.audioOut = ConnectableUtils.createOutputMesh("sf3d_audio_out", 0.08, scene);
        this.audioOut.parent = this.root;
        this.audioOut.position.set(0.68, 0.68, 0);
        MeshUtils.setColor(this.audioOut, audioColor);

        // Knobs: profile A left (gold), profile B right (magenta),
        // scale/speed at the bottom of each column (orange).
        const mkKnob = (name: string, color: Color4): AbstractMesh => {
            const k = B.MeshBuilder.CreateSphere(name, { diameter: 0.10 }, scene);
            k.parent = this.root;
            const mat = new StandardMaterial(`${name}_mat`, scene);
            mat.emissiveColor = new Color3(color.r * 0.6, color.g * 0.6, color.b * 0.6);
            mat.diffuseColor  = new Color3(color.r, color.g, color.b);
            k.material = mat;
            return k;
        };
        const goldA   = new Color4(0.95, 0.85, 0.20, 1);
        const magentaB = new Color4(0.95, 0.35, 0.85, 1);
        const motion  = new Color4(1.00, 0.55, 0.10, 1);

        const colA: RangeKey[] = ["mA", "n1A", "n2A", "n3A"];
        const colB: RangeKey[] = ["mB", "n1B", "n2B", "n3B"];
        colA.forEach((key, i) => {
            const k = mkKnob(`sf3d_knob_${key}`, goldA);
            k.position.set(-0.68, 0.42 - i * 0.20, 0);
            this.knobs[key] = k;
        });
        colB.forEach((key, i) => {
            const k = mkKnob(`sf3d_knob_${key}`, magentaB);
            k.position.set(0.68, 0.42 - i * 0.20, 0);
            this.knobs[key] = k;
        });
        this.knobs["scale"] = mkKnob("sf3d_knob_scale", motion);
        this.knobs["scale"].position.set(-0.68, -0.42, 0);
        this.knobs["speed"] = mkKnob("sf3d_knob_speed", motion);
        this.knobs["speed"].position.set(0.68, -0.42, 0);

        // Ball steering knobs — pink like the ball, bottom-centre below the cage
        const pink = new Color4(1.0, 0.45, 0.75, 1);
        (["ballX", "ballY", "ballZ"] as RangeKey[]).forEach((key, i) => {
            const k = mkKnob(`sf3d_knob_${key}`, pink);
            k.position.set(-0.22 + i * 0.22, -0.62, 0);
            this.knobs[key] = k;
        });

        // 8 automation outputs — bottom row
        const outColors: Record<string, Color4> = {
            posX:        new Color4(0.90, 0.15, 0.15, 1),
            posY:        new Color4(0.15, 0.40, 0.95, 1),
            posZ:        new Color4(0.15, 0.85, 0.85, 1),
            radius:      new Color4(0.15, 0.85, 0.35, 1),
            radiusDelta: new Color4(0.85, 0.85, 0.15, 1),
            speed:       new Color4(0.65, 0.20, 0.85, 1),
            accel:       new Color4(0.85, 0.20, 0.55, 1),
            curvature:   new Color4(1.00, 0.60, 0.20, 1),
        };
        const mkOut = (name: string, x: number, c: Color4): AbstractMesh => {
            const m = ConnectableUtils.createOutputMesh(name, 0.06, scene);
            m.parent = this.root;
            m.position.set(x, -0.78, 0);
            MeshUtils.setColor(m, c);
            return m;
        };
        const xs = [-0.60, -0.43, -0.26, -0.09, 0.09, 0.26, 0.43, 0.60];
        this.outPosX         = mkOut("sf3d_out_pos_x",  xs[0], outColors.posX);
        this.outPosY         = mkOut("sf3d_out_pos_y",  xs[1], outColors.posY);
        this.outPosZ         = mkOut("sf3d_out_pos_z",  xs[2], outColors.posZ);
        this.outRadius       = mkOut("sf3d_out_radius", xs[3], outColors.radius);
        this.outRadiusDelta  = mkOut("sf3d_out_rdelta", xs[4], outColors.radiusDelta);
        this.outSpeed        = mkOut("sf3d_out_speed",  xs[5], outColors.speed);
        this.outAcceleration = mkOut("sf3d_out_accel",  xs[6], outColors.accel);
        this.outCurvature    = mkOut("sf3d_out_curv",   xs[7], outColors.curvature);

        // Boid controls — discs at the top-left
        const mkDisc = (name: string, diameter: number, emissive: Color3): AbstractMesh => {
            const m = B.MeshBuilder.CreateCylinder(name, { diameter, height: 0.025, tessellation: 24 }, scene);
            m.rotation.x = Math.PI / 2;
            const mat = new StandardMaterial(`${name}_mat`, scene);
            mat.emissiveColor = emissive;
            mat.disableLighting = true;
            m.material = mat;
            m.parent = this.root;
            return m;
        };
        this.btnBoidAdd = mkDisc("sf3d_boid_add", 0.08, new Color3(0.2, 0.85, 0.35));
        this.btnBoidAdd.position.set(-0.50, 0.70, 0);
        this.btnBoidToggle = mkDisc("sf3d_boid_toggle", 0.10, new Color3(0, 0.5, 0.6));
        this.btnBoidToggle.position.set(-0.36, 0.70, 0);
        this.boidToggleMat = this.btnBoidToggle.material as StandardMaterial;
        this.btnBoidRemove = mkDisc("sf3d_boid_remove", 0.08, new Color3(0.85, 0.2, 0.3));
        this.btnBoidRemove.position.set(-0.22, 0.70, 0);

        // Standard cluster — above the cage, centred
        this.cluster = makeClusterButtons(B, scene, this.root, { x: -0.24, y: 0.86, z: 0 });

        // The swarm lives in shape space (follows its rotation, like the ball)
        this.boidContainer = new B.TransformNode("sf3d_boid_container", scene);
        this.boidContainer.parent = this.shapeRoot;

        // 6 boid-metric outputs — second row below the motion outputs
        const mkBoidOut = (name: string, x: number, c: Color4): AbstractMesh => {
            const m = ConnectableUtils.createOutputMesh(name, 0.06, scene);
            m.parent = this.root;
            m.position.set(x, -0.92, 0);
            MeshUtils.setColor(m, c);
            return m;
        };
        const bxs = [-0.50, -0.30, -0.10, 0.10, 0.30, 0.50];
        this.outBoidCx    = mkBoidOut("sf3d_boid_cx",    bxs[0], new Color4(1.00, 0.40, 0.70, 1));  // pink
        this.outBoidCy    = mkBoidOut("sf3d_boid_cy",    bxs[1], new Color4(0.40, 0.70, 1.00, 1));  // light blue
        this.outBoidCz    = mkBoidOut("sf3d_boid_cz",    bxs[2], new Color4(0.30, 0.95, 0.80, 1));  // turquoise
        this.outBoidDisp  = mkBoidOut("sf3d_boid_disp",  bxs[3], new Color4(1.00, 0.85, 0.30, 1));  // gold
        this.outBoidAlign = mkBoidOut("sf3d_boid_align", bxs[4], new Color4(0.30, 0.90, 0.55, 1));  // emerald
        this.outBoidVort  = mkBoidOut("sf3d_boid_vort",  bxs[5], new Color4(0.75, 0.40, 1.00, 1));  // violet
    }

    /** Recompute supershape positions/normals/colors for the given parameters.
     *  Reuses buffers with fixed indices — no per-frame allocation. */
    rebuildSurface(
        mA: number, n1A: number, n2A: number, n3A: number,
        mB: number, n1B: number, n2B: number, n3B: number,
        scale: number,
    ): void {
        if (this.surface.isDisposed()) return;
        const pos = this.positions;
        let maxR2 = 1e-9;
        let i = 0;
        for (let v = 0; v <= V_SEGS; v++) {
            const phi = -Math.PI / 2 + (v / V_SEGS) * Math.PI;
            const r2 = superformula(phi, mB, n1B, n2B, n3B);
            const cp = Math.cos(phi), sp = Math.sin(phi);
            for (let u = 0; u <= U_SEGS; u++) {
                const theta = -Math.PI + (u / U_SEGS) * 2 * Math.PI;
                const r1 = superformula(theta, mA, n1A, n2A, n3A);
                const x = r1 * Math.cos(theta) * r2 * cp * scale;
                const y = r2 * sp * scale;
                const z = r1 * Math.sin(theta) * r2 * cp * scale;
                pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
                const d2 = x * x + y * y + z * z;
                if (d2 > maxR2) maxR2 = d2;
                i += 3;
            }
        }

        // Colors: violet → cyan gradient by normalized radius
        const maxR = Math.sqrt(maxR2);
        const n = pos.length / 3;
        for (let k = 0; k < n; k++) {
            const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
            const t = Math.sqrt(x * x + y * y + z * z) / maxR;
            this.colors[k * 4]     = COLOR_INNER.r + (COLOR_OUTER.r - COLOR_INNER.r) * t;
            this.colors[k * 4 + 1] = COLOR_INNER.g + (COLOR_OUTER.g - COLOR_INNER.g) * t;
            this.colors[k * 4 + 2] = COLOR_INNER.b + (COLOR_OUTER.b - COLOR_INNER.b) * t;
            this.colors[k * 4 + 3] = 1;
        }

        VertexData.ComputeNormals(pos, this.surface.getIndices(), this.normals);
        this.surface.updateVerticesData(VertexBuffer.PositionKind, pos);
        this.surface.updateVerticesData(VertexBuffer.NormalKind, this.normals);
        this.surface.updateVerticesData(VertexBuffer.ColorKind, this.colors);
        this.surface.refreshBoundingInfo();
    }

    /** Sample the displayed surface at (u01, v01) ∈ [0,1]² by bilinear
     *  interpolation of the 4 neighbouring mesh vertices, so the ball stays
     *  glued to the rendered facets (no drift from the analytic formula). */
    samplePoint(u01: number, v01: number, outPos: Vector3, outNormal: Vector3): void {
        const fu = Math.max(0, Math.min(0.9999, u01)) * U_SEGS;
        const fv = Math.max(0, Math.min(0.9999, v01)) * V_SEGS;
        const i0 = Math.floor(fu), j0 = Math.floor(fv);
        const du = fu - i0, dv = fv - j0;
        const read = (buf: Float32Array, i: number, j: number, k: number) =>
            buf[(j * (U_SEGS + 1) + i) * 3 + k];
        const bilerp = (buf: Float32Array, k: number) =>
            (read(buf, i0, j0, k) * (1 - du) + read(buf, i0 + 1, j0, k) * du) * (1 - dv) +
            (read(buf, i0, j0 + 1, k) * (1 - du) + read(buf, i0 + 1, j0 + 1, k) * du) * dv;
        outPos.set(bilerp(this.positions, 0), bilerp(this.positions, 1), bilerp(this.positions, 2));
        outNormal.set(bilerp(this.normals, 0), bilerp(this.normals, 1), bilerp(this.normals, 2));
    }

    /** Push a playhead position into the fading trail. */
    pushTrailPoint(p: Vector3): void {
        if (!this.trail || this.trail.isDisposed()) return;
        for (let i = 0; i < TRAIL_POINTS - 1; i++) this.trailPoints[i].copyFrom(this.trailPoints[i + 1]);
        this.trailPoints[TRAIL_POINTS - 1].copyFrom(p);
        this.trail = MeshBuilder.CreateLines("sf3d_trail", {
            points: this.trailPoints, instance: this.trail,
        }, this.scene);
    }

    async dispose() {
        try { this.trail?.dispose(); } catch (_) {}
    }
}

// ─── Logic ────────────────────────────────────────────────────────────────────

export class Superformula3DN3D implements Node3D {
    // Targets (knobs write here) and current values (smoothed toward the target)
    private target: Record<RangeKey, number> = Object.fromEntries(
        (Object.keys(RANGES) as RangeKey[]).map(k => [k, RANGES[k].default]),
    ) as Record<RangeKey, number>;
    private current = { ...this.target };

    private theta = 0;          // playhead phase
    private morphActivity = 0;  // 0..1 — drives wireframe/cage/rotation

    // Boids (network-synced)
    private boidMode = false;
    private boidCount = 5;
    private swarm!: BoidSwarm;

    private gainIn!: GainNode;
    private gainOut!: GainNode;

    private outs: Record<string, InstanceType<(typeof AutomationN3DConnectable)["Output"]>> = {};
    private boidOuts: Record<string, InstanceType<(typeof AutomationN3DConnectable)["Output"]>> = {};

    constructor(context: Node3DContext, private gui: Superformula3DN3DGUI) {
        const { audioCtx, tools: T } = context;
        const scene = gui.root.getScene();

        context.addToBoundingBox(gui.handle);

        // Flatten the bounding box's spawn tilt
        let orientObs: Observer<Scene> | null = null;
        orientObs = context.observe(scene.onBeforeRenderObservable, () => {
            let p: TransformNode | null = gui.root.parent as TransformNode | null;
            while (p && p.name !== "boundingBox") p = p.parent as TransformNode | null;
            if (!p) return;
            p.rotation.set(0, 0, 0);
            p.rotationQuaternion = Quaternion.Identity();
            if (orientObs) { scene.onBeforeRenderObservable.remove(orientObs); orientObs = null; }
        });

        // Audio passthrough
        this.gainIn = audioCtx.createGain();
        this.gainOut = audioCtx.createGain();
        this.gainIn.connect(this.gainOut);
        context.createConnectable(new T.AudioN3DConnectable.Input("audioIn", [gui.audioIn], "Audio In", this.gainIn));
        context.createConnectable(new T.AudioN3DConnectable.Output("audioOut", [gui.audioOut], "Audio Out", this.gainOut));

        // 8 automation outputs
        const A = T.AutomationN3DConnectable.Output;
        const outDefs: [string, AbstractMesh, string, number][] = [
            ["posX",        gui.outPosX,         "Position X",        0.5],
            ["posY",        gui.outPosY,         "Position Y",        0.5],
            ["posZ",        gui.outPosZ,         "Position Z",        0.5],
            ["radius",      gui.outRadius,       "Ball Radius",       0.5],
            ["radiusDelta", gui.outRadiusDelta,  "Ball Radius Delta", 0.0],
            ["speed",       gui.outSpeed,        "Ball Speed",        0.0],
            ["accel",       gui.outAcceleration, "Ball Acceleration", 0.0],
            ["curvature",   gui.outCurvature,    "Ball Curvature",    0.0],
        ];
        for (const [id, mesh, label, def] of outDefs) {
            const out = new A(id, [mesh], label, def);
            this.outs[id] = out;
            context.createConnectable(out);
        }

        // Knobs — the target moves, the shape follows smoothly
        const knobDefs: [RangeKey, string, number][] = [
            ["mA",  "Petals A (m)",      1],
            ["n1A", "Sharpness A (n1)",  2],
            ["n2A", "Width A (n2)",      2],
            ["n3A", "Height A (n3)",     2],
            ["mB",  "Petals B (m)",      1],
            ["n1B", "Sharpness B (n1)",  2],
            ["n2B", "Width B (n2)",      2],
            ["n3B", "Height B (n3)",     2],
            ["scale", "Scale",           2],
            ["speed", "Speed",           2],
            ["ballX", "Ball X",          2],
            ["ballY", "Ball Y",          2],
            ["ballZ", "Ball Z",          2],
        ];
        // Cluster-controllable params (presets/mutation): shape only —
        // ballX/Y/Z are live performance and excluded.
        const tunables: TunableParam[] = [];
        for (const [key, label, decimals] of knobDefs) {
            const mesh = gui.knobs[key];
            const updateVisual = () => mesh.scaling.setAll(0.6 + norm(key, this.target[key]) * 0.6);
            updateVisual();
            const setNorm = (v01: number) => {
                this.target[key] = denorm(key, v01);
                updateVisual();
                context.notifyStateChange(key);
            };
            context.createParameter({
                id: key,
                meshes: [mesh],
                getLabel: () => label,
                getStepCount: () => 0,
                getValue: () => norm(key, this.target[key]),
                setValue: setNorm,
                stringify: (v01: number) => `${label}: ${denorm(key, v01).toFixed(decimals)}`,
            });
            if (key !== "ballX" && key !== "ballY" && key !== "ballZ") {
                tunables.push({ name: key, min: RANGES[key].min, max: RANGES[key].max, getNorm: () => norm(key, this.target[key]), setNorm });
            }
        }

        // Boids: a 3D swarm that chases the ball
        this.swarm = new BoidSwarm(gui.boidContainer, scene, { is3D: true });
        this.swarm.setCount(this.boidCount);
        this.swarm.setEnabled(this.boidMode);

        const refreshToggleColor = () => {
            gui.boidToggleMat.emissiveColor = this.boidMode
                ? new Color3(0.95, 0.75, 0.15)
                : new Color3(0, 0.5, 0.6);
        };
        refreshToggleColor();

        context.createButton({
            id: "boidToggle", meshes: [gui.btnBoidToggle], label: "Boids on/off",
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
            id: "boidAdd", meshes: [gui.btnBoidAdd], label: "+ Boid",
            color: new Color3(0.2, 0.85, 0.35),
            press: () => {
                this.boidCount = Math.min(BOID_MAX, this.boidCount + 1);
                this.swarm.setCount(this.boidCount);
                context.notifyStateChange("boidCount");
            },
            release: () => {},
        });
        context.createButton({
            id: "boidRemove", meshes: [gui.btnBoidRemove], label: "− Boid",
            color: new Color3(0.85, 0.2, 0.3),
            press: () => {
                this.boidCount = Math.max(0, this.boidCount - 1);
                this.swarm.setCount(this.boidCount);
                context.notifyStateChange("boidCount");
            },
            release: () => {},
        });

        // 6 swarm-metric outputs (3D centroid + dynamics)
        const boidOutDefs: [string, AbstractMesh, string, number][] = [
            ["boidCentroidX",  gui.outBoidCx,    "Boid Centroid X", 0.5],
            ["boidCentroidY",  gui.outBoidCy,    "Boid Centroid Y", 0.5],
            ["boidCentroidZ",  gui.outBoidCz,    "Boid Centroid Z", 0.5],
            ["boidDispersion", gui.outBoidDisp,  "Boid Dispersion", 0],
            ["boidAlignment",  gui.outBoidAlign, "Boid Alignment",  0],
            ["boidVorticity",  gui.outBoidVort,  "Boid Vorticity",  0],
        ];
        for (const [id, mesh, label, def] of boidOutDefs) {
            const out = new A(id, [mesh], label, def);
            this.boidOuts[id] = out;
            context.createConnectable(out);
        }

        // Standard cluster (applies "Flower" on spawn)
        setupInstrumentControls(context, {
            title: "Superformula 3D",
            description: "3D Gielis supershape. The 8 knobs sculpt the surface " +
                "(2 profiles A/B); it morphs smoothly. A ball travels over the surface, " +
                "its 3D motion metrics come out as automation. Ball X/Y/Z aim at a point " +
                "(centered = auto spiral). 3D boids mode.",
            legend: [
                { swatch: "🟡", name: "Gold knobs (left)", role: "Profile A: m, n1, n2, n3 (equator shape)" },
                { swatch: "🟣", name: "Magenta knobs (right)", role: "Profile B: m, n1, n2, n3 (meridian shape)" },
                { swatch: "🟠", name: "Orange knobs (bottom)", role: "Ball scale and speed" },
                { swatch: "🌸", name: "Pink knobs", role: "Ball X/Y/Z — aim at a surface point; centered = auto spiral" },
                { swatch: "🔵", name: "Top-left discs", role: "3D boids: on/off, +, −" },
                { swatch: "🟢", name: "Bottom spheres", role: "Automation outputs: posX/Y/Z, radius, speed, accel., curvature (+ boid metrics)" },
                { swatch: "✋", name: "Cage", role: "Two-handed grab = resize; bin button or vigorous shake = delete" },
            ],
            presets: SF3D_PRESETS,
            defaultPreset: "Flower",
            params: tunables,
            helpBtn: gui.cluster.helpBtn,
            presetBtn: gui.cluster.presetBtn,
            mutateBtn: gui.cluster.mutateBtn,
            resetBtn: gui.cluster.resetBtn,
        });

        // Pulse the 8 motion outputs by value
        const pulser = new OutputPulser([
            gui.outPosX, gui.outPosY, gui.outPosZ, gui.outRadius,
            gui.outRadiusDelta, gui.outSpeed, gui.outAcceleration, gui.outCurvature,
        ]);

        console.log("[Superformula3D] spawned");

        // Per-frame loop: smooth params toward target (rebuild surface while
        // moving), advance the spiral playhead + trail, emit 3D motion metrics,
        // and update feedback (auto-rotation, breathing wireframe/cage, halo).
        let prev = new Vector3();
        let prevVel = new Vector3();
        let prevR = 0;
        let firstFrame = true;
        let surfaceDirty = true;
        let uCur = 0, vCur = 0.5;   // current (smoothed) ball (u,v) position
        const ballPos = new Vector3();
        const ballNormal = new Vector3();
        const vel = new Vector3();

        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
            if (dt <= 0) return;
            const tNow = performance.now() / 1000;

            // 1. Smooth morph (all keys glide toward target, but only SHAPE keys
            //    trigger a surface rebuild; ball X/Y/Z can modulate every frame).
            const k = Math.min(1, dt * 6);
            let shapeDiff = 0;
            for (const key of Object.keys(RANGES) as RangeKey[]) {
                const diff = this.target[key] - this.current[key];
                this.current[key] += diff * k;
            }
            for (const key of SHAPE_KEYS) {
                const span = RANGES[key].max - RANGES[key].min;
                shapeDiff = Math.max(shapeDiff, Math.abs(this.target[key] - this.current[key]) / span);
            }
            this.morphActivity = Math.min(1, shapeDiff * 12);
            if (shapeDiff > 1e-4) surfaceDirty = true;

            if (surfaceDirty) {
                const c = this.current;
                gui.rebuildSurface(c.mA, c.n1A, c.n2A, c.n3A, c.mB, c.n1B, c.n2B, c.n3B, c.scale);
                surfaceDirty = false;
            }

            // 2. Playhead on the displayed surface — sample the mesh buffers
            //    (bilinear), not the analytic formula, for a perfect fit to the
            //    rendered facets. Steering: ball X/Y/Z centred → auto spiral;
            //    off-centre → the ball glides toward the aimed surface point
            //    (θ = atan2(z,x), φ = asin(y/|T|)), always staying on the surface.
            this.theta += this.current.speed * dt;
            const tx = this.current.ballX - 0.5;
            const ty = this.current.ballY - 0.5;
            const tz = this.current.ballZ - 0.5;
            const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
            let uTarget: number, vTarget: number;
            if (tLen < 0.06) {
                // Autopilot: spiral (θ, φ incommensurable)
                uTarget = (((this.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
                vTarget = 0.5 + 0.46 * Math.sin(this.theta * 0.37);
            } else {
                const thetaDir = Math.atan2(tz, tx);                                    // [-π, π]
                const phiDir = Math.asin(Math.max(-1, Math.min(1, ty / tLen)));         // [-π/2, π/2]
                uTarget = (thetaDir + Math.PI) / (2 * Math.PI);
                vTarget = Math.max(0.04, Math.min(0.96, (phiDir + Math.PI / 2) / Math.PI));
            }
            // Smooth toward target (u is cyclic → shortest path)
            const ek = Math.min(1, dt * 6);
            const du = ((uTarget - uCur + 1.5) % 1) - 0.5;
            uCur = (((uCur + du * ek) % 1) + 1) % 1;
            vCur += (vTarget - vCur) * ek;
            const s = this.current.scale;
            gui.samplePoint(uCur, vCur, ballPos, ballNormal);
            // Seat the ball on the facet: a small offset along the outward
            // normal (flipped if it points toward the centre).
            const nLen = ballNormal.length();
            if (nLen > 1e-6) {
                ballNormal.scaleInPlace(1 / nLen);
                if (Vector3.Dot(ballNormal, ballPos) < 0) ballNormal.scaleInPlace(-1);
                ballPos.addInPlace(ballNormal.scaleInPlace(0.02));
            }
            gui.ballRoot.position.copyFrom(ballPos);
            // First frame: start the trail ON the ball (else a stray line links
            // the origin to the start position).
            if (firstFrame) for (const p of gui.trailPoints) p.copyFrom(ballPos);
            gui.pushTrailPoint(ballPos);

            // 3. 3D metrics → automation (normalized 0..1)
            const r = ballPos.length();
            ballPos.subtractToRef(prev, vel);
            const speedMag = firstFrame ? 0 : vel.length() / Math.max(dt, 1e-6);
            const ax = vel.x / Math.max(dt, 1e-6) - prevVel.x;
            const ay = vel.y / Math.max(dt, 1e-6) - prevVel.y;
            const az = vel.z / Math.max(dt, 1e-6) - prevVel.z;
            const accMag = firstFrame ? 0 : Math.sqrt(ax * ax + ay * ay + az * az);
            let curvature = 0;
            if (!firstFrame) {
                const v1 = prevVel.length(), v2l = vel.length() / Math.max(dt, 1e-6);
                if (v1 > 1e-5 && v2l > 1e-5) {
                    const dot = (prevVel.x * vel.x + prevVel.y * vel.y + prevVel.z * vel.z) / (v1 * v2l * dt);
                    curvature = Math.acos(Math.max(-1, Math.min(1, dot)));
                }
            }
            const radiusDelta = firstFrame ? 0 : Math.abs(r - prevR) / Math.max(dt, 1e-6);
            const c01 = (x: number) => Math.max(0, Math.min(1, x));
            this.outs.posX.value        = c01(ballPos.x + 0.5);
            this.outs.posY.value        = c01(ballPos.y + 0.5);
            this.outs.posZ.value        = c01(ballPos.z + 0.5);
            this.outs.radius.value      = c01(r / Math.max(s * 2, 1e-6));
            this.outs.radiusDelta.value = c01(radiusDelta / 5.0);
            this.outs.speed.value       = c01(speedMag / 8.0);
            this.outs.accel.value       = c01(accMag / 50.0);
            this.outs.curvature.value   = c01(curvature / (Math.PI / 2));
            pulser.update([
                this.outs.posX.value, this.outs.posY.value, this.outs.posZ.value, this.outs.radius.value,
                this.outs.radiusDelta.value, this.outs.speed.value, this.outs.accel.value, this.outs.curvature.value,
            ], dt);

            // 4. Boids: the swarm chases the ball (no-op when disabled), and its
            //    aggregate metrics go out as automation.
            this.swarm.update(gui.ballRoot.position, dt);
            const bm = this.swarm.computeMetrics();
            this.boidOuts.boidCentroidX.value  = bm.centroidX;
            this.boidOuts.boidCentroidY.value  = bm.centroidY;
            this.boidOuts.boidCentroidZ.value  = bm.centroidZ;
            this.boidOuts.boidDispersion.value = bm.dispersion;
            this.boidOuts.boidAlignment.value  = bm.alignment;
            this.boidOuts.boidVorticity.value  = bm.vorticity;

            // 5. Continuous feedback. No auto-rotation at rest (the shape stays
            //    stable so the ball reads clearly as it travels); only while
            //    morphing does the shape gently turn.
            gui.shapeRoot.rotation.y += dt * this.morphActivity * 1.2;
            const breathe = 1 + Math.sin(tNow * Math.PI) * 0.06;
            gui.ball.scaling.setAll(breathe);
            gui.ballHalo.scaling.setAll(breathe * 1.05);
            gui.wireMat.alpha = 0.10 + this.morphActivity * 0.45;
            const glow = 0.75 + this.morphActivity * 0.8 + Math.sin(tNow * Math.PI * 2) * 0.06;
            gui.edgeMat.emissiveColor.set(0 * glow, 0.75 * glow, 0.85 * glow);
            if (this.boidMode) {
                const pulse = 0.6 + Math.sin(tNow * Math.PI * 2) * 0.4;
                gui.boidToggleMat.emissiveColor.set(0.95 * pulse, 0.75 * pulse, 0.15 * pulse);
            }

            prevVel.set(vel.x / Math.max(dt, 1e-6), vel.y / Math.max(dt, 1e-6), vel.z / Math.max(dt, 1e-6));
            prev.copyFrom(ballPos);
            prevR = r;
            firstFrame = false;
        });
    }

    async dispose() {
        try { this.gainIn.disconnect(); } catch (_) {}
        try { this.gainOut.disconnect(); } catch (_) {}
        this.swarm?.dispose();
    }

    // Sync: knobs + boids (theta evolves freely per peer)
    getStateKeys(): string[] { return [...Object.keys(RANGES), "boidMode", "boidCount"]; }

    async getState(key: string): Promise<Serializable | void> {
        if (key === "boidMode") return this.boidMode;
        if (key === "boidCount") return this.boidCount;
        if (key in RANGES) return this.target[key as RangeKey];
    }

    async setState(key: string, value: Serializable | undefined): Promise<void> {
        if (key === "boidMode" && typeof value === "boolean") {
            this.boidMode = value;
            this.swarm.setEnabled(value);
            this.gui.boidToggleMat.emissiveColor = value
                ? new Color3(0.95, 0.75, 0.15)
                : new Color3(0, 0.5, 0.6);
            return;
        }
        if (typeof value !== "number") return;
        if (key === "boidCount") {
            this.boidCount = Math.max(0, Math.min(BOID_MAX, Math.floor(value)));
            this.swarm.setCount(this.boidCount);
            return;
        }
        if (key in RANGES) this.target[key as RangeKey] = value;
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export class Superformula3DN3DFactory implements Node3DFactory<Superformula3DN3DGUI, Superformula3DN3D> {
    constructor(
        public size: number,
        public label: string,
        public description: string,
    ) {}

    tags = ["automation", "controller", "superformula", "3d", "supershape"];

    async createGUI(context: Node3DGUIContext) {
        const gui = new Superformula3DN3DGUI(this);
        await gui.init(context);
        return gui;
    }

    async create(context: Node3DContext, gui: Superformula3DN3DGUI) {
        return new Superformula3DN3D(context, gui);
    }

    static DEFAULT = new Superformula3DN3DFactory(
        3.0,
        "Superformula 3D",
        "3D Gielis supershape (spherical product of two superformulas). 8 knobs " +
        "sculpt the surface (2 profiles); it MORPHS smoothly before your eyes " +
        "(radius-based colors + glowing wireframe). A playhead spirals over the " +
        "surface; 8 3D motion metrics (X, Y, Z, radius, speed…) come out as " +
        "automation. Pink Ball X/Y/Z knobs: centered = auto spiral, off-center = " +
        "the ball aims at that surface point (drive by hand or automation). 3D " +
        "BOIDS mode: a swarm chases the ball inside the cage (toggle + ± buttons), " +
        "6 swarm metrics as automation (centroid X/Y/Z, dispersion, alignment, " +
        "vorticity). Two-handed resize.",
    );
}
