import {
    AbstractMesh, Color3, Color4, Mesh, MeshBuilder, Observer, Quaternion, Scene,
    StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable, MidiN3DConnectable } from "../../tools";
import type { PointerInput } from "../../../xr/inputs/PointerInput";
import { NoteUtils } from "../../tools";
import {
    setupInstrumentControls, makeClusterButtons, OutputPulser,
    type TunableParam, type ClusterButtons,
} from "./instrumentControls";
import { Logger } from "../../../utils/logger";

const log = Logger.get("RainPlinko");

// MIDI generator: drops fall down a board under gravity/wind; each floor impact
// strikes a column and fires a scale note out the MIDI output (column = note,
// kinetic energy = velocity). Wire the MIDI output to any synth.

const NUM_COLUMNS = 8;
const COL_W = 1 / NUM_COLUMNS;     // column width in local board space (board spans x∈[-0.5,0.5])
const TOP_Y = 0.45;                // spawn line
const FLOOR_Y = -0.45;             // impact line
const MAX_DROPS = 72;
const MAX_SPLASHES = 24;
const NOTE_DURATION = 0.32;        // seconds a struck note is held

// Knob ranges (host gives 0..1, mapped to these real values).
const RANGES = {
    gravity:   { min: 0.10, max: 2.00, default: 0.60 },   // local units / s²
    wind:      { min: -0.60, max: 0.60, default: 0.00 },  // local units / s² (x)
    spawnRate: { min: 0.00, max: 22.00, default: 6.00 },  // drops / second
    dropSize:  { min: 0.50, max: 4.00, default: 1.50 },   // mass multiplier
    octave:    { min: 2, max: 6, default: 4 },            // base octave (discrete)
    scaleIdx:  { min: 0, max: NoteUtils.GAMMES.length - 1, default: 8 }, // gamme index (discrete)
} as const;

const norm = (key: keyof typeof RANGES, value: number) =>
    (value - RANGES[key].min) / (RANGES[key].max - RANGES[key].min);
const denorm = (key: keyof typeof RANGES, t01: number) =>
    RANGES[key].min + Math.max(0, Math.min(1, t01)) * (RANGES[key].max - RANGES[key].min);

// Weather presets (REAL values).
const PLINKO_PRESETS: Record<string, Record<string, number>> = {
    "Calm Drizzle": { gravity: 0.35, wind: 0.00, spawnRate: 3,  dropSize: 1.0, octave: 5, scaleIdx: 7 }, // C Major Pentatonic, light & high
    "Steady Rain":  { gravity: 0.60, wind: 0.05, spawnRate: 8,  dropSize: 1.5, octave: 4, scaleIdx: 8 }, // C Minor Pentatonic
    "Windy Storm":  { gravity: 1.10, wind: 0.38, spawnRate: 14, dropSize: 2.3, octave: 3, scaleIdx: 8 },
    "Downpour":     { gravity: 1.60, wind: 0.00, spawnRate: 22, dropSize: 1.2, octave: 4, scaleIdx: 7 },
    "Chaos":        { gravity: 1.40, wind: -0.45, spawnRate: 20, dropSize: 3.0, octave: 3, scaleIdx: 0 }, // chromatic
};

// ─── GUI ──────────────────────────────────────────────────────────────────────

export class RainPlinkoN3DGUI implements Node3DGUI {
    root!: TransformNode;
    get worldSize() { return this.factory.size; }

    handle!: AbstractMesh;        // backing plate that goes in the bounding box
    board!: AbstractMesh;         // the dark playfield plane (pickable: tap to drop)
    floorPads!: AbstractMesh[];   // 8 strips that flash on impact
    floorMats!: StandardMaterial[];

    // Connectors
    audioOut!: AbstractMesh;
    midiOut!: AbstractMesh;
    outEnergy!: AbstractMesh;
    outColumn!: AbstractMesh;
    outActivity!: AbstractMesh;

    // Knobs
    knobGravity!: AbstractMesh;
    knobWind!: AbstractMesh;
    knobRain!: AbstractMesh;
    knobDropSize!: AbstractMesh;
    knobOctave!: AbstractMesh;
    knobScale!: AbstractMesh;

    dropContainer!: TransformNode;
    splashContainer!: TransformNode;
    cluster!: ClusterButtons;

    constructor(public factory: RainPlinkoN3DFactory) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: { ConnectableUtils, MeshUtils, MidiN3DConnectable, AutomationN3DConnectable, AudioN3DConnectable } } = context;

        this.root = new B.TransformNode("rain_plinko_root", context.scene);

        // Backing handle (what the bounding box wraps) — kept small/behind so
        // rays reach the board directly (same trick as AudioPlaque).
        this.handle = B.MeshBuilder.CreateBox("plinko_handle", { width: 0.8, height: 0.8, depth: 0.04 }, context.scene);
        this.handle.parent = this.root;
        this.handle.position.set(0, 0, 0.15);
        this.handle.material = context.materialMat;
        this.handle.isPickable = false;

        // Board — dark "rainy night" grid plane.
        this.board = B.MeshBuilder.CreatePlane("plinko_board", { size: 1, sideOrientation: 2 }, context.scene);
        this.board.parent = this.root;
        this.board.isPickable = true;   // tap-to-drop
        const grid = new GridMaterial("plinko_grid", context.scene);
        grid.majorUnitFrequency = 4;
        grid.minorUnitVisibility = 0.35;
        grid.gridRatio = COL_W;                          // grid lines align to columns
        grid.mainColor = new Color3(0.02, 0.03, 0.07);
        grid.lineColor = new Color3(0.10, 0.45, 0.85);
        grid.backFaceCulling = false;
        this.board.material = grid;

        // Glowing frame.
        const edgeMat = new StandardMaterial("plinko_edge_mat", context.scene);
        edgeMat.emissiveColor = new Color3(0.1, 0.5, 0.95);
        edgeMat.disableLighting = true;
        const t = 0.012, half = 0.5;
        const edges: [string, number, number, number, number][] = [
            ["top", 1 + t, t, 0, half], ["bottom", 1 + t, t, 0, -half],
            ["left", t, 1 + t, -half, 0], ["right", t, 1 + t, half, 0],
        ];
        for (const [name, w, h, px, py] of edges) {
            const e = B.MeshBuilder.CreateBox(`plinko_edge_${name}`, { width: w, height: h, depth: t }, context.scene);
            e.position.set(px, py, -0.006);
            e.parent = this.root; e.material = edgeMat; e.isPickable = false;
        }

        // Spawn line marker (faint, near the top).
        const spawnLine = B.MeshBuilder.CreateBox("plinko_spawnline", { width: 1, height: 0.004, depth: 0.004 }, context.scene);
        spawnLine.position.set(0, TOP_Y, -0.01);
        spawnLine.parent = this.root;
        const spawnMat = new StandardMaterial("plinko_spawn_mat", context.scene);
        spawnMat.emissiveColor = new Color3(0.15, 0.3, 0.5);
        spawnMat.disableLighting = true;
        spawnLine.material = spawnMat;
        spawnLine.isPickable = false;

        // Floor pads — one per column, flash on impact.
        this.floorPads = [];
        this.floorMats = [];
        for (let i = 0; i < NUM_COLUMNS; i++) {
            const pad = B.MeshBuilder.CreateBox(`plinko_pad_${i}`, { width: COL_W * 0.86, height: 0.03, depth: 0.02 }, context.scene);
            pad.position.set(-0.5 + (i + 0.5) * COL_W, FLOOR_Y - 0.02, -0.01);
            pad.parent = this.root;
            pad.isPickable = false;
            const mat = new StandardMaterial(`plinko_pad_mat_${i}`, context.scene);
            mat.emissiveColor = new Color3(0.05, 0.12, 0.25);
            mat.disableLighting = true;
            pad.material = mat;
            this.floorPads.push(pad);
            this.floorMats.push(mat);
        }

        // Connectors — audio out (built-in synth) + MIDI out + 3 automation outs.
        this.audioOut = ConnectableUtils.createOutputMesh("plinko_audio_out", 0.09, context.scene);
        this.audioOut.parent = this.root;
        this.audioOut.position.set(0.62, 0.50, 0);
        MeshUtils.setColor(this.audioOut, AudioN3DConnectable.Color.toColor4());

        this.midiOut = ConnectableUtils.createOutputMesh("plinko_midi_out", 0.09, context.scene);
        this.midiOut.parent = this.root;
        this.midiOut.position.set(0.62, 0.30, 0);
        MeshUtils.setColor(this.midiOut, MidiN3DConnectable.Color.toColor4());

        const autoColor = AutomationN3DConnectable.Color.toColor4();
        const mkAuto = (name: string, y: number, color: Color4): AbstractMesh => {
            const m = ConnectableUtils.createOutputMesh(name, 0.06, context.scene);
            m.parent = this.root; m.position.set(0.62, y, 0);
            MeshUtils.setColor(m, color);
            return m;
        };
        this.outEnergy   = mkAuto("plinko_out_energy",   0.08, new Color4(0.95, 0.55, 0.15, 1));
        this.outColumn   = mkAuto("plinko_out_column",  -0.10, new Color4(0.65, 0.25, 0.85, 1));
        this.outActivity = mkAuto("plinko_out_activity", -0.28, autoColor);

        // Knobs — left column (weather) + (octave/scale) lower.
        const makeKnob = (name: string, color: Color4): AbstractMesh => {
            const k = B.MeshBuilder.CreateSphere(name, { diameter: 0.10 }, context.scene);
            k.parent = this.root;
            const mat = new StandardMaterial(`${name}_mat`, context.scene);
            mat.emissiveColor = new Color3(color.r * 0.6, color.g * 0.6, color.b * 0.6);
            mat.diffuseColor = new Color3(color.r, color.g, color.b);
            k.material = mat;
            MeshUtils.setColor(k, color);
            return k;
        };
        const weatherColor = new Color4(0.25, 0.65, 1.0, 1);   // blue
        const musicColor   = new Color4(1.0, 0.8, 0.25, 1);    // gold
        this.knobGravity  = makeKnob("knob_gravity",  weatherColor);
        this.knobWind     = makeKnob("knob_wind",     weatherColor);
        this.knobRain     = makeKnob("knob_rain",     weatherColor);
        this.knobDropSize = makeKnob("knob_dropsize", weatherColor);
        this.knobOctave   = makeKnob("knob_octave",   musicColor);
        this.knobScale    = makeKnob("knob_scale",    musicColor);

        this.knobGravity .position.set(-0.62,  0.30, 0);
        this.knobWind    .position.set(-0.62,  0.12, 0);
        this.knobRain    .position.set(-0.62, -0.06, 0);
        this.knobDropSize.position.set(-0.62, -0.24, 0);
        this.knobOctave  .position.set(-0.62, -0.42, 0);
        this.knobScale   .position.set(-0.42, -0.42, 0);

        // Containers for the dynamic meshes (drops + splashes) so they scale with root.
        this.dropContainer = new B.TransformNode("plinko_drops", context.scene);
        this.dropContainer.parent = this.root;
        this.splashContainer = new B.TransformNode("plinko_splashes", context.scene);
        this.splashContainer.parent = this.root;

        // Standard cluster — top-centre.
        this.cluster = makeClusterButtons(B, context.scene, this.root, { x: -0.24, y: 0.46, z: 0 });
    }

    /** Project a world-space point onto the board's local X (−0.5..0.5). */
    projectColumnX(worldPos: Vector3): number {
        const center = this.board.getAbsolutePosition();
        const right = this.board.getDirection(RainPlinkoN3DGUI._LOCAL_X);
        const len2 = right.lengthSquared();
        if (len2 < 1e-10) return 0;
        return Math.max(-0.5, Math.min(0.5, Vector3.Dot(worldPos.subtract(center), right) / len2));
    }
    private static readonly _LOCAL_X = new Vector3(1, 0, 0);

    async dispose() { }
}

// ─── Internal drop / splash pools ─────────────────────────────────────────────

interface Drop {
    mesh: Mesh; mat: StandardMaterial;
    pos: Vector3; vel: Vector3; mass: number; r: number; active: boolean;
}
interface Splash {
    mesh: Mesh; mat: StandardMaterial; life: number; active: boolean;
}

// ─── Logic ──────────────────────────────────────────────────────────────────

export class RainPlinkoN3D implements Node3D {
    private gravity = RANGES.gravity.default as number;
    private wind = RANGES.wind.default as number;
    private spawnRate = RANGES.spawnRate.default as number;
    private dropSize = RANGES.dropSize.default as number;
    private octave = RANGES.octave.default as number;       // integer
    private scaleIdx = RANGES.scaleIdx.default as number;   // integer index into NoteUtils.GAMMES

    private midiOutput!: InstanceType<(typeof MidiN3DConnectable)["ListOutput"]>;
    private outEnergy!: InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outColumn!: InstanceType<(typeof AutomationN3DConnectable)["Output"]>;
    private outActivity!: InstanceType<(typeof AutomationN3DConnectable)["Output"]>;

    // Built-in synth so the board makes sound on its own and can wire to a speaker.
    private audioCtx: AudioContext;
    private outGain!: GainNode;

    private drops: Drop[] = [];
    private splashes: Splash[] = [];
    private spawnAcc = 0;
    private padGlow = new Array(NUM_COLUMNS).fill(0);

    private lastEnergy = 0;
    private lastColumnNorm = 0.5;
    private activity = 0;

    constructor(context: Node3DContext, private gui: RainPlinkoN3DGUI) {
        const { audioCtx, tools: T } = context;
        this.audioCtx = audioCtx;
        const scene = gui.root.getScene();

        context.addToBoundingBox(gui.handle);

        // Built-in synth bus → audio output (wire to a speaker, or ignore it and
        // use the MIDI output to drive an external synth instead).
        this.outGain = audioCtx.createGain();
        this.outGain.gain.value = 0.5;
        context.createConnectable(new T.AudioN3DConnectable.Output("audioOut", [gui.audioOut], "Audio Out", this.outGain));

        // Flatten the BB spawn tilt so the board stands upright facing the player
        // (same observer pattern as AudioPlaque / Superformula).
        let orientObs: Observer<Scene> | null = null;
        orientObs = context.observe(scene.onBeforeRenderObservable, () => {
            let p: TransformNode | null = gui.root.parent as TransformNode | null;
            while (p && p.name !== "boundingBox") p = p.parent as TransformNode | null;
            if (!p) return;
            p.rotation.set(0, 0, 0);
            p.rotationQuaternion = Quaternion.Identity();
            if (orientObs) { scene.onBeforeRenderObservable.remove(orientObs); orientObs = null; }
        });

        // MIDI output (notes struck by impacts).
        this.midiOutput = new T.MidiN3DConnectable.ListOutput("midi_out", [gui.midiOut], "Impact notes");
        context.createConnectable(this.midiOutput);

        // Automation outputs.
        const A = T.AutomationN3DConnectable.Output;
        this.outEnergy   = new A("impactEnergy", [gui.outEnergy],   "Impact Energy", 0);
        this.outColumn   = new A("lastColumn",   [gui.outColumn],   "Last Column",   0.5);
        this.outActivity = new A("rainActivity", [gui.outActivity], "Rain Activity", 0);
        for (const o of [this.outEnergy, this.outColumn, this.outActivity]) context.createConnectable(o);

        // Build drop + splash pools.
        this.buildPools(scene);

        // Tap the board to release a heavier drop at the pointed column.
        const grab = new T.InputGrabBehavior(
            (pointer: PointerInput) => {
                const x = pointer.hit ? gui.projectColumnX(pointer.target) : (Math.random() - 0.5) * 0.96;
                this.spawnDrop(x, this.dropSize * 2.2);
            },
            () => {}, () => {},
        );
        gui.board.addBehavior(grab);

        // ── Knobs ──────────────────────────────────────────────────────────────
        const tunables: TunableParam[] = [];
        const setupKnob = (
            id: string, label: string, mesh: AbstractMesh, range: keyof typeof RANGES,
            stepCount: number, getter: () => number, setter: (v: number) => void,
            stringify: (real: number) => string,
        ) => {
            const updateVisual = () => mesh.scaling.setAll(0.6 + norm(range, getter()) * 0.6);
            updateVisual();
            const setNorm = (v01: number) => {
                setter(denorm(range, v01));
                updateVisual();
                context.notifyStateChange(id);
            };
            context.createParameter({
                id, meshes: [mesh],
                getLabel: () => label,
                getStepCount: () => stepCount,
                getValue: () => norm(range, getter()),
                setValue: setNorm,
                stringify: (v01: number) => stringify(denorm(range, v01)),
            });
            tunables.push({ name: id, min: RANGES[range].min, max: RANGES[range].max, getNorm: () => norm(range, getter()), setNorm });
        };

        setupKnob("gravity", "Gravity", gui.knobGravity, "gravity", 40, () => this.gravity, v => this.gravity = v, r => `Gravity: ${r.toFixed(2)}`);
        setupKnob("wind", "Wind", gui.knobWind, "wind", 41, () => this.wind, v => this.wind = v, r => `Wind: ${r >= 0 ? "+" : ""}${r.toFixed(2)}`);
        setupKnob("spawnRate", "Rain Rate", gui.knobRain, "spawnRate", 45, () => this.spawnRate, v => this.spawnRate = v, r => `Rain: ${r.toFixed(1)}/s`);
        setupKnob("dropSize", "Drop Size", gui.knobDropSize, "dropSize", 40, () => this.dropSize, v => this.dropSize = v, r => `Drop Size: ${r.toFixed(1)}`);
        setupKnob("octave", "Base Octave", gui.knobOctave, "octave", RANGES.octave.max - RANGES.octave.min + 1, () => this.octave, v => this.octave = Math.round(v), r => `Octave: ${Math.round(r)}`);
        setupKnob("scaleIdx", "Scale", gui.knobScale, "scaleIdx", NoteUtils.GAMMES.length, () => this.scaleIdx, v => this.scaleIdx = Math.round(v), r => `Scale: ${NoteUtils.GAMMES[Math.max(0, Math.min(NoteUtils.GAMMES.length - 1, Math.round(r)))].label}`);

        // ── Cluster (Help / Presets / Mutate / Reset) ───────────────────────────
        setupInstrumentControls(context, {
            title: "Rain Plinko",
            description: "A rain board that plays music. Drops fall under gravity and wind; each one " +
                "that lands strikes its column and fires a scale note out the MIDI output (wire it to " +
                "any synth). The column chooses the note, the impact's energy chooses the velocity. " +
                "Tap the board to drop a heavy raindrop yourself.",
            legend: [
                { swatch: "🔵", name: "Blue knobs (left)", role: "Weather: gravity, wind, rain rate, drop size" },
                { swatch: "🟡", name: "Gold knobs", role: "Music: base octave and musical scale" },
                { swatch: "🟢", name: "Green sphere (right)", role: "MIDI output — wire to a synth" },
                { swatch: "🟠", name: "Small spheres (right)", role: "Automation: impact energy, last column, rain activity" },
                { swatch: "🌧", name: "Board", role: "Tap to drop a heavy raindrop; columns flash on impact" },
                { swatch: "✋", name: "Frame", role: "Two-handed grab = resize; bin button or vigorous shake = delete" },
            ],
            presets: PLINKO_PRESETS,
            defaultPreset: "Steady Rain",
            params: tunables,
            helpBtn: gui.cluster.helpBtn,
            presetBtn: gui.cluster.presetBtn,
            mutateBtn: gui.cluster.mutateBtn,
            resetBtn: gui.cluster.resetBtn,
        });
        const pulser = new OutputPulser([gui.outEnergy, gui.outColumn, gui.outActivity]);

        // ── Per-frame simulation ─────────────────────────────────────────────────
        const VALUE_EPS = 1e-3;
        let lastSent = { e: -1, c: -1, a: -1 };
        const tmpColor = new Color3();

        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000.0, 0.05);
            if (dt <= 0) return;

            // Spawn drops at the configured rate.
            this.spawnAcc += this.spawnRate * dt;
            while (this.spawnAcc >= 1) {
                this.spawnAcc -= 1;
                this.spawnDrop((Math.random() - 0.5) * 0.96, this.dropSize * (0.7 + Math.random() * 0.7));
            }

            // Integrate + draw drops.
            let activeCount = 0;
            for (const d of this.drops) {
                if (!d.active) continue;
                activeCount++;
                d.vel.y -= this.gravity * dt;
                d.vel.x += this.wind * dt;
                d.pos.x += d.vel.x * dt;
                d.pos.y += d.vel.y * dt;

                // Impact with the floor.
                if (d.pos.y <= FLOOR_Y) {
                    const col = Math.max(0, Math.min(NUM_COLUMNS - 1, Math.floor((d.pos.x + 0.5) / COL_W)));
                    this.triggerImpact(col, d);
                    this.spawnSplash(d.pos.x);
                    d.active = false;
                    d.mesh.setEnabled(false);
                    continue;
                }
                // Blown off the sides / below.
                if (d.pos.x < -0.55 || d.pos.x > 0.55) { d.active = false; d.mesh.setEnabled(false); continue; }

                // Draw: position, speed-based glow + vertical stretch (raindrop look).
                const speed = d.vel.length();
                d.mesh.position.set(d.pos.x, d.pos.y, -0.03);
                const stretch = 1 + Math.min(speed * 0.7, 2.0);
                d.mesh.scaling.set(d.r, d.r * stretch, d.r);
                const hot = Math.min(speed * 0.6, 1);
                tmpColor.set(0.1 + hot * 0.6, 0.5 + hot * 0.45, 1.0);
                d.mat.emissiveColor.copyFrom(tmpColor);
            }

            // Splashes — expand + fade.
            for (const s of this.splashes) {
                if (!s.active) continue;
                s.life -= dt / 0.45;
                if (s.life <= 0) { s.active = false; s.mesh.setEnabled(false); continue; }
                const grow = 1 + (1 - s.life) * 6;
                s.mesh.scaling.set(grow, grow, grow);
                s.mat.alpha = s.life * 0.8;
            }

            // Floor pad glow decay.
            for (let i = 0; i < NUM_COLUMNS; i++) {
                if (this.padGlow[i] > 0) {
                    this.padGlow[i] = Math.max(0, this.padGlow[i] - dt * 3.2);
                    const g = this.padGlow[i];
                    this.gui.floorMats[i].emissiveColor.set(0.05 + g * 0.6, 0.12 + g * 0.7, 0.25 + g * 0.6);
                }
            }

            // Automation outputs (smoothed).
            this.lastEnergy *= Math.exp(-dt * 3.5);                 // decay impact energy
            this.activity += ((activeCount / MAX_DROPS) - this.activity) * Math.min(1, dt * 4);
            if (Math.abs(this.lastEnergy - lastSent.e) > VALUE_EPS) { this.outEnergy.value = this.lastEnergy; lastSent.e = this.lastEnergy; }
            if (Math.abs(this.lastColumnNorm - lastSent.c) > VALUE_EPS) { this.outColumn.value = this.lastColumnNorm; lastSent.c = this.lastColumnNorm; }
            if (Math.abs(this.activity - lastSent.a) > VALUE_EPS) { this.outActivity.value = this.activity; lastSent.a = this.activity; }
            pulser.update([this.lastEnergy, this.lastColumnNorm, this.activity], dt);
        });

        log.debug("spawned");
    }

    private buildPools(scene: Scene) {
        for (let i = 0; i < MAX_DROPS; i++) {
            const mesh = MeshBuilder.CreateSphere(`plinko_drop_${i}`, { diameter: 0.028, segments: 6 }, scene);
            mesh.parent = this.gui.dropContainer;
            mesh.isPickable = false;
            mesh.setEnabled(false);
            const mat = new StandardMaterial(`plinko_drop_mat_${i}`, scene);
            mat.emissiveColor = new Color3(0.2, 0.6, 1.0);
            mat.disableLighting = true;
            mesh.material = mat;
            this.drops.push({ mesh, mat, pos: new Vector3(), vel: new Vector3(), mass: 1, r: 1, active: false });
        }
        for (let i = 0; i < MAX_SPLASHES; i++) {
            const mesh = MeshBuilder.CreateTorus(`plinko_splash_${i}`, { diameter: 0.05, thickness: 0.006, tessellation: 16 }, scene);
            mesh.parent = this.gui.splashContainer;
            mesh.isPickable = false;
            mesh.rotation.x = Math.PI / 2;   // ring faces the player on the board plane
            mesh.setEnabled(false);
            const mat = new StandardMaterial(`plinko_splash_mat_${i}`, scene);
            mat.emissiveColor = new Color3(0.3, 0.8, 1.0);
            mat.disableLighting = true;
            mat.alpha = 0;
            mesh.material = mat;
            this.splashes.push({ mesh, mat, life: 0, active: false });
        }
    }

    private spawnDrop(x: number, mass: number) {
        const d = this.drops.find(d => !d.active);
        if (!d) return;
        d.active = true;
        d.mass = Math.max(0.4, mass);
        d.pos.set(Math.max(-0.48, Math.min(0.48, x)), TOP_Y, -0.03);
        d.vel.set(0, -0.05, 0);
        d.r = 0.5 + Math.min(d.mass, 4) * 0.22;   // visual radius factor (mass → size)
        d.mesh.scaling.set(d.r, d.r, d.r);
        d.mesh.position.copyFrom(d.pos);
        d.mesh.setEnabled(true);
    }

    private spawnSplash(x: number) {
        const s = this.splashes.find(s => !s.active);
        if (!s) return;
        s.active = true;
        s.life = 1;
        s.mesh.position.set(Math.max(-0.5, Math.min(0.5, x)), FLOOR_Y, -0.03);
        s.mesh.scaling.set(1, 1, 1);
        s.mat.alpha = 0.8;
        s.mesh.setEnabled(true);
    }

    private triggerImpact(col: number, drop: Drop) {
        const gamme = NoteUtils.GAMMES[Math.max(0, Math.min(NoteUtils.GAMMES.length - 1, this.scaleIdx))].notes;
        const note = gamme[col % gamme.length];
        const octave = this.octave + Math.floor(col / gamme.length);
        const midi = Math.max(0, Math.min(127, NoteUtils.noteToMidi(note, octave)));

        const speed = drop.vel.length();
        const kineticEnergy = 0.5 * drop.mass * speed * speed;
        const vel = Math.max(20, Math.min(127, Math.floor(40 + (kineticEnergy / 8) * 87)));

        // Built-in synth voice (so the board makes sound by itself).
        this.playVoice(midi, vel);

        // Also emit MIDI note-on/off to every connected (external) synth.
        this.midiOutput.connections.forEach(conn => {
            const now = conn.context.currentTime;
            conn.scheduleEvents({ type: "wam-midi", time: now, data: { bytes: [0x90, midi, vel] } });
            conn.scheduleEvents({ type: "wam-midi", time: now + NOTE_DURATION, data: { bytes: [0x80, midi, 0] } });
        });

        // Reactivity: light the column pad (intensity from velocity), feed automation.
        this.padGlow[col] = Math.min(1, vel / 127 + 0.2);
        this.lastEnergy = Math.min(1, kineticEnergy / 8);
        this.lastColumnNorm = col / (NUM_COLUMNS - 1);
    }

    /** A short triangle-wave ping (mellow raindrop tone) into the audio output. */
    private playVoice(midi: number, vel: number) {
        const ctx = this.audioCtx;
        const t = ctx.currentTime;
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const peak = Math.max(0.02, (vel / 127) * 0.45);

        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(peak, t + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0008, t + NOTE_DURATION);
        osc.connect(env);
        env.connect(this.outGain);
        osc.start(t);
        osc.stop(t + NOTE_DURATION + 0.05);
    }

    async dispose() {
        try { this.outGain.disconnect(); } catch (_) {}
        for (const d of this.drops) { try { d.mesh.dispose(); d.mat.dispose(); } catch (_) {} }
        for (const s of this.splashes) { try { s.mesh.dispose(); s.mat.dispose(); } catch (_) {} }
    }

    getStateKeys(): string[] { return ["gravity", "wind", "spawnRate", "dropSize", "octave", "scaleIdx"]; }

    async getState(key: string): Promise<Serializable | void> {
        switch (key) {
            case "gravity": return this.gravity;
            case "wind": return this.wind;
            case "spawnRate": return this.spawnRate;
            case "dropSize": return this.dropSize;
            case "octave": return this.octave;
            case "scaleIdx": return this.scaleIdx;
        }
    }

    async setState(key: string, value: Serializable | undefined): Promise<void> {
        if (typeof value !== "number") return;
        switch (key) {
            case "gravity": this.gravity = value; break;
            case "wind": this.wind = value; break;
            case "spawnRate": this.spawnRate = value; break;
            case "dropSize": this.dropSize = value; break;
            case "octave": this.octave = Math.round(value); break;
            case "scaleIdx": this.scaleIdx = Math.round(value); break;
        }
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export class RainPlinkoN3DFactory implements Node3DFactory<RainPlinkoN3DGUI, RainPlinkoN3D> {
    constructor(
        public size: number,
        public label: string,
        public description: string,
    ) { }

    tags = ["midi", "generator", "plinko", "rain", "live_instrument"];

    async createGUI(context: Node3DGUIContext) {
        const gui = new RainPlinkoN3DGUI(this);
        await gui.init(context);
        return gui;
    }

    async create(context: Node3DContext, gui: RainPlinkoN3DGUI) {
        return new RainPlinkoN3D(context, gui);
    }

    static DEFAULT = new RainPlinkoN3DFactory(
        3.0,
        "Rain Plinko",
        "A generative rain board: drops fall under gravity and wind, and each impact strikes a " +
        "column to play a scale note. It has a built-in synth (wire the green AUDIO output to a " +
        "speaker) and also emits MIDI (wire the MIDI output to any synth). Column picks the note, " +
        "kinetic energy picks the velocity. Tap the board to drop your own raindrop. " +
        "Resize with a two-handed grab.",
    );
}
