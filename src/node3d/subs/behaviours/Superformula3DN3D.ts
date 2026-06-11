import {
    AbstractMesh, Color3, Color4, LinesMesh, Mesh, MeshBuilder, Observer,
    Quaternion, Scene, StandardMaterial, TransformNode, Vector3, VertexBuffer, VertexData,
} from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable } from "../../tools";

// ─── Superformula3DN3D — supershape de Gielis en 3D ──────────────────────────
//
//   Même rôle que le SuperformulaN3D 2D (contrôleur d'automation : un playhead
//   parcourt la forme, ses métriques de mouvement sortent en automation), mais
//   la forme est le SUPERSHAPE 3D : produit sphérique de deux superformules.
//
//     r1 = sf(θ, mA, n1A, n2A, n3A)   — profil longitudinal (équateur)
//     r2 = sf(φ, mB, n1B, n2B, n3B)   — profil latitudinal (méridien)
//
//     x = r1·cosθ · r2·cosφ
//     y = r2·sinφ
//     z = r1·sinθ · r2·cosφ
//
//   Feedback (le cœur de la demande) :
//     • MORPHING LISSÉ : tourner un knob ne "saute" pas — les paramètres
//       courants glissent vers la cible à chaque frame, la surface se déforme
//       fluidement sous les yeux (mesh updatable, ~1 200 sommets).
//     • COULEURS PAR RAYON : chaque sommet est coloré selon sa distance au
//       centre (violet profond → cyan) — la "météo" de la forme se lit
//       instantanément.
//     • SURCOUCHE WIREFRAME lumineuse qui respire avec l'activité de morphing.
//     • Playhead 3D en spirale sur la surface + traînée fondante + halo.
//     • Cage 12 arêtes dont l'émissif pulse pendant le morphing.
//     • Auto-rotation lente (accélère pendant le morphing).
//
//   BOUNDING BOX : même idiome que le 2D — seule une plaque-poignée à
//   L'ARRIÈRE (z=+0.62, le joueur regarde depuis -z) va dans la bounding box,
//   pour que les rayons atteignent directement knobs et connecteurs devant.

function superformula(angle: number, m: number, n1: number, n2: number, n3: number): number {
    const p1 = Math.pow(Math.abs(Math.cos((m * angle) / 4)), n2);
    const p2 = Math.pow(Math.abs(Math.sin((m * angle) / 4)), n3);
    const r = Math.pow(p1 + p2, -1 / n1);
    return Number.isFinite(r) ? r : 0;
}

// Plages des knobs — 2 profils × (m, n1, n2, n3) + scale + speed
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
} as const;
type RangeKey = keyof typeof RANGES;

const norm   = (key: RangeKey, v: number) => (v - RANGES[key].min) / (RANGES[key].max - RANGES[key].min);
const denorm = (key: RangeKey, t: number) => RANGES[key].min + Math.max(0, Math.min(1, t)) * (RANGES[key].max - RANGES[key].min);

// Runtime resize (même plage que le 2D / AudioPlaque)
const RESIZE_MIN = 0.3, RESIZE_MAX = 4.0, RESIZE_DEFAULT = 1.0;

// Résolution de la surface.  97×49 ≈ 4 750 sommets : nécessaire pour que la
// surface AFFICHÉE colle à la vraie formule — la boule suit la formule exacte,
// un maillage trop grossier (48×24) la faisait « flotter » hors des facettes
// dès que m dépassait ~6.  Rebuild seulement pendant le morphing.
const U_SEGS = 96;   // θ : -π..π
const V_SEGS = 48;   // φ : -π/2..π/2
const TRAIL_POINTS = 90;

// Dégradé de couleur par rayon normalisé
const COLOR_INNER = new Color3(0.30, 0.10, 0.55);   // violet profond
const COLOR_OUTER = new Color3(0.20, 0.95, 1.00);   // cyan

// ─── GUI ──────────────────────────────────────────────────────────────────────

export class Superformula3DN3DGUI implements Node3DGUI {
    root!: TransformNode;
    get worldSize() { return this.factory.size; }

    handle!: AbstractMesh;          // plaque arrière — seule cible de la bounding box
    shapeRoot!: TransformNode;      // porte la surface (auto-rotation)
    surface!: Mesh;                 // mesh updatable du supershape
    wire!: Mesh;                    // clone wireframe (géométrie partagée)
    wireMat!: StandardMaterial;
    edgeMat!: StandardMaterial;     // matériau commun des 12 arêtes de la cage

    // Playhead
    ballRoot!: TransformNode;
    ball!: AbstractMesh;
    ballHalo!: AbstractMesh;
    trail!: LinesMesh | null;
    trailPoints: Vector3[] = [];

    // Connecteurs / knobs
    audioIn!: AbstractMesh;
    audioOut!: AbstractMesh;
    knobs: Record<string, AbstractMesh> = {};
    resizeHandle!: AbstractMesh;

    outPosX!: AbstractMesh;  outPosY!: AbstractMesh;  outPosZ!: AbstractMesh;
    outRadius!: AbstractMesh; outRadiusDelta!: AbstractMesh;
    outSpeed!: AbstractMesh; outAcceleration!: AbstractMesh; outCurvature!: AbstractMesh;

    // Buffers réutilisés du mesh (positions/normales/couleurs ; indices fixes)
    private positions!: Float32Array;
    private normals!: Float32Array;
    private colors!: Float32Array;

    private scene!: Scene;

    constructor(public factory: Superformula3DN3DFactory) {}

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: { ConnectableUtils, MeshUtils, AudioN3DConnectable } } = context;
        const scene = this.scene = context.scene;

        this.root = new B.TransformNode("sf3d_root", scene);

        // ── Plaque-poignée arrière (bounding box) ─────────────────────────────
        this.handle = B.MeshBuilder.CreateBox("sf3d_handle", {
            width: 1.7, height: 1.7, depth: 0.06,
        }, scene);
        this.handle.parent = this.root;
        this.handle.position.set(0, 0, 0.62);
        this.handle.material = context.materialMat;
        this.handle.isPickable = false;

        // ── Cage : 12 arêtes lumineuses (pulse pendant le morphing) ───────────
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

        // ── Surface supershape (mesh custom updatable) ────────────────────────
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
        surfMat.diffuseColor  = new Color3(1, 1, 1);          // modulé par les vertex colors
        surfMat.emissiveColor = new Color3(0.18, 0.20, 0.28); // lisible même sans lumière directe
        surfMat.specularColor = new Color3(0.4, 0.4, 0.45);
        surfMat.backFaceCulling = false;                      // les formes concaves montrent l'intérieur
        this.surface.material = surfMat;
        this.surface.hasVertexAlpha = false;
        // Les buffers changent à chaque morph sans refresh de bounding info →
        // on désactive le frustum culling (mesh peu coûteux, toujours rendu).
        this.surface.alwaysSelectAsActiveMesh = true;

        // Surcouche wireframe — géométrie PARTAGÉE avec la surface (clone),
        // donc mise à jour gratuitement à chaque morph.
        this.wire = this.surface.clone("sf3d_wire");
        this.wire.parent = this.shapeRoot;
        this.wire.isPickable = false;
        this.wire.scaling.setAll(1.015);
        // Le clone garde la bounding info DÉGÉNÉRÉE du moment du clone (tout à
        // zéro) et ne la rafraîchit jamais → sans ce flag il disparaît selon
        // l'angle de vue (frustum culling sur un point).
        this.wire.alwaysSelectAsActiveMesh = true;
        this.wireMat = new StandardMaterial("sf3d_wire_mat", scene);
        this.wireMat.emissiveColor = new Color3(0.2, 0.9, 1.0);
        this.wireMat.disableLighting = true;
        this.wireMat.wireframe = true;
        this.wireMat.alpha = 0.16;
        this.wireMat.backFaceCulling = false;
        this.wire.material = this.wireMat;

        // ── Playhead : balle + halo + traînée 3D ──────────────────────────────
        this.ballRoot = new B.TransformNode("sf3d_ball_root", scene);
        this.ballRoot.parent = this.shapeRoot;   // suit l'auto-rotation de la forme

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
        // Même raison que le wire : les updates par instance ne rafraîchissent
        // pas la bounding info → culling erratique sans ce flag.
        this.trail.alwaysSelectAsActiveMesh = true;

        // ── Audio in/out — coins supérieurs ───────────────────────────────────
        const audioColor = (() => { const c = AudioN3DConnectable.Color; return new Color4(c.r, c.g, c.b, 1); })();
        this.audioIn = ConnectableUtils.createInputMesh("sf3d_audio_in", 0.08, scene);
        this.audioIn.parent = this.root;
        this.audioIn.position.set(-0.68, 0.68, 0);
        MeshUtils.setColor(this.audioIn, audioColor);

        this.audioOut = ConnectableUtils.createOutputMesh("sf3d_audio_out", 0.08, scene);
        this.audioOut.parent = this.root;
        this.audioOut.position.set(0.68, 0.68, 0);
        MeshUtils.setColor(this.audioOut, audioColor);

        // ── Knobs : profil A à gauche (or), profil B à droite (magenta),
        //    scale/speed en bas des colonnes (orange) ────────────────────────────
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

        // ── 8 sorties d'automation — rangée du bas ────────────────────────────
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

        // ── Poignée de resize — sommet de la cage ─────────────────────────────
        this.resizeHandle = B.MeshBuilder.CreateSphere("sf3d_resize", { diameter: 0.08 }, scene);
        this.resizeHandle.parent = this.root;
        this.resizeHandle.position.set(0, 0.70, 0);
        const resizeMat = new StandardMaterial("sf3d_resize_mat", scene);
        resizeMat.emissiveColor = new Color3(0.85, 0.3, 0.95);
        this.resizeHandle.material = resizeMat;
    }

    /**
     * Recalcule positions + normales + couleurs du supershape pour les
     * paramètres donnés.  Buffers réutilisés, indices fixes — pas d'allocation
     * par frame (hors le tableau temporaire de ComputeNormals).
     */
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

        // Couleurs : dégradé violet → cyan selon le rayon normalisé
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

    /**
     * Échantillonne la SURFACE AFFICHÉE en (u01, v01) ∈ [0,1]² : interpolation
     * bilinéaire entre les 4 sommets voisins des buffers du mesh (positions +
     * normales).  La boule qui suit ce point est collée aux facettes RENDUES
     * par construction — aucune divergence possible entre la formule analytique
     * et le maillage (résolution, spikes, morphing en cours…).
     */
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

    /** Pousse une position de playhead dans la traînée (fondante). */
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
    // Cibles (les knobs écrivent ici) et valeurs courantes (lissées vers la cible)
    private target: Record<RangeKey, number> = Object.fromEntries(
        (Object.keys(RANGES) as RangeKey[]).map(k => [k, RANGES[k].default]),
    ) as Record<RangeKey, number>;
    private current = { ...this.target };

    private theta = 0;          // phase du playhead
    private userScale = RESIZE_DEFAULT;
    private morphActivity = 0;  // 0..1 — pilote wireframe/cage/rotation

    private gainIn!: GainNode;
    private gainOut!: GainNode;

    private outs: Record<string, InstanceType<(typeof AutomationN3DConnectable)["Output"]>> = {};

    constructor(context: Node3DContext, private gui: Superformula3DN3DGUI) {
        const { audioCtx, tools: T } = context;
        const scene = gui.root.getScene();

        context.addToBoundingBox(gui.handle);

        // Aplatit l'inclinaison de spawn de la bounding box (idiome du 2D)
        let orientObs: Observer<Scene> | null = null;
        orientObs = context.observe(scene.onBeforeRenderObservable, () => {
            let p: TransformNode | null = gui.root.parent as TransformNode | null;
            while (p && p.name !== "boundingBox") p = p.parent as TransformNode | null;
            if (!p) return;
            p.rotation.set(0, 0, 0);
            p.rotationQuaternion = Quaternion.Identity();
            if (orientObs) { scene.onBeforeRenderObservable.remove(orientObs); orientObs = null; }
        });

        // ── Audio passthrough ─────────────────────────────────────────────────
        this.gainIn = audioCtx.createGain();
        this.gainOut = audioCtx.createGain();
        this.gainIn.connect(this.gainOut);
        context.createConnectable(new T.AudioN3DConnectable.Input("audioIn", [gui.audioIn], "Audio In", this.gainIn));
        context.createConnectable(new T.AudioN3DConnectable.Output("audioOut", [gui.audioOut], "Audio Out", this.gainOut));

        // ── 8 sorties d'automation ────────────────────────────────────────────
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

        // ── Knobs (10) — la cible bouge, la forme suit en douceur ─────────────
        const knobDefs: [RangeKey, string, number][] = [
            ["mA",  "Pétales A (m)",     1],
            ["n1A", "Tranchant A (n1)",  2],
            ["n2A", "Largeur A (n2)",    2],
            ["n3A", "Hauteur A (n3)",    2],
            ["mB",  "Pétales B (m)",     1],
            ["n1B", "Tranchant B (n1)",  2],
            ["n2B", "Largeur B (n2)",    2],
            ["n3B", "Hauteur B (n3)",    2],
            ["scale", "Échelle",         2],
            ["speed", "Vitesse",         2],
        ];
        for (const [key, label, decimals] of knobDefs) {
            const mesh = gui.knobs[key];
            const updateVisual = () => mesh.scaling.setAll(0.6 + norm(key, this.target[key]) * 0.6);
            updateVisual();
            context.createParameter({
                id: key,
                meshes: [mesh],
                getLabel: () => label,
                getStepCount: () => 0,
                getValue: () => norm(key, this.target[key]),
                setValue: (v01: number) => {
                    this.target[key] = denorm(key, v01);
                    updateVisual();
                    context.notifyStateChange(key);
                },
                stringify: (v01: number) => `${label}: ${denorm(key, v01).toFixed(decimals)}`,
            });
        }

        // ── Resize runtime ────────────────────────────────────────────────────
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
            stringify: (v01: number) => `Size: ${(RESIZE_MIN + v01 * (RESIZE_MAX - RESIZE_MIN)).toFixed(2)}x`,
        });

        console.log("[Superformula3D] SPAWNED");

        // ── Boucle par frame ──────────────────────────────────────────────────
        //
        //   1. Lissage des paramètres courants vers la cible (morphing fluide) ;
        //      rebuild de la surface tant que ça bouge.
        //   2. Avance du playhead en spirale (θ, φ incommensurables → couvre
        //      toute la surface) + traînée.
        //   3. Métriques de mouvement 3D → automation.
        //   4. Feedback : auto-rotation, wireframe/cage qui respirent, halo.
        //
        let prev = new Vector3();
        let prevVel = new Vector3();
        let prevR = 0;
        let firstFrame = true;
        let surfaceDirty = true;
        const ballPos = new Vector3();
        const ballNormal = new Vector3();
        const vel = new Vector3();

        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
            if (dt <= 0) return;
            const tNow = performance.now() / 1000;

            // 1. Morphing lissé
            let maxDiff = 0;
            const k = Math.min(1, dt * 6);
            for (const key of Object.keys(RANGES) as RangeKey[]) {
                const diff = this.target[key] - this.current[key];
                const span = RANGES[key].max - RANGES[key].min;
                maxDiff = Math.max(maxDiff, Math.abs(diff) / span);
                this.current[key] += diff * k;
            }
            this.morphActivity = Math.min(1, maxDiff * 12);
            if (maxDiff > 1e-4) surfaceDirty = true;

            if (surfaceDirty) {
                const c = this.current;
                gui.rebuildSurface(c.mA, c.n1A, c.n2A, c.n3A, c.mB, c.n1B, c.n2B, c.n3B, c.scale);
                surfaceDirty = false;
            }

            // 2. Playhead en spirale sur la SURFACE AFFICHÉE — on échantillonne
            //    les buffers du mesh (bilinéaire), PAS la formule analytique :
            //    collage parfait aux facettes rendues quels que soient la
            //    résolution, les spikes ou le morphing en cours.
            this.theta += this.current.speed * dt;
            const u01 = (((this.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
            const v01 = 0.5 + 0.46 * Math.sin(this.theta * 0.37);
            const s = this.current.scale;
            gui.samplePoint(u01, v01, ballPos, ballNormal);
            // Poser la boule SUR la facette : petit décalage le long de la
            // normale extérieure (retournée si elle pointe vers le centre).
            const nLen = ballNormal.length();
            if (nLen > 1e-6) {
                ballNormal.scaleInPlace(1 / nLen);
                if (Vector3.Dot(ballNormal, ballPos) < 0) ballNormal.scaleInPlace(-1);
                ballPos.addInPlace(ballNormal.scaleInPlace(0.02));
            }
            gui.ballRoot.position.copyFrom(ballPos);
            // Première frame : la traînée démarre SUR la boule (sinon un trait
            // parasite relie l'origine à la position de départ).
            if (firstFrame) for (const p of gui.trailPoints) p.copyFrom(ballPos);
            gui.pushTrailPoint(ballPos);

            // 3. Métriques 3D → automation (normalisées 0..1, mêmes calibres que le 2D)
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

            // 4. Feedback continu.
            //    PAS d'auto-rotation au repos : la forme reste stable pour que
            //    la boule se lise clairement en train de parcourir la surface.
            //    Pendant le morphing seulement, la forme « remue » doucement.
            gui.shapeRoot.rotation.y += dt * this.morphActivity * 1.2;
            const breathe = 1 + Math.sin(tNow * Math.PI) * 0.06;
            gui.ball.scaling.setAll(breathe);
            gui.ballHalo.scaling.setAll(breathe * 1.05);
            gui.wireMat.alpha = 0.10 + this.morphActivity * 0.45;
            const glow = 0.75 + this.morphActivity * 0.8 + Math.sin(tNow * Math.PI * 2) * 0.06;
            gui.edgeMat.emissiveColor.set(0 * glow, 0.75 * glow, 0.85 * glow);

            prevVel.set(vel.x / Math.max(dt, 1e-6), vel.y / Math.max(dt, 1e-6), vel.z / Math.max(dt, 1e-6));
            prev.copyFrom(ballPos);
            prevR = r;
            firstFrame = false;
        });
    }

    async dispose() {
        try { this.gainIn.disconnect(); } catch (_) {}
        try { this.gainOut.disconnect(); } catch (_) {}
    }

    // ── Sync : 10 knobs + resize ; theta évolue librement par pair ────────────
    getStateKeys(): string[] { return [...Object.keys(RANGES), "userScale"]; }

    async getState(key: string): Promise<Serializable | void> {
        if (key === "userScale") return this.userScale;
        if (key in RANGES) return this.target[key as RangeKey];
    }

    async setState(key: string, value: Serializable | undefined): Promise<void> {
        if (typeof value !== "number") return;
        if (key === "userScale") {
            this.userScale = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, value));
            this.gui.root.scaling.setAll(this.userScale);
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
        "Supershape de Gielis en 3D (produit sphérique de deux superformules). " +
        "8 knobs sculptent la surface (2 profils), qui MORPHE en douceur sous les " +
        "yeux (couleurs par rayon + wireframe lumineux). Un playhead parcourt la " +
        "surface en spirale ; 8 métriques de mouvement 3D (X, Y, Z, rayon, " +
        "vitesse…) sortent en automation. Poignée violette pour redimensionner.",
    );
}
