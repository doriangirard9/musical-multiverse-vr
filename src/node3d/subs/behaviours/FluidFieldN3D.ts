import {
    AbstractMesh, Color3, Color4, DynamicTexture, Observer, Quaternion, Scene,
    StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable, MidiN3DConnectable } from "../../tools";
import type { PointerInput } from "../../../xr/inputs/PointerInput";
import { setupInstrumentControls, makeClusterButtons, OutputPulser, type TunableParam, type ClusterButtons } from "./instrumentControls";

// ─── FluidFieldN3D — champ de fluide Perlin réactif ──────────────────────────
//
//   Port du sketch p5.js "Perlin Noise Fluid Field" vers wamjamparty.
//
//   LE MODÈLE (fidèle au sketch) :
//     • Une grille de vecteurs à deux couches :
//         baseGrid — courants de fond en bruit de Perlin 3D (z = temps),
//         wakeGrid — perturbations injectées (vortex du joueur, sillages des
//                    boids), amorties chaque pas par la viscosité.
//     • Pointer le laser sur le canvas + gâchette → VORTEX tangentiel injecté
//       sous le pointeur (l'équivalent du mouseIsPressed du sketch).
//     • Des boids suivent le courant total et laissent des remous (splat).
//
//   L'ADAPTATION wamjamparty (idiome AudioPlaque) :
//     • Grand canvas = DynamicTexture (2D) sur une plaque 1.6×1.0, montée sur
//       une plaque-poignée arrière (seule cible de la bounding box) — les
//       rayons atteignent le canvas, les knobs et les connecteurs directement.
//     • La chaîne WAM codée en dur du sketch devient des SORTIES D'AUTOMATION :
//         disturbance — Σ|wake| normalisé (lac calme 0 → tempête 1)
//                       (le sketch la mappait sur cutoff + overdrive)
//         curl        — rotationnel moyen |∇×F| (tourbillons)
//                       (le sketch : résonance + temps de delay)
//         swarmX/Y    — centre de masse des boids (0..1)
//     • Le panoramique du sketch (Mapping C) devient RÉEL : le passthrough
//       audio traverse un StereoPannerNode piloté par swarmX.
//     • Le drone du sketch (Sol grave retriggé chaque seconde) devient une
//       sortie MIDI + bouton play/stop : câbler vers un synthé (Pro54) et
//       renvoyer son audio dans la plaque → le patch original complet.
//
//   SIMULATION À PAS FIXE (1/60 s, comme p5) : toutes les constantes du
//   sketch (viscosité par frame, vitesses en px/frame…) gardent leur sens.

// ── Bruit de Perlin 3D (improved Perlin + fbm 4 octaves, sortie ~[0,1]) ──────
// p5.noise() est un bruit fractal [0,1] ; on reproduit le caractère avec un
// Perlin classique sommé sur 4 octaves (falloff 0.5), table de permutation
// mélangée par xorshift déterministe.
class Perlin3 {
    private p = new Uint8Array(512);
    constructor(seed = 1337) {
        const perm = new Uint8Array(256);
        for (let i = 0; i < 256; i++) perm[i] = i;
        let s = seed >>> 0;
        const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
        }
        for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    }
    private static fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
    private static lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    private static grad(h: number, x: number, y: number, z: number) {
        const u = (h & 15) < 8 ? x : y;
        const v = (h & 15) < 4 ? y : ((h & 15) === 12 || (h & 15) === 14 ? x : z);
        return (((h & 15) & 1) === 0 ? u : -u) + (((h & 15) & 2) === 0 ? v : -v);
    }
    /** Perlin 3D brut, ∈ [-1, 1]. */
    noise(x: number, y: number, z: number): number {
        const p = this.p;
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = Perlin3.fade(x), v = Perlin3.fade(y), w = Perlin3.fade(z);
        const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
        const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
        return Perlin3.lerp(
            Perlin3.lerp(
                Perlin3.lerp(Perlin3.grad(p[AA], x, y, z),     Perlin3.grad(p[BA], x - 1, y, z), u),
                Perlin3.lerp(Perlin3.grad(p[AB], x, y - 1, z), Perlin3.grad(p[BB], x - 1, y - 1, z), u), v),
            Perlin3.lerp(
                Perlin3.lerp(Perlin3.grad(p[AA + 1], x, y, z - 1),     Perlin3.grad(p[BA + 1], x - 1, y, z - 1), u),
                Perlin3.lerp(Perlin3.grad(p[AB + 1], x, y - 1, z - 1), Perlin3.grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
    }
    /** Fractal 4 octaves, falloff 0.5 → [0, 1] (caractère p5.noise). */
    fbm(x: number, y: number, z: number): number {
        let sum = 0, amp = 0.5, f = 1;
        for (let o = 0; o < 4; o++) {
            sum += amp * (this.noise(x * f, y * f, z * f) * 0.5 + 0.5);
            amp *= 0.5; f *= 2;
        }
        return sum / 0.9375;   // Σ amps = 0.9375
    }
}

// ── Knobs (plages du sketch, valeurs par défaut identiques) ──────────────────
const RANGES = {
    noiseScale:     { min: 0.01, max: 0.20, default: 0.05 },   // échelle du Perlin
    noiseSpeed:     { min: 0.0,  max: 0.02, default: 0.002 },  // évolution (z) par pas
    viscosity:      { min: 0.80, max: 0.99, default: 0.92 },   // amortissement des remous
    vortexRadius:   { min: 30,   max: 200,  default: 100 },    // px canvas
    vortexStrength: { min: 0.5,  max: 10,   default: 5 },
    boidSpeed:      { min: 1,    max: 15,   default: 6 },      // px/pas (comme p5)
    splatStrength:  { min: 0,    max: 2,    default: 0.5 },    // sillage des boids
    droneNote:      { min: 24,   max: 60,   default: 31 },     // Sol grave du sketch
} as const;
type RangeKey = keyof typeof RANGES;
const norm   = (k: RangeKey, v: number) => (v - RANGES[k].min) / (RANGES[k].max - RANGES[k].min);
const denorm = (k: RangeKey, t: number) => RANGES[k].min + Math.max(0, Math.min(1, t)) * (RANGES[k].max - RANGES[k].min);

// Redimensionnement à deux mains géré par l'hôte → plus de poignée par item.

// ── Canvas / grille (1200×750, res 25 dans le sketch → réduit pour le Quest) ──
const TEX_W = 800, TEX_H = 500;       // même ratio 1.6:1
const CELL = 20;                       // résolution de la grille (px)
const COLS = Math.floor(TEX_W / CELL) + 1;   // 41
const ROWS = Math.floor(TEX_H / CELL) + 1;   // 26
const SIM_STEP = 1 / 60;               // pas fixe : les constantes p5 restent valides
const BOID_DEFAULT = 30, BOID_STEP = 10, BOID_MAX = 80;

// Presets de comportement (valeurs RÉELLES dans les plages de RANGES + boidCount).
const FLUID_PRESETS: Record<string, Record<string, number>> = {
    "Calm Lake":   { noiseScale: 0.04, noiseSpeed: 0.001, viscosity: 0.95, vortexRadius: 100, vortexStrength: 3,  boidSpeed: 3,  splatStrength: 0.2, droneNote: 31, boidCount: 15 },
    "River":       { noiseScale: 0.05, noiseSpeed: 0.003, viscosity: 0.92, vortexRadius: 120, vortexStrength: 5,  boidSpeed: 6,  splatStrength: 0.5, droneNote: 31, boidCount: 30 },
    "Storm":       { noiseScale: 0.09, noiseSpeed: 0.012, viscosity: 0.85, vortexRadius: 160, vortexStrength: 9,  boidSpeed: 12, splatStrength: 1.2, droneNote: 28, boidCount: 50 },
    "Whirlpools":  { noiseScale: 0.12, noiseSpeed: 0.004, viscosity: 0.82, vortexRadius: 180, vortexStrength: 10, boidSpeed: 8,  splatStrength: 1.5, droneNote: 33, boidCount: 40 },
    "Dense Swarm": { noiseScale: 0.06, noiseSpeed: 0.005, viscosity: 0.90, vortexRadius: 120, vortexStrength: 6,  boidSpeed: 14, splatStrength: 2,   droneNote: 31, boidCount: 80 },
};

// Plaque locale : 1.6 × 1.0 (les helpers de projection clampent sur ces moitiés)
const HALF_W = 0.8, HALF_H = 0.5;

// Palette des flèches : sarcelle (calme) → rouge (tempête), pré-calculée en
// 24 niveaux pour éviter de fabriquer des chaînes rgba par cellule par frame.
const ARROW_LUT: string[] = [];
for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const r = Math.round(0   + 255 * t), g = Math.round(255 - 255 * t), b = Math.round(204 - 119 * t);
    const a = (0.12 + 0.68 * t).toFixed(3);
    ARROW_LUT.push(`rgba(${r},${g},${b},${a})`);
}

// ── Boid du sketch (espace canvas en px, intégration par pas fixe) ───────────
class FluidBoid {
    x: number; y: number; vx: number; vy: number;
    constructor(x: number, y: number) {
        this.x = x; this.y = y;
        this.vx = Math.random() * 2 - 1; this.vy = Math.random() * 2 - 1;
    }
}

// ─── GUI ──────────────────────────────────────────────────────────────────────

export class FluidFieldN3DGUI implements Node3DGUI {
    root!: TransformNode;
    get worldSize() { return this.factory.size; }

    handle!: AbstractMesh;       // plaque-poignée arrière (bounding box)
    plaque!: AbstractMesh;       // le grand canvas (pickable — cible du laser)
    tex!: DynamicTexture;
    ctx!: CanvasRenderingContext2D;

    audioIn!: AbstractMesh;
    audioOut!: AbstractMesh;
    midiOut!: AbstractMesh;
    knobs: Record<string, AbstractMesh> = {};
    btnBoidAdd!: AbstractMesh;
    btnBoidRemove!: AbstractMesh;
    btnDrone!: AbstractMesh;
    droneMat!: StandardMaterial;
    cluster!: ClusterButtons;

    outDisturbance!: AbstractMesh;
    outCurl!: AbstractMesh;
    outSwarmX!: AbstractMesh;
    outSwarmY!: AbstractMesh;

    constructor(public factory: FluidFieldN3DFactory) {}

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: { ConnectableUtils, MeshUtils, AudioN3DConnectable, MidiN3DConnectable: Midi } } = context;
        const scene = context.scene;

        this.root = new B.TransformNode("fluid_root", scene);

        // ── Plaque-poignée arrière (seule cible de la bounding box) ───────────
        this.handle = B.MeshBuilder.CreateBox("fluid_handle", {
            width: 1.5, height: 0.95, depth: 0.04,
        }, scene);
        this.handle.parent = this.root;
        this.handle.position.set(0, 0, 0.15);
        this.handle.material = context.materialMat;
        this.handle.isPickable = false;

        // ── Le grand canvas : DynamicTexture émissive sur une plaque 1.6×1.0 ──
        this.plaque = B.MeshBuilder.CreatePlane("fluid_plaque", {
            width: HALF_W * 2, height: HALF_H * 2, sideOrientation: 2,
        }, scene);
        this.plaque.parent = this.root;
        this.plaque.isPickable = true;   // cible du laser (vortex)

        this.tex = new DynamicTexture("fluid_tex", { width: TEX_W, height: TEX_H }, scene, false);
        this.ctx = this.tex.getContext() as CanvasRenderingContext2D;
        // Dessiner un premier frame + update() IMMÉDIATEMENT : sans ça la
        // DynamicTexture n'est jamais "ready" tant que la logique (render loop)
        // ne tourne pas — or le RENDU DE VIGNETTE du shop n'instancie que la GUI
        // (pas la logique). Une texture jamais-ready y bloque le render-to-texture
        // → la vignette ne se termine pas → l'instrument n'apparaît pas du tout
        // dans le menu. Un fond dessiné une fois rend la texture ready d'emblée.
        this.ctx.fillStyle = "rgb(15,15,20)";
        this.ctx.fillRect(0, 0, TEX_W, TEX_H);
        this.tex.update();
        const mat = new StandardMaterial("fluid_mat", scene);
        mat.emissiveTexture = this.tex;
        mat.diffuseColor = new Color3(0, 0, 0);
        mat.specularColor = new Color3(0, 0, 0);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        this.plaque.material = mat;

        // ── Cadre lumineux (sarcelle, comme l'AudioPlaque) ────────────────────
        const edgeMat = new StandardMaterial("fluid_edge_mat", scene);
        edgeMat.emissiveColor = new Color3(0, 0.9, 0.8);
        edgeMat.disableLighting = true;
        const t = 0.012;
        const edges: [string, number, number, number, number][] = [
            ["top",    HALF_W * 2 + t, t, 0,  HALF_H],
            ["bottom", HALF_W * 2 + t, t, 0, -HALF_H],
            ["left",   t, HALF_H * 2 + t, -HALF_W, 0],
            ["right",  t, HALF_H * 2 + t,  HALF_W, 0],
        ];
        for (const [name, w, h, px, py] of edges) {
            const e = B.MeshBuilder.CreateBox(`fluid_edge_${name}`, { width: w, height: h, depth: t }, scene);
            e.parent = this.root;
            e.position.set(px, py, -0.006);
            e.material = edgeMat;
            e.isPickable = false;
        }

        // ── Connecteurs audio (passthrough avec panner stéréo) ────────────────
        const audioColor = (() => { const c = AudioN3DConnectable.Color; return new Color4(c.r, c.g, c.b, 1); })();
        this.audioIn = ConnectableUtils.createInputMesh("fluid_audio_in", 0.08, scene);
        this.audioIn.parent = this.root;
        this.audioIn.position.set(-0.95, 0.35, 0);
        MeshUtils.setColor(this.audioIn, audioColor);

        this.audioOut = ConnectableUtils.createOutputMesh("fluid_audio_out", 0.08, scene);
        this.audioOut.parent = this.root;
        this.audioOut.position.set(0.95, 0.35, 0);
        MeshUtils.setColor(this.audioOut, audioColor);

        // ── Sortie MIDI (drone) + bouton play/stop — bord supérieur droit ─────
        this.midiOut = ConnectableUtils.createOutputMesh("fluid_midi_out", 0.08, scene);
        this.midiOut.parent = this.root;
        this.midiOut.position.set(0.62, 0.62, 0);
        MeshUtils.setColor(this.midiOut, Midi.Color.toColor4());

        const mkDisc = (name: string, diameter: number, emissive: Color3): AbstractMesh => {
            const m = B.MeshBuilder.CreateCylinder(name, { diameter, height: 0.025, tessellation: 24 }, scene);
            m.rotation.x = Math.PI / 2;
            const dm = new StandardMaterial(`${name}_mat`, scene);
            dm.emissiveColor = emissive;
            dm.disableLighting = true;
            m.material = dm;
            m.parent = this.root;
            return m;
        };
        this.btnDrone = mkDisc("fluid_btn_drone", 0.11, new Color3(0.2, 0.7, 0.3));
        this.btnDrone.position.set(0.42, 0.62, 0);
        this.droneMat = this.btnDrone.material as StandardMaterial;

        // ── Boutons boids ± — bord supérieur gauche ───────────────────────────
        this.btnBoidAdd = mkDisc("fluid_boid_add", 0.085, new Color3(0.2, 0.85, 0.35));
        this.btnBoidAdd.position.set(-0.55, 0.62, 0);
        this.btnBoidRemove = mkDisc("fluid_boid_remove", 0.085, new Color3(0.85, 0.2, 0.3));
        this.btnBoidRemove.position.set(-0.40, 0.62, 0);

        // ── Knobs (sphères, idiome plaque/superformula) ───────────────────────
        const mkKnob = (name: string, color: Color4): AbstractMesh => {
            const k = B.MeshBuilder.CreateSphere(name, { diameter: 0.10 }, scene);
            k.parent = this.root;
            const km = new StandardMaterial(`${name}_mat`, scene);
            km.emissiveColor = new Color3(color.r * 0.6, color.g * 0.6, color.b * 0.6);
            km.diffuseColor = new Color3(color.r, color.g, color.b);
            k.material = km;
            return k;
        };
        const teal   = new Color4(0.20, 0.85, 0.75, 1);   // courants de base
        const red    = new Color4(0.95, 0.25, 0.40, 1);   // physique des remous
        const orange = new Color4(1.00, 0.65, 0.15, 1);   // entités
        const gold   = new Color4(0.95, 0.85, 0.20, 1);   // drone

        // Colonne gauche : courants + viscosité ; colonne droite : vortex + boids
        const leftDefs: [RangeKey, Color4][] = [
            ["noiseScale", teal], ["noiseSpeed", teal], ["viscosity", red], ["splatStrength", orange],
        ];
        const rightDefs: [RangeKey, Color4][] = [
            ["vortexRadius", red], ["vortexStrength", red], ["boidSpeed", orange], ["droneNote", gold],
        ];
        leftDefs.forEach(([key, c], i) => {
            const k = mkKnob(`fluid_knob_${key}`, c);
            k.position.set(-0.95, 0.12 - i * 0.18, 0);
            this.knobs[key] = k;
        });
        rightDefs.forEach(([key, c], i) => {
            const k = mkKnob(`fluid_knob_${key}`, c);
            k.position.set(0.95, 0.12 - i * 0.18, 0);
            this.knobs[key] = k;
        });

        // ── Sorties d'automation — rangée du bas ──────────────────────────────
        const mkOut = (name: string, x: number, c: Color4): AbstractMesh => {
            const m = ConnectableUtils.createOutputMesh(name, 0.07, scene);
            m.parent = this.root;
            m.position.set(x, -0.66, 0);
            MeshUtils.setColor(m, c);
            return m;
        };
        this.outDisturbance = mkOut("fluid_out_dist",   -0.45, new Color4(1.00, 0.30, 0.20, 1));  // rouge-orange
        this.outCurl        = mkOut("fluid_out_curl",   -0.15, new Color4(0.70, 0.35, 1.00, 1));  // violet
        this.outSwarmX      = mkOut("fluid_out_swarmx",  0.15, new Color4(1.00, 0.40, 0.70, 1));  // rose
        this.outSwarmY      = mkOut("fluid_out_swarmy",  0.45, new Color4(0.40, 0.70, 1.00, 1));  // bleu clair

        // Cluster standard ? · Presets · 🎲 · ↺ — haut-centre (entre boids et drone)
        this.cluster = makeClusterButtons(B, scene, this.root, { x: -0.24, y: 0.62, z: 0 });
    }

    // ── Projection monde → local plaque (copie de l'AudioPlaque, clamps 1.6×1) ─
    private static readonly _LX = new Vector3(1, 0, 0);
    private static readonly _LY = new Vector3(0, 1, 0);
    private static readonly _LZ = new Vector3(0, 0, 1);

    projectOntoPlaque(worldPos: Vector3): Vector3 {
        const center = this.plaque.getAbsolutePosition();
        const right = this.plaque.getDirection(FluidFieldN3DGUI._LX);
        const up = this.plaque.getDirection(FluidFieldN3DGUI._LY);
        const offset = worldPos.subtract(center);
        const r2 = right.lengthSquared(), u2 = up.lengthSquared();
        if (r2 < 1e-10 || u2 < 1e-10) return new Vector3(0, 0, 0);
        return new Vector3(
            Math.max(-HALF_W, Math.min(HALF_W, Vector3.Dot(offset, right) / r2)),
            Math.max(-HALF_H, Math.min(HALF_H, Vector3.Dot(offset, up) / u2)),
            0,
        );
    }

    plaqueNormal(): Vector3 { return this.plaque.getDirection(FluidFieldN3DGUI._LZ); }

    async dispose() {
        this.tex?.dispose();
    }
}

// ─── Logic ────────────────────────────────────────────────────────────────────

export class FluidFieldN3D implements Node3D {
    // Valeurs des knobs (appliquées directement à la simulation)
    private vals: Record<RangeKey, number> = Object.fromEntries(
        (Object.keys(RANGES) as RangeKey[]).map(k => [k, RANGES[k].default]),
    ) as Record<RangeKey, number>;

    // ── État de la simulation (espace canvas en px, pas fixe 1/60 s) ──────────
    private perlin = new Perlin3();
    private baseX = new Float32Array(COLS * ROWS);
    private baseY = new Float32Array(COLS * ROWS);
    private wakeX = new Float32Array(COLS * ROWS);
    private wakeY = new Float32Array(COLS * ROWS);
    private zOff = 0;
    private simAccum = 0;
    private boids: FluidBoid[] = [];
    private boidCount = BOID_DEFAULT;

    // Vortex du joueur (laser + gâchette maintenue)
    private vortexActive = false;
    private vortexX = 0;   // px canvas
    private vortexY = 0;

    // Métriques lissées (EMA) → sorties d'automation
    private dist01 = 0;
    private curl01 = 0;
    private comX01 = 0.5;
    private comY01 = 0.5;

    // Drone MIDI
    private droneOn = false;
    private droneTimer = 0;
    private lastDronePitch = -1;

    private gainIn!: GainNode;
    private panner!: StereoPannerNode;
    private gainOut!: GainNode;
    private audioCtx: AudioContext;

    private outs: Record<string, InstanceType<(typeof AutomationN3DConnectable)["Output"]>> = {};
    private midiOutput!: InstanceType<(typeof MidiN3DConnectable)["ListOutput"]>;

    // Segments groupés par niveau de couleur — UN stroke() par niveau (24) au
    // lieu d'un par cellule (~1 000) : crucial pour le canvas 2D sur Quest.
    private bucketSegs: number[][] = Array.from({ length: ARROW_LUT.length }, () => []);

    constructor(context: Node3DContext, private gui: FluidFieldN3DGUI) {
        const { audioCtx, tools: T } = context;
        this.audioCtx = audioCtx;
        const scene = gui.root.getScene();

        context.addToBoundingBox(gui.handle);

        // Aplatit l'inclinaison de spawn (idiome AudioPlaque — pad XY)
        let orientObs: Observer<Scene> | null = null;
        orientObs = context.observe(scene.onBeforeRenderObservable, () => {
            let p: TransformNode | null = gui.root.parent as TransformNode | null;
            while (p && p.name !== "boundingBox") p = p.parent as TransformNode | null;
            if (!p) return;
            p.rotation.set(0, 0, 0);
            p.rotationQuaternion = Quaternion.Identity();
            if (orientObs) { scene.onBeforeRenderObservable.remove(orientObs); orientObs = null; }
        });

        // ── Audio : in → panner (piloté par swarmX, Mapping C du sketch) → out ─
        this.gainIn = audioCtx.createGain();
        this.panner = audioCtx.createStereoPanner();
        this.gainOut = audioCtx.createGain();
        this.gainIn.connect(this.panner);
        this.panner.connect(this.gainOut);
        context.createConnectable(new T.AudioN3DConnectable.Input("audioIn", [gui.audioIn], "Audio In", this.gainIn));
        context.createConnectable(new T.AudioN3DConnectable.Output("audioOut", [gui.audioOut], "Audio Out (panné)", this.gainOut));

        // ── Sortie MIDI du drone ──────────────────────────────────────────────
        this.midiOutput = new T.MidiN3DConnectable.ListOutput("midiOut", [gui.midiOut], "Drone MIDI Out");
        context.createConnectable(this.midiOutput);

        // ── 4 sorties d'automation (les mappings du sketch, découplés) ────────
        const A = T.AutomationN3DConnectable.Output;
        const outDefs: [string, AbstractMesh, string, number][] = [
            ["disturbance", gui.outDisturbance, "Disturbance (énergie)", 0],
            ["curl",        gui.outCurl,        "Curl (tourbillons)",    0],
            ["swarmX",      gui.outSwarmX,      "Swarm Center X",        0.5],
            ["swarmY",      gui.outSwarmY,      "Swarm Center Y",        0.5],
        ];
        for (const [id, mesh, label, def] of outDefs) {
            const out = new A(id, [mesh], label, def);
            this.outs[id] = out;
            context.createConnectable(out);
        }

        // ── Knobs ─────────────────────────────────────────────────────────────
        const knobLabels: Record<RangeKey, [string, number]> = {
            noiseScale:     ["Noise Scale", 3],
            noiseSpeed:     ["Evolution", 4],
            viscosity:      ["Viscosity", 2],
            vortexRadius:   ["Vortex Radius", 0],
            vortexStrength: ["Vortex Strength", 1],
            boidSpeed:      ["Boid Speed", 1],
            splatStrength:  ["Wake Strength", 2],
            droneNote:      ["Drone Note", 0],
        };
        const tunables: TunableParam[] = [];
        for (const key of Object.keys(RANGES) as RangeKey[]) {
            const [label, decimals] = knobLabels[key];
            const mesh = gui.knobs[key];
            const updateVisual = () => mesh.scaling.setAll(0.6 + norm(key, this.vals[key]) * 0.6);
            updateVisual();
            const setNorm = (v01: number) => {
                this.vals[key] = denorm(key, v01);
                updateVisual();
                context.notifyStateChange(key);
            };
            context.createParameter({
                id: key,
                meshes: [mesh],
                getLabel: () => label,
                getStepCount: () => key === "droneNote" ? (RANGES.droneNote.max - RANGES.droneNote.min + 1) : 0,
                getValue: () => norm(key, this.vals[key]),
                setValue: setNorm,
                stringify: (v01: number) => `${label}: ${denorm(key, v01).toFixed(decimals)}`,
            });
            tunables.push({ name: key, min: RANGES[key].min, max: RANGES[key].max, getNorm: () => norm(key, this.vals[key]), setNorm });
        }
        // boidCount aussi pilotable par les presets/mutation (ex. "Nuée dense")
        tunables.push({
            name: "boidCount", min: 0, max: BOID_MAX,
            getNorm: () => this.boidCount / BOID_MAX,
            setNorm: (v01: number) => {
                this.boidCount = Math.round(Math.max(0, Math.min(1, v01)) * BOID_MAX);
                this.syncBoidPool();
                context.notifyStateChange("boidCount");
            },
        });

        // ── Boutons boids ± (par 10, comme l'esprit du sketch) ────────────────
        context.createButton({
            id: "boidAdd", meshes: [gui.btnBoidAdd], label: `+ ${BOID_STEP} Boids`,
            color: new Color3(0.2, 0.85, 0.35),
            press: () => {
                this.boidCount = Math.min(BOID_MAX, this.boidCount + BOID_STEP);
                this.syncBoidPool();
                context.notifyStateChange("boidCount");
            },
            release: () => {},
        });
        context.createButton({
            id: "boidRemove", meshes: [gui.btnBoidRemove], label: `− ${BOID_STEP} Boids`,
            color: new Color3(0.85, 0.2, 0.3),
            press: () => {
                this.boidCount = Math.max(0, this.boidCount - BOID_STEP);
                this.syncBoidPool();
                context.notifyStateChange("boidCount");
            },
            release: () => {},
        });

        // ── Bouton drone (play/stop du Sol grave retriggé) ────────────────────
        const refreshDroneColor = () => {
            gui.droneMat.emissiveColor = this.droneOn
                ? new Color3(0.9, 0.2, 0.3)    // rouge = en cours
                : new Color3(0.2, 0.7, 0.3);   // vert = prêt
        };
        context.createButton({
            id: "droneToggle", meshes: [gui.btnDrone], label: "Drone on/off",
            color: new Color3(0.95, 0.75, 0.15),
            press: () => {
                this.droneOn = !this.droneOn;
                if (this.droneOn) {
                    this.droneTimer = 10;   // retrigger immédiat au prochain tick
                } else {
                    this.stopDroneNote();
                }
                refreshDroneColor();
                context.notifyStateChange("droneOn");
            },
            release: () => {},
        });
        refreshDroneColor();

        // (Redimensionnement à deux mains géré par l'hôte → pas de userScale.)

        // ── Input : laser + gâchette sur le canvas = vortex (mouseIsPressed) ──
        const pointerToCanvas = (pointer: PointerInput): { x: number, y: number } | null => {
            let local: Vector3 | null = null;
            if (pointer.hit && pointer.targetMesh === gui.plaque) {
                local = gui.projectOntoPlaque(pointer.target);
            } else {
                const planeOrigin = gui.plaque.getAbsolutePosition();
                const planeNormal = gui.plaqueNormal();
                const denom = Vector3.Dot(pointer.forward, planeNormal);
                if (Math.abs(denom) < 1e-6) return null;
                const tHit = Vector3.Dot(planeOrigin.subtract(pointer.origin), planeNormal) / denom;
                if (tHit < 0) return null;
                local = gui.projectOntoPlaque(pointer.origin.add(pointer.forward.scale(tHit)));
            }
            // local (-0.8..0.8, -0.5..0.5) → px canvas.
            // La texture de Babylon s'affiche miroir-vertical sur la plaque
            // (canvas y=0 = bas de la plaque) : on envoie donc « manette en
            // haut » (local.y +) vers le BAS du canvas pour que le vortex
            // apparaisse bien en haut. X est direct.
            return {
                x: (local.x / (HALF_W * 2) + 0.5) * TEX_W,
                y: (0.5 + local.y / (HALF_H * 2)) * TEX_H,
            };
        };
        const grab = new T.InputGrabBehavior(
            (pointer) => {
                const c = pointerToCanvas(pointer);
                if (c) { this.vortexActive = true; this.vortexX = c.x; this.vortexY = c.y; }
            },
            () => { this.vortexActive = false; },
            (pointer) => {
                const c = pointerToCanvas(pointer);
                if (c) { this.vortexX = c.x; this.vortexY = c.y; }
            },
        );
        gui.plaque.addBehavior(grab);

        // ── Standard cluster: ? · Presets · 🎲 · ↺ (applies "River" on spawn) ─
        setupInstrumentControls(context, {
            title: "Fluid Field",
            description: "Perlin-noise fluid field. Currents evolve; laser + trigger " +
                "injects a vortex; boids follow the flow and leave wakes. Automation " +
                "outputs: Disturbance (energy), Curl (vortices), Swarm X/Y. Audio passes " +
                "through a panner driven by Swarm X. The drone (button) sends a MIDI note " +
                "to wire to a synth.",
            legend: [
                { swatch: "🟦", name: "Teal knobs (left)", role: "Base currents: noise scale & evolution" },
                { swatch: "🟥", name: "Red knobs", role: "Physics: viscosity, vortex radius & strength" },
                { swatch: "🟧", name: "Orange knobs", role: "Boids: speed, wake strength" },
                { swatch: "🟨", name: "Gold knob", role: "Drone note (pitch of the low drone)" },
                { swatch: "🟢", name: "Top-left discs", role: "± boids (by 10)" },
                { swatch: "🟩", name: "Green/red disc (right)", role: "Drone on/off (MIDI output)" },
                { swatch: "🔴", name: "Bottom spheres", role: "Outputs: Disturbance, Curl, Swarm X/Y" },
                { swatch: "✋", name: "Frame", role: "Two-handed grab = resize; bin button or vigorous shake = delete" },
            ],
            presets: FLUID_PRESETS,
            defaultPreset: "River",
            params: tunables,
            helpBtn: gui.cluster.helpBtn,
            presetBtn: gui.cluster.presetBtn,
            mutateBtn: gui.cluster.mutateBtn,
            resetBtn: gui.cluster.resetBtn,
        });

        // Pulse des 4 sorties d'automation ∝ valeur
        const pulser = new OutputPulser([gui.outDisturbance, gui.outCurl, gui.outSwarmX, gui.outSwarmY], 1);

        // ── Init : boids + premier rendu ──────────────────────────────────────
        this.syncBoidPool();
        console.log(`[FluidField] SPAWNED (grille ${COLS}×${ROWS}, canvas ${TEX_W}×${TEX_H})`);

        // ── Boucle : simulation à pas fixe + rendu canvas + sorties ───────────
        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
            if (dt <= 0) return;

            // Simulation à pas fixe 60 Hz (max 3 pas par frame : pas de spirale)
            this.simAccum = Math.min(this.simAccum + dt, SIM_STEP * 3);
            while (this.simAccum >= SIM_STEP) {
                this.simAccum -= SIM_STEP;
                this.simStep();
            }

            // Rendu + sorties (par frame, pas par pas de sim)
            this.render();
            this.outs.disturbance.value = this.dist01;
            this.outs.curl.value        = this.curl01;
            this.outs.swarmX.value      = this.comX01;
            this.outs.swarmY.value      = this.comY01;
            pulser.update([this.dist01, this.curl01, this.comX01, this.comY01], dt);

            // Mapping C du sketch : centre de masse → panoramique réel
            this.panner.pan.value = Math.max(-1, Math.min(1, this.comX01 * 2 - 1));

            // Drone : retrigger toutes les secondes (battement du sketch)
            if (this.droneOn) {
                this.droneTimer += dt;
                if (this.droneTimer >= 1.0) {
                    this.droneTimer = 0;
                    this.triggerDroneNote();
                }
                const pulse = 0.6 + Math.sin(performance.now() / 1000 * Math.PI * 2) * 0.3;
                gui.droneMat.emissiveColor.set(0.9 * pulse, 0.2 * pulse, 0.3 * pulse);
            }
        });
    }

    // ── Un pas de simulation (1/60 s — constantes du sketch inchangées) ───────
    private simStep(): void {
        const scale = this.vals.noiseScale;
        const friction = this.vals.viscosity;
        this.zOff += this.vals.noiseSpeed;

        // 1. Courants de base (Perlin) + amortissement des remous
        let yOff = 0;
        for (let y = 0; y < ROWS; y++) {
            let xOff = 0;
            const rowBase = y * COLS;
            for (let x = 0; x < COLS; x++) {
                const i = rowBase + x;
                const angle = this.perlin.fbm(xOff, yOff, this.zOff) * Math.PI * 4;
                this.baseX[i] = Math.cos(angle);
                this.baseY[i] = Math.sin(angle);
                this.wakeX[i] *= friction;
                this.wakeY[i] *= friction;
                xOff += scale;
            }
            yOff += scale;
        }

        // 2. Vortex du joueur (tangentiel, décroissant avec la distance)
        if (this.vortexActive) this.applyVortex(this.vortexX, this.vortexY);

        // 3. Boids : suivent le courant total, laissent un sillage, wrap
        const maxSpeed = this.vals.boidSpeed;
        const splat = this.vals.splatStrength;
        const maxForce = 0.5;
        let comX = 0, comY = 0;
        for (const b of this.boids) {
            const fi = this.cellIndexAt(b.x, b.y);
            let dx = this.baseX[fi] + this.wakeX[fi];
            let dy = this.baseY[fi] + this.wakeY[fi];
            const dLen = Math.hypot(dx, dy) || 1;
            dx = dx / dLen * maxSpeed; dy = dy / dLen * maxSpeed;
            let sx = dx - b.vx, sy = dy - b.vy;
            const sLen = Math.hypot(sx, sy);
            if (sLen > maxForce) { sx = sx / sLen * maxForce; sy = sy / sLen * maxForce; }
            b.vx += sx; b.vy += sy;
            const vLen = Math.hypot(b.vx, b.vy);
            if (vLen > maxSpeed) { b.vx = b.vx / vLen * maxSpeed; b.vy = b.vy / vLen * maxSpeed; }
            // Sillage AVANT de bouger (comme le sketch : splat puis update)
            if (splat > 0) {
                const wi = this.cellIndexAt(b.x, b.y);
                const wLen = vLen || 1;
                this.wakeX[wi] += b.vx / wLen * splat;
                this.wakeY[wi] += b.vy / wLen * splat;
            }
            b.x += b.vx; b.y += b.vy;
            if (b.x > TEX_W + 4) b.x = -4; if (b.x < -4) b.x = TEX_W + 4;
            if (b.y > TEX_H + 4) b.y = -4; if (b.y < -4) b.y = TEX_H + 4;
            comX += b.x; comY += b.y;
        }

        // 4. Métriques → EMA (sorties stables, le brut par frame est nerveux)
        let totalDist = 0;
        for (let i = 0; i < this.wakeX.length; i++) totalDist += Math.hypot(this.wakeX[i], this.wakeY[i]);
        // Calibre du sketch : map(total, 0..500) sur 1 440 cellules → ici ~1 066
        const distRaw = Math.min(1, totalDist / 370);
        const curlRaw = Math.min(1, this.averageCurl() / 0.5);
        const ema = 0.15;
        this.dist01 += (distRaw - this.dist01) * ema;
        this.curl01 += (curlRaw - this.curl01) * ema;
        if (this.boids.length > 0) {
            this.comX01 += (comX / this.boids.length / TEX_W - this.comX01) * ema;
            // Même convention d'axe que la projection : haut de la plaque = 1
            // (le canvas est miroir-vertical, donc canvas-y grand = haut → pas
            // de « 1 - » ici). swarmX/Y restent cohérents avec l'AudioPlaque.
            this.comY01 += (comY / this.boids.length / TEX_H - this.comY01) * ema;
        }
    }

    private cellIndexAt(px: number, py: number): number {
        const col = Math.max(0, Math.min(COLS - 1, Math.floor(px / CELL)));
        const row = Math.max(0, Math.min(ROWS - 1, Math.floor(py / CELL)));
        return col + row * COLS;
    }

    private applyVortex(mx: number, my: number): void {
        const radius = this.vals.vortexRadius;
        const strength = this.vals.vortexStrength;
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const px = x * CELL, py = y * CELL;
                const d = Math.hypot(mx - px, my - py);
                if (d < radius) {
                    const i = x + y * COLS;
                    // Vecteur tangent (rotation autour du pointeur), force ∝ proximité
                    let tx = -(py - my), ty = (px - mx);
                    const tLen = Math.hypot(tx, ty) || 1;
                    const f = strength * (1 - d / radius);
                    this.wakeX[i] += tx / tLen * f;
                    this.wakeY[i] += ty / tLen * f;
                }
            }
        }
    }

    /** Curl discret moyen |∂Fy/∂x − ∂Fx/∂y| sur la grille intérieure (sketch). */
    private averageCurl(): number {
        let total = 0, count = 0;
        for (let y = 1; y < ROWS - 1; y++) {
            for (let x = 1; x < COLS - 1; x++) {
                const iR = (x + 1) + y * COLS, iL = (x - 1) + y * COLS;
                const iD = x + (y + 1) * COLS, iU = x + (y - 1) * COLS;
                const dFydx = ((this.baseY[iR] + this.wakeY[iR]) - (this.baseY[iL] + this.wakeY[iL])) / 2;
                const dFxdy = ((this.baseX[iD] + this.wakeX[iD]) - (this.baseX[iU] + this.wakeX[iU])) / 2;
                total += Math.abs(dFydx - dFxdy);
                count++;
            }
        }
        return count > 0 ? total / count : 0;
    }

    // ── Rendu canvas (flèches colorées par magnitude + boids + halo vortex) ───
    private render(): void {
        const ctx = this.gui.ctx;
        ctx.fillStyle = "rgb(15,15,20)";
        ctx.fillRect(0, 0, TEX_W, TEX_H);
        ctx.lineCap = "round";

        // 1er passage : tri des segments par niveau de couleur
        for (const b of this.bucketSegs) b.length = 0;
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const i = x + y * COLS;
                const fx = this.baseX[i] + this.wakeX[i];
                const fy = this.baseY[i] + this.wakeY[i];
                const mag = Math.hypot(fx, fy);
                const t = Math.min(1, Math.max(0, (mag - 1) / 4));   // 1..5 → 0..1 (sketch)
                const cx = x * CELL + CELL / 2, cy = y * CELL + CELL / 2;
                const inv = mag || 1;
                this.bucketSegs[Math.round(t * (ARROW_LUT.length - 1))].push(
                    cx, cy, cx + fx / inv * CELL * 0.8, cy + fy / inv * CELL * 0.8,
                );
            }
        }
        // 2e passage : un seul stroke par niveau
        for (let bi = 0; bi < ARROW_LUT.length; bi++) {
            const segs = this.bucketSegs[bi];
            if (segs.length === 0) continue;
            ctx.strokeStyle = ARROW_LUT[bi];
            ctx.lineWidth = 1 + (bi / (ARROW_LUT.length - 1)) * 2;
            ctx.beginPath();
            for (let si = 0; si < segs.length; si += 4) {
                ctx.moveTo(segs[si], segs[si + 1]);
                ctx.lineTo(segs[si + 2], segs[si + 3]);
            }
            ctx.stroke();
        }

        // Boids : triangles blancs orientés selon la vélocité (comme p5)
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        const r = 4;
        for (const b of this.boids) {
            const h = Math.atan2(b.vy, b.vx) + Math.PI / 2;
            const ch = Math.cos(h), sh = Math.sin(h);
            ctx.beginPath();
            ctx.moveTo(b.x + (0) * ch - (-r * 2) * sh, b.y + (0) * sh + (-r * 2) * ch);
            ctx.lineTo(b.x + (-r) * ch - (r * 2) * sh, b.y + (-r) * sh + (r * 2) * ch);
            ctx.lineTo(b.x + (r) * ch - (r * 2) * sh,  b.y + (r) * sh + (r * 2) * ch);
            ctx.closePath();
            ctx.fill();
        }

        // Halo du vortex pendant l'injection (feedback du geste)
        if (this.vortexActive) {
            ctx.strokeStyle = "rgba(255,0,85,0.55)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.vortexX, this.vortexY, this.vals.vortexRadius, 0, Math.PI * 2);
            ctx.stroke();
        }

        this.gui.tex.update(false);
    }

    // ── Boids : pool ajusté au compteur ────────────────────────────────────────
    private syncBoidPool(): void {
        while (this.boids.length < this.boidCount) {
            this.boids.push(new FluidBoid(Math.random() * TEX_W, Math.random() * TEX_H));
        }
        if (this.boids.length > this.boidCount) this.boids.length = this.boidCount;
    }

    // ── Drone MIDI (battement du sketch : off puis on 20 ms plus tard) ────────
    private triggerDroneNote(): void {
        const pitch = Math.round(this.vals.droneNote);
        const now = this.audioCtx.currentTime;
        for (const cn of this.midiOutput.connections) {
            if (this.lastDronePitch >= 0) {
                cn.scheduleEvents({ type: "wam-midi", time: now, data: { bytes: [0x80, this.lastDronePitch, 0] } });
            }
            cn.scheduleEvents({ type: "wam-midi", time: now + 0.02, data: { bytes: [0x90, pitch, 100] } });
        }
        this.lastDronePitch = pitch;
    }

    private stopDroneNote(): void {
        if (this.lastDronePitch < 0) return;
        const now = this.audioCtx.currentTime;
        for (const cn of this.midiOutput.connections) {
            cn.scheduleEvents({ type: "wam-midi", time: now, data: { bytes: [0x80, this.lastDronePitch, 0] } });
        }
        this.lastDronePitch = -1;
    }

    async dispose() {
        this.stopDroneNote();
        try { this.gainIn.disconnect(); } catch (_) {}
        try { this.panner.disconnect(); } catch (_) {}
        try { this.gainOut.disconnect(); } catch (_) {}
    }

    // ── Sync : knobs + boids + drone ────────────────────────────────────────
    getStateKeys(): string[] { return [...Object.keys(RANGES), "boidCount", "droneOn"]; }

    async getState(key: string): Promise<Serializable | void> {
        if (key === "boidCount") return this.boidCount;
        if (key === "droneOn") return this.droneOn;
        if (key in RANGES) return this.vals[key as RangeKey];
    }

    async setState(key: string, value: Serializable | undefined): Promise<void> {
        if (key === "droneOn" && typeof value === "boolean") {
            this.droneOn = value;
            if (!value) this.stopDroneNote();
            this.gui.droneMat.emissiveColor = value
                ? new Color3(0.9, 0.2, 0.3) : new Color3(0.2, 0.7, 0.3);
            return;
        }
        if (typeof value !== "number") return;
        if (key === "boidCount") {
            this.boidCount = Math.max(0, Math.min(BOID_MAX, Math.floor(value)));
            this.syncBoidPool();
            return;
        }
        if (key in RANGES) this.vals[key as RangeKey] = value;
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export class FluidFieldN3DFactory implements Node3DFactory<FluidFieldN3DGUI, FluidFieldN3D> {
    constructor(
        public size: number,
        public label: string,
        public description: string,
    ) {}

    tags = ["automation", "controller", "fluid", "perlin", "xy_pad"];

    async createGUI(context: Node3DGUIContext) {
        const gui = new FluidFieldN3DGUI(this);
        await gui.init(context);
        return gui;
    }

    async create(context: Node3DContext, gui: FluidFieldN3DGUI) {
        return new FluidFieldN3D(context, gui);
    }

    static DEFAULT = new FluidFieldN3DFactory(
        5.0,
        "Fluid Field",
        "Perlin-noise fluid field (port of the p5 sketch). Large canvas: currents " +
        "evolve continuously; aiming the laser + trigger injects a VORTEX; boids " +
        "follow the flow and leave wakes. Automation outputs: Disturbance (fluid " +
        "energy — the sketch mapped it to cutoff/overdrive), Curl (vortices — " +
        "resonance/delay), Swarm X/Y (center of mass). Audio passes through a stereo " +
        "PANNER driven by Swarm X. Drone button: a low G retriggered every second on " +
        "the MIDI output (wire to a synth). 8 knobs: noise scale/evolution, " +
        "viscosity, vortex radius/strength, boid speed, wake strength, drone note. " +
        "±10 boid buttons. Two-handed resize.",
    );
}
