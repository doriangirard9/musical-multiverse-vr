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

// ─── AIComposerN3D ───────────────────────────────────────────────────────────
//
//   Module "console synthé" : châssis métal + panneau avant face au joueur.
//
//     • Cœur IA lumineux (sphère + anneau orbital) = bouton play/stop.
//       Couleur d'état (vert prêt / ambre chargement / accent en jeu / rouge
//       erreur), pulse à CHAQUE note jouée (synchronisé au temps audio),
//       anneau qui tourne avec l'activité.
//
//     • Écran embarqué (ADT sur le panneau) : nom du modèle, état, valeurs
//       des potards, jauge de buffer look-ahead, compteur de notes,
//       progression du chargement du checkpoint.
//
//     • Potards CYLINDRIQUES rotatifs (encoche + bague colorée), montés sur
//       tiges qui dépassent DEVANT la bounding box pickable (marge +0.1 monde
//       en z) → directement manipulables en VR.  L'host couple chaque potard
//       à un point d'automation sur le même mesh → toujours câblables depuis
//       l'AudioPlaque/Superformula.
//
//     • Sortie MIDI (MidiN3DConnectable.ListOutput) sur le flanc droit.
//
//   GÉOMÉTRIE / BOUNDING BOX — règle apprise à la dure : la BoundingBox
//   pickable enveloppe les meshes addToBoundingBox + une marge (+0.1 monde en
//   profondeur).  Tout élément interactif DOIT en sortir.  Ici seul le châssis
//   (z 0.025..0.375) y va ; les potards sont à z=-0.21 (côté joueur, le spawn
//   oriente -z vers lui), le cœur au-dessus (y=0.80), le MIDI sur le flanc.
//
//   Mapping des deux latences (cf PFE_JOURNAL) :
//     • température / densité (ou morph) → hyperparamètres → génération FUTURE
//     • tempo / vélocité                 → appliqués au drain → immédiats

// Plages des potards post-génération.
// Horizon : 2 s par défaut — l'inférence dans le worker (CPU) prend des
// centaines de ms par chunk ; un horizon de 0.5 s provoquait une famine
// cyclique (buffer vidé pendant l'inférence → ruptures de grille audibles).
// Le prix : les changements d'hyperparamètres mettent ~2 s à s'entendre.
const TEMPO_RANGE   = { min: 0.25, max: 3.0, default: 1.0 };
const VEL_RANGE     = { min: 0.0,  max: 2.0, default: 1.0 };
const HORIZON_RANGE = { min: 0.25, max: 4.0, default: 2.0 };

const invlerp = (r: { min: number; max: number }, v: number) => (v - r.min) / (r.max - r.min);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Couleurs d'état du cœur
const COLOR_READY   = new Color3(0.25, 0.85, 0.45);
const COLOR_LOADING = new Color3(0.95, 0.75, 0.15);
const COLOR_ERROR   = new Color3(0.90, 0.20, 0.20);

type CoreState = "ready" | "loading" | "playing" | "error";

/** Un potard rotatif : cylindre + encoche, bague colorée à la base. */
interface Knob {
    mesh: AbstractMesh;            // le cylindre pickable (createParameter)
    set: (v01: number) => void;    // tourne l'encoche (-135°..+135°)
}

// ─── GUI ──────────────────────────────────────────────────────────────────────

export class AIComposerN3DGUI implements Node3DGUI {
    root!: TransformNode;
    get worldSize() { return 1.5; }

    chassis!: AbstractMesh;     // seule cible de la bounding box (poignée)
    midiOut!: AbstractMesh;

    hypKnobs: Knob[] = [];      // 2 gros potards hyperparamètres (façade)
    tempoKnob!: Knob;           // 3 petits potards post-gen
    velKnob!: Knob;
    horizonKnob!: Knob;

    core!: AbstractMesh;        // cœur IA = bouton play/stop
    coreMat!: StandardMaterial;
    coreHalo!: AbstractMesh;
    coreHaloMat!: StandardMaterial;
    ring!: AbstractMesh;        // anneau orbital autour du cœur

    accent!: Color3;

    // Écran
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

        // ── Châssis (bounding box) — boîtier arrière ──────────────────────────
        this.chassis = B.CreateBox("ai_chassis", { width: 1.2, height: 1.0, depth: 0.35 }, scene);
        this.chassis.parent = this.root;
        this.chassis.position.set(0, 0, 0.2);
        this.chassis.material = context.materialMetal;
        this.chassis.isPickable = false;

        // ── Panneau avant (plaque proud du châssis, face joueur en -z) ────────
        const panel = B.CreateBox("ai_panel", { width: 1.26, height: 1.06, depth: 0.05 }, scene);
        panel.parent = this.root;
        panel.position.set(0, 0, 0);
        const panelMat = new StandardMaterial("ai_panel_mat", scene);
        panelMat.diffuseColor = new Color3(0.10, 0.11, 0.13);
        panelMat.specularColor = new Color3(0.25, 0.25, 0.28);
        panel.material = panelMat;
        panel.isPickable = false;

        // Liserés lumineux accent sur le pourtour du panneau
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

        // ── Écran (haut du panneau) ───────────────────────────────────────────
        // NB : la face avant d'un CreatePlane regarde -z (côté joueur au spawn)
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

        // Dernière ligne : jauge de buffer + compteur de notes
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

        // ── Cœur IA (bouton play/stop) au-dessus du module ────────────────────
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

        // Colonne de support du cœur
        const stem = B.MeshBuilder.CreateCylinder("ai_core_stem", { diameter: 0.05, height: 0.18 }, scene);
        stem.parent = this.root;
        stem.position.set(0, 0.59, 0.08);
        stem.material = context.materialMetal;
        stem.isPickable = false;

        // ── Potards — sur tiges DEVANT la bounding box (z=-0.21 < -0.142) ─────
        const makeKnob = (name: string, pos: Vector3, diameter: number, height: number, ringColor: Color3): Knob => {
            const knobRoot = new B.TransformNode(`${name}_root`, scene);
            knobRoot.parent = this.root;
            knobRoot.position.copyFrom(pos);
            knobRoot.rotation.x = -Math.PI / 2;   // axe du cylindre vers -z (joueur)

            // Tige reliant le panneau au potard
            const stemLen = -pos.z - 0.02;
            const kstem = B.MeshBuilder.CreateCylinder(`${name}_stem`, { diameter: 0.035, height: stemLen }, scene);
            kstem.parent = knobRoot;
            kstem.position.y = -stemLen / 2;
            kstem.material = context.materialMetal;
            kstem.isPickable = false;

            // Corps (pickable — c'est lui le paramètre draggable)
            const body = B.MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: 32 }, scene);
            body.parent = knobRoot;
            const bodyMat = new StandardMaterial(`${name}_mat`, scene);
            bodyMat.diffuseColor = new Color3(0.16, 0.17, 0.20);
            bodyMat.specularColor = new Color3(0.5, 0.5, 0.55);
            body.material = bodyMat;

            // Encoche lumineuse sur la face avant (tourne avec body.rotation.y)
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

            // Bague colorée à la base (code couleur : accent = IA, gris = utilitaire)
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

            // Encoche : valeur 0 → 7h (-135°), valeur 1 → 5h (+135°), sens horaire
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

        // ── Sortie MIDI — flanc droit (hors bounding box en x) ────────────────
        this.midiOut = ConnectableUtils.createOutputMesh("ai_midi_out", 0.16, scene);
        this.midiOut.parent = this.root;
        this.midiOut.position.set(0.76, 0, 0.05);
        MeshUtils.setColor(this.midiOut, MidiN3DConnectable.Color.toColor4());
    }

    // ── Setters écran (appelés par la logique, throttlés côté logique) ────────
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

    // État visuel
    private coreState: CoreState = "ready";
    private corePulse = 0;          // décroît exponentiellement, bump par note
    private loadProgress = 0;
    private noteOnsSent = 0;        // diagnostic d'émission MIDI

    // Valeurs courantes des potards post-gen (synchronisées)
    private tempo = TEMPO_RANGE.default;
    private velocity = VEL_RANGE.default;
    private horizon = HORIZON_RANGE.default;

    // Hyperparamètres (2 premiers du modèle)
    private hypSpecs: HyperparamSpec[] = [];
    private hypValues: Record<string, number> = {};

    // Visuels des potards par id (pour resynchroniser après setState réseau)
    private knobVisuals = new Map<string, () => void>();

    constructor(
        private context: Node3DContext,
        private gui: AIComposerN3DGUI,
        private modelType: WorkerModelType,
        private variant: MagentaRNNVariant,
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
        this.scheduler.setTempoScale(this.tempo);
        this.scheduler.setVelocityScale(this.velocity);

        this.perf = new PerfMonitor(scene, this.scheduler, this.adapter);

        // ── Potards hyperparamètres : les 2 PREMIERS du modèle ────────────────
        // RNN → température + densité ; VAE → température + morph.  Le mesh est
        // aussi couplé à un point d'automation par l'host → câblable.
        this.hypSpecs = this.adapter.capabilities.hyperparameters.slice(0, 2);
        this.hypSpecs.forEach((spec, i) => {
            this.hypValues[spec.name] = spec.default;
            const range = { min: spec.min, max: spec.max, default: spec.default };
            this.setupKnob(
                spec.name, spec.displayName, gui.hypKnobs[i], range,
                () => this.hypValues[spec.name],
                (v) => {
                    this.hypValues[spec.name] = v;
                    // Mis en cache même avant init() (poussé au worker à l'init)
                    try { this.adapter.setHyperparameter(spec.name, v); } catch (_) {}
                },
            );
        });

        // ── Cœur = bouton play/stop ───────────────────────────────────────────
        context.createButton({
            id: "playStop",
            meshes: [gui.core],
            label: "Play / Stop",
            color: gui.accent,
            press: () => { void this.togglePlay(); },
            release: () => {},
        });

        // ── Potards post-gen ──────────────────────────────────────────────────
        this.setupKnob("tempo", "Tempo", gui.tempoKnob, TEMPO_RANGE,
            () => this.tempo, (v) => { this.tempo = v; this.scheduler.setTempoScale(v); }, true);
        this.setupKnob("velocity", "Vélocité", gui.velKnob, VEL_RANGE,
            () => this.velocity, (v) => { this.velocity = v; this.scheduler.setVelocityScale(v); }, true);
        this.setupKnob("horizon", "Horizon", gui.horizonKnob, HORIZON_RANGE,
            () => this.horizon, (v) => { this.horizon = v; this.scheduler.setHorizonSec(v); }, true);

        this.refreshValues();
        this.gui.setStatus("Prêt — touche le cœur");

        // ── Boucle de feedback (pulse, anneau, halo, écran throttlé) ──────────
        const targetColor = new Color3();
        let screenTimer = 0;
        context.observe(scene.onBeforeRenderObservable, () => {
            const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
            if (dt <= 0) return;
            const tNow = performance.now() / 1000;

            // Pulse de note (bump à chaque note-on, décroissance exponentielle)
            this.corePulse *= Math.exp(-dt * 5);

            // Respiration lente au repos, pulse énergique en jeu
            const breathe = this.playing
                ? Math.sin(tNow * Math.PI * 2.2) * 0.02
                : Math.sin(tNow * Math.PI * 0.8) * 0.04;
            gui.core.scaling.setAll(1 + breathe + this.corePulse * 0.35);
            gui.coreHalo.scaling.setAll(1 + breathe + this.corePulse * 0.55);
            gui.coreHaloMat.alpha = 0.10 + this.corePulse * 0.30;

            // Couleur du cœur selon l'état (transition douce)
            switch (this.coreState) {
                case "ready":   targetColor.copyFrom(COLOR_READY);   break;
                case "loading": targetColor.copyFrom(COLOR_LOADING); break;
                case "error":   targetColor.copyFrom(COLOR_ERROR);   break;
                case "playing": targetColor.copyFrom(gui.accent);    break;
            }
            Color3.LerpToRef(gui.coreMat.emissiveColor, targetColor, Math.min(1, dt * 8), gui.coreMat.emissiveColor);
            gui.coreHaloMat.emissiveColor.copyFrom(gui.coreMat.emissiveColor);

            // Clignotement du chargement
            if (this.coreState === "loading") {
                const blink = 0.65 + Math.sin(tNow * Math.PI * 4) * 0.35;
                gui.coreMat.emissiveColor.scaleToRef(blink, gui.coreMat.emissiveColor);
            }

            // Anneau orbital : vitesse ∝ activité
            gui.ring.rotation.y += dt * (this.playing ? 1.4 + this.corePulse * 5 : 0.15);

            // Écran (4 Hz suffisent)
            screenTimer += dt;
            if (screenTimer >= 0.25) {
                screenTimer = 0;
                this.refreshScreen();
            }
        });

        console.log(`[AIComposer] SPAWNED (modelType=${modelType}, variant=${variant})`);
    }

    // ── Envoi MIDI + pulse visuel synchronisé au temps audio ──────────────────
    private emitToConnections(ev: MidiEvent, timeSec: number): void {
        const channel = ev.channel ?? 0;
        let bytes: number[] | null = null;
        if (ev.type === "note-on" && ev.note !== undefined) {
            bytes = [0x90 | channel, ev.note, ev.velocity ?? 80];
            // Le scheduler émet ~0.5 s en avance (look-ahead) : on programme le
            // pulse visuel au moment AUDIBLE de la note, pas à l'émission.
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
        // Diagnostic : confirme périodiquement que des événements PARTENT et
        // vers combien de WAMs (si silence côté synthé → problème côté WAM).
        if (ev.type === "note-on") {
            this.noteOnsSent++;
            if (this.noteOnsSent === 1 || this.noteOnsSent % 50 === 0) {
                console.log(`[AIComposer] ${this.noteOnsSent} note-on émis → ${this.midiOutput.connections.length} connexion(s) MIDI`);
            }
        }
    }

    // ── Play/Stop avec init paresseux ─────────────────────────────────────────
    private async togglePlay(): Promise<void> {
        if (this.initializing) return;

        if (this.playing) {
            this.scheduler.stop();
            this.perf.stop();
            this.playing = false;
            this.coreState = "ready";
            this.gui.setStatus("En pause — touche le cœur");
            console.log("[AIComposer] stop");
            return;
        }

        if (!this.adapterReady) {
            this.initializing = true;
            this.coreState = "loading";
            this.loadProgress = 0;
            this.context.showMessage("Chargement du modèle IA (worker)…");
            try {
                await this.adapter.init({
                    progressCallback: (p: number) => { this.loadProgress = p; },
                });
                this.adapterReady = true;
                console.log(`[AIComposer] adapter prêt (init ${this.adapter.stats.initTimeMs.toFixed(0)} ms, backend=${this.adapter.backend})`);
            } catch (e) {
                console.error("[AIComposer] init échouée:", e);
                this.context.showMessage("Échec du chargement du modèle.");
                this.coreState = "error";
                this.gui.setStatus("✖ Échec du chargement");
                this.initializing = false;
                return;
            }
            this.initializing = false;
        }

        this.scheduler.start();
        this.perf.start();
        this.playing = true;
        this.coreState = "playing";

        // Signal coloré dans le monde : "cet instrument démarre"
        const a = this.gui.accent;
        this.context.sendSignal(this.context.getPosition().position, a.r, a.g, a.b);
        console.log("[AIComposer] play");
    }

    // ── Écran : valeurs des potards ───────────────────────────────────────────
    private refreshValues(): void {
        const fmt = (spec: HyperparamSpec, v: number) =>
            (spec.max - spec.min) > 4 ? Math.round(v).toString() : v.toFixed(2);
        const parts = this.hypSpecs.map(spec =>
            `${spec.displayName} ${fmt(spec, this.hypValues[spec.name] ?? spec.default)}`);
        this.gui.setValues(
            parts.join("  ·  "),
            `Tempo ${this.tempo.toFixed(2)}×  ·  Vél ${this.velocity.toFixed(2)}×  ·  Hor ${this.horizon.toFixed(2)} s`,
        );
    }

    // ── Écran : état + jauge buffer + compteur (throttlé à 4 Hz) ──────────────
    private refreshScreen(): void {
        const stats = this.scheduler.stats;
        const nConn = this.midiOutput?.connections.length ?? 0;
        switch (this.coreState) {
            case "loading":
                this.gui.setStatus(`Chargement du modèle… ${Math.round(this.loadProgress * 100)} %`);
                break;
            case "playing": {
                if (nConn === 0) {
                    this.gui.setStatus("⚠ Sortie MIDI non câblée !");
                } else {
                    const late = stats.lateEvents > 0 ? `  ⚠${stats.lateEvents} retard` : "";
                    const resync = stats.gridResyncs > 0 ? `  ↻${stats.gridResyncs}` : "";
                    this.gui.setStatus(`♪ En jeu →${nConn} — buffer ${stats.bufferDepthSec.toFixed(2)} s${late}${resync}`);
                }
                break;
            }
            // ready / error : message posé une fois par togglePlay, pas écrasé
        }
        this.gui.setBuffer(this.playing ? stats.bufferDepthSec / Math.max(this.horizon, 0.01) : 0);
        this.gui.setNotes(`♪ ${stats.notesPlayed}`);
    }

    // ── Helper : potard rotatif (Node3DParameter) ─────────────────────────────
    private setupKnob(
        id: string, label: string, knob: Knob,
        range: { min: number; max: number; default: number },
        getter: () => number, setter: (v: number) => void,
        notifyNodeState = false,
    ): void {
        const updateVisual = () => knob.set(invlerp(range, getter()));
        updateVisual();
        this.knobVisuals.set(id, updateVisual);
        this.context.createParameter({
            id,
            meshes: [knob.mesh],
            getLabel: () => label,
            getStepCount: () => 0,
            getValue: () => invlerp(range, getter()),
            setValue: (v01: number) => {
                setter(range.min + v01 * (range.max - range.min));
                updateVisual();
                if (notifyNodeState) this.context.notifyStateChange(id);
                this.refreshValues();
            },
            stringify: (v01: number) => `${label}: ${(range.min + v01 * (range.max - range.min)).toFixed(2)}`,
        });
    }

    async dispose() {
        this.alive = false;
        this.perf?.stop();
        this.scheduler?.stop();
        await this.adapter?.dispose();
    }

    // ── Sync : tempo / vélocité / horizon ─────────────────────────────────────
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

export class AIComposerN3DFactory implements Node3DFactory<AIComposerN3DGUI, AIComposerN3D> {
    constructor(
        public modelType: WorkerModelType,
        public variant: MagentaRNNVariant,
        public label: string,
        public description: string,
        public accent: Color3,
        public shortLabel: string,
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
        " Sortie MIDI à câbler vers un instrument. Potards rotatifs directement " +
        "manipulables (et câblables en automation) ; écran d'état embarqué ; " +
        "le cœur lumineux = play/stop.";

    static MELODY = new AIComposerN3DFactory(
        "music_rnn", "melody_rnn",
        "AI Composer — Mélodie",
        "Compositeur IA mélodique (Magenta melody_rnn). Flux MIDI monophonique " +
        "tonal et continu, dirigeable en temps réel. À câbler vers un synthé " +
        "(Pro54)." + AIComposerN3DFactory.COMMON_DESC,
        new Color3(0.20, 0.80, 1.00), "MÉLODIE",
    );

    static IMPROV = new AIComposerN3DFactory(
        "music_rnn", "chord_pitches_improv",
        "AI Composer — Impro",
        "Compositeur IA qui improvise une mélodie sur une grille d'accords " +
        "(Magenta ImprovRNN, accord de Do par défaut). À câbler vers un synthé." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(1.00, 0.60, 0.15), "IMPRO",
    );

    static DRUMS = new AIComposerN3DFactory(
        "music_rnn", "drum_kit_rnn",
        "AI Composer — Batterie",
        "Compositeur IA de patterns de batterie (Magenta DrumsRNN, polyphonique, " +
        "canal MIDI 10). À câbler vers une boîte à rythmes / drum kit WAM." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(0.95, 0.30, 0.25), "BATTERIE",
    );

    static BASIC = new AIComposerN3DFactory(
        "music_rnn", "basic_rnn",
        "AI Composer — Mélodie simple",
        "Compositeur IA mélodique basique (Magenta basic_rnn). Variante plus " +
        "neutre que melody_rnn, utile comme point de comparaison." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(0.55, 0.65, 0.90), "BASIQUE",
    );

    static VAE = new AIComposerN3DFactory(
        "music_vae", "melody_rnn",   // variant ignoré pour le VAE
        "AI Composer — Latent (VAE)",
        "Compositeur IA à espace latent (Magenta MusicVAE mel_2bar). Le potard " +
        "MORPH interpole entre deux phrases-ancres → la musique morphe " +
        "continûment. Potards : température + morph." +
        AIComposerN3DFactory.COMMON_DESC,
        new Color3(0.72, 0.42, 1.00), "LATENT VAE",
    );
}
