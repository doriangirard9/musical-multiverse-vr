import { Color3, type AbstractMesh, type DynamicTexture, type Mesh, type TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";
import type { RotativeParameter } from "../tools/gui";
import { TransportSync } from "../../network/TransportSync";

/** Shortest and longest countdown, in seconds */
const MIN_DURATION = 5;
const MAX_DURATION = 600;
/** The duration is set by steps of this many seconds */
const DURATION_STEP = 5;
/** The duration of a new timer, in seconds */
const DEFAULT_DURATION = 60;

/** How often the countdown is checked, in ms */
const TICK_MS = 100;
/** Time constant of the fade when the sound is let through or cut, in seconds: short, but without a click */
const FADE_SECONDS = 0.01;

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;

/**
 * What the timer does to the sound going through it: cut until the countdown reaches 0 then let
 * through, or let through until it reaches 0 then cut.
 */
type TimerMode = "muteUntilZero" | "playUntilZero";

/** Duration in seconds for a knob position between 0 and 1. Squared, so short durations get more room. */
function durationFor(value: number): number {
    const seconds = MIN_DURATION + value * value * (MAX_DURATION - MIN_DURATION);
    return Math.round(seconds / DURATION_STEP) * DURATION_STEP;
}

/** Knob position between 0 and 1 for a duration in seconds, the inverse of {@link durationFor} */
function valueFor(seconds: number): number {
    return Math.sqrt(Math.max(0, (seconds - MIN_DURATION) / (MAX_DURATION - MIN_DURATION)));
}

/** "m:ss" for a number of seconds */
function formatTime(totalSeconds: number): string {
    const seconds = Math.max(0, Math.ceil(totalSeconds));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export class TimerN3DGUI implements Node3DGUI {

    root: TransformNode;
    block: Mesh;
    audioInput: Mesh;
    audioOutput: Mesh;
    duration: RotativeParameter;
    resetButton: Mesh;
    modeButton: Mesh;
    display: DynamicTexture;

    get worldSize() { return 1; }

    constructor(context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context;

        this.root = new B.TransformNode("timer root", scene);

        this.block = B.CreateBox("timer block", { width: 1, depth: 0.6, height: 0.2 }, scene);
        this.block.parent = this.root;
        this.block.position.set(0, -0.4, 0);
        this.block.material = context.materialMat;

        // The remaining time and the mode, on a screen standing on the block
        const screen = B.CreatePlane("timer screen", { width: 0.9, height: 0.45 }, scene);
        screen.parent = this.root;
        screen.position.set(0, 0.05, 0.1);
        this.display = new B.DynamicTexture("timer display", { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT }, scene, false);
        const material = new B.StandardMaterial("timer screen material", scene);
        material.emissiveTexture = this.display;
        material.diffuseColor = B.Color3.Black();
        material.specularColor = B.Color3.Black();
        material.disableLighting = true;
        screen.material = material;
        screen.isPickable = false;

        this.duration = new T.RotativeParameter("timer duration", context);
        this.duration.root.parent = this.root;
        this.duration.root.scaling.setAll(0.3);
        this.duration.root.position.set(-0.3, -0.25, -0.1);

        this.resetButton = B.CreateBox("timer reset", { width: 0.2, depth: 0.2, height: 0.1 }, scene);
        this.resetButton.parent = this.root;
        this.resetButton.position.set(0.05, -0.25, -0.1);
        T.MeshUtils.setColor(this.resetButton, new B.Color4(1, 0.6, 0.2, 1));

        this.modeButton = B.CreateBox("timer mode", { width: 0.2, depth: 0.2, height: 0.1 }, scene);
        this.modeButton.parent = this.root;
        this.modeButton.position.set(0.3, -0.25, -0.1);
        T.MeshUtils.setColor(this.modeButton, new B.Color4(0.3, 0.7, 1, 1));

        this.audioInput = T.ConnectableUtils.createInputMesh("timer audio input", 0.25, scene);
        T.MeshUtils.setColor(this.audioInput, new B.Color4(0, 1, 0, 1));
        this.audioInput.parent = this.root;
        this.audioInput.position.set(-0.65, -0.4, 0);

        this.audioOutput = T.ConnectableUtils.createOutputMesh("timer audio output", 0.25, scene);
        T.MeshUtils.setColor(this.audioOutput, new B.Color4(1, 0, 0, 1));
        this.audioOutput.parent = this.root;
        this.audioOutput.position.set(0.65, -0.4, 0);

        // Painted once here, and not only by TimerN3D: a dynamic texture is not ready until it has been
        // drawn, and the shop thumbnail and the loading impostor build the GUI alone. Undrawn, their
        // render waited for it forever, and so did the loading of every session holding a timer.
        this.paint(formatTime(DEFAULT_DURATION), "muteUntilZero", false);
    }

    /** Paint the remaining time, and the mode below it */
    paint(time: string, mode: TimerMode, open: boolean): void {
        const ctx = this.display.getContext() as CanvasRenderingContext2D;
        ctx.fillStyle = "rgb(10, 12, 18)";
        ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = open ? "#7ee787" : "#ff7b72";
        ctx.font = "bold 120px ui-monospace, Menlo, monospace";
        ctx.fillText(time, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.42);
        ctx.fillStyle = "#cccccc";
        ctx.font = "36px sans-serif";
        ctx.fillText(mode === "muteUntilZero" ? "Muted until 0" : "Plays until 0", TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.82);
        this.display.update(true);
    }

    async dispose() {
        this.duration.dispose();
        this.display.dispose();
    }
}

/**
 * A countdown acting on the sound that goes through it, cutting it until the countdown reaches 0
 * or letting it through until then, as chosen on the module.
 *
 * It counts down while the group in Sync plays, and pauses with it: it runs on the time the group
 * has played (see TransportSync). Its duration (the knob), its mode and its start are shared with
 * everyone and saved with the session; the time played starts again from 0 with every session, so
 * a reloaded timer starts its countdown over.
 */
export class TimerN3D implements Node3D {

    private durationSeconds = DEFAULT_DURATION;
    private mode: TimerMode = "muteUntilZero";
    /** The time played by the group when the countdown was last started over, in ms */
    private startPlayedMs = 0;

    private readonly gate: GainNode;
    private readonly interval: ReturnType<typeof setInterval>;
    private open: boolean | null = null;
    private painted = "";

    constructor(private readonly context: Node3DContext, private readonly gui: TimerN3DGUI) {
        const { tools: T, audioCtx } = context;

        context.addToBoundingBox(gui.block);

        this.gate = audioCtx.createGain();
        context.createConnectable(new T.AudioN3DConnectable.Input("audioInput", [gui.audioInput], "Audio Input", this.gate));
        context.createConnectable(new T.AudioN3DConnectable.Output("audioOutput", [gui.audioOutput], "Audio Output", this.gate));

        gui.duration.setValue(valueFor(this.durationSeconds));
        const that = this;
        context.createParameter({
            id: "duration",
            meshes: gui.duration.meshes as AbstractMesh[],
            getLabel() { return "Duration" },
            getMin() { return 0 },
            getMax() { return 1 },
            getStepSize() { return 0 },
            getExponant() { return 1 },
            getValue() { return valueFor(that.durationSeconds) },
            setValue(value: number) {
                that.durationSeconds = durationFor(value);
                gui.duration.setValue(value);
                that.update();
            },
            stringify(value: number) { return `Duration: ${formatTime(durationFor(value))}` },
        });

        context.createButton({
            id: "reset",
            meshes: [gui.resetButton],
            label: "Restart countdown",
            color: new Color3(1, 0.6, 0.2),
            press: () => {
                this.startPlayedMs = TransportSync.instance?.getPlayedMs() ?? 0;
                context.notifyStateChange("start");
                this.update();
            },
            release: () => { },
        });

        context.createButton({
            id: "mode",
            meshes: [gui.modeButton],
            label: "Switch mode",
            color: new Color3(0.3, 0.7, 1),
            press: () => {
                this.mode = this.mode === "muteUntilZero" ? "playUntilZero" : "muteUntilZero";
                context.notifyStateChange("mode");
                this.update();
            },
            release: () => { },
        });

        this.update();
        this.interval = setInterval(() => this.update(), TICK_MS);
    }

    /** Seconds left before the countdown reaches 0 */
    private remainingSeconds(): number {
        const played = TransportSync.instance?.getPlayedMs() ?? 0;
        // A start later than the time played comes from an earlier session: count from this one's start
        const elapsed = played >= this.startPlayedMs ? played - this.startPlayedMs : played;
        return this.durationSeconds - elapsed / 1000;
    }

    /** Let the sound through or cut it, and refresh the display, from where the countdown stands */
    private update(): void {
        const remaining = this.remainingSeconds();
        const reachedZero = remaining <= 0;
        const open = this.mode === "muteUntilZero" ? reachedZero : !reachedZero;

        if (open !== this.open) {
            this.open = open;
            const now = this.context.audioCtx.currentTime;
            this.gate.gain.cancelScheduledValues(now);
            this.gate.gain.setTargetAtTime(open ? 1 : 0, now, FADE_SECONDS);
        }

        const time = formatTime(remaining);
        const painted = `${time}|${this.mode}|${open}`;
        if (painted !== this.painted) {
            this.painted = painted;
            this.gui.paint(time, this.mode, open);
        }
    }

    async setState(key: string, value: any) {
        if (key === "mode" && (value === "muteUntilZero" || value === "playUntilZero")) this.mode = value;
        if (key === "start" && typeof value === "number") this.startPlayedMs = value;
        this.update();
    }

    async getState(key: string) {
        if (key === "mode") return this.mode;
        if (key === "start") return this.startPlayedMs;
    }

    getStateKeys() { return ["mode", "start"]; }

    async dispose() {
        clearInterval(this.interval);
        this.gate.disconnect();
    }
}

export const TimerN3DFactory: Node3DFactory<TimerN3DGUI, TimerN3D> = {

    label: "Timer",

    description: "A countdown that cuts the sound going through it until it reaches 0, or lets it through until then (mode button). It counts while the group in Sync plays and pauses with it. The knob sets the duration, the orange button starts it over.",

    tags: ["other", "timer", "countdown"],

    createGUI: async (context) => new TimerN3DGUI(context),

    create: async (context, gui) => new TimerN3D(context, gui),

}
