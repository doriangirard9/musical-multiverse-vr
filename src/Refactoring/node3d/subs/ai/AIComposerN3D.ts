import { AbstractMesh, Color3, Color4, StandardMaterial, TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI, Serializable } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { MidiLookaheadScheduler } from "../../../ai/scheduler/MidiLookaheadScheduler";
import { MagentaMusicRNNAdapter, MagentaRNNVariant } from "../../../ai/adapters/MagentaMusicRNNAdapter";
import type { IMusicGeneratorAdapter } from "../../../ai/IMusicGeneratorAdapter";
import type { MidiEvent } from "../../../ai/types";

// ─── AIComposerN3D ───────────────────────────────────────────────────────────
//
//   Encapsule un adapter génératif
//   (melody_rnn) + le MidiLookaheadScheduler, et expose :
//
//     • Sortie MIDI (MidiN3DConnectable.ListOutput) — à câbler vers Pro54.
//       RÉUTILISE le système de connexion natif : le scheduler envoie les
//       événements via scheduleEvents() à tous les WAM câblés en aval, comme
//       le fait le Sequencer.
//
//     • Entrées d'automation (température, densité) — à câbler DEPUIS
//       l'AudioPlaque / la Superformula / des potards.  C'est la synergie :
//       diriger l'IA avec les contrôleurs déjà construits, avant même la
//       capture gestuelle.
//
//     • Potards : tempo, vélocité, horizon (modulations post-gen + réglage
//       du buffer look-ahead).
//
//     • Bouton play/stop.  L'adapter est initialisé paresseusement au premier
//       play (téléchargement du checkpoint ~ qq secondes).
//
//   Mapping des deux latences (cf PFE_JOURNAL, architecture look-ahead) :
//     • température / densité → hyperparamètres → génération FUTURE (bufferisé)
//     • tempo / vélocité      → appliqués au drain du scheduler → immédiats

// Plages des hyperparamètres mappés depuis les entrées d'automation 0..1
const TEMP_RANGE   = { min: 0.1, max: 2.5 };
const DENS_RANGE   = { min: 1.0, max: 8.0 };
// Plages des potards
const TEMPO_RANGE   = { min: 0.25, max: 3.0, default: 1.0 };
const VEL_RANGE     = { min: 0.0,  max: 2.0, default: 1.0 };
const HORIZON_RANGE = { min: 0.1,  max: 2.0, default: 0.5 };

const lerp   = (r: { min: number; max: number }, t: number) => r.min + Math.max(0, Math.min(1, t)) * (r.max - r.min);
const invlerp = (r: { min: number; max: number }, v: number) => (v - r.min) / (r.max - r.min);

// ─── GUI ──────────────────────────────────────────────────────────────────────

export class AIComposerN3DGUI implements Node3DGUI {
    root!: TransformNode;
    get worldSize() { return 1.5; }

    body!: AbstractMesh;        // cible de la bounding box
    midiOut!: AbstractMesh;     // sortie MIDI (sphère verte)
    tempIn!: AbstractMesh;      // entrée automation température (géodésique)
    densIn!: AbstractMesh;      // entrée automation densité
    playBtn!: AbstractMesh;     // bouton play/stop
    playMat!: StandardMaterial; // gardé pour recolorier au play/stop
    tempoKnob!: AbstractMesh;
    velKnob!: AbstractMesh;
    horizonKnob!: AbstractMesh;

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: { ConnectableUtils, MeshUtils, MidiN3DConnectable, AutomationN3DConnectable } } = context;

        this.root = new B.TransformNode("ai_composer_root", context.scene);

        // Corps : boîte centrale (va dans la bounding box)
        this.body = B.CreateBox("ai_composer_body", { width: 1, height: 0.6, depth: 0.5 }, context.scene);
        this.body.parent = this.root;
        this.body.material = context.materialMat;

        // Sortie MIDI — sphère verte, côté droit
        this.midiOut = ConnectableUtils.createOutputMesh("ai_midi_out", 0.16, context.scene);
        this.midiOut.parent = this.root;
        this.midiOut.position.set(0.65, 0, 0);
        MeshUtils.setColor(this.midiOut, MidiN3DConnectable.Color.toColor4());

        // Entrées d'automation — géodésiques, côté gauche
        const autoColor = (() => { const c = AutomationN3DConnectable.Color; return new Color4(c.r, c.g, c.b, 1); })();

        this.tempIn = ConnectableUtils.createInputMesh("ai_temp_in", 0.12, context.scene);
        this.tempIn.parent = this.root;
        this.tempIn.position.set(-0.65, 0.18, 0);
        MeshUtils.setColor(this.tempIn, autoColor);

        this.densIn = ConnectableUtils.createInputMesh("ai_dens_in", 0.12, context.scene);
        this.densIn.parent = this.root;
        this.densIn.position.set(-0.65, -0.18, 0);
        MeshUtils.setColor(this.densIn, autoColor);

        // Bouton play/stop — cylindre disque sur le dessus
        this.playBtn = B.MeshBuilder.CreateCylinder("ai_play_btn", { diameter: 0.22, height: 0.06, tessellation: 24 }, context.scene);
        this.playBtn.rotation.x = Math.PI / 2;
        this.playBtn.parent = this.root;
        this.playBtn.position.set(0, 0.42, 0);
        this.playMat = new StandardMaterial("ai_play_mat", context.scene);
        this.playMat.emissiveColor = new Color3(0.2, 0.7, 0.3);   // vert = prêt à jouer
        this.playMat.disableLighting = true;
        this.playBtn.material = this.playMat;

        // Potards — petites sphères en bas
        const makeKnob = (name: string, x: number, color: Color3): AbstractMesh => {
            const k = B.CreateSphere(name, { diameter: 0.14 }, context.scene);
            k.parent = this.root;
            k.position.set(x, -0.42, 0);
            const m = new StandardMaterial(`${name}_mat`, context.scene);
            m.emissiveColor = color;
            m.disableLighting = true;
            k.material = m;
            return k;
        };
        this.tempoKnob   = makeKnob("ai_tempo_knob",   -0.28, new Color3(1.0, 0.55, 0.1));   // orange
        this.velKnob     = makeKnob("ai_vel_knob",      0.0,  new Color3(1.0, 0.85, 0.2));   // or
        this.horizonKnob = makeKnob("ai_horizon_knob",  0.28, new Color3(0.6, 0.4, 0.95));   // violet
    }

    async dispose() { }
}

// ─── Logic ──────────────────────────────────────────────────────────────────

export class AIComposerN3D implements Node3D {
    private adapter: IMusicGeneratorAdapter;
    private scheduler!: MidiLookaheadScheduler;
    private midiOutput!: InstanceType<(typeof import("../../tools"))["MidiN3DConnectable"]["ListOutput"]>;

    private playing = false;
    private adapterReady = false;
    private initializing = false;

    // Valeurs courantes (synchronisées)
    private tempo = TEMPO_RANGE.default;
    private velocity = VEL_RANGE.default;
    private horizon = HORIZON_RANGE.default;

    constructor(
        private context: Node3DContext,
        private gui: AIComposerN3DGUI,
        private variant: MagentaRNNVariant,
    ) {
        const { tools: T, audioCtx } = context;

        context.addToBoundingBox(gui.body);

        // ── Adapter (pas encore init — lazy au premier play) ──────────────────
        this.adapter = new MagentaMusicRNNAdapter({ variant, primerMaxNotes: 8 });

        // ── Sortie MIDI : ListOutput natif ────────────────────────────────────
        // Le scheduler enverra les événements à tous les WAM câblés en aval.
        this.midiOutput = new T.MidiN3DConnectable.ListOutput(
            "midiOut", [gui.midiOut], "MIDI Output",
        );
        context.createConnectable(this.midiOutput);

        // ── Scheduler : clock = audioCtx, scheduleCallback → connections MIDI ──
        this.scheduler = new MidiLookaheadScheduler(
            this.adapter,
            () => audioCtx.currentTime,
            (ev: MidiEvent, timeSec: number) => this.emitToConnections(ev, timeSec),
            { horizonSec: this.horizon },
        );
        this.scheduler.setTempoScale(this.tempo);
        this.scheduler.setVelocityScale(this.velocity);

        // ── Entrées d'automation : température + densité ──────────────────────
        // setValue(0..1) appelé par l'AudioPlaque/Superformula câblée en amont.
        context.createConnectable(new T.AutomationN3DConnectable.Input(
            "temperature", [gui.tempIn], "Température",
            this.makeAutomationParam("Température", (v01) => {
                try { this.adapter.setHyperparameter("temperature", lerp(TEMP_RANGE, v01)); } catch (_) {}
            }, (v01) => lerp(TEMP_RANGE, v01).toFixed(2)),
        ));
        context.createConnectable(new T.AutomationN3DConnectable.Input(
            "density", [gui.densIn], "Densité",
            this.makeAutomationParam("Densité", (v01) => {
                try { this.adapter.setHyperparameter("density", lerp(DENS_RANGE, v01)); } catch (_) {}
            }, (v01) => lerp(DENS_RANGE, v01).toFixed(1)),
        ));

        // ── Bouton play/stop ──────────────────────────────────────────────────
        context.createButton({
            id: "playStop",
            meshes: [gui.playBtn],
            label: "Play / Stop",
            color: new Color3(0.2, 0.7, 0.3),
            press: () => { void this.togglePlay(); },
            release: () => {},
        });

        // ── Potards : tempo, vélocité, horizon ────────────────────────────────
        this.setupKnob("tempo", "Tempo", gui.tempoKnob, TEMPO_RANGE,
            () => this.tempo, (v) => { this.tempo = v; this.scheduler.setTempoScale(v); });
        this.setupKnob("velocity", "Vélocité", gui.velKnob, VEL_RANGE,
            () => this.velocity, (v) => { this.velocity = v; this.scheduler.setVelocityScale(v); });
        this.setupKnob("horizon", "Horizon", gui.horizonKnob, HORIZON_RANGE,
            () => this.horizon, (v) => { this.horizon = v; this.scheduler.setHorizonSec(v); });

        console.log(`[AIComposer] SPAWNED (variant=${variant})`);
    }

    // ── Envoi des événements aux WAM câblés (réutilise ListOutput.connections) ──
    private emitToConnections(ev: MidiEvent, timeSec: number): void {
        const channel = ev.channel ?? 0;
        let bytes: number[] | null = null;
        if (ev.type === "note-on" && ev.note !== undefined) {
            bytes = [0x90 | channel, ev.note, ev.velocity ?? 80];
        } else if (ev.type === "note-off" && ev.note !== undefined) {
            bytes = [0x80 | channel, ev.note, 0];
        }
        if (!bytes) return;
        for (const cn of this.midiOutput.connections) {
            cn.scheduleEvents({ type: "wam-midi", time: timeSec, data: { bytes } });
        }
    }

    // ── Play/Stop avec init paresseux de l'adapter ────────────────────────────
    private async togglePlay(): Promise<void> {
        if (this.initializing) return;

        if (this.playing) {
            this.scheduler.stop();
            this.playing = false;
            this.gui.playMat.emissiveColor = new Color3(0.2, 0.7, 0.3);   // vert
            console.log("[AIComposer] stop");
            return;
        }

        // Démarrage
        if (!this.adapterReady) {
            this.initializing = true;
            this.gui.playMat.emissiveColor = new Color3(0.9, 0.7, 0.1);   // jaune = chargement
            this.context.showMessage("Chargement du modèle IA…");
            try {
                await this.adapter.init();
                this.adapterReady = true;
                console.log(`[AIComposer] adapter prêt (init ${this.adapter.stats.initTimeMs.toFixed(0)} ms)`);
            } catch (e) {
                console.error("[AIComposer] init échouée:", e);
                this.context.showMessage("Échec du chargement du modèle.");
                this.gui.playMat.emissiveColor = new Color3(0.8, 0.2, 0.2);   // rouge
                this.initializing = false;
                return;
            }
            this.initializing = false;
        }

        this.scheduler.start();
        this.playing = true;
        this.gui.playMat.emissiveColor = new Color3(0.9, 0.2, 0.3);   // rouge = en cours (= stop)
        console.log("[AIComposer] play");
    }

    // ── Helper : objet "parameter" pour AutomationN3DConnectable.Input ────────
    private makeAutomationParam(
        name: string,
        apply: (v01: number) => void,
        stringify: (v01: number) => string,
    ) {
        return {
            setValue: (v: number) => apply(v),
            stringify: (v: number) => `${name}: ${stringify(v)}`,
            getStepCount: () => 0,
            getName: () => name,
            lock: (_isLocked: boolean) => {},
        };
    }

    // ── Helper : potard (Node3DParameter) ─────────────────────────────────────
    private setupKnob(
        id: string, label: string, mesh: AbstractMesh,
        range: { min: number; max: number; default: number },
        getter: () => number, setter: (v: number) => void,
    ): void {
        const updateVisual = () => mesh.scaling.setAll(0.6 + invlerp(range, getter()) * 0.6);
        updateVisual();
        this.context.createParameter({
            id,
            meshes: [mesh],
            getLabel: () => label,
            getStepCount: () => 0,
            getValue: () => invlerp(range, getter()),
            setValue: (v01: number) => {
                setter(range.min + v01 * (range.max - range.min));
                updateVisual();
                this.context.notifyStateChange(id);
            },
            stringify: (v01: number) => `${label}: ${(range.min + v01 * (range.max - range.min)).toFixed(2)}`,
        });
    }

    async dispose() {
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
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export class AIComposerN3DFactory implements Node3DFactory<AIComposerN3DGUI, AIComposerN3D> {
    constructor(
        public variant: MagentaRNNVariant,
        public label: string,
        public description: string,
    ) {}

    tags = ["ai", "generator", "midi", "composer"];

    async createGUI(context: Node3DGUIContext) {
        const gui = new AIComposerN3DGUI();
        await gui.init(context);
        return gui;
    }

    async create(context: Node3DContext, gui: AIComposerN3DGUI) {
        return new AIComposerN3D(context, gui, this.variant);
    }

    static MELODY = new AIComposerN3DFactory(
        "melody_rnn",
        "AI Composer (melody)",
        "Compositeur IA (Magenta melody_rnn). Génère un flux MIDI en continu, " +
        "dirigeable en temps réel. Sortie MIDI à câbler vers un synthé (Pro54). " +
        "Entrées d'automation température/densité à câbler depuis l'AudioPlaque " +
        "ou la Superformula. Potards tempo/vélocité/horizon.",
    );
}
