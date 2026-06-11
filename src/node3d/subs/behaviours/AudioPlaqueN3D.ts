import { AbstractMesh, Color3, Color4, Observer, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable } from "../../tools";
import type { PointerInput } from "../../../xr/inputs/PointerInput";
import { BoidSwarm } from "./steering/Boid";

// ── Runtime resize bounds (multiplier applied on top of gui.root's normal scale) ──
// Runtime resize bounds — multiplier applied on top of gui.root's normal scale.
// Range widened to 0.3×–4× so the resize handle alone covers what the old
// SMALL/DEFAULT/LARGE spawn variants used to provide (and then some).
const RESIZE_MIN = 0.3;
const RESIZE_MAX = 4.0;
const RESIZE_DEFAULT = 1.0;
const BOID_MAX = 30;

// ─── GUI (pure visuals + coordinate helper) ───────────────────────────────────

export class AudioPlaqueN3DGUI implements Node3DGUI {
    root!: TransformNode;

    // worldSize is set from the factory (Node3DInstance scales gui_root_transform
    // by `worldSize * SIZE_MULTIPLIER` once at spawn — bigger value = bigger plaque).
    get worldSize() { return this.factory.size; }

    plaque!: AbstractMesh;
    handle!: AbstractMesh;        // backing plate — what the bounding box wraps

    // Connector meshes (parented to root, sit OUTSIDE the bounding box):
    audioIn!:  AbstractMesh;      // green geodesic — left edge, audio in
    audioOut!: AbstractMesh;      // green sphere   — right edge, audio out (passthrough)
    xOutput!:  AbstractMesh;      // red sphere    — top edge, X automation output
    yOutput!:  AbstractMesh;      // blue sphere    — bottom edge, Y automation output

    // Ball is split into:
    //   ballRoot — TransformNode whose XY position the logic class drives
    //   ball     — visible sphere, parented to ballRoot, offset slightly in front
    //   ballHalo — larger translucent emissive sphere that gives the ball a soft glow
    ballRoot!: TransformNode;
    ball!:     AbstractMesh;
    ballHalo!: AbstractMesh;

    // Runtime UI: resize handle (bottom-right corner) + 3 boid buttons (top-left)
    resizeHandle!: AbstractMesh;
    btnBoidToggle!: AbstractMesh;
    btnBoidAdd!:    AbstractMesh;
    btnBoidRemove!: AbstractMesh;
    boidToggleMat!: StandardMaterial;     // material kept so the logic class can recolor on toggle

    // Five new boid metric outputs (bottom row, below yOut)
    outBoidCentroidX!:  AbstractMesh;
    outBoidCentroidY!:  AbstractMesh;
    outBoidDispersion!: AbstractMesh;
    outBoidAlignment!:  AbstractMesh;
    outBoidVorticity!:  AbstractMesh;

    // Parent for boid meshes so they scale with the plaque
    boidContainer!: TransformNode;

    constructor(public factory: AudioPlaqueN3DFactory) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: { ConnectableUtils, MeshUtils, AudioN3DConnectable, AutomationN3DConnectable } } = context;

        this.root = new B.TransformNode("audio_plaque_root", context.scene);

        // ── Backing handle (what the bounding box wraps) ──────────────────────
        //
        //   Node3DInstance.updateBoundingBoxNow() builds an invisible pickable box
        //   around whatever mesh you pass to addToBoundingBox().  That box would
        //   intercept every controller ray — so we put a small backing plate at
        //   z = +0.15 (BEHIND the plaque) and only that plate goes in the box.
        //   The plaque + connectors all sit at z ≤ 0 in front of the box and
        //   stay directly hittable.
        this.handle = B.MeshBuilder.CreateBox("plaque_handle", {
            width: 0.8, height: 0.8, depth: 0.04,
        }, context.scene);
        this.handle.parent     = this.root;
        this.handle.position.set(0, 0, 0.15);
        this.handle.material   = context.materialMat;
        this.handle.isPickable = false;

        // ── Surface: 1×1 plane with teal GridMaterial ─────────────────────────
        this.plaque = B.MeshBuilder.CreatePlane("audio_plaque", {
            size: 1,
            sideOrientation: 2,   // BABYLON.Mesh.DOUBLESIDE
        }, context.scene);
        this.plaque.parent     = this.root;
        this.plaque.isPickable = true;   // controller rays MUST hit this for grab-to-work

        const gridMat = new GridMaterial("plaque_grid", context.scene);
        gridMat.majorUnitFrequency  = 5;
        gridMat.minorUnitVisibility = 0.45;
        gridMat.gridRatio           = 0.1;
        gridMat.mainColor           = new Color3(0.0, 0.04, 0.04);
        gridMat.lineColor           = new Color3(0.0, 0.8,  0.8);
        gridMat.backFaceCulling     = false;
        this.plaque.material = gridMat;

        // ── Glowing teal border frame ─────────────────────────────────────────
        const edgeMat = new StandardMaterial("plaque_edge_mat", context.scene);
        edgeMat.emissiveColor = new Color3(0, 0.9, 0.9);

        const t    = 0.012;
        const half = 0.5;
        const edgeDefs: [string, number, number, number, number][] = [
            ["top",    1 + t,     t,    0,  half],
            ["bottom", 1 + t,     t,    0, -half],
            ["left",       t, 1 + t, -half,    0],
            ["right",      t, 1 + t,  half,    0],
        ];
        for (const [name, w, h, px, py] of edgeDefs) {
            const edge = B.MeshBuilder.CreateBox(
                `plaque_edge_${name}`, { width: w, height: h, depth: t }, context.scene,
            );
            edge.position.set(px, py, -0.006);
            edge.parent     = this.root;
            edge.material   = edgeMat;
            edge.isPickable = false;
        }

        // ── Connector meshes ──────────────────────────────────────────────────
        //
        //   Convention from the rest of the project:
        //     • Input connectors  → CreateGeodesic (icosahedron-ish, "many edges in")
        //     • Output connectors → CreateSphere   (smooth, "one signal out")
        //     • Audio      → green   (AudioN3DConnectable.Color)
        //     • Automation → red/blue tints, on the gray automation base color
        //
        const audioColor = (() => {
            const c = AudioN3DConnectable.Color;
            return new Color4(c.r, c.g, c.b, 1);
        })();
        const xColor = new Color4(0.9, 0.15, 0.15, 1);   // red  — X output
        const yColor = new Color4(0.15, 0.4, 0.95, 1);   // blue — Y output

        // Audio in (geodesic) — left edge
        this.audioIn = ConnectableUtils.createInputMesh("plaque_audio_in", 0.08, context.scene);
        this.audioIn.parent = this.root;
        this.audioIn.position.set(-0.65, 0, 0);
        MeshUtils.setColor(this.audioIn, audioColor);

        // Audio out (sphere) — right edge
        this.audioOut = ConnectableUtils.createOutputMesh("plaque_audio_out", 0.08, context.scene);
        this.audioOut.parent = this.root;
        this.audioOut.position.set(0.65, 0, 0);
        MeshUtils.setColor(this.audioOut, audioColor);

        // X automation output (sphere) — top edge
        this.xOutput = ConnectableUtils.createOutputMesh("plaque_x_out", 0.08, context.scene);
        this.xOutput.parent = this.root;
        this.xOutput.position.set(0, 0.65, 0);
        MeshUtils.setColor(this.xOutput, xColor);

        // Y automation output (sphere) — bottom edge
        this.yOutput = ConnectableUtils.createOutputMesh("plaque_y_out", 0.08, context.scene);
        this.yOutput.parent = this.root;
        this.yOutput.position.set(0, -0.65, 0);
        MeshUtils.setColor(this.yOutput, yColor);

        // (silence "unused import" warning — AutomationN3DConnectable is used in the logic class)
        void AutomationN3DConnectable;

        // ── Ball: ballRoot TransformNode + visible hot-pink sphere ────────────
        this.ballRoot = new B.TransformNode("ball_root", context.scene);
        this.ballRoot.parent = this.root;
        this.ballRoot.position.set(0, 0, 0);  // start at centre

        // Solid core: small bright sphere
        this.ball = B.MeshBuilder.CreateSphere("audio_plaque_ball", { diameter: 0.06 }, context.scene);
        this.ball.parent     = this.ballRoot;
        this.ball.position.set(0, 0, -0.05);
        this.ball.isPickable = false;

        const ballMat = new StandardMaterial("ball_mat", context.scene);
        ballMat.emissiveColor = new Color3(1, 0.4, 0.7);
        ballMat.disableLighting = true;
        this.ball.material = ballMat;

        // Halo: bigger semi-transparent sphere around the core, no lighting.
        // Adds visual "weight" to the ball without obscuring the grid behind it.
        this.ballHalo = B.MeshBuilder.CreateSphere("audio_plaque_ball_halo", { diameter: 0.16 }, context.scene);
        this.ballHalo.parent     = this.ballRoot;
        this.ballHalo.position.set(0, 0, -0.05);
        this.ballHalo.isPickable = false;
        const haloMat = new StandardMaterial("ball_halo_mat", context.scene);
        haloMat.emissiveColor = new Color3(1, 0.3, 0.6);
        haloMat.alpha = 0.18;
        haloMat.disableLighting = true;
        this.ballHalo.material = haloMat;

        // ── Resize handle (bottom-right corner) ───────────────────────────────
        //
        //   Drag-controlled by a Node3DParameter the logic class registers.  Maps
        //   the host's 0..1 value to a [RESIZE_MIN..RESIZE_MAX] multiplier on
        //   gui.root.scaling.  All children — plaque, ball, knobs, connectors,
        //   boids — scale together so the layout stays internally consistent.
        //
        this.resizeHandle = B.MeshBuilder.CreateSphere("plaque_resize", { diameter: 0.08 }, context.scene);
        this.resizeHandle.parent = this.root;
        this.resizeHandle.position.set(0.65, -0.65, 0);
        const resizeMat = new StandardMaterial("resize_mat", context.scene);
        resizeMat.emissiveColor = new Color3(0.85, 0.3, 0.95);   // violet
        this.resizeHandle.material = resizeMat;

        // ── Boid controls (top-left column) ───────────────────────────────────
        //
        //   Toggle = round button, cyan when off, gold when on.  +/− are slightly
        //   smaller spheres beneath it.  All three are wired to Node3DButton
        //   callbacks by the logic class.
        //
        // Cylinder discs feel more like real "buttons" than flat boxes.
        // We rotate them so the disc face points along +Z (toward the player).
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

        this.btnBoidToggle = makeDiscButton("btn_boid_toggle", 0.11, new Color3(0, 0.5, 0.6));
        this.btnBoidToggle.position.set(-0.65, 0.45, 0);
        this.boidToggleMat = this.btnBoidToggle.material as StandardMaterial;

        this.btnBoidAdd = makeDiscButton("btn_boid_add", 0.085, new Color3(0.2, 0.85, 0.35));
        this.btnBoidAdd.position.set(-0.65, 0.3, 0);

        this.btnBoidRemove = makeDiscButton("btn_boid_remove", 0.085, new Color3(0.85, 0.2, 0.3));
        this.btnBoidRemove.position.set(-0.65, 0.18, 0);

        // ── Five new boid-metric automation outputs (below yOut, smaller) ─────
        //
        //   Layout: bottom row at y = -0.85, x ∈ {-0.4, -0.2, 0, 0.2, 0.4}
        //   Cohesive palette — five hues equally spaced for easy identification.
        //   Smaller diameter (0.06) so they read as a distinct "secondary" group
        //   versus the primary X/Y outputs at y = ±0.65.
        //
        const metricColors: Color4[] = [
            new Color4(1.0,  0.4,  0.7,  1),  // centroidX  — pink
            new Color4(0.4,  0.7,  1.0,  1),  // centroidY  — light cyan
            new Color4(1.0,  0.85, 0.3,  1),  // dispersion — gold
            new Color4(0.3,  0.9,  0.55, 1),  // alignment  — emerald
            new Color4(0.75, 0.4,  1.0,  1),  // vorticity  — violet
        ];
        const metricXs = [-0.4, -0.2, 0, 0.2, 0.4];
        const makeMetricOut = (name: string, x: number, color: Color4): AbstractMesh => {
            const m = ConnectableUtils.createOutputMesh(name, 0.06, context.scene);
            m.parent = this.root;
            m.position.set(x, -0.85, 0);
            MeshUtils.setColor(m, color);
            return m;
        };
        this.outBoidCentroidX  = makeMetricOut("plaque_boid_cx",   metricXs[0], metricColors[0]);
        this.outBoidCentroidY  = makeMetricOut("plaque_boid_cy",   metricXs[1], metricColors[1]);
        this.outBoidDispersion = makeMetricOut("plaque_boid_disp", metricXs[2], metricColors[2]);
        this.outBoidAlignment  = makeMetricOut("plaque_boid_algn", metricXs[3], metricColors[3]);
        this.outBoidVorticity  = makeMetricOut("plaque_boid_vort", metricXs[4], metricColors[4]);

        // ── Boid container ────────────────────────────────────────────────────
        // Empty TransformNode that swarm boid meshes parent to — keeps them in
        // plaque local space so they scale with gui.root.
        this.boidContainer = new B.TransformNode("boid_container", context.scene);
        this.boidContainer.parent = this.root;
    }

    /**
     * Project a world-space position onto the plaque's local XY plane via
     * dot products with the plaque's own world-space axes.
     *
     *   center = plaque world position
     *   right  = plaque's local +X expressed in world (= world dir of (1,0,0))
     *   up     = plaque's local +Y expressed in world (= world dir of (0,1,0))
     *
     *   getDirection() applies the rotation+scale parts of the world matrix to
     *   the local axis, so |right| equals the world-space scale along X.
     *   Therefore:  localX = (offset · right) / |right|^2
     *
     * This is rotation-correct, scale-correct, and parent-hierarchy-correct
     * regardless of how the plaque is positioned, scaled, or oriented.  It
     * doesn't rely on `getWorldMatrix().invert()` whose handling of non-uniform
     * scaling or recently-updated parent transforms was producing wrong values.
     */
    projectOntoPlaque(worldPos: Vector3): Vector3 {
        const center = this.plaque.getAbsolutePosition();
        const right  = this.plaque.getDirection(AudioPlaqueN3DGUI._LOCAL_X);
        const up     = this.plaque.getDirection(AudioPlaqueN3DGUI._LOCAL_Y);
        const offset = worldPos.subtract(center);

        const rLen2 = right.lengthSquared();
        const uLen2 = up.lengthSquared();
        if (rLen2 < 1e-10 || uLen2 < 1e-10) return new Vector3(0, 0, 0);

        const localX = Vector3.Dot(offset, right) / rLen2;
        const localY = Vector3.Dot(offset, up)    / uLen2;

        return new Vector3(
            Math.max(-0.5, Math.min(0.5, localX)),
            Math.max(-0.5, Math.min(0.5, localY)),
            0,
        );
    }

    // Reusable local-axis constants — avoid allocating new vectors every call.
    private static readonly _LOCAL_X = new Vector3(1, 0, 0);
    private static readonly _LOCAL_Y = new Vector3(0, 1, 0);
    private static readonly _LOCAL_Z = new Vector3(0, 0, 1);

    /** Plaque's world-space normal (used by the logic class for ray-plane math). */
    plaqueNormal(): Vector3 {
        return this.plaque.getDirection(AudioPlaqueN3DGUI._LOCAL_Z);
    }

    async dispose() { }
}

// ─── Logic (audio passthrough + automation outputs + input handling) ─────────

export class AudioPlaqueN3D implements Node3D {
    // Where the ball steers toward, in plaque local space.  (0, 0, 0) = centre.
    public targetPos = new Vector3(0, 0, 0);

    // Audio passthrough: gainIn → gainOut.  Generator → plaque → speaker still works.
    private gainIn!:  GainNode;
    private gainOut!: GainNode;

    // Automation outputs — the public face of this Node3D
    private xOut!: InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private yOut!: InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
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

    constructor(context: Node3DContext, private gui: AudioPlaqueN3DGUI) {
        const { audioCtx, tools: T } = context;

        // ── Bounding box wraps only the small backing handle ──────────────────
        context.addToBoundingBox(gui.handle);

        // ── Flatten the bounding box's spawn tilt ─────────────────────────────
        //
        //   BoundingBox.ts (line 34) sets the outer pickable BB's rotation to
        //   `-π/6` around X for every Node3D — a "music stand" forward tilt.
        //   For an XY pad this misaligns the BB with the plaque surface: rays
        //   that should hit the plaque hit the BB first (the BB sticks out
        //   above and below) and the user ends up grabbing the cube instead
        //   of moving the ball.
        //
        //   Fix: as soon as the BB exists, zero its X tilt so the BB shares
        //   exactly the plaque's orientation.  We need a per-frame poll
        //   because addToBoundingBox is async (queued for next frame inside
        //   Node3DInstance) and there's no "BB ready" event we can hook.
        //
        //   The observer self-removes on first success, and is also auto-
        //   removed if this Node3D is disposed (context.observe handles that).
        //
        const scene = gui.root.getScene();
        let orientObs: Observer<Scene> | null = null;
        orientObs = context.observe(scene.onBeforeRenderObservable, () => {
            // Walk up: gui.root → gui_root_transform → root_transform
            //          → bounding_mesh → boundingBox
            let p: TransformNode | null = gui.root.parent as TransformNode | null;
            while (p && p.name !== "boundingBox") p = p.parent as TransformNode | null;
            if (!p) return;   // BB not constructed yet — try again next frame

            // Zero just the X tilt; keep Y/Z at 0 too (BoundingBox.ts only
            // ever sets X, so identity is the right answer here).
            p.rotation.set(0, 0, 0);
            p.rotationQuaternion = Quaternion.Identity();

            console.log(
                "[AudioPlaque] Bounding box flattened",
                "\n  BB name        :", p.name,
                "\n  BB rotation    : (0, 0, 0)  identity",
            );

            if (orientObs) {
                scene.onBeforeRenderObservable.remove(orientObs);
                orientObs = null;
            }
        });

        // ── Spawn log ─────────────────────────────────────────────────────────
        const fmt = (v: Vector3) =>
            `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;

        const spawnPos = context.getPosition();
        console.log(
            "[AudioPlaque] SPAWNED",
            "\n  world position :", fmt(spawnPos.position),
            "\n  world rotation :", `(x:${spawnPos.rotation.x.toFixed(3)} y:${spawnPos.rotation.y.toFixed(3)} z:${spawnPos.rotation.z.toFixed(3)} w:${spawnPos.rotation.w.toFixed(3)})`,
            "\n  plaque local   :", fmt(gui.root.position),
            "\n  audioIn  pos   :", fmt(gui.audioIn.position as Vector3),
            "\n  audioOut pos   :", fmt(gui.audioOut.position as Vector3),
            "\n  xOutput  pos   :", fmt(gui.xOutput.position as Vector3),
            "\n  yOutput  pos   :", fmt(gui.yOutput.position as Vector3),
        );

        // ── Audio passthrough chain ───────────────────────────────────────────
        //
        //   gainIn  ─────►  gainOut
        //
        //   The plaque doesn't process audio itself.  Audio flows through
        //   unchanged so the plaque can sit in a generator → plaque → speaker
        //   patch without breaking it.  All modulation happens via the X / Y
        //   automation outputs being wired to other nodes' parameters.
        //
        this.gainIn  = audioCtx.createGain();
        this.gainOut = audioCtx.createGain();
        this.gainIn.connect(this.gainOut);

        // ── Connectables ──────────────────────────────────────────────────────
        //
        //   AudioN3DConnectable.Input         (audioIn  → gainIn)
        //   AudioN3DConnectable.Output        (gainOut  → next node)
        //   AutomationN3DConnectable.Output   ("xPos", default 0.5)
        //   AutomationN3DConnectable.Output   ("yPos", default 0.5)
        //
        context.createConnectable(new T.AudioN3DConnectable.Input(
            "audioIn", [gui.audioIn], "Audio In", this.gainIn,
        ));
        context.createConnectable(new T.AudioN3DConnectable.Output(
            "audioOut", [gui.audioOut], "Audio Out", this.gainOut,
        ));

        this.xOut = new T.AutomationN3DConnectable.Output(
            "xPos", [gui.xOutput], "X Position", 0.5,
        );
        this.yOut = new T.AutomationN3DConnectable.Output(
            "yPos", [gui.yOutput], "Y Position", 0.5,
        );
        context.createConnectable(this.xOut);
        context.createConnectable(this.yOut);

        // Five boid-swarm metric outputs (computed from the live boid simulation).
        // Default values match what computeMetrics() returns for an empty swarm:
        // centroids at 0.5 (centred), motion metrics at 0.
        this.boidCxOut    = new T.AutomationN3DConnectable.Output(
            "boidCentroidX",  [gui.outBoidCentroidX],  "Boid Centroid X", 0.5);
        this.boidCyOut    = new T.AutomationN3DConnectable.Output(
            "boidCentroidY",  [gui.outBoidCentroidY],  "Boid Centroid Y", 0.5);
        this.boidDispOut  = new T.AutomationN3DConnectable.Output(
            "boidDispersion", [gui.outBoidDispersion], "Boid Dispersion", 0);
        this.boidAlignOut = new T.AutomationN3DConnectable.Output(
            "boidAlignment",  [gui.outBoidAlignment],  "Boid Alignment", 0);
        this.boidVortOut  = new T.AutomationN3DConnectable.Output(
            "boidVorticity",  [gui.outBoidVorticity],  "Boid Vorticity", 0);
        for (const o of [this.boidCxOut, this.boidCyOut, this.boidDispOut, this.boidAlignOut, this.boidVortOut]) {
            context.createConnectable(o);
        }

        // ── Resize handle parameter ───────────────────────────────────────────
        //
        //   Maps host's normalised 0..1 value to a [RESIZE_MIN .. RESIZE_MAX]
        //   scale multiplier on gui.root.
        //
        //   IMPORTANT: we do NOT trigger a bounding-box recompute here.
        //   Node3DInstance.updateBoundingBoxNow() disposes the old outer BB
        //   mesh, and Babylon's Mesh.dispose() cascades into children by default
        //   — that would wipe the entire Node3D mesh tree (root_transform,
        //   gui.root, plaque, ball, trail, all connectors).  Letting the BB
        //   keep its spawn-time size is fine: at 0.5×–2.0× scale the BB may
        //   be slightly off, but every interactive child is individually
        //   pickable so dragging still works fine via any of them.
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

        // ── Boid swarm + controls ─────────────────────────────────────────────
        //
        //   The swarm seeks the existing pink ball.  Three buttons:
        //     • boidToggle  — flip boidMode on/off, recolor the button mesh
        //     • boidAdd     — +1 boid (capped at BOID_MAX)
        //     • boidRemove  — -1 boid (floored at 0)
        //   boidCount and boidMode are synced; boid positions are local.
        //
        this.swarm = new BoidSwarm(gui.boidContainer, scene);
        this.swarm.setCount(this.boidCount);
        this.swarm.setEnabled(this.boidMode);

        const refreshToggleColor = () => {
            gui.boidToggleMat.emissiveColor = this.boidMode
                ? new Color3(0.95, 0.75, 0.15)   // gold = ON
                : new Color3(0, 0.5, 0.6);       // teal = OFF
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
                console.log("[AudioPlaque] Boid mode:", this.boidMode ? "ON" : "OFF",
                    "  count:", this.boidCount);
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
                console.log("[AudioPlaque] Boid count:", this.boidCount);
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
                console.log("[AudioPlaque] Boid count:", this.boidCount);
            },
            release: () => {},
        });

        // ── Helper: pointer → plaque-local target ─────────────────────────────
        //
        //   Two paths, both ending in projectOntoPlaque() for the final
        //   world→local conversion via dot-product axis projection:
        //
        //   1. Ray currently hits the plaque mesh:
        //      Use pointer.target directly — Babylon already computed the
        //      exact world-space hit point during its mesh raycast.
        //
        //   2. Ray points off the plaque (e.g., dragged past the edge while
        //      holding trigger):
        //      Compute the intersection with the plaque's infinite plane
        //      ourselves, so the ball still tracks the laser direction.
        //
        //   Works identically for XR controllers (origin = controller tip,
        //   forward = controller ray) and mouse (origin = camera, forward =
        //   camera-through-cursor ray).
        //
        const pointerToTarget = (pointer: PointerInput): Vector3 | null => {
            // Path 1: native raycast hit on the plaque
            if (pointer.hit && pointer.targetMesh === gui.plaque) {
                return gui.projectOntoPlaque(pointer.target);
            }

            // Path 2: ray-plane intersection from origin + forward
            const planeOrigin = gui.plaque.getAbsolutePosition();
            const planeNormal = gui.plaqueNormal();
            const denom = Vector3.Dot(pointer.forward, planeNormal);
            if (Math.abs(denom) < 1e-6) return null;
            const t = Vector3.Dot(planeOrigin.subtract(pointer.origin), planeNormal) / denom;
            if (t < 0) return null;
            const hitWorld = pointer.origin.add(pointer.forward.scale(t));
            return gui.projectOntoPlaque(hitWorld);
        };

        // ── InputGrabBehavior on the plaque surface ───────────────────────────
        //
        //   Fires onDown when trigger pressed while ray is on the plaque,
        //   onMove on every pointer movement while grabbed, onUp on release.
        //
        const grab = new T.InputGrabBehavior(
            // onDown
            (pointer) => {
                const t = pointerToTarget(pointer);
                const center = gui.plaque.getAbsolutePosition();
                const right  = gui.plaque.getDirection(new Vector3(1, 0, 0));
                const up     = gui.plaque.getDirection(new Vector3(0, 1, 0));
                const normal = gui.plaqueNormal();
                console.log(
                    "[AudioPlaque] GRAB DOWN",
                    "\n  controller     :", pointer.controller.side,
                    "\n  pointer.origin :", fmt(pointer.origin),
                    "\n  pointer.hit    :", pointer.hit,
                    "\n  pointer.target :", pointer.hit ? fmt(pointer.target) : "(no hit)",
                    "\n  projected →    :", t ? fmt(t) : "null (off-surface)",
                    "\n  plaque center  :", fmt(center),
                    "\n  plaque right   :", fmt(right),  "len:", right.length().toFixed(3),
                    "\n  plaque up      :", fmt(up),     "len:", up.length().toFixed(3),
                    "\n  plaque normal  :", fmt(normal), "len:", normal.length().toFixed(3),
                );
                if (t) this.targetPos.copyFrom(t);
            },
            // onUp
            (pointer) => {
                console.log(
                    "[AudioPlaque] GRAB UP",
                    "\n  controller     :", pointer.controller.side,
                    "\n  final targetPos:", fmt(this.targetPos),
                    "\n  ball local pos :", fmt(gui.ballRoot.position),
                    "\n  ball world pos :", fmt(gui.ballRoot.getAbsolutePosition()),
                );
            },
            // onMove
            (pointer) => {
                const t = pointerToTarget(pointer);
                if (t) {
                    this.targetPos.copyFrom(t);
                    console.log(
                        "[AudioPlaque] GRAB MOVE",
                        "\n  controller     :", pointer.controller.side,
                        "\n  pointer.origin :", fmt(pointer.origin),
                        "\n  pointer.target :", pointer.hit ? fmt(pointer.target) : "(no hit)",
                        "\n  projected →    :", fmt(t),
                    );
                }
            },
        );
        gui.plaque.addBehavior(grab);

        // ── Per-frame loop ────────────────────────────────────────────────────
        //
        //   1. Smooth follow — frame-rate-independent exponential smoothing:
        //        alpha = 1 - exp(-FOLLOW_RATE * dt)
        //        ball += (target - ball) * alpha
        //      With FOLLOW_RATE = 18 the ball reaches ~95 % of target in
        //      ~0.17 s.  No rotation, no autonomous steering — the ball
        //      tracks exactly where you point.
        //
        //   2. Automation outputs — write the ball's normalised X / Y
        //      (0..1) into xOut.value and yOut.value.  AutomationN3DConnectable
        //      .Output forwards the value to every connected input.  Skip
        //      writes when the value hasn't changed measurably (avoids spam
        //      to downstream parameters).
        //
        const FOLLOW_RATE = 18;
        const VALUE_EPS   = 1e-4;   // suppress redundant sends below this delta

        let lastX = -1, lastY = -1;       // force first send
        let _lastLogTime = 0;

        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000.0, 0.1);
            if (dt <= 0) return;

            // 1. Smooth follow
            const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
            const bp = gui.ballRoot.position;
            bp.x += (this.targetPos.x - bp.x) * alpha;
            bp.y += (this.targetPos.y - bp.y) * alpha;
            bp.z  = 0;
            bp.x = Math.max(-0.5, Math.min(0.5, bp.x));
            bp.y = Math.max(-0.5, Math.min(0.5, bp.y));

            // 2. Push automation values
            const nx = bp.x + 0.5;   // 0 .. 1
            const ny = bp.y + 0.5;   // 0 .. 1
            if (Math.abs(nx - lastX) > VALUE_EPS) { this.xOut.value = nx; lastX = nx; }
            if (Math.abs(ny - lastY) > VALUE_EPS) { this.yOut.value = ny; lastY = ny; }

            // 3. Boid swarm — chase the ball (no-op when boidMode is OFF)
            this.swarm.update(bp, dt);

            // 4. Boid metrics → 5 automation outputs (computed every frame; values
            //    naturally freeze when the swarm is disabled since boid positions
            //    don't change while update() is a no-op).
            const m = this.swarm.computeMetrics();
            this.boidCxOut.value    = m.centroidX;
            this.boidCyOut.value    = m.centroidY;
            this.boidDispOut.value  = m.dispersion;
            this.boidAlignOut.value = m.alignment;
            this.boidVortOut.value  = m.vorticity;

            // 5. Visual polish
            //    a. Ball breathing  — subtle scale pulse (1.0 .. 1.06 over 2 s)
            //    b. Toggle glow     — emissive pulse on the boid toggle while ON
            const t = performance.now() / 1000;
            const breathe = 1 + Math.sin(t * Math.PI) * 0.06;
            gui.ball.scaling.setAll(breathe);
            gui.ballHalo.scaling.setAll(breathe * 1.05);
            if (this.boidMode) {
                const pulse = 0.6 + Math.sin(t * Math.PI * 2) * 0.4;   // 0.2..1.0
                gui.boidToggleMat.emissiveColor.set(0.95 * pulse, 0.75 * pulse, 0.15 * pulse);
            }

            // 6. Throttled state log (every 500 ms)
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

    // ── State sync (synced across peers) ──────────────────────────────────────
    getStateKeys(): string[] { return ["userScale", "boidMode", "boidCount"]; }

    async getState(key: string): Promise<Serializable | void> {
        switch (key) {
            case "userScale": return this.userScale;
            case "boidMode":  return this.boidMode;
            case "boidCount": return this.boidCount;
        }
    }

    async setState(key: string, value: Serializable | undefined): Promise<void> {
        switch (key) {
            case "userScale":
                if (typeof value !== "number") return;
                this.userScale = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, value));
                this.gui.root.scaling.setAll(this.userScale);
                return;
            case "boidMode":
                if (typeof value !== "boolean") return;
                this.boidMode = value;
                this.swarm.setEnabled(value);
                this.gui.boidToggleMat.emissiveColor = value
                    ? new Color3(0.95, 0.75, 0.15)
                    : new Color3(0, 0.5, 0.6);
                return;
            case "boidCount":
                if (typeof value !== "number") return;
                this.boidCount = Math.max(0, Math.min(BOID_MAX, Math.floor(value)));
                this.swarm.setCount(this.boidCount);
                return;
        }
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────
//
//   Size variants follow the project's standard pattern (see HarpN3DFactory and
//   PositionCubeN3DFactory): one factory class with a `size` parameter, and
//   static instances for each preset.  Each preset is registered separately in
//   Node3DBuilder.ts under its own kind name, so the player picks a size from
//   the shop at spawn time.
//
//   `size` is fed straight into AudioPlaqueN3DGUI.worldSize, which Node3DInstance
//   uses as `worldSize * SIZE_MULTIPLIER (0.2)` to scale gui_root_transform.
//
//     SMALL   = 2.0   →  0.40 world units
//     DEFAULT = 3.0   →  0.60 world units   (current default)
//     LARGE   = 5.0   →  1.00 world units
//
//   Add another preset by appending `static <NAME> = new AudioPlaqueN3DFactory(...)`
//   below and registering its kind name in Node3DBuilder.ts.
//
export class AudioPlaqueN3DFactory implements Node3DFactory<AudioPlaqueN3DGUI, AudioPlaqueN3D> {
    constructor(
        public size: number,
        public label: string,
        public description: string,
    ) { }

    tags = ["automation", "controller", "xy_pad"];

    async createGUI(context: Node3DGUIContext) {
        const gui = new AudioPlaqueN3DGUI(this);
        await gui.init(context);
        return gui;
    }

    async create(context: Node3DContext, gui: AudioPlaqueN3DGUI) {
        return new AudioPlaqueN3D(context, gui);
    }

    // Single canonical instance — runtime resize handle (0.5×..4×) replaces
    // the old SMALL/DEFAULT/LARGE spawn variants.
    static DEFAULT = new AudioPlaqueN3DFactory(
        3.0,
        "Audio Plaque",
        "2D XY pad with a ball that tracks the controller laser. Audio passes through " +
        "unchanged; the ball's X and Y positions (0..1) plus 5 boid-swarm metrics are " +
        "exposed as automation outputs you can wire to any WAM parameter. " +
        "Drag the violet corner handle to resize (0.5×–4×).",
    );
}
