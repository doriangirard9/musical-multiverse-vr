import { AbstractMesh, Color3, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { SteeringVehicle } from "../../../behaviours/steering/SteeringVehicle";
import { InputManager } from "../../../xr/inputs/InputManager";

// ─── GUI (pure visuals + coordinate helper) ───────────────────────────────────

export class AudioPlaqueN3DGUI implements Node3DGUI {
    root!: TransformNode;
    worldSize = 3;  // scaled to 3 * 0.2 = 0.6 world units

    plaque!: AbstractMesh;
    handle!: AbstractMesh;  // the grabbing handle — this is what goes in the bounding box

    // The ball is split into two objects:
    //   ballRoot  — a TransformNode that SteeringVehicle moves (no collision physics)
    //   ball      — the visible sphere, parented to ballRoot, offset slightly in front
    ballRoot!: TransformNode;
    ball!: AbstractMesh;

    async init(context: Node3DGUIContext) {
        const { babylon: B } = context;

        this.root = new B.TransformNode("audio_plaque_root", context.scene);

        // ── Backing handle (what the bounding box wraps) ──────────────────────
        //
        // WHY this exists:
        //   Node3DInstance.updateBoundingBoxNow() creates a pickable invisible box
        //   that exactly fits whatever mesh you pass to addToBoundingBox().
        //   That outer box intercepts ALL controller rays before they reach the plaque.
        //
        //   The fix (same pattern as PositionCubeN3D, which puts its base plate at
        //   y=-0.6 so its interactive cube sticks out above the bounding box):
        //   we put a small backing plate BEHIND the plaque (at +Z, away from player).
        //   The bounding box wraps the handle. The plaque protrudes in front and is
        //   directly hittable by controller rays.
        this.handle = B.MeshBuilder.CreateBox("plaque_handle", {
            width: 0.8, height: 0.8, depth: 0.04,
        }, context.scene);
        this.handle.parent   = this.root;
        this.handle.position.set(0, 0, 0.15);   // behind the plaque surface
        this.handle.material = context.materialMat;
        this.handle.isPickable = false;

        // ── Surface: 1×1 plane with a teal GridMaterial ──────────────────────
        this.plaque = B.MeshBuilder.CreatePlane("audio_plaque", {
            size: 1,
            sideOrientation: 2   // BABYLON.Mesh.DOUBLESIDE
        }, context.scene);
        this.plaque.parent = this.root;
        this.plaque.isPickable = true;  // must stay true — controller rays need to hit this

        const gridMat = new GridMaterial("plaque_grid", context.scene);
        gridMat.majorUnitFrequency  = 5;
        gridMat.minorUnitVisibility = 0.45;
        gridMat.gridRatio           = 0.1;   // 10 cells across the 1-unit surface
        gridMat.mainColor           = new Color3(0.0, 0.04, 0.04);
        gridMat.lineColor           = new Color3(0.0, 0.8,  0.8);
        gridMat.backFaceCulling     = false;
        this.plaque.material = gridMat;

        // ── Glowing teal border frame (4 thin edge boxes) ─────────────────────
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
            const edge = B.MeshBuilder.CreateBox(`plaque_edge_${name}`, { width: w, height: h, depth: t }, context.scene);
            edge.position.set(px, py, -0.006);
            edge.parent     = this.root;
            edge.material   = edgeMat;
            edge.isPickable = false;
        }

        // ── Ball: vehicle TransformNode + visible hot-pink sphere ─────────────
        this.ballRoot = new B.TransformNode("ball_root", context.scene);
        this.ballRoot.parent = this.root;
        this.ballRoot.position.set(-0.3, -0.3, 0);  // start off-centre so Arrive is visible on spawn

        this.ball = B.MeshBuilder.CreateSphere("audio_plaque_ball", { diameter: 0.08 }, context.scene);
        this.ball.parent     = this.ballRoot;
        this.ball.position.set(0, 0, -0.05);  // float slightly in front of the plaque
        this.ball.isPickable = false;

        const ballMat = new StandardMaterial("ball_mat", context.scene);
        ballMat.emissiveColor = new Color3(1, 0, 0.5);   // hot-pink glow
        this.ball.material = ballMat;
    }

    /**
     * Project a world-space position onto the plaque's local XY plane.
     *
     * How it works:
     *   1. Invert the root's world matrix to get the world→local transform.
     *   2. Multiply the world position by that inverse → gives us local coordinates
     *      where X is horizontal on the plaque, Y is vertical, Z is depth.
     *   3. Clamp X and Y to [-0.5, +0.5] (the plaque bounds) and force Z = 0.
     *
     * This means the controller can be anywhere in 3D space — we always project
     * straight through to the nearest point on the plaque surface, like a shadow.
     */
    projectOntoPlaque(worldPos: Vector3): Vector3 {
        const localPos = Vector3.TransformCoordinates(
            worldPos,
            this.root.getWorldMatrix().invert()
        );
        return new Vector3(
            Math.max(-0.5, Math.min(0.5, localPos.x)),
            Math.max(-0.5, Math.min(0.5, localPos.y)),
            0
        );
    }

    async dispose() { }
}

// ─── Logic (steering physics + XR controller input) ───────────────────────────

export class AudioPlaqueN3D implements Node3D {

    // The position the ball steers toward, in plaque local space.
    // (0, 0, 0) = centre.  Updated every frame by whichever controller is active.
    public targetPos = new Vector3(0, 0, 0);

    private vehicle!: SteeringVehicle;

    constructor(context: Node3DContext, private gui: AudioPlaqueN3DGUI) {
        context.addToBoundingBox(gui.handle);

        // ── Steering vehicle on the ball's TransformNode ──────────────────────
        this.vehicle = new SteeringVehicle(gui.ballRoot);
        this.vehicle.maxSpeed      = 1.5;
        this.vehicle.maxForce      = 8.0;
        this.vehicle.slowingRadius = 0.25;

        const scene  = gui.root.getScene();
        const inputs = InputManager.getInstance();

        // ── Per-frame update — auto-removed when this Node3D is disposed ──────
        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000.0, 0.1);
            if (dt <= 0) return;

            // ── Controller → targetPos ────────────────────────────────────────
            //
            // WHY we don't use InputPressBehavior here:
            //   InputPressBehavior requires the controller ray to be pointing AT
            //   the plaque mesh at the exact moment the trigger is pressed.
            //   With the Immersive Web Emulator (and often in real VR too) the ray
            //   is rarely aligned precisely with the small plaque, so onDown never
            //   fires reliably.
            //
            // Instead we poll trigger.isPressed() directly every render frame:
            //
            //   • XR controllers (right / left):
            //       Hold trigger → your hand position is projected onto the plaque.
            //       No ray-aiming required — move your hand anywhere in space,
            //       the ball maps from your hand's world position.
            //
            //   • Screen controller (mouse / Immersive Web Emulator desktop mode):
            //       Left-click on the plaque surface and drag.
            //       Uses the ray hit point on the plaque (pointer.target),
            //       so the ball follows exactly where the cursor lands.

            let driven = false;

            // XR: right controller takes priority, then left
            for (const controller of [inputs.right, inputs.left]) {
                if (controller.trigger.isPressed()) {
                    this.targetPos.copyFrom(gui.projectOntoPlaque(controller.pointer.origin));
                    driven = true;
                    break;
                }
            }

            // Mouse / emulator fallback: only when cursor is on the plaque surface
            if (!driven
                && inputs.screen.trigger.isPressed()
                && inputs.screen.pointer.hit
                && inputs.screen.pointer.targetMesh === gui.plaque) {
                this.targetPos.copyFrom(gui.projectOntoPlaque(inputs.screen.pointer.target));
            }

            // ── Steering physics ──────────────────────────────────────────────
            this.vehicle.applyBehavior("Arrive", { position: this.targetPos });
            this.vehicle.update(dt);

            // Pin to the plaque's XY plane — zero Z drift, clamp to bounds
            this.vehicle.velocity.z = 0;
            gui.ballRoot.position.z = 0;
            gui.ballRoot.position.x = Math.max(-0.5, Math.min(0.5, gui.ballRoot.position.x));
            gui.ballRoot.position.y = Math.max(-0.5, Math.min(0.5, gui.ballRoot.position.y));
        });
    }

    async dispose() { }
    async getState(_key: string): Promise<Serializable | void> { }
    getStateKeys(): string[] { return []; }
    async setState(_key: string, _value: Serializable | undefined) { }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export const AudioPlaqueN3DFactory: Node3DFactory<AudioPlaqueN3DGUI, AudioPlaqueN3D> = {
    label: "Audio Plaque",
    description: "XY pad: a physics ball follows your XR controller and outputs automation signals",
    tags: ["automation", "controller", "xy_pad"],

    createGUI: async (context: Node3DGUIContext) => {
        const gui = new AudioPlaqueN3DGUI();
        await gui.init(context);
        return gui;
    },

    create: async (context: Node3DContext, gui: AudioPlaqueN3DGUI) => {
        return new AudioPlaqueN3D(context, gui);
    },
};
