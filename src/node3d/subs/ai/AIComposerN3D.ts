import { AbstractMesh, Color3, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { MidiLookaheadScheduler } from "../../../ai/scheduler/MidiLookaheadScheduler";
import type { MagentaRNNVariant } from "../../../ai/adapters/MagentaMusicRNNAdapter";
import { WebWorkerAdapter, WorkerModelType } from "../../../ai/adapters/WebWorkerAdapter";
import { PerfMonitor } from "../../../ai/perf/PerfMonitor";
import type { MidiEvent, HyperparamSpec } from "../../../ai/types";
import { WamTransportManager } from "../../../app/WamTransportManager";
import { setupInstrumentControls, makeClusterButtons, type TunableParam, type ClusterButtons } from "../behaviours/instrumentControls";

// AI "synth console" module: a metal chassis with a front panel facing the
// player. A glowing AI core (sphere + orbital ring) is the play/stop button
// (state colour, pulses on each played note, ring spins with activity); an
// on-board screen shows model/state/knob values/buffer gauge/note count; rotary
// cylinder knobs on stalks reach in front of the pickable bounding box so they
// are grabbable in VR; a MIDI output sits on the right side.
//
// Bounding box: the pickable box wraps the addToBoundingBox meshes plus a depth
// margin, so every interactive element must sit outside it. Only the chassis
// goes in; knobs are at z=-0.21 (player side), the core above, MIDI on the side.
//
// Two latencies: temperature/density (or morph) feed hyperparameters → future
// generation; tempo/velocity are applied at the drain → immediate.

// Model's nominal BPM (Magenta generates deltas at 120); the real tempo comes
// from the host: scheduler tempoScale = hostBpm/120 × the knob multiplier.
const NOMINAL_BPM = 120;

// Post-generation knob ranges. "Tempo" is a multiplier RELATIVE to the host
// tempo (1.0 = the conductor's tempo) for rubato without leaving the pulse.
// Horizon defaults to 2 s: worker inference takes hundreds of ms per chunk, so
// a 0.5 s horizon starved the buffer and caused audible grid breaks.
const TEMPO_RANGE   = { min: 0.25, max: 3.0, default: 1.0 };
const VEL_RANGE     = { min: 0.0,  max: 2.0, default: 1.0 };
const HORIZON_RANGE = { min: 0.25, max: 4.0, default: 2.0 };

const invlerp = (r: { min: number; max: number }, v: number) => (v - r.min) / (r.max - r.min);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Core state colours
const COLOR_READY   = new Color3(0.25, 0.85, 0.45);
const COLOR_LOADING = new Color3(0.95, 0.75, 0.15);
const COLOR_ERROR   = new Color3(0.90, 0.20, 0.20);

type CoreState = "ready" | "loading" | "playing" | "error";

/** A rotary knob: cylinder + notch, coloured ring at the base. */
interface Knob {
    mesh: AbstractMesh;            // pickable cylinder (createParameter)
    set: (v01: number) => void;    // rotates the notch (-135°..+135°)
}

// ─── GUI ──────────────────────────────────────────────────────────────────────

export class AIComposerN3DGUI implements Node3DGUI {
    root!: TransformNode;
    get worldSize() { return 1.5; }

    chassis!: AbstractMesh;     // only bounding-box target (handle)
    midiOut!: AbstractMesh;

    hypKnobs: Knob[] = [];      // 2 large hyperparameter knobs
    tempoKnob!: Knob;           // 3 small post-gen knobs
    velKnob!: Knob;
    horizonKnob!: Knob;
    cluster!: ClusterButtons;

    core!: AbstractMesh;        // AI core = play/stop button
    coreMat!: StandardMaterial;
    coreHalo!: AbstractMesh;
    coreHaloMat!: StandardMaterial;
    ring!: AbstractMesh;        // orbital ring around the core

    accent!: Color3;

    // Screen
    private screenTex?: GUI.AdvancedDynamicTexture;
    private statusText?: GUI.TextBlock;
    private valuesText1?: GUI.TextBlock;
    private valuesText2?: GUI.TextBlock;
    private notesText?: GUI.TextBlock;
    private bufferFill?: GUI.Rectangle;

    constructor(public factory: AIComposerN3DFactory) {}

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: { ConnectableUtils, MeshUtils, MidiN3DConnectable } } = context;
        const scene = context.scene;
        this.accent = this.factory.accent;
        const accentHex = this.accent.toHexString();

        this.root = new B.TransformNode("ai_composer_root", scene);

        // Chassis (bounding box) — rear box
        this.chassis = B.CreateBox("ai_chassis", { width: 1.2, height: 1.0, depth: 0.35 }, scene);
        this.chassis.parent = this.root;
        this.chassis.position.set(0, 0, 0.2);
        this.chassis.material = context.materialMetal;
        this.chassis.isPickable = false;

        // Front panel (sits proud of the chassis, faces the player in -z)
        const panel = B.CreateBox("ai_panel", { width: 1.26, height: 1.06, depth: 0.05 }, scene);
        panel.parent = this.root;
        panel.position.set(0, 0, 0);
        const panelMat = new StandardMaterial("ai_panel_mat", scene);
        panelMat.diffuseColor = new Color3(0.10, 0.11, 0.13);
        panelMat.specularColor = new Color3(0.25, 0.25, 0.28);
        panel.material = panelMat;
        panel.isPickable = false;

        // Glowing accent trim around the panel
        const trimMat = new StandardMaterial("ai_trim_mat", scene);
        trimMat.emissiveColor = this.accent.scale(0.85);
        trimMat.disableLighting = true;
        const t = 0.018, hw = 0.63, hh = 0.53;
        const trims: [string, number, number, number, number][] = [
            ["top",    1.26 + t, t, 0,  hh],
            ["bottom", 1.26 + t, t, 0, -hh],
            ["left",   t, 1.06 + t, -hw, 0],
            ["right",  t, 1.06 + t,  hw, 0],
        ];
        for (const [name, w, h, px, py] of trims) {
            const trim = B.CreateBox(`ai_trim_${name}`, { width: w, height: h, depth: t }, scene);
            trim.parent = this.root;
            trim.position.set(px, py, -0.028);
            trim.material = trimMat;
            trim.isPickable = false;
        }

        // Screen (top of the panel). A CreatePlane's front face looks down -z.
        const screen = B.MeshBuilder.CreatePlane("ai_screen", { width: 1.06, height: 0.44 }, scene);
        screen.parent = this.root;
        screen.position.set(0, 0.30, -0.032);
        screen.isPickable = false;
        this.screenTex = GUI.AdvancedDynamicTexture.CreateForMesh(screen, 1024, 426);

        const bg = new GUI.Rectangle("ai_screen_bg");
        bg.background = "#0a0f14";
        bg.color = accentHex;
        bg.thickness = 5;
        bg.cornerRadius = 28;
        this.screenTex.addControl(bg);

        const stack = new GUI.StackPanel();
        stack.isVertical = true;
        stack.paddingTop = "14px";
        bg.addControl(stack);

        const mkLine = (size: number, color: string, height: number, bold = false) => {
            const tb = new GUI.TextBlock();
            tb.fontSize = size;
            tb.color = color;
            tb.fontFamily = "monospace";
            if (bold) tb.fontWeight = "bold";
            tb.height = `${height}px`;
            tb.text = "";
            stack.addControl(tb);
            return tb;
        };

        const title = mkLine(58, accentHex, 78, true);
        title.text = `◈ ${this.factory.shortLabel}`;
        this.statusText  = mkLine(44, "#e8f4f8", 66);
        this.valuesText1 = mkLine(42, "#9fd8e8", 60);
        this.valuesText2 = mkLine(38, "#7a9aa8", 56);

        // Last line: buffer gauge + note count
        const bottomRow = new GUI.Grid();
        bottomRow.addColumnDefinition(0.62);
        bottomRow.addColumnDefinition(0.38);
        bottomRow.height = "70px";
        stack.addControl(bottomRow);

        const gaugeBack = new GUI.Rectangle("ai_gauge_back");
        gaugeBack.height = "26px";
        gaugeBack.width = "92%";
        gaugeBack.background = "#16222b";
        gaugeBack.color = "#2a4a58";
        gaugeBack.thickness = 2;
        gaugeBack.cornerRadius = 12;
        bottomRow.addControl(gaugeBack, 0, 0);

        this.bufferFill = new GUI.Rectangle("ai_gauge_fill");
        this.bufferFill.height = "100%";
        this.bufferFill.width = "0%";
        this.bufferFill.background = accentHex;
        this.bufferFill.thickness = 0;
        this.bufferFill.cornerRadius = 12;
        this.bufferFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        gaugeBack.addControl(this.bufferFill);

        this.notesText = new GUI.TextBlock();
        this.notesText.fontSize = 40;
        this.notesText.color = accentHex;
        this.notesText.fontFamily = "monospace";
        this.notesText.text = "♪ 0";
        bottomRow.addControl(this.notesText, 0, 1);

        // AI core (play/stop button) above the module
        this.core = B.CreateSphere("ai_core", { diameter: 0.30, segments: 24 }, scene);
        this.core.parent = this.root;
        this.core.position.set(0, 0.80, 0.08);
        this.coreMat = new StandardMaterial("ai_core_mat", scene);
        this.coreMat.emissiveColor = COLOR_READY.clone();
        this.coreMat.disableLighting = true;
        this.core.material = this.coreMat;

        this.coreHalo = B.CreateSphere("ai_core_halo", { diameter: 0.42, segments: 16 }, scene);
        this.coreHalo.parent = this.root;
        this.coreHalo.position.copyFrom(this.core.position);
        this.coreHaloMat = new StandardMaterial("ai_core_halo_mat", scene);
        this.coreHaloMat.emissiveColor = COLOR_READY.clone();
        this.coreHaloMat.alpha = 0.16;
        this.coreHaloMat.disableLighting = true;
        this.coreHalo.material = this.coreHaloMat;
        this.coreHalo.isPickable = false;

        this.ring = B.MeshBuilder.CreateTorus("ai_core_ring", {
            diameter: 0.52, thickness: 0.022, tessellation: 48,
        }, scene);
        this.ring.parent = this.root;
        this.ring.position.copyFrom(this.core.position);
        this.ring.rotation.x = Math.PI / 7;
        const ringMat = new StandardMaterial("ai_ring_mat", scene);
        ringMat.emissiveColor = this.accent.clone();
        ringMat.disableLighting = true;
        this.ring.material = ringMat;
        this.ring.isPickable = false;

        // Core support column
        const stem = B.MeshBuilder.CreateCylinder("ai_core_stem", { diameter: 0.05, height: 0.18 }, scene);
        stem.parent = this.root;
        stem.position.set(0, 0.59, 0.08);
        stem.material = context.materialMetal;
        stem.isPickable = false;

        // Knobs — on stalks in FRONT of the bounding box (z=-0.21 < -0.142)
        const makeKnob = (name: string, pos: Vector3, diameter: number, height: number, ringColor: Color3): Knob => {
            const knobRoot = new B.TransformNode(`${name}_root`, scene);
            knobRoot.parent = this.root;
            knobRoot.position.copyFrom(pos);
            knobRoot.rotation.x = -Math.PI / 2;   // cylinder axis toward -z (player)

            // Stalk linking the panel to the knob
            const stemLen = -pos.z - 0.02;
            const kstem = B.MeshBuilder.CreateCylinder(`${name}_stem`, { diameter: 0.035, height: stemLen }, scene);
            kstem.parent = knobRoot;
            kstem.position.y = -stemLen / 2;
            kstem.material = context.materialMetal;
            kstem.isPickable = false;

            // Body (pickable — this is the draggable parameter)
            const body = B.MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: 32 }, scene);
            body.parent = knobRoot;
            const bodyMat = new StandardMaterial(`${name}_mat`, scene);
            bodyMat.diffuseColor = new Color3(0.16, 0.17, 0.20);
            bodyMat.specularColor = new Color3(0.5, 0.5, 0.55);
            body.material = bodyMat;

            // Glowing notch on the front face (rotates with body.rotation.y)
            const notch = B.CreateBox(`${name}_notch`, {
                width: 0.024, height: 0.018, depth: diameter * 0.38,
            }, scene);
            notch.parent = body;
            notch.position.set(0, height / 2 + 0.008, diameter * 0.22);
            const notchMat = new StandardMaterial(`${name}_notch_mat`, scene);
            notchMat.emissiveColor = new Color3(1, 1, 1);
            notchMat.disableLighting = true;
            notch.material = notchMat;
            notch.isPickable = false;

            // Coloured ring at the base (accent = AI, grey = utility)
            const collar = B.MeshBuilder.CreateTorus(`${name}_collar`, {
                diameter: diameter * 1.18, thickness: 0.016, tessellation: 32,
            }, scene);
            collar.parent = knobRoot;
            collar.position.y = -height / 2;
            const collarMat = new StandardMaterial(`${name}_collar_mat`, scene);
            collarMat.emissiveColor = ringColor.clone();
            collarMat.disableLighting = true;
            collar.material = collarMat;
            collar.isPickable = false;

            // Notch: value 0 → -135°, value 1 → +135°, clockwise
            const set = (v01: number) => { body.rotation.y = (0.5 - clamp01(v01)) * 1.5 * Math.PI; };
            set(0.5);
            return { mesh: body, set };
        };

        const grey = new Color3(0.45, 0.48, 0.52);
        this.hypKnobs = [
            makeKnob("ai_hyp0", new Vector3(-0.30, -0.06, -0.21), 0.22, 0.10, this.accent),
            makeKnob("ai_hyp1", new Vector3( 0.30, -0.06, -0.21), 0.22, 0.10, this.accent),
        ];
        this.tempoKnob   = makeKnob("ai_tempo",   new Vector3(-0.32, -0.40, -0.21), 0.13, 0.08, grey);
        this.velKnob     = makeKnob("ai_vel",     new Vector3( 0.0,  -0.40, -0.21), 0.13, 0.08, grey);
        this.horizonKnob = makeKnob("ai_horizon", new Vector3( 0.32, -0.40, -0.21), 0.13, 0.08, grey);

        // MIDI output — right side (outside the bounding box in x)
        this.midiOut = ConnectableUtils.createOutputMesh("ai_midi_out", 0.16, scene);
        this.midiOut.parent = this.root;
        this.midiOut.position.set(0.76, 0, 0.05);
        MeshUtils.setColor(this.midiOut, MidiN3DConnectable.Color.toColor4());

        // Standard cluster — strip below the knobs
        this.cluster = makeClusterButtons(B, scene, this.root, { x: -0.225, y: -0.60, z: -0.20 }, 0.15, 0.09);
    }

    // Screen setters (called by the logic, throttled there)
    setStatus(text: string)  { if (this.statusText)  this.statusText.text  = text; }
    setValues(l1: string, l2: string) {
        if (this.valuesText1) this.valuesText1.text = l1;
        if (this.valuesText2) this.valuesText2.text = l2;
    }
    setBuffer(t01: number)   { if (this.bufferFill)  this.bufferFill.width = `${Math.round(clamp01(t01) * 100)}%`; }
    setNotes(text: string)   { if (this.notesText)   this.notesText.text   = text; }

    async dispose() {
        this.screenTex?.dispose();
        this.screenTex = undefined;
    }
}

// ─── Logic ──────────────────────────────────────────────────────────────────

export class AIComposerN3D implements Node3D {
    private adapter: WebWorkerAdapter;
    private scheduler!: MidiLookaheadScheduler;
    private perf!: PerfMonitor;
    private midiOutput!: InstanceType<(typeof import("../../tools"))["MidiN3DConnectable"]["ListOutput"]>;
    private audioCtx: AudioContext;

    private playing = false;
    private adapterReady = false;
    private initializing = false;
    private alive = true;

    // Visual state
    private coreState: CoreState = "ready";
    private corePulse = 0;          // decays exponentially, bumped per note
    private loadProgress = 0;
    private noteOnsSent = 0;        // MIDI emission diagnostic

    // Current post-gen knob values (synced).
    // `tempo` = multiplier RELATIVE to the host tempo (1.0 = the conductor's).
    private tempo = TEMPO_RANGE.default;
    private velocity = VEL_RANGE.default;
    private horizon = HORIZON_RANGE.default;

    // Host transport (shared tempo + time signature)
    private transport!: WamTransportManager;
    private unsubTransport: (() => void) | null = null;
    private hostBpm = NOMINAL_BPM;
    private timeSig = { numerator: 4, denominator: 4 };

    // Hyperparameters (first 2 of the model)
    private hypSpecs: HyperparamSpec[] = [];
    private hypValues: Record<string, number> = {};

    // Knob visuals by id (to resync after a network setState)
    private knobVisuals = new Map<string, () => void>();

    // Cluster-controllable params (presets / mutation), filled by setupKnob
    private tunables: TunableParam[] = [];

    constructor(
        private context: Node3DContext,
        private gui: AIComposerN3DGUI,
        modelType: WorkerModelType,
        variant: MagentaRNNVariant,
    ) {
        const { tools: T, audioCtx } = context;
        this.audioCtx = audioCtx;
        const scene = gui.root.getScene();

        context.addToBoundingBox(gui.chassis);

        // ── Adapter (lazy init au premier play) ───────────────────────────────
        const isDrums = variant === "drum_kit_rnn";
        this.adapter = new WebWorkerAdapter({ modelType, variant, primerMaxNotes: isDrums ? 24 : 8 });

        // ── Sortie MIDI (avec diagnostics de connexion) ───────────────────────
        this.midiOutput = new T.MidiN3DConnectable.ListOutput(
            "midiOut", [gui.midiOut], "MIDI Output",
            (wamNode) => {
                console.log(`[AIComposer] sortie MIDI CONNECTÉE → ${wamNode.instanceId} (${this.midiOutput.connections.length} au total)`);
                this.refreshScreen();
            },
            (wamNode) => {
                console.log(`[AIComposer] sortie MIDI déconnectée ← ${wamNode.instanceId} (${this.midiOutput.connections.length} restantes)`);
                this.refreshScreen();
            },
        );
        context.createConnectable(this.midiOutput);

        // ── Scheduler ─────────────────────────────────────────────────────────
        this.scheduler = new MidiLookaheadScheduler(
            this.adapter,
            () => audioCtx.currentTime,
            (ev: MidiEvent, timeSec: number) => this.emitToConnections(ev, timeSec),
            { horizonSec: this.horizon },
        );
        this.scheduler.setVelocityScale(this.velocity);

        this.perf = new PerfMonitor(scene, this.scheduler, this.adapter);

        // Host transport: the AIComposer LISTENS to WamTransportManager instead
        // of imposing its own tempo (host tempo → scheduler; signature → adapter).
        this.transport = WamTransportManager.getInstance(audioCtx);
        this.unsubTransport = this.transport.onChange(() => this.applyTransport());

        // Hyperparameter knobs: the first 2 of the model (RNN → temperature +
        // density; VAE → temperature + morph). The mesh is also automatable.
        this.hypSpecs = this.adapter.capabilities.hyperparameters.slice(0, 2);
        this.hypSpecs.forEach((spec, i) => {
            this.hypValues[spec.name] = spec.default;
            const range = { min: spec.min, max: spec.max, default: spec.default };
            this.setupKnob(
                spec.name, spec.displayName, gui.hypKnobs[i], range,
                () => this.hypValues[spec.name],
                (v) => {
                    this.hypValues[spec.name] = v;
                    // Cached even before init() (pushed to the worker at init)
                    try { this.adapter.setHyperparameter(spec.name, v); } catch (_) {}
                },
            );
        });

        // Core = play/stop button
        context.createButton({
            id: "playStop",
            meshes: [gui.core],
            label: "Play / Stop",
            color: gui.accent,
            press: () => { void this.togglePlay(); },
            release: () => {},
        });

        // Post-gen knobs. "Tempo" is relative to the host tempo; applyTransport()
        // combines it with the current BPM (rubato without breaking the pulse).
        this.setupKnob("tempo", "Tempo ×", gui.tempoKnob, TEMPO_RANGE,
            () => this.tempo, (v) => { this.tempo = v; this.applyTransport(); }, true);
        this.setupKnob("velocity", "Velocity", gui.velKnob, VEL_RANGE,
            () => this.velocity, (v) => { this.velocity = v; this.scheduler.setVelocityScale(v); }, true);
        this.setupKnob("horizon", "Horizon", gui.horizonKnob, HORIZON_RANGE,
            () => this.horizon, (v) => { this.horizon = v; this.scheduler.setHorizonSec(v); }, true);

        // Standard cluster (sound presets per variant)
        const hyp1 = this.hypSpecs[1]?.displayName ?? "Density";
        setupInstrumentControls(context, {
            title: gui.factory.shortLabel,
            description: gui.factory.description,
            legend: [
                { swatch: "🔵", name: "Big left knob", role: "Temperature — chaos vs predictability of the draw" },
                { swatch: "🟣", name: "Big right knob", role: `${hyp1} — character of the stream` },
                { swatch: "⚪", name: "Small knobs (bottom)", role: "Tempo (× host tempo), Velocity, Horizon (buffer latency)" },
                { swatch: "💗", name: "Glowing core", role: "Play/Stop; color = state; pulses on each note; follows the host transport" },
                { swatch: "🟢", name: "Green sphere (side)", role: "MIDI output — wire to a synth (Pro54…)" },
                { swatch: "✋", name: "Chassis", role: "Two-handed grab = resize; bin button or vigorous shake = delete" },
            ],
            presets: gui.factory.presets,
            defaultPreset: gui.factory.defaultPreset,
            params: this.tunables,
            helpBtn: gui.cluster.helpBtn,
            presetBtn: gui.cluster.presetBtn,
            mutateBtn: gui.cluster.mutateBtn,
            resetBtn: gui.cluster.resetBtn,
        });

        // Apply the host tempo + signature from the start.
        this.applyTransport();
        this.gui.setStatus("Ready — touch the core");

        // Feedback loop (pulse, ring, halo, throttled screen)
        const targetColor = new Color3();
        let screenTimer = 0;
        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
            if (dt <= 0) return;
            const tNow = performance.now() / 1000;

            // Note pulse (bumped on each note-on, exponential decay)
            this.corePulse *= Math.exp(-dt * 5);

            // Slow breathing at rest, energetic pulse while playing
            const breathe = this.playing
                ? Math.sin(tNow * Math.PI * 2.2) * 0.02
                : Math.sin(tNow * Math.PI * 0.8) * 0.04;
            gui.core.scaling.setAll(1 + breathe + this.corePulse * 0.35);
            gui.coreHalo.scaling.setAll(1 + breathe + this.corePulse * 0.55);
            gui.coreHaloMat.alpha = 0.10 + this.corePulse * 0.30;

            // Core colour by state (smooth transition)
            switch (this.coreState) {
                case "ready":   targetColor.copyFrom(COLOR_READY);   break;
                case "loading": targetColor.copyFrom(COLOR_LOADING); break;
                case "error":   targetColor.copyFrom(COLOR_ERROR);   break;
                case "playing": targetColor.copyFrom(gui.accent);    break;
            }
            Color3.LerpToRef(gui.coreMat.emissiveColor, targetColor, Math.min(1, dt * 8), gui.coreMat.emissiveColor);
            gui.coreHaloMat.emissiveColor.copyFrom(gui.coreMat.emissiveColor);

            // Loading blink
            if (this.coreState === "loading") {
                const blink = 0.65 + Math.sin(tNow * Math.PI * 4) * 0.35;
                gui.coreMat.emissiveColor.scaleToRef(blink, gui.coreMat.emissiveColor);
            }

            // Orbital ring: speed ∝ activity
            gui.ring.rotation.y += dt * (this.playing ? 1.4 + this.corePulse * 5 : 0.15);

            // Screen (4 Hz is enough)
            screenTimer += dt;
            if (screenTimer >= 0.25) {
                screenTimer = 0;
                this.refreshScreen();
            }
        });

        console.log(`[AIComposer] spawned (modelType=${modelType}, variant=${variant})`);
    }

    // MIDI emission + visual pulse synced to audio time
    private emitToConnections(ev: MidiEvent, timeSec: number): void {
        const channel = ev.channel ?? 0;
        // Tuple [number, number, number] for WamMidiData typing — a wide
        // number[] no longer passes the current @webaudiomodules/api.
        let bytes: [number, number, number] | null = null;
        if (ev.type === "note-on" && ev.note !== undefined) {
            bytes = [0x90 | channel, ev.note, ev.velocity ?? 80];
            // The scheduler emits ~0.5 s ahead (look-ahead), so schedule the
            // visual pulse at the note's audible time, not at emission.
            const delayMs = Math.max(0, (timeSec - this.audioCtx.currentTime) * 1000);
            const strength = 0.4 + ((ev.velocity ?? 80) / 127) * 0.6;
            setTimeout(() => {
                if (this.alive) this.corePulse = Math.min(1.6, this.corePulse + strength);
            }, delayMs);
        } else if (ev.type === "note-off" && ev.note !== undefined) {
            bytes = [0x80 | channel, ev.note, 0];
        }
        if (!bytes) return;
        for (const cn of this.midiOutput.connections) {
            cn.scheduleEvents({ type: "wam-midi", time: timeSec, data: { bytes } });
        }
        // Diagnostic: periodically confirm events are leaving and to how many
        // WAMs (silence at the synth → problem on the WAM side).
        if (ev.type === "note-on") {
            this.noteOnsSent++;
            if (this.noteOnsSent === 1 || this.noteOnsSent % 50 === 0) {
                console.log(`[AIComposer] ${this.noteOnsSent} note-on sent → ${this.midiOutput.connections.length} MIDI connection(s)`);
            }
        }
    }

    // Play/Stop with lazy init
    private async togglePlay(): Promise<void> {
        if (this.initializing) return;

        if (this.playing) {
            this.scheduler.stop();
            this.perf.stop();
            this.playing = false;
            this.coreState = "ready";
            this.gui.setStatus("Paused — touch the core");
            console.log("[AIComposer] stop");
            return;
        }

        if (!this.adapterReady) {
            this.initializing = true;
            this.coreState = "loading";
            this.loadProgress = 0;
            this.context.showMessage("Loading AI model (worker)…");
            try {
                await this.adapter.init({
                    progressCallback: (p: number) => { this.loadProgress = p; },
                });
                this.adapterReady = true;
                console.log(`[AIComposer] adapter ready (init ${this.adapter.stats.initTimeMs.toFixed(0)} ms, backend=${this.adapter.backend})`);
            } catch (e) {
                console.error("[AIComposer] init failed:", e);
                this.context.showMessage("Failed to load the model.");
                this.coreState = "error";
                this.gui.setStatus("✖ Load failed");
                this.initializing = false;
                return;
            }
            this.initializing = false;
        }

        // Start aligned to the host downbeat: if the transport is playing, place
        // the first event at the next bar start so it lands on the conductor's "1".
        let startAt: number | undefined;
        if (this.transport.getPlaying()) {
            const { numerator, denominator } = this.transport.getTimeSignature();
            const secPerBeat = (60 / this.transport.getTempo()) * (4 / denominator);
            const secPerBar = secPerBeat * numerator;
            const intoBar = this.transport.getElapsedSeconds() % secPerBar;
            startAt = this.audioCtx.currentTime + (secPerBar - intoBar);
        }
        this.scheduler.start(startAt);
        this.perf.start();
        this.playing = true;
        this.coreState = "playing";

        // Coloured world signal: "this instrument is starting"
        const a = this.gui.accent;
        this.context.sendSignal(this.context.getPosition().position, a.r, a.g, a.b);
        console.log("[AIComposer] play");
    }

    // Follow the host transport: tempo (immediate) + signature (grid)
    private applyTransport(): void {
        this.hostBpm = this.transport.getTempo();
        this.timeSig = this.transport.getTimeSignature();
        // Real tempo = host BPM × knob multiplier (the scheduler plays deltas
        // calibrated to NOMINAL_BPM, hence the ratio).
        this.scheduler.setTempoScale((this.hostBpm / NOMINAL_BPM) * this.tempo);
        // Time signature → adapter grid/accents (worker).
        this.adapter.setMeter(this.timeSig.numerator, this.timeSig.denominator);
        this.refreshValues();
    }

    // Screen: knob values
    private refreshValues(): void {
        const fmt = (spec: HyperparamSpec, v: number) =>
            (spec.max - spec.min) > 4 ? Math.round(v).toString() : v.toFixed(2);
        const parts = this.hypSpecs.map(spec =>
            `${spec.displayName} ${fmt(spec, this.hypValues[spec.name] ?? spec.default)}`);
        this.gui.setValues(
            parts.join("  ·  "),
            `Host ${Math.round(this.hostBpm)} BPM ${this.timeSig.numerator}/${this.timeSig.denominator}  ·  Tempo ×${this.tempo.toFixed(2)}  ·  Vel ×${this.velocity.toFixed(2)}`,
        );
    }

    // Screen: state + buffer gauge + counter (throttled to 4 Hz)
    private refreshScreen(): void {
        const stats = this.scheduler.stats;
        const nConn = this.midiOutput?.connections.length ?? 0;
        switch (this.coreState) {
            case "loading":
                this.gui.setStatus(`Loading model… ${Math.round(this.loadProgress * 100)} %`);
                break;
            case "playing": {
                if (nConn === 0) {
                    this.gui.setStatus("⚠ MIDI output not wired!");
                } else {
                    const late = stats.lateEvents > 0 ? `  ⚠${stats.lateEvents} late` : "";
                    const resync = stats.gridResyncs > 0 ? `  ↻${stats.gridResyncs}` : "";
                    this.gui.setStatus(`♪ Playing →${nConn} — buffer ${stats.bufferDepthSec.toFixed(2)} s${late}${resync}`);
                }
                break;
            }
            // ready / error: message set once by togglePlay, not overwritten
        }
        this.gui.setBuffer(this.playing ? stats.bufferDepthSec / Math.max(this.horizon, 0.01) : 0);
        this.gui.setNotes(`♪ ${stats.notesPlayed}`);
    }

    // Helper: rotary knob (Node3DParameter)
    private setupKnob(
        id: string, label: string, knob: Knob,
        range: { min: number; max: number; default: number },
        getter: () => number, setter: (v: number) => void,
        notifyNodeState = false,
    ): void {
        const updateVisual = () => knob.set(invlerp(range, getter()));
        updateVisual();
        this.knobVisuals.set(id, updateVisual);
        const setNorm = (v01: number) => {
            setter(range.min + v01 * (range.max - range.min));
            updateVisual();
            if (notifyNodeState) this.context.notifyStateChange(id);
            this.refreshValues();
        };
        this.context.createParameter({
            id,
            meshes: [knob.mesh],
            getLabel: () => label,
            getStepCount: () => 0,
            getValue: () => invlerp(range, getter()),
            setValue: setNorm,
            stringify: (v01: number) => `${label}: ${(range.min + v01 * (range.max - range.min)).toFixed(2)}`,
        });
        // Cluster-controllable (presets / mutation).
        this.tunables.push({ name: id, min: range.min, max: range.max, getNorm: () => invlerp(range, getter()), setNorm });
    }

    async dispose() {
        this.alive = false;
        this.unsubTransport?.();
        this.perf?.stop();
        this.scheduler?.stop();
        await this.adapter?.dispose();
    }

    // Sync: tempo / velocity / horizon
    getStateKeys(): string[] { return ["tempo", "velocity", "horizon"]; }

    async getState(key: string): Promise<Serializable | void> {
        switch (key) {
            case "tempo":    return this.tempo;
            case "velocity": return this.velocity;
            case "horizon":  return this.horizon;
        }
    }

    async setState(key: string, value: Serializable | undefined): Promise<void> {
        if (typeof value !== "number") return;
        switch (key) {
            case "tempo":    this.tempo = value;    this.scheduler.setTempoScale(value);    break;
            case "velocity": this.velocity = value; this.scheduler.setVelocityScale(value); break;
            case "horizon":  this.horizon = value;  this.scheduler.setHorizonSec(value);    break;
        }
        this.knobVisuals.get(key)?.();
        this.refreshValues();
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

// Sound presets per family (REAL values). Param names = the exposed knobs:
// temperature + (density | morph) + tempo/velocity/horizon.
const MELODIC_PRESETS: Record<string, Record<string, number>> = {
    "Soft & Tonal":  { temperature: 0.8, density: 6, tempo: 1.0, velocity: 1.0,  horizon: 2.0 },
    "Adventurous":   { temperature: 1.3, density: 6, tempo: 1.0, velocity: 1.05, horizon: 2.0 },
    "Slow Pad":      { temperature: 0.6, density: 2, tempo: 0.6, velocity: 0.9,  horizon: 2.5 },
    "Virtuoso Lead": { temperature: 1.0, density: 8, tempo: 1.3, velocity: 1.2,  horizon: 1.5 },
};
const DRUM_PRESETS: Record<string, Record<string, number>> = {
    "Groove":  { temperature: 0.9, density: 6, tempo: 1.0, velocity: 1.0,  horizon: 2.0 },
    "Minimal": { temperature: 0.8, density: 3, tempo: 1.0, velocity: 0.95, horizon: 2.0 },
    "Chaotic": { temperature: 1.4, density: 8, tempo: 1.0, velocity: 1.1,  horizon: 1.5 },
};
const VAE_PRESETS: Record<string, Record<string, number>> = {
    "Phrase A":    { temperature: 0.5, morph: 0.0, tempo: 1.0, velocity: 1.0, horizon: 2.0 },
    "In Between":  { temperature: 0.5, morph: 0.5, tempo: 1.0, velocity: 1.0, horizon: 2.0 },
    "Phrase B":    { temperature: 0.5, morph: 1.0, tempo: 1.0, velocity: 1.0, horizon: 2.0 },
    "Exploration": { temperature: 1.0, morph: 0.5, tempo: 1.0, velocity: 1.0, horizon: 2.0 },
};

export class AIComposerN3DFactory implements Node3DFactory<AIComposerN3DGUI, AIComposerN3D> {
    constructor(
        public modelType: WorkerModelType,
        public variant: MagentaRNNVariant,
        public label: string,
        public description: string,
        public accent: Color3,
        public shortLabel: string,
        public presets: Record<string, Record<string, number>>,
        public defaultPreset: string,
    ) {}

    tags = ["ai", "generator", "midi", "composer"];

    async createGUI(context: Node3DGUIContext) {
        const gui = new AIComposerN3DGUI(this);
        await gui.init(context);
        return gui;
    }

    async create(context: Node3DContext, gui: AIComposerN3DGUI) {
        return new AIComposerN3D(context, gui, this.modelType, this.variant);
    }

    private static readonly COMMON_DESC =
        " MIDI output to wire to an instrument. Rotary knobs you can turn directly " +
        "(and wire as automation); embedded status screen; the glowing core = " +
        "play/stop.";

    static MELODY = new AIComposerN3DFactory(
        "music_rnn", "melody_rnn",
        "AI Composer — Melody",
        "Melodic AI composer (Magenta melody_rnn). A continuous, tonal monophonic " +
        "MIDI stream you can steer in real time. Wire to a synth (Pro54)." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(0.20, 0.80, 1.00), "MELODY",
        MELODIC_PRESETS, "Soft & Tonal",
    );

    static IMPROV = new AIComposerN3DFactory(
        "music_rnn", "chord_pitches_improv",
        "AI Composer — Improv",
        "AI composer that improvises a melody over a chord grid (Magenta ImprovRNN, " +
        "C chord by default). Wire to a synth." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(1.00, 0.60, 0.15), "IMPROV",
        MELODIC_PRESETS, "Soft & Tonal",
    );

    static DRUMS = new AIComposerN3DFactory(
        "music_rnn", "drum_kit_rnn",
        "AI Composer — Drums",
        "AI composer for drum patterns (Magenta DrumsRNN, polyphonic, channel 0). " +
        "Wire to a drum machine / drum-kit WAM." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(0.95, 0.30, 0.25), "DRUMS",
        DRUM_PRESETS, "Groove",
    );

    static BASIC = new AIComposerN3DFactory(
        "music_rnn", "basic_rnn",
        "AI Composer — Simple Melody",
        "Basic melodic AI composer (Magenta basic_rnn). A more neutral variant than " +
        "melody_rnn, handy as a baseline for comparison." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(0.55, 0.65, 0.90), "BASIC",
        MELODIC_PRESETS, "Soft & Tonal",
    );

    static VAE = new AIComposerN3DFactory(
        "music_vae", "melody_rnn",   // variant ignored for the VAE
        "AI Composer — Latent (VAE)",
        "Latent-space AI composer (Magenta MusicVAE mel_2bar). The MORPH knob " +
        "interpolates between two anchor phrases → the music morphs continuously. " +
        "Knobs: temperature + morph." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(0.72, 0.42, 1.00), "LATENT VAE",
        VAE_PRESETS, "In Between",
    );
}
