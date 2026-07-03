import { AbstractMesh, Color3, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import type { Node3DContext } from "../../Node3DContext";

// Shared four-button cluster wired onto every instrument: Help (description +
// colour legend), Presets, Mutate (random perturbation), Reset. Everything goes
// through the parameters' setNorm(), so knob visuals and network sync follow for
// free and any value smoothing keeps preset/mutation transitions fluid.

/** A cluster-controllable parameter, in normalized [0,1] space. */
export interface TunableParam {
    name: string;
    min: number;
    max: number;
    getNorm(): number;
    setNorm(v01: number): void;
}

/** A legend row: colour swatch + role. */
export interface LegendEntry {
    swatch: string;
    name: string;
    role: string;
}

export interface InstrumentControlsOpts {
    title: string;
    description: string;
    legend: LegendEntry[];
    /** Presets: name → (param name → REAL value, within the param's range). */
    presets: Record<string, Record<string, number>>;
    /** Preset applied on spawn and by reset. */
    defaultPreset: string;
    params: TunableParam[];
    /** Mutation amount as a fraction of the range. Default 0.18. */
    mutateAmount?: number;
    helpBtn: AbstractMesh;
    presetBtn: AbstractMesh;
    mutateBtn: AbstractMesh;
    resetBtn: AbstractMesh;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ─── Custom (user-saved) presets — persisted per instrument in localStorage ──
//
//   "Save current configuration" captures the live value of every tunable
//   parameter as a named preset, stored under the instrument's title. They show
//   up in the Presets menu (prefixed ★) on this and future sessions on the same
//   device. Per-user / per-device by design (not synced across peers).

type PresetMap = Record<string, Record<string, number>>;

const customKey = (title: string) =>
    `wamjam.presets.${title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;

function loadCustomPresets(title: string): PresetMap {
    try {
        const raw = localStorage.getItem(customKey(title));
        if (raw) return JSON.parse(raw) as PresetMap;
    } catch { /* ignore */ }
    return {};
}

function saveCustomPresets(title: string, presets: PresetMap): void {
    try { localStorage.setItem(customKey(title), JSON.stringify(presets)); } catch { /* ignore */ }
}

export interface InstrumentControls {
    applyPreset(name: string): void;
    mutate(): void;
    reset(): void;
}

export function setupInstrumentControls(
    context: Node3DContext, opts: InstrumentControlsOpts,
): InstrumentControls {
    const byName = new Map(opts.params.map(p => [p.name, p]));
    const amount = opts.mutateAmount ?? 0.18;

    // User-saved presets for this instrument, kept alongside the built-in ones.
    let customPresets = loadCustomPresets(opts.title);

    const applyPreset = (name: string) => {
        const preset = opts.presets[name] ?? customPresets[name];
        if (!preset) return;
        for (const [pname, real] of Object.entries(preset)) {
            const p = byName.get(pname);
            if (p) p.setNorm(clamp01((real - p.min) / (p.max - p.min)));
        }
        context.showMessage(`Preset: ${name}`);
    };

    // Capture the current value of every tunable parameter as a new named preset.
    const saveCurrentAsPreset = () => {
        const snapshot: Record<string, number> = {};
        for (const p of opts.params) snapshot[p.name] = p.min + p.getNorm() * (p.max - p.min);
        let n = 1;
        while (customPresets[`My Preset ${n}`]) n++;
        const name = `My Preset ${n}`;
        customPresets = { ...customPresets, [name]: snapshot };
        saveCustomPresets(opts.title, customPresets);
        context.showMessage(`Saved: ${name}`);
    };

    const clearCustomPresets = () => {
        customPresets = {};
        saveCustomPresets(opts.title, customPresets);
        context.showMessage("Custom presets cleared");
    };

    // Build/refresh the Presets menu: built-in presets, then ★ custom ones,
    // then the save / clear actions. Re-opened after save/clear so changes show.
    const openPresetsMenu = () => {
        const choices: { label: string; click?: () => void }[] = [];
        for (const name of Object.keys(opts.presets)) {
            choices.push({ label: name, click: () => applyPreset(name) });
        }
        for (const name of Object.keys(customPresets)) {
            choices.push({ label: `★ ${name}`, click: () => applyPreset(name) });
        }
        choices.push({ label: "＋ Save current configuration", click: () => { saveCurrentAsPreset(); openPresetsMenu(); } });
        if (Object.keys(customPresets).length > 0) {
            choices.push({ label: "🗑 Delete my presets", click: () => { clearCustomPresets(); openPresetsMenu(); } });
        }
        choices.push({ label: "✖ Close", click: () => context.closeMenu() });
        context.openMenu(choices);
    };

    const mutate = () => {
        for (const p of opts.params) {
            p.setNorm(clamp01(p.getNorm() + (Math.random() * 2 - 1) * amount));
        }
        context.showMessage("🎲 Mutation");
    };

    const reset = () => {
        applyPreset(opts.defaultPreset);
        context.showMessage("↺ Defaults");
    };

    // Help: a scrollable billboard panel with the full description + legend,
    // built lazily on first open and toggled by the "?" button.
    let helpPanel: AbstractMesh | null = null;
    const buildHelpPanel = () => {
        const scene = opts.helpBtn.getScene();
        const panel = MeshBuilder.CreatePlane("ctl_help_panel", { width: 2.0, height: 1.5 }, scene);
        panel.parent = opts.helpBtn.parent;
        panel.position.copyFrom(opts.helpBtn.position);
        panel.position.y += 0.95;
        panel.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
        panel.isPickable = true;   // pickable so the trigger can scroll it

        const tex = GUI.AdvancedDynamicTexture.CreateForMesh(panel, 1024, 768);
        const bg = new GUI.Rectangle();
        bg.background = "#0b0f14";
        bg.alpha = 0.97;
        bg.color = "#2f7d8a";
        bg.thickness = 4;
        bg.cornerRadius = 24;
        tex.addControl(bg);

        const sv = new GUI.ScrollViewer();
        sv.thickness = 0;
        sv.width = "95%";
        sv.height = "92%";
        sv.barSize = 22;
        sv.wheelPrecision = 0.02;
        bg.addControl(sv);

        const stack = new GUI.StackPanel();
        stack.isVertical = true;
        stack.paddingTop = "18px";
        stack.width = "960px";
        sv.addControl(stack);

        const addText = (text: string, size: number, color: string, bold = false) => {
            const tb = new GUI.TextBlock();
            tb.text = text;
            tb.color = color;
            tb.fontSize = size;
            if (bold) tb.fontWeight = "bold";
            tb.textWrapping = true;        // wrap + auto-height so nothing is clipped
            tb.resizeToFit = true;
            tb.width = "940px";
            tb.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            tb.paddingBottom = "12px";
            stack.addControl(tb);
        };
        addText(`◈ ${opts.title}`, 46, "#7fdfff", true);
        addText(opts.description, 30, "#e6f2f7");
        addText("Controls:", 32, "#9fd8e8", true);
        for (const e of opts.legend) addText(`${e.swatch}  ${e.name} — ${e.role}`, 27, "#cfe6ee");

        panel.setEnabled(false);
        helpPanel = panel;
    };

    context.createButton({
        id: "help",
        meshes: [opts.helpBtn],
        label: "Help / ?",
        color: new Color3(0.2, 0.6, 1.0),
        press: () => {
            if (!helpPanel) buildHelpPanel();
            if (helpPanel) helpPanel.setEnabled(!helpPanel.isEnabled());
        },
        release: () => {},
    });

    // Presets
    context.createButton({
        id: "presets",
        meshes: [opts.presetBtn],
        label: "Presets",
        color: new Color3(0.1, 0.75, 0.7),
        press: () => openPresetsMenu(),
        release: () => {},
    });

    // Mutate
    context.createButton({
        id: "mutate",
        meshes: [opts.mutateBtn],
        label: "🎲 Mutate",
        color: new Color3(0.7, 0.4, 1.0),
        press: () => mutate(),
        release: () => {},
    });

    // Reset
    context.createButton({
        id: "reset",
        meshes: [opts.resetBtn],
        label: "↺ Reset",
        color: new Color3(0.6, 0.62, 0.66),
        press: () => reset(),
        release: () => {},
    });

    // Apply the default preset on spawn so the instrument is usable immediately.
    applyPreset(opts.defaultPreset);

    return { applyPreset, mutate, reset };
}

// Builds the four aligned cluster discs (Help blue, Presets teal, Mutate violet,
// Reset grey) and returns their meshes for setupInstrumentControls.

export interface ClusterButtons {
    helpBtn: AbstractMesh;
    presetBtn: AbstractMesh;
    mutateBtn: AbstractMesh;
    resetBtn: AbstractMesh;
}

export function makeClusterButtons(
    B: typeof import("@babylonjs/core"),
    scene: Scene,
    parent: TransformNode,
    origin: { x: number; y: number; z: number },
    step = 0.16,
    diameter = 0.1,
): ClusterButtons {
    const mk = (name: string, i: number, emissive: Color3): AbstractMesh => {
        const m = B.MeshBuilder.CreateCylinder(name, { diameter, height: 0.025, tessellation: 24 }, scene);
        m.rotation.x = Math.PI / 2;
        m.parent = parent;
        m.position.set(origin.x + i * step, origin.y, origin.z);
        const mat = new StandardMaterial(`${name}_mat`, scene);
        mat.emissiveColor = emissive;
        mat.disableLighting = true;
        m.material = mat;
        return m;
    };
    return {
        helpBtn:   mk("ctl_help",   0, new Color3(0.2, 0.6, 1.0)),
        presetBtn: mk("ctl_preset", 1, new Color3(0.1, 0.75, 0.7)),
        mutateBtn: mk("ctl_mutate", 2, new Color3(0.7, 0.4, 1.0)),
        resetBtn:  mk("ctl_reset",  3, new Color3(0.6, 0.62, 0.66)),
    };
}

// Scales output meshes by their current value (smoothed) so active automation
// outputs are visible at a glance.

export class OutputPulser {
    private cur: number[];
    constructor(private meshes: AbstractMesh[], private base = 1) {
        this.cur = meshes.map(() => base);
    }
    /** Call each frame with 0..1 values, in the same order as the meshes. */
    update(values: number[], dt: number): void {
        const k = Math.min(1, dt * 10);
        for (let i = 0; i < this.meshes.length; i++) {
            const target = this.base * (0.8 + 0.5 * clamp01(values[i] ?? 0));
            this.cur[i] += (target - this.cur[i]) * k;
            this.meshes[i].scaling.setAll(this.cur[i]);
        }
    }
}
