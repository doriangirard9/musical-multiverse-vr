import type { AbstractMesh, Color4, Observer, Scene, StandardMaterial } from "@babylonjs/core";
import { Color3 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Node3DContext } from "../../Node3DContext";
import type { MidiN3DConnectable } from "../../tools";
import type { PatternNote } from "../../../ai/types";
import { WamTransportManager } from "../../../app/WamTransportManager";
import { WebWorkerAdapter } from "../../../ai/adapters/WebWorkerAdapter";
import { DRUM_CLASSES, DRUM_ROWS, ROW_TO_MIDI, MIDI_TO_ROW } from "./drumGrid";
import { Drum808Kit } from "./Drum808Kit";

// ─── Neural Drum Machine ─────────────────────────────────────────────────────
//
//   Pattern based AI drum machine (after teropa's "Neural Drum Machine").
//   The user paints a seed on the first steps of a step grid; the DrumsRNN
//   model completes the rest of the pattern in one shot. The pattern loops
//   in sync with the host transport, playing through a built-in 808 kit
//   (audio output) and through MIDI to any connected drum WAM.
//
//   The original pen relies on Tone.js (transport, samplers). Here the
//   transport is the WamTransportManager plus an AudioContext lookahead
//   loop, and the sound is a synthesized WebAudio kit. No Tone.js.

const MAX_STEPS = 32;
const LENGTH_CHOICES = [8, 16, 32];
const SEED_MAX = 8;
const LOOKAHEAD_SEC = 0.08;
const HUMANIZE_SEC = 0.005;
const RING_POOL = 10;
const RING_LIFE_MS = 320;

// Velocities per metric accent (codepen: high on beats, med on eighths).
const VEL_HIGH = 112, VEL_MED = 84, VEL_LOW = 56;

class NeuralDrumMachineN3DGUI implements Node3DGUI {

    root;
    block;
    /** Cell instances indexed [step][row]. */
    cells: AbstractMesh[][] = [];
    playBtn;
    generateBtn;
    knobTemperature; knobSwing; knobSeed; knobLength; knobAutoVary; knobVolume;
    midiOut; audioOut;

    constructor(readonly context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context;

        this.root = new B.TransformNode("neural drum machine root", context.scene);

        // Base plate. Grid on top, knob row below, outputs on the right edge.
        const W = 1.5, D = 0.62, BASE = 0.05;
        const block = this.block = B.CreateBox("ndm block", { width: W, height: BASE, depth: D }, context.scene);
        block.material = context.materialMat;
        T.MeshUtils.setColor(block, new B.Color4(0.09, 0.1, 0.13, 1));
        block.position.y = -BASE / 2;
        block.parent = this.root;

        // Row colors: one hue per drum class, kick first.
        this.rowColors = Array.from({ length: DRUM_ROWS }, (_, r) =>
            B.Color3.FromHSV((r * 360) / DRUM_ROWS, 0.72, 0.95).toColor4(1));
        this.seedTint = new B.Color4(0.91, 0.12, 0.39, 1);

        // Cell template, unit sized: layout() scales instances per pattern length.
        const template = B.CreateBox("ndm cell template", { width: 1, height: 0.012, depth: 1 }, context.scene);
        template.material = context.materialMat;
        template.isVisible = false;
        template.parent = this.root;
        template.registerInstancedBuffer("color", 4);
        template.instancedBuffers.color = new B.Color4(1, 1, 1, 1);

        for (let s = 0; s < MAX_STEPS; s++) {
            const column: AbstractMesh[] = [];
            this.cells.push(column);
            for (let r = 0; r < DRUM_ROWS; r++) {
                const cell = template.createInstance(`ndm cell ${r} step ${s}`);
                cell.parent = this.root;
                column.push(cell);
            }
        }
        this.layout(16);
        // Default paint so impostors and thumbnails show a sensible grid.
        for (let s = 0; s < MAX_STEPS; s++) {
            for (let r = 0; r < DRUM_ROWS; r++) this.paint(s, r, false, s < 4, false, false);
        }

        // Play and generate buttons, left of the knob row.
        const playBtn = this.playBtn = B.CreateBox("ndm play", { width: 0.1, height: 0.035, depth: 0.1 }, context.scene);
        playBtn.material = context.materialMat;
        playBtn.position.set(-0.66, 0.018, -0.22);
        playBtn.parent = this.root;

        const generateBtn = this.generateBtn = B.CreateBox("ndm generate", { width: 0.12, height: 0.035, depth: 0.1 }, context.scene);
        generateBtn.material = context.materialMat;
        generateBtn.position.set(-0.51, 0.018, -0.22);
        generateBtn.parent = this.root;

        // Pulse ring pool: expanding colored rings around the plate, one per
        // drum hit. Pooled and animated on the render loop.
        this.ringObserver = context.scene.onBeforeRenderObservable.add(() => this.animateRings());
        for (let i = 0; i < RING_POOL; i++) {
            const mat = new B.StandardMaterial(`ndm ring mat ${i}`, context.scene);
            mat.disableLighting = true;
            mat.alpha = 0;
            const mesh = B.CreateTorus(`ndm ring ${i}`, { diameter: 1, thickness: 0.03, tessellation: 48 }, context.scene);
            mesh.material = mat;
            mesh.parent = this.root;
            mesh.position.y = 0.04 + i * 0.004;
            mesh.setEnabled(false);
            this.rings.push({ mesh, mat, startMs: 0, strength: 1 });
        }

        // Knob row along the bottom.
        const knob = (name: string, x: number, color: Color4) => {
            const mesh = B.CreateSphere(name, { diameter: 0.075 }, context.scene);
            mesh.material = context.materialMat;
            T.MeshUtils.setColor(mesh, color);
            mesh.position.set(x, 0.02, -0.22);
            mesh.parent = this.root;
            return mesh;
        };
        this.knobTemperature = knob("ndm temperature", -0.38, new B.Color4(0.95, 0.35, 0.25, 1));
        this.knobSwing       = knob("ndm swing",       -0.22, new B.Color4(0.95, 0.65, 0.2, 1));
        this.knobSeed        = knob("ndm seed",        -0.06, this.seedTint);
        this.knobLength      = knob("ndm length",       0.1,  new B.Color4(0.3, 0.6, 0.95, 1));
        this.knobAutoVary    = knob("ndm autovary",     0.26, new B.Color4(0.45, 0.85, 0.45, 1));
        this.knobVolume      = knob("ndm volume",       0.42, new B.Color4(0.85, 0.85, 0.85, 1));

        // Outputs on the right edge.
        const midiOut = this.midiOut = T.ConnectableUtils.createOutputMesh("ndm midi out", 0.09, context.scene);
        T.MeshUtils.setColor(midiOut, T.MidiN3DConnectable.Color.toColor4());
        midiOut.material = context.materialMat;
        midiOut.position.set(W / 2 + 0.06, 0, 0.08);
        midiOut.parent = this.root;

        const audioOut = this.audioOut = T.ConnectableUtils.createOutputMesh("ndm audio out", 0.09, context.scene);
        T.MeshUtils.setColor(audioOut, T.AudioN3DConnectable.Color.toColor4());
        audioOut.material = context.materialMat;
        audioOut.position.set(W / 2 + 0.06, 0, -0.12);
        audioOut.parent = this.root;

        this.setGenerateState("loading");
    }

    /** Repositions the visible columns so `length` steps fill the grid area. */
    layout(length: number): void {
        const GX0 = -0.7, GX1 = 0.7, GZ_TOP = 0.28, GZ_BOT = -0.1;
        const w = (GX1 - GX0) / length;
        const h = (GZ_TOP - GZ_BOT) / DRUM_ROWS;
        for (let s = 0; s < MAX_STEPS; s++) {
            const visible = s < length;
            for (let r = 0; r < DRUM_ROWS; r++) {
                const cell = this.cells[s][r];
                cell.setEnabled(visible);
                if (visible === false) continue;
                cell.position.set(GX0 + (s + 0.5) * w, 0.012, GZ_TOP - (r + 0.5) * h);
                cell.scaling.set(w * 0.86, 1, h * 0.78);
            }
        }
    }

    /** Paints one cell from its logical state. */
    paint(step: number, row: number, on: boolean, seed: boolean, active: boolean, dim: boolean): void {
        const { babylon: B } = this.context;
        const base = this.rowColors[row];
        let cr: number, cg: number, cb: number;
        if (on === true) { cr = base.r; cg = base.g; cb = base.b; }
        else { cr = base.r * 0.12 + 0.05; cg = base.g * 0.12 + 0.05; cb = base.b * 0.12 + 0.05; }
        if (seed === true) {
            const mix = on === true ? 0.42 : 0.16;
            cr += (this.seedTint.r - cr) * mix;
            cg += (this.seedTint.g - cg) * mix;
            cb += (this.seedTint.b - cb) * mix;
        }
        if (dim === true) { cr *= 0.45; cg *= 0.45; cb *= 0.45; }
        if (active === true) { cr += 0.22; cg += 0.22; cb += 0.22; }
        this.cells[step][row].instancedBuffers.color = new B.Color4(Math.min(1, cr), Math.min(1, cg), Math.min(1, cb), 1);
    }

    /** Tints the generate button: grey loading, green ready, orange busy. */
    setGenerateState(state: "loading" | "ready" | "busy"): void {
        const { babylon: B, tools: T } = this.context;
        const color =
            state === "ready" ? new B.Color4(0.25, 0.75, 0.35, 1)
            : state === "busy" ? new B.Color4(0.95, 0.6, 0.15, 1)
            : new B.Color4(0.4, 0.4, 0.45, 1);
        T.MeshUtils.setColor(this.generateBtn, color);
    }

    /** Tints the play button: bright green while playing, dark red when paused. */
    setPlayState(playing: boolean): void {
        const { babylon: B, tools: T } = this.context;
        const color = playing === true ? new B.Color4(0.2, 0.85, 0.3, 1) : new B.Color4(0.6, 0.18, 0.18, 1);
        T.MeshUtils.setColor(this.playBtn, color);
    }

    /**
     * Fires an expanding colored ring around the plate for one drum hit.
     * @param row      Drum row, sets the ring color.
     * @param strength Accent 0-1, scales the ring size.
     */
    pulse(row: number, strength: number): void {
        if (this.disposed === true) return;
        const ring = this.rings[this.ringCursor];
        this.ringCursor = (this.ringCursor + 1) % RING_POOL;
        const base = this.rowColors[row];
        ring.mat.emissiveColor.set(base.r, base.g, base.b);
        ring.startMs = performance.now();
        ring.strength = 0.6 + 0.4 * strength;
        ring.mesh.setEnabled(true);
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        if (this.ringObserver !== null) {
            this.context.scene.onBeforeRenderObservable.remove(this.ringObserver);
            this.ringObserver = null;
        }
        this.root.dispose();
        this.cells = [];
    }

    get worldSize() { return 5; }

    private animateRings(): void {
        const now = performance.now();
        for (const ring of this.rings) {
            if (ring.mesh.isEnabled() === false) continue;
            const e = (now - ring.startMs) / RING_LIFE_MS;
            if (e >= 1) { ring.mesh.setEnabled(false); ring.mat.alpha = 0; continue; }
            const size = (0.9 + e * 1.1) * ring.strength;
            ring.mesh.scaling.set(size, 1, size);
            ring.mat.alpha = (1 - e) * 0.85;
        }
    }

    private rowColors: Color4[];
    private seedTint: Color4;
    private rings: { mesh: AbstractMesh; mat: StandardMaterial; startMs: number; strength: number }[] = [];
    private ringCursor = 0;
    private ringObserver: Observer<Scene> | null = null;
    private disposed = false;
}

class NeuralDrumMachineN3D implements Node3D {

    constructor(private context: Node3DContext, private gui: NeuralDrumMachineN3DGUI) {
        const { audioCtx, tools: T } = context;
        const machine = this;

        context.addToBoundingBox(gui.block);

        // Built-in kit bus and audio output (wire to a speaker), plus MIDI
        // output to drive external drum WAMs.
        this.kit = new Drum808Kit(audioCtx);
        context.createConnectable(new T.AudioN3DConnectable.Output("audioOut", [gui.audioOut], "Audio Out", this.kit.output));
        this.midiOutput = new T.MidiN3DConnectable.ListOutput("midiOut", [gui.midiOut], "MIDI Output");
        context.createConnectable(this.midiOutput);

        this.pattern = Array.from({ length: MAX_STEPS }, () => Array.from({ length: DRUM_ROWS }, () => false));
        // Default seed (codepen default): kick on step 1, closed hat on step 3.
        this.pattern[0][0] = true;
        this.pattern[2][2] = true;

        // Grid cells: one toggle parameter per cell, synced per cell.
        for (let s = 0; s < MAX_STEPS; s++) {
            for (let r = 0; r < DRUM_ROWS; r++) {
                context.createParameter({
                    id: `ndm_cell_${r}_${s}`,
                    meshes: [gui.cells[s][r]],
                    getLabel: () => `${DRUM_CLASSES[r]} step ${s + 1}`,
                    getStepCount: () => 2,
                    getValue: () => machine.pattern[s][r] === true ? 1 : 0,
                    setValue: v => machine.setCell(s, r, v >= 0.5),
                    stringify: v => v < 0.5 ? "Off" : "On",
                });
            }
        }

        // Knobs.
        context.createParameter({
            id: "ndm_temperature",
            meshes: [gui.knobTemperature],
            getLabel: () => "Temperature",
            getStepCount: () => 16,
            getValue: () => (machine.temperature - 0.5) / 1.5,
            setValue: v => { machine.temperature = 0.5 + v * 1.5; },
            stringify: v => (0.5 + v * 1.5).toFixed(2),
        });
        context.createParameter({
            id: "ndm_swing",
            meshes: [gui.knobSwing],
            getLabel: () => "Swing",
            getStepCount: () => 5,
            getValue: () => (machine.swing - 0.5) / 0.2,
            setValue: v => { machine.swing = 0.5 + v * 0.2; },
            stringify: v => (0.5 + v * 0.2).toFixed(2),
        });
        context.createParameter({
            id: "ndm_seed_length",
            meshes: [gui.knobSeed],
            getLabel: () => "Seed Steps",
            getStepCount: () => SEED_MAX,
            getValue: () => (machine.seedSteps - 1) / (SEED_MAX - 1),
            setValue: v => {
                machine.seedSteps = 1 + Math.round(v * (SEED_MAX - 1));
                machine.paintAll();
            },
            stringify: v => `${1 + Math.round(v * (SEED_MAX - 1))} steps`,
        });
        context.createParameter({
            id: "ndm_pattern_length",
            meshes: [gui.knobLength],
            getLabel: () => "Pattern Length",
            getStepCount: () => LENGTH_CHOICES.length,
            getValue: () => LENGTH_CHOICES.indexOf(machine.patternLength) / (LENGTH_CHOICES.length - 1),
            setValue: v => {
                const length = LENGTH_CHOICES[Math.round(v * (LENGTH_CHOICES.length - 1))];
                if (length === machine.patternLength) return;
                machine.patternLength = length;
                machine.anchored = false;
                gui.layout(length);
                machine.paintAll();
            },
            stringify: v => `${LENGTH_CHOICES[Math.round(v * (LENGTH_CHOICES.length - 1))]} steps`,
        });
        context.createParameter({
            id: "ndm_auto_vary",
            meshes: [gui.knobAutoVary],
            getLabel: () => "Auto Vary",
            getStepCount: () => 2,
            getValue: () => machine.autoVary === true ? 1 : 0,
            setValue: v => { machine.autoVary = v >= 0.5; },
            stringify: v => v < 0.5 ? "Off" : "On (regenerate each loop)",
        });
        context.createParameter({
            id: "ndm_volume",
            meshes: [gui.knobVolume],
            getLabel: () => "Kit Volume",
            getStepCount: () => 0,
            getValue: () => machine.kit.output.gain.value,
            setValue: v => { machine.kit.output.gain.value = v; },
            stringify: v => `${Math.round(v * 100)}%`,
        });

        // Play/pause and generate buttons.
        context.createButton({
            id: "ndm_play",
            meshes: [gui.playBtn],
            label: "Play / Pause",
            color: new Color3(0.2, 0.85, 0.3),
            press: () => machine.setPlaying(machine.playing === false),
            release: () => {},
        });
        context.createButton({
            id: "ndm_generate",
            meshes: [gui.generateBtn],
            label: "Generate beat",
            color: new Color3(0.25, 0.75, 0.35),
            press: () => { void machine.generate(); },
            release: () => {},
        });
        gui.setPlayState(false);

        this.paintAll();

        // DrumsRNN in the shared AI worker. Same checkpoint as the streaming
        // AI drums, but used through one-shot pattern completion.
        this.adapter = new WebWorkerAdapter({ modelType: "music_rnn", variant: "drum_kit_rnn" });
        this.adapter.init()
            .then(() => {
                machine.adapterReady = true;
                gui.setGenerateState("ready");
            })
            .catch(e => {
                console.error("[NeuralDrumMachine] model init failed:", e);
                context.showMessage("Neural Drum Machine: AI model failed to load");
            });

        // Transport sync: re-anchor the scheduler on any transport change.
        // When the host transport stops mid-play, the free-run clock takes
        // over from the current loop position, so the beat never halts.
        const transport = WamTransportManager.getInstance(audioCtx);
        const disposeTransport = transport.onChange(() => {
            machine.anchored = false;
            if (transport.isPlaying === false && machine.playing === true) {
                machine.freeRunBase = audioCtx.currentTime - machine.lastPos;
            }
        });

        const interval = setInterval(() => machine.tick(transport, audioCtx), 10);

        this.dispose = async () => {
            clearInterval(interval);
            disposeTransport();
            await machine.adapter.dispose();
        };
    }

    getStateKeys(): string[] { return ["pattern", "playing"]; }

    async getState(key: string): Promise<any> {
        if (key === "pattern") {
            // One bitmask per step, row r = bit r.
            return this.pattern.map(rows => rows.reduce((bits, on, r) => on === true ? bits | (1 << r) : bits, 0));
        }
        if (key === "playing") return this.playing;
    }

    async setState(key: string, value: any): Promise<void> {
        if (key === "pattern" && Array.isArray(value)) {
            for (let s = 0; s < MAX_STEPS; s++) {
                const bits = typeof value[s] === "number" ? value[s] : 0;
                for (let r = 0; r < DRUM_ROWS; r++) this.pattern[s][r] = (bits & (1 << r)) !== 0;
            }
            this.paintAll();
        }
        if (key === "playing" && typeof value === "boolean") this.applyPlaying(value);
    }

    dispose!: () => Promise<void>;

    // ── Playback ──────────────────────────────────────────────────────────

    /** Toggles playback from the local button and syncs the state. */
    private setPlaying(playing: boolean): void {
        this.applyPlaying(playing);
        this.context.notifyStateChange("playing");
    }

    private applyPlaying(playing: boolean): void {
        if (playing === this.playing) return;
        this.playing = playing;
        if (playing === true) {
            // Free-run restarts at step 0. Host-synced playback re-anchors.
            this.freeRunBase = this.context.audioCtx.currentTime;
            this.lastPos = 0;
            this.anchored = false;
        }
        this.gui.setPlayState(playing);
    }

    private tick(transport: WamTransportManager, audioCtx: AudioContext): void {
        if (this.playing === false) {
            this.anchored = false;
            if (this.currentColumn !== -1) {
                const old = this.currentColumn;
                this.currentColumn = -1;
                this.paintColumn(old);
            }
            return;
        }

        const stepDur = 60 / transport.getTempo() / 4;
        const loopDur = stepDur * this.patternLength;
        const now = audioCtx.currentTime;

        // Clock source: the host transport when it runs (all nodes share its
        // grid), otherwise a local free-run clock at the host tempo.
        const elapsed = transport.isPlaying === true
            ? transport.getElapsedSeconds()
            : now - this.freeRunBase;
        const pos = elapsed % loopDur;
        this.lastPos = pos;

        if (this.anchored === false) {
            const k = Math.ceil(pos / stepDur - 1e-9);
            this.schedStep = k % this.patternLength;
            this.schedTime = now + (k * stepDur - pos);
            this.anchored = true;
        }

        while (this.schedTime < now + LOOKAHEAD_SEC) {
            if (this.schedTime >= now - 0.02) this.scheduleStep(this.schedStep, this.schedTime, stepDur);
            const wrapped = this.schedStep === this.patternLength - 1;
            this.schedStep = (this.schedStep + 1) % this.patternLength;
            this.schedTime += stepDur;
            if (wrapped === true) this.onLoopWrap();
        }

        // Column highlight follows the audible position, not the scheduler.
        const column = Math.min(this.patternLength - 1, Math.floor(pos / stepDur));
        if (column !== this.currentColumn) {
            const old = this.currentColumn;
            this.currentColumn = column;
            if (old !== -1) this.paintColumn(old);
            this.paintColumn(column);
        }
    }

    private scheduleStep(step: number, time: number, stepDur: number): void {
        let t = time;
        if (step % 2 === 1) t += (this.swing - 0.5) * 2 * stepDur;
        if (step !== 0) t += (Math.random() - 0.5) * 2 * HUMANIZE_SEC;

        const velocity = step % 4 === 0 ? VEL_HIGH : step % 2 === 0 ? VEL_MED : VEL_LOW;
        const now = this.context.audioCtx.currentTime;
        for (let r = 0; r < DRUM_ROWS; r++) {
            if (this.pattern[step][r] === false) continue;
            this.kit.play(r, velocity / 127, t);
            const note = ROW_TO_MIDI[r];
            for (const cn of this.midiOutput.connections) {
                cn.scheduleEvents({ type: "wam-midi", time: t, data: { bytes: [0x90, note, velocity] } });
                cn.scheduleEvents({ type: "wam-midi", time: t + stepDur * 0.9, data: { bytes: [0x80, note, 0] } });
            }
            // Visual pulse at the audible moment.
            const row = r;
            setTimeout(() => this.gui.pulse(row, velocity / 127), Math.max(0, (t - now) * 1000));
        }
    }

    private onLoopWrap(): void {
        if (this.autoVary === true && this.generating === false && this.adapterReady === true) {
            void this.generate();
        }
    }

    // ── Generation ────────────────────────────────────────────────────────

    private async generate(): Promise<void> {
        if (this.adapterReady === false) {
            this.context.showMessage("The AI model is still loading");
            return;
        }
        if (this.generating === true) return;

        this.generating = true;
        this.gui.setGenerateState("busy");
        this.paintAll();
        try {
            const seed: PatternNote[] = [];
            for (let s = 0; s < this.seedSteps; s++) {
                for (let r = 0; r < DRUM_ROWS; r++) {
                    if (this.pattern[s][r] === true) seed.push({ pitch: ROW_TO_MIDI[r], startStep: s, endStep: s + 1 });
                }
            }
            const genSteps = this.patternLength - this.seedSteps;
            const notes = await this.adapter.generatePattern(seed, this.seedSteps, genSteps, this.temperature);

            for (let s = this.seedSteps; s < this.patternLength; s++) {
                for (let r = 0; r < DRUM_ROWS; r++) this.pattern[s][r] = false;
            }
            for (const n of notes) {
                const row = MIDI_TO_ROW.get(n.pitch);
                const s = this.seedSteps + n.startStep;
                if (row !== undefined && s < this.patternLength) this.pattern[s][row] = true;
            }
            this.context.notifyStateChange("pattern");
        } catch (e) {
            console.error("[NeuralDrumMachine] generation failed:", e);
            this.context.showMessage("Beat generation failed");
        } finally {
            this.generating = false;
            this.gui.setGenerateState(this.adapterReady === true ? "ready" : "loading");
            this.paintAll();
        }
    }

    // ── Grid state and painting ───────────────────────────────────────────

    private setCell(step: number, row: number, on: boolean): void {
        this.pattern[step][row] = on;
        this.paintCell(step, row);
    }

    private paintCell(step: number, row: number): void {
        this.gui.paint(
            step, row,
            this.pattern[step][row],
            step < this.seedSteps,
            step === this.currentColumn,
            this.generating === true && step >= this.seedSteps,
        );
    }

    private paintColumn(step: number): void {
        for (let r = 0; r < DRUM_ROWS; r++) this.paintCell(step, r);
    }

    private paintAll(): void {
        for (let s = 0; s < this.patternLength; s++) this.paintColumn(s);
    }

    // ── State ─────────────────────────────────────────────────────────────

    private pattern: boolean[][];
    private patternLength = 16;
    private seedSteps = 4;
    private temperature = 1.1;
    private swing = 0.55;
    private autoVary = false;
    private playing = false;
    private currentColumn = -1;
    private generating = false;
    private adapterReady = false;
    private anchored = false;
    private schedStep = 0;
    private schedTime = 0;
    private freeRunBase = 0;
    private lastPos = 0;
    private adapter: WebWorkerAdapter;
    private kit: Drum808Kit;
    private midiOutput: InstanceType<(typeof MidiN3DConnectable)["ListOutput"]>;
}

export const NeuralDrumMachineN3DFactory: Node3DFactory<NeuralDrumMachineN3DGUI, NeuralDrumMachineN3D> = {
    label: "Neural Drum Machine",
    description: "Paint a seed beat on the grid and let the DrumsRNN neural network complete the pattern. Loops in sync with the host transport, through a built-in 808 kit and MIDI output.",
    tags: ["ai", "drums", "midi", "audio", "generator", "sequencer", "pattern"],
    async createGUI(context) { return new NeuralDrumMachineN3DGUI(context); },
    async create(context, gui) { return new NeuralDrumMachineN3D(context, gui); },
};
