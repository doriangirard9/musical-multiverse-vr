import { AbstractMesh, Color3, Observer, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { SteeringVehicle } from "../../../behaviours/steering/SteeringVehicle";
import { InputPressBehavior } from "../../../xr/inputs/tools/InputPressBehavior";
import { ControllerInput } from "../../../xr/inputs/ControllerInput";

// ─── GUI (pure visuals + coordinate helper) ───────────────────────────────────

export class AudioPlaqueN3DGUI implements Node3DGUI {
    root!: TransformNode;
    worldSize = 2;

    plaque!: AbstractMesh;

    // The ball is split into two objects:
    //   ballRoot  — a TransformNode that SteeringVehicle moves (no collision physics)
    //   ball      — the visible sphere, parented to ballRoot, offset slightly in front
    ballRoot!: TransformNode;
    ball!: AbstractMesh;

    async init(context: Node3DGUIContext) {
        const { babylon: B } = context;

        this.root = new B.TransformNode("audio_plaque_root", context.scene);

        // ── Surface: 1×1 plane with a teal GridMaterial ──────────────────────
        this.plaque = B.MeshBuilder.CreatePlane("audio_plaque", {
            size: 1,
            sideOrientation: 2   // BABYLON.Mesh.DOUBLESIDE
        }, context.scene);
        this.plaque.parent = this.root;

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
    // (0, 0, 0) = centre.  Updated by XR controller in Step 3.
    public targetPos = new Vector3(0, 0, 0);

    private vehicle!: SteeringVehicle;
    private cleanups: { remove(): void }[] = [];

    constructor(context: Node3DContext, private gui: AudioPlaqueN3DGUI) {
        context.addToBoundingBox(gui.plaque);

        // ── Step 2: Steering vehicle on the ball's TransformNode ──────────────
        //
        // SteeringVehicle.position === gui.ballRoot.position (same Vector3 ref),
        // so all arrive/seek math runs in the plaque's local coordinate space.
        // Because ballRoot is a TransformNode (not a Mesh), SteeringVehicle.update()
        // uses  position.addInPlace(velocity * dt)  instead of moveWithCollisions,
        // which lets us fully control where the ball can go.
        this.vehicle = new SteeringVehicle(gui.ballRoot);
        this.vehicle.maxSpeed      = 1.5;   // units/sec in local space
        this.vehicle.maxForce      = 8.0;
        this.vehicle.slowingRadius = 0.25;  // start slowing 25% of plaque width from target

        const scene = gui.root.getScene();

        // Per-frame physics update — auto-removed when this Node3D is disposed
        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000.0, 0.1);
            if (dt <= 0) return;

            this.vehicle.applyBehavior("Arrive", { position: this.targetPos });
            this.vehicle.update(dt);

            // Constrain to the plaque's XY plane after each physics step:
            //   • zero Z velocity so it never drifts off the surface
            //   • clamp XY to the plaque bounds [-0.5, +0.5]
            this.vehicle.velocity.z = 0;
            gui.ballRoot.position.z = 0;
            gui.ballRoot.position.x = Math.max(-0.5, Math.min(0.5, gui.ballRoot.position.x));
            gui.ballRoot.position.y = Math.max(-0.5, Math.min(0.5, gui.ballRoot.position.y));
        });

        // ── Step 3: XR controller → targetPos ────────────────────────────────
        //
        // InputPressBehavior fires onDown when:
        //   controller ray is pointing at gui.plaque  AND  trigger is pressed
        // While active, onMove fires every frame with the controller's live position.
        //
        // We only accept the first controller that presses (firstController guard)
        // to avoid two hands fighting over the same ball.
        let firstController: ControllerInput | null = null;
        let lastObserver:    Observer<any>    | null = null;

        const press = new InputPressBehavior(
            // onDown — controller started pressing while pointing at plaque
            controller => {
                if (firstController == null) {
                    firstController = controller;

                    // Subscribe to this controller's movement.
                    // e is the PointerInput object itself (it calls notifyObservers(this)).
                    // e.origin is the controller tip's live world-space Vector3.
                    lastObserver = controller.pointer.onMove.add(e => {
                        // Project controller world position → plaque local XY
                        const projected = gui.projectOntoPlaque(e.origin);
                        this.targetPos.copyFrom(projected);
                    });
                }
            },
            // onUp — trigger released or controller stopped pointing at plaque
            controller => {
                if (controller === firstController) {
                    lastObserver?.remove();
                    lastObserver    = null;
                    firstController = null;
                }
            }
        );

        gui.plaque.addBehavior(press);

        // Store cleanup so dispose() can detach the behavior cleanly
        this.cleanups.push({ remove: () => gui.plaque.removeBehavior(press) });
    }

    async dispose() {
        this.cleanups.forEach(c => c.remove());
    }

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
