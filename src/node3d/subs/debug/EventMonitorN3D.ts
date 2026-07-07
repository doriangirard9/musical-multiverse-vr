import { Color3, StandardMaterial } from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import type { WamNode } from "@webaudiomodules/api";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Node3DContext } from "../../Node3DContext";
import { WamTransportManager } from "../../../app/WamTransportManager";
import { createEventMonitorNode } from "./EventMonitorWam";

// ─── Event Monitor ───────────────────────────────────────────────────────────
//
//   In-world event log, after the official "wamEventViewer" example. Wire any
//   MIDI output (sequencers, AI nodes, WAM instruments) to the Event In jack
//   and every WAM event it receives scrolls on the screen: MIDI decoded to
//   note names, transport, automation, sysex/mpe/osc. A separate Auto In jack
//   captures wamjamparty automation streams, which bypass WAM events.
//
//   Both wiring styles of the codebase reach it: ListOutput style nodes call
//   scheduleEvents on the monitor's WamNode directly, and WAM outputs route
//   through connectEvents in the worklet event graph. The base WamProcessor
//   forwards everything back to the main thread as DOM CustomEvents.

const LOG_LINES = 14;
const BUFFER_MAX = 200;
const REDRAW_MS = 80;
const AUTOMATION_THROTTLE_MS = 120;

type Category = "midi" | "transport" | "automation" | "other";
const FILTERS: ("all" | Category)[] = ["all", "midi", "transport", "automation", "other"];

const COLOR_NOTE_ON = "#7ee787";
const COLOR_NOTE_OFF = "#8b949e";
const COLOR_CC = "#e3b341";
const COLOR_TRANSPORT = "#79c0ff";
const COLOR_AUTOMATION = "#ffa657";
const COLOR_OTHER = "#d2a8ff";

interface LogEntry {
    category: Category;
    text: string;
    color: string;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function noteName(n: number): string {
    return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}
function fmtNum(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** Decodes a wam-midi event into a readable line with its color. */
function decodeMidi(bytes: number[]): { text: string; color: string } {
    const [status, d1, d2] = bytes;
    const cmd = status & 0xf0;
    const ch = (status & 0x0f) + 1;
    switch (cmd) {
        case 0x90:
            if (d2 > 0) return { text: `note-on   ${noteName(d1).padEnd(4)} vel ${fmtNum(d2)}  ch${ch}`, color: COLOR_NOTE_ON };
            return { text: `note-off  ${noteName(d1).padEnd(4)} ch${ch}`, color: COLOR_NOTE_OFF };
        case 0x80: return { text: `note-off  ${noteName(d1).padEnd(4)} ch${ch}`, color: COLOR_NOTE_OFF };
        case 0xb0: return { text: `cc ${d1} = ${fmtNum(d2)}  ch${ch}`, color: COLOR_CC };
        case 0xe0: return { text: `pitchbend ${((d2 << 7) | d1) - 8192}  ch${ch}`, color: COLOR_CC };
        case 0xc0: return { text: `program ${d1}  ch${ch}`, color: COLOR_CC };
        case 0xa0: return { text: `aftertouch ${noteName(d1)} ${fmtNum(d2)}  ch${ch}`, color: COLOR_CC };
        default: return { text: `midi [${bytes.map(fmtNum).join(" ")}]`, color: COLOR_CC };
    }
}

class EventMonitorN3DGUI implements Node3DGUI {

    root;
    chassis;
    midiIn; autoIn;
    clearBtn; pauseBtn;
    filterKnob;
    titleText!: GUI.TextBlock;
    lineTexts: GUI.TextBlock[] = [];

    constructor(readonly context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context;
        const scene = context.scene;

        this.root = new B.TransformNode("event monitor root", scene);

        // Chassis and front panel, console style facing -z.
        const chassis = this.chassis = B.CreateBox("evm chassis", { width: 1.3, height: 1.0, depth: 0.3 }, scene);
        chassis.parent = this.root;
        chassis.position.set(0, 0, 0.16);
        chassis.material = context.materialMetal;
        chassis.isPickable = false;

        const panel = B.CreateBox("evm panel", { width: 1.34, height: 1.04, depth: 0.05 }, scene);
        panel.parent = this.root;
        const panelMat = new StandardMaterial("evm panel mat", scene);
        panelMat.diffuseColor = new Color3(0.08, 0.09, 0.11);
        panelMat.specularColor = new Color3(0.2, 0.2, 0.22);
        panel.material = panelMat;
        panel.isPickable = false;

        // Screen: title row plus the scrolling log lines.
        const screen = B.MeshBuilder.CreatePlane("evm screen", { width: 1.22, height: 0.82 }, scene);
        screen.parent = this.root;
        screen.position.set(0, 0.06, -0.032);
        screen.isPickable = false;
        const tex = GUI.AdvancedDynamicTexture.CreateForMesh(screen, 1024, 688);

        const bg = new GUI.Rectangle("evm screen bg");
        bg.background = "#0a0f14";
        bg.color = "#33bb88";
        bg.thickness = 4;
        bg.cornerRadius = 20;
        tex.addControl(bg);

        const stack = new GUI.StackPanel();
        stack.isVertical = true;
        stack.paddingTop = "10px";
        stack.paddingLeft = "24px";
        stack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        bg.addControl(stack);

        const title = this.titleText = new GUI.TextBlock();
        title.fontSize = 40;
        title.fontFamily = "monospace";
        title.fontWeight = "bold";
        title.color = "#33bb88";
        title.height = "56px";
        title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        title.text = "EVENT MONITOR";
        stack.addControl(title);

        for (let i = 0; i < LOG_LINES; i++) {
            const tb = new GUI.TextBlock();
            tb.fontSize = 34;
            tb.fontFamily = "monospace";
            tb.color = COLOR_NOTE_OFF;
            tb.height = "43px";
            tb.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            tb.text = "";
            stack.addControl(tb);
            this.lineTexts.push(tb);
        }

        // Input jacks on the left edge.
        const midiIn = this.midiIn = T.ConnectableUtils.createInputMesh("evm midi in", 0.1, scene);
        T.MeshUtils.setColor(midiIn, T.MidiN3DConnectable.Color.toColor4());
        midiIn.material = context.materialMat;
        midiIn.position.set(-0.73, 0.15, 0);
        midiIn.parent = this.root;

        const autoIn = this.autoIn = T.ConnectableUtils.createInputMesh("evm auto in", 0.08, scene);
        T.MeshUtils.setColor(autoIn, T.AutomationN3DConnectable.Color.toColor4());
        autoIn.material = context.materialMat;
        autoIn.position.set(-0.73, -0.1, 0);
        autoIn.parent = this.root;

        // Clear and pause buttons plus the filter knob, below the screen.
        const button = (name: string, x: number, w: number) => {
            const mesh = B.CreateBox(name, { width: w, height: 0.09, depth: 0.045 }, scene);
            mesh.material = context.materialMat;
            mesh.position.set(x, -0.43, -0.035);
            mesh.parent = this.root;
            return mesh;
        };
        this.clearBtn = button("evm clear", -0.42, 0.24);
        T.MeshUtils.setColor(this.clearBtn, new B.Color4(0.55, 0.2, 0.2, 1));
        this.pauseBtn = button("evm pause", -0.12, 0.24);
        this.setPaused(false);

        const filterKnob = this.filterKnob = B.CreateSphere("evm filter", { diameter: 0.1 }, scene);
        filterKnob.material = context.materialMat;
        T.MeshUtils.setColor(filterKnob, new B.Color4(0.3, 0.6, 0.95, 1));
        filterKnob.position.set(0.3, -0.43, -0.035);
        filterKnob.parent = this.root;
    }

    /** Repaints the log area from the visible entries, newest last. */
    setLines(entries: LogEntry[]): void {
        const start = Math.max(0, entries.length - LOG_LINES);
        for (let i = 0; i < LOG_LINES; i++) {
            const entry = entries[start + i];
            const tb = this.lineTexts[i];
            if (entry === undefined) { tb.text = ""; continue; }
            tb.text = entry.text;
            tb.color = entry.color;
        }
    }

    setTitle(text: string): void {
        this.titleText.text = text;
    }

    setPaused(paused: boolean): void {
        const { babylon: B, tools: T } = this.context;
        const color = paused === true ? new B.Color4(0.85, 0.6, 0.15, 1) : new B.Color4(0.2, 0.5, 0.3, 1);
        T.MeshUtils.setColor(this.pauseBtn, color);
    }

    async dispose(): Promise<void> {
        this.root.dispose();
    }

    get worldSize() { return 4; }
}

class EventMonitorN3D implements Node3D {

    constructor(context: Node3DContext, private gui: EventMonitorN3DGUI, wamNode: WamNode) {
        const { audioCtx, tools: T } = context;
        const monitor = this;

        context.addToBoundingBox(gui.chassis);

        // Keep-alive: an AudioWorkletNode is only processed while it sits on
        // a path to the destination, and the processor is what forwards the
        // queued events back to the main thread. Routed through a muted gain.
        this.silentGain = audioCtx.createGain();
        this.silentGain.gain.value = 0;
        (wamNode as unknown as AudioNode).connect(this.silentGain);
        this.silentGain.connect(audioCtx.destination);

        // Event In: accepts both ListOutput style nodes (scheduleEvents) and
        // WAM outputs (connectEvents through the worklet event graph).
        context.createConnectable(new T.MidiN3DConnectable.Input("eventIn", [gui.midiIn], "Event In", wamNode));

        // Auto In: wamjamparty automation values, throttled to readable rate.
        context.createConnectable(new T.AutomationN3DConnectable.Input("autoIn", [gui.autoIn], "Auto In", {
            setValue: v => monitor.logAutomation(v),
            stringify: v => v.toFixed(2),
            getStepCount: () => 0,
            getName: () => "Monitor",
            lock: () => {},
        }));

        // The seven WAM event types, dispatched by the node as CustomEvents.
        const handler = (e: Event) => monitor.onWamEvent((e as CustomEvent).detail);
        for (const type of EVENT_TYPES) wamNode.addEventListener(type, handler);

        // Transport events reach WAMs through the transport manager.
        const transport = WamTransportManager.getInstance(audioCtx);
        transport.register(wamNode);

        context.createButton({
            id: "evm_clear",
            meshes: [gui.clearBtn],
            label: "Clear log",
            color: new Color3(0.55, 0.2, 0.2),
            press: () => { monitor.entries.length = 0; monitor.dirty = true; },
            release: () => {},
        });
        context.createButton({
            id: "evm_pause",
            meshes: [gui.pauseBtn],
            label: "Pause / Resume log",
            color: new Color3(0.2, 0.5, 0.3),
            press: () => {
                monitor.paused = monitor.paused === false;
                gui.setPaused(monitor.paused);
                monitor.dirty = true;
            },
            release: () => {},
        });
        context.createParameter({
            id: "evm_filter",
            meshes: [gui.filterKnob],
            getLabel: () => "Filter",
            getStepCount: () => FILTERS.length,
            getValue: () => monitor.filterIndex / (FILTERS.length - 1),
            setValue: v => {
                monitor.filterIndex = Math.round(v * (FILTERS.length - 1));
                monitor.dirty = true;
            },
            stringify: v => FILTERS[Math.round(v * (FILTERS.length - 1))],
        });

        const redraw = setInterval(() => monitor.redraw(), REDRAW_MS);
        this.dirty = true;

        this.dispose = async () => {
            clearInterval(redraw);
            for (const type of EVENT_TYPES) wamNode.removeEventListener(type, handler);
            transport.unregister(wamNode);
            this.silentGain.disconnect();
            wamNode.destroy();
        };
    }

    getStateKeys(): string[] { return []; }
    async getState(_key: string): Promise<any> {}
    async setState(_key: string, _value: any): Promise<void> {}

    dispose!: () => Promise<void>;

    // ── Event intake ──────────────────────────────────────────────────────

    private onWamEvent(event: { type: string; data: any }): void {
        this.counts.total++;
        switch (event.type) {
            case "wam-midi":
                this.push("midi", decodeMidi(event.data.bytes ?? []));
                break;
            case "wam-transport": {
                const d = event.data ?? {};
                const state = d.playing === true ? "PLAY" : "STOP";
                this.push("transport", {
                    text: `transport ${state} ${d.tempo ?? "?"} bpm ${d.timeSigNumerator ?? "?"}/${d.timeSigDenominator ?? "?"}`,
                    color: COLOR_TRANSPORT,
                });
                break;
            }
            case "wam-automation": {
                const d = event.data ?? {};
                this.push("automation", { text: `param ${d.id} = ${fmtNum(d.value ?? 0)}`, color: COLOR_AUTOMATION });
                break;
            }
            case "wam-sysex":
                this.push("other", { text: `sysex [${(event.data?.bytes ?? []).length} bytes]`, color: COLOR_OTHER });
                break;
            default: {
                const json = JSON.stringify(event.data ?? {});
                const text = `${event.type.replace("wam-", "")} ${json.length > 34 ? json.slice(0, 34) + "..." : json}`;
                this.push("other", { text, color: COLOR_OTHER });
                break;
            }
        }
    }

    private logAutomation(value: number): void {
        if (value === this.lastAutoValue) return;
        const now = performance.now();
        if (now - this.lastAutoLogMs < AUTOMATION_THROTTLE_MS) return;
        this.lastAutoValue = value;
        this.lastAutoLogMs = now;
        this.counts.total++;
        this.push("automation", { text: `auto in = ${value.toFixed(3)}`, color: COLOR_AUTOMATION });
    }

    private push(category: Category, line: { text: string; color: string }): void {
        if (this.paused === true) return;
        this.entries.push({ category, text: line.text, color: line.color });
        if (this.entries.length > BUFFER_MAX) this.entries.splice(0, this.entries.length - BUFFER_MAX);
        this.dirty = true;
    }

    // ── Rendering ─────────────────────────────────────────────────────────

    private redraw(): void {
        if (this.dirty === false) return;
        this.dirty = false;
        const filter = FILTERS[this.filterIndex];
        const visible = filter === "all" ? this.entries : this.entries.filter(e => e.category === filter);
        this.gui.setLines(visible);
        const pausedTag = this.paused === true ? "  [PAUSED]" : "";
        this.gui.setTitle(`EVENT MONITOR  ${this.counts.total} evts  [${filter}]${pausedTag}`);
    }

    private entries: LogEntry[] = [];
    private counts = { total: 0 };
    private filterIndex = 0;
    private paused = false;
    private dirty = false;
    private lastAutoValue = Number.NaN;
    private lastAutoLogMs = 0;
    private silentGain: GainNode;
}

const EVENT_TYPES = ["wam-automation", "wam-info", "wam-midi", "wam-mpe", "wam-osc", "wam-sysex", "wam-transport"] as const;

export const EventMonitorN3DFactory: Node3DFactory<EventMonitorN3DGUI, EventMonitorN3D> = {
    label: "Event Monitor",
    description: "In-world event log. Wire any MIDI or automation output to it and watch every event scroll by: notes, CCs, transport, automation. The debugging screen of the multiverse.",
    tags: ["midi", "debug", "utility", "monitor"],
    async createGUI(context) { return new EventMonitorN3DGUI(context); },
    async create(context, gui) {
        const wamNode = await createEventMonitorNode(context.groupId, context.audioCtx);
        return new EventMonitorN3D(context, gui, wamNode);
    },
};
