import { AbstractMesh, Color3, Color4, Observer, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable } from "../../tools";
import { InputGrabBehavior } from "../../../xr/inputs/tools/InputGrabBehavior";
import type { PointerInput } from "../../../xr/inputs/PointerInput";

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
    ballRoot!: TransformNode;
    ball!:     AbstractMesh;

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

        this.ball = B.MeshBuilder.CreateSphere("audio_plaque_ball", { diameter: 0.08 }, context.scene);
        this.ball.parent     = this.ballRoot;
        this.ball.position.set(0, 0, -0.05);   // float slightly in front of the plaque
        this.ball.isPickable = false;

        const ballMat = new StandardMaterial("ball_mat", context.scene);
        ballMat.emissiveColor = new Color3(1, 0, 0.5);   // hot-pink glow
        this.ball.material = ballMat;
    }

    /**
     * Project a world-space position onto the plaque's local XY plane.
     *
     * 1. Invert the root's world matrix → world→local transform.
     * 2. Multiply the world position by that inverse → local X, Y, Z.
     * 3. Clamp X and Y to [-0.5, +0.5] (plaque bounds), force Z = 0.
     */
    projectOntoPlaque(worldPos: Vector3): Vector3 {
        const localPos = Vector3.TransformCoordinates(
            worldPos,
            this.root.getWorldMatrix().invert(),
        );
        return new Vector3(
            Math.max(-0.5, Math.min(0.5, localPos.x)),
            Math.max(-0.5, Math.min(0.5, localPos.y)),
            0,
        );
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

        // ── Helper: pointer → plaque-local target ─────────────────────────────
        //
        //   XR hand  (side = "left" / "right"):
        //     Project pointer.origin (controller tip world pos) onto the plaque.
        //     Ray direction doesn't matter — the ball follows the "shadow" of
        //     your hand on the surface.
        //
        //   Mouse / Immersive Web Emulator desktop (side = "none"):
        //     Use pointer.target (the actual ray-hit point on the plaque).
        //     Returns null when the cursor leaves the plaque so targetPos
        //     freezes at its last on-surface value.
        //
        const pointerToTarget = (pointer: PointerInput): Vector3 | null => {
            if (pointer.controller.side === "none") {
                if (pointer.hit && pointer.targetMesh === gui.plaque)
                    return gui.projectOntoPlaque(pointer.target);
                return null;
            }
            return gui.projectOntoPlaque(pointer.origin);
        };

        // ── InputGrabBehavior on the plaque surface ───────────────────────────
        //
        //   Fires onDown when trigger pressed while ray is on the plaque,
        //   onMove on every pointer movement while grabbed, onUp on release.
        //
        const grab = new InputGrabBehavior(
            // onDown
            (pointer) => {
                const t = pointerToTarget(pointer);
                console.log(
                    "[AudioPlaque] GRAB DOWN",
                    "\n  controller     :", pointer.controller.side,
                    "\n  pointer.origin :", fmt(pointer.origin),
                    "\n  pointer.hit    :", pointer.hit,
                    "\n  pointer.target :", pointer.hit ? fmt(pointer.target) : "(no hit)",
                    "\n  projected →    :", t ? fmt(t) : "null (off-surface)",
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

            // 3. Throttled state log (every 500 ms)
            const nowMs = performance.now();
            if (nowMs - _lastLogTime >= 500) {
                _lastLogTime = nowMs;
                console.log(
                    "[AudioPlaque] TICK",
                    "\n  ball local pos :", fmt(bp),
                    "\n  ball world pos :", fmt(gui.ballRoot.getAbsolutePosition()),
                    "\n  targetPos      :", fmt(this.targetPos),
                    "\n  plaque world   :", fmt(gui.root.getAbsolutePosition()),
                    "\n  xOut value     :", nx.toFixed(4), `(${this.xOut.senders.size} consumer${this.xOut.senders.size === 1 ? "" : "s"})`,
                    "\n  yOut value     :", ny.toFixed(4), `(${this.yOut.senders.size} consumer${this.yOut.senders.size === 1 ? "" : "s"})`,
                    "\n  follow alpha   :", alpha.toFixed(3),
                );
            }
        });
    }

    async dispose() {
        try { this.gainIn.disconnect();  } catch (_) {}
        try { this.gainOut.disconnect(); } catch (_) {}
    }

    async getState(_key: string): Promise<Serializable | void> { }
    getStateKeys(): string[] { return []; }
    async setState(_key: string, _value: Serializable | undefined) { }
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

    static SMALL = new AudioPlaqueN3DFactory(
        2.0,
        "Small Audio Plaque",
        "Compact 2D XY pad. Audio passes through; X/Y ball position exposed as automation outputs.",
    );

    static DEFAULT = new AudioPlaqueN3DFactory(
        3.0,
        "Audio Plaque",
        "2D XY pad. Audio passes through unchanged; the ball's X and Y positions " +
        "(0..1) are exposed as automation outputs you can wire to any WAM parameter.",
    );

    static LARGE = new AudioPlaqueN3DFactory(
        5.0,
        "Large Audio Plaque",
        "Wall-sized 2D XY pad for fine-grained control. Same audio + automation contract as the default.",
    );
}
