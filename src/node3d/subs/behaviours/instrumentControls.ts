import { AbstractMesh, Color3, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import type { Node3DContext } from "../../Node3DContext";

// ─── instrumentControls — cluster standard partagé par les instruments ───────
//
//   Câble le même quatuor de boutons sur chaque instrument :
//     ?  (aide)      — ouvre un menu : description + LÉGENDE par couleur
//                      (clic sur une entrée = explication détaillée)
//     ▦  (presets)   — ouvre un menu de configurations nommées
//     🎲 (mutate)    — perturbe aléatoirement la config courante
//     ↺  (reset)     — revient au preset par défaut
//
//   Tout passe par les setNorm() des paramètres — c.-à-d. les MÊMES setters
//   que les potards. Donc les visuels des potards ET la synchro réseau suivent
//   gratuitement, et le lissage éventuel (Superformula / Fluid Field) rend les
//   transitions (preset, mutation) fluides au lieu de sauter.
//
//   Idiome identique d'un instrument à l'autre → apprentissage transférable
//   (feedback prof : « trouver les contrôles, comprendre ce qu'ils font »).

/** Un paramètre pilotable par le cluster, en espace normalisé [0,1]. */
export interface TunableParam {
    name: string;
    min: number;
    max: number;
    getNorm(): number;
    setNorm(v01: number): void;
}

/** Une ligne de la légende d'aide (pastille couleur + rôle). */
export interface LegendEntry {
    swatch: string;   // pastille emoji (🔵 🟢 🟡 …) ou symbole (✋ 🗑)
    name: string;
    role: string;
}

export interface InstrumentControlsOpts {
    title: string;
    description: string;
    legend: LegendEntry[];
    /** Presets : nom → (nom de param → valeur RÉELLE, dans la plage du param). */
    presets: Record<string, Record<string, number>>;
    /** Preset appliqué au spawn et par le reset. */
    defaultPreset: string;
    /** Paramètres pilotables (presets / mutation / reset). */
    params: TunableParam[];
    /** Amplitude de mutation, en fraction de la plage. Défaut 0.18. */
    mutateAmount?: number;
    /** Meshes des 4 boutons du cluster (créés par la GUI via makeClusterButtons). */
    helpBtn: AbstractMesh;
    presetBtn: AbstractMesh;
    mutateBtn: AbstractMesh;
    resetBtn: AbstractMesh;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

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

    const applyPreset = (name: string) => {
        const preset = opts.presets[name];
        if (!preset) return;
        for (const [pname, real] of Object.entries(preset)) {
            const p = byName.get(pname);
            if (p) p.setNorm(clamp01((real - p.min) / (p.max - p.min)));
        }
        context.showMessage(`Preset: ${name}`);
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

    // ── ? : aide → PANNEAU déroulant complet ───────────────────────────────
    // showMessage tronquait les longues descriptions (toast). On affiche plutôt
    // un panneau billboard avec ScrollViewer : la description ENTIÈRE (qui se
    // renvoie à la ligne) + toute la légende, défilable, lisible. Construit
    // paresseusement à la première ouverture, basculé à chaque clic sur « ? ».
    let helpPanel: AbstractMesh | null = null;
    const buildHelpPanel = () => {
        const scene = opts.helpBtn.getScene();
        const panel = MeshBuilder.CreatePlane("ctl_help_panel", { width: 2.0, height: 1.5 }, scene);
        panel.parent = opts.helpBtn.parent;
        panel.position.copyFrom(opts.helpBtn.position);
        panel.position.y += 0.95;
        panel.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
        panel.isPickable = true;   // pour pouvoir faire défiler à la gâchette

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
            tb.textWrapping = true;        // renvoi à la ligne…
            tb.resizeToFit = true;         // …et hauteur auto → rien n'est coupé
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

    // ── ▦ : presets ────────────────────────────────────────────────────────
    context.createButton({
        id: "presets",
        meshes: [opts.presetBtn],
        label: "Presets",
        color: new Color3(0.1, 0.75, 0.7),
        press: () => {
            context.openMenu(Object.keys(opts.presets).map(name => ({
                label: name,
                click: () => applyPreset(name),
            })));
        },
        release: () => {},
    });

    // ── 🎲 : mutation aléatoire ────────────────────────────────────────────
    context.createButton({
        id: "mutate",
        meshes: [opts.mutateBtn],
        label: "🎲 Mutate",
        color: new Color3(0.7, 0.4, 1.0),
        press: () => mutate(),
        release: () => {},
    });

    // ── ↺ : reset ──────────────────────────────────────────────────────────
    context.createButton({
        id: "reset",
        meshes: [opts.resetBtn],
        label: "↺ Reset",
        color: new Color3(0.6, 0.62, 0.66),
        press: () => reset(),
        release: () => {},
    });

    // Spawn sur le preset par défaut → l'instrument est tout de suite agréable.
    applyPreset(opts.defaultPreset);

    return { applyPreset, mutate, reset };
}

// ─── makeClusterButtons — 4 disques alignés, même look partout ────────────────
//
//   Couleurs : ? bleu · presets sarcelle · 🎲 violet · reset gris.
//   `B` = le namespace babylon (context.babylon). Renvoie les 4 meshes à passer
//   à setupInstrumentControls.

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

// ─── OutputPulser — taille des sphères de sortie ∝ valeur courante ────────────
//
//   On voit d'un coup d'œil quelles sorties d'automation sont « vivantes » et
//   à quelle intensité elles émettent (feedback prof : comprendre ce que fait
//   l'instrument). Lissé pour ne pas trembler.

export class OutputPulser {
    private cur: number[];
    constructor(private meshes: AbstractMesh[], private base = 1) {
        this.cur = meshes.map(() => base);
    }
    /** À appeler chaque frame avec les valeurs 0..1 (même ordre que les meshes). */
    update(values: number[], dt: number): void {
        const k = Math.min(1, dt * 10);
        for (let i = 0; i < this.meshes.length; i++) {
            const target = this.base * (0.8 + 0.5 * clamp01(values[i] ?? 0));
            this.cur[i] += (target - this.cur[i]) * k;
            this.meshes[i].scaling.setAll(this.cur[i]);
        }
    }
}
