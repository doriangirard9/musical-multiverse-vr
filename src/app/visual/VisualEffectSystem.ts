import { Color3 } from "@babylonjs/core"
import { NetworkManager } from "../../network/NetworkManager"
import { InputManager } from "../../xr/inputs"
import { SceneManager } from "../SceneManager"
import { Node3DInstance } from "../../node3d/instance/Node3DInstance";
import { EffectProfile, EffectSystem } from "../../visual/effects";
import { edgeViewOf, nodeViewOf } from "../../node3d/graph/Node3DGraphAdapter";
import { Node3DGraph, NodeView, Role } from "../../node3d/graph/Node3DGraph";
import { AudioAnalyser } from "../../utils/AudioAnalyser";
import { N3DConnectableInstance } from "../../node3d/instance/N3DConnectableInstance";
import { N3DConnectionInstance } from "../../node3d/instance/N3DConnectionInstance";
import { MidiAnalyser, MidiSignalSnapshot } from "../../utils/MidiAnalyser";


export class VisualEffectSystem {

    // Instance
    static _instance?: VisualEffectSystem

    static async initialize(...network: ConstructorParameters<typeof VisualEffectSystem>){
        this._instance = new VisualEffectSystem(...network)
    }

    static getInstance(): VisualEffectSystem {
        if(!this._instance) throw new Error("VisualEffectSystem not initialized. Call initialize() first.")
        return this._instance
    }


    constructor(
        readonly network: NetworkManager,
        readonly inputs: InputManager,
        readonly scene: SceneManager,
        readonly usercolor: Color3,
    ){

    }


    /**
     * Register visuals for a given node.
     * @param node 
     */
    registerNode(node: Node3DInstance){
        const that = this

        // Analyzer node
        const analyser = new AudioAnalyser(node.shared.audioContext)

        let connectables = [] as N3DConnectableInstance[]
        let connecteds = [] as AudioNode[]

        function updateAnalyser(){
            for(const c of connecteds) analyser.untap(c)
            connecteds = []

            const inputs = [] as AudioNode[]
            const outputs = [] as AudioNode[]
            for(const c of connectables){
                if(c.config.direction === 'input') inputs.push(that.getAudioNode(c)!)
                if(c.config.direction === 'output') outputs.push(that.getAudioNode(c)!)
            }

            if(outputs.length > 0){
                for(const output of outputs) analyser.tap(output)
                connecteds = [...outputs]
            }
            else if(inputs.length > 0){
                for(const input of inputs) analyser.tap(input)
                connecteds = [...inputs]
            }
        }

        function registerConnectable(connectable: N3DConnectableInstance){
            connectables.push(connectable)
            connectable.onDispose.add(()=>{
                connectables = connectables.filter(c => c !== connectable)
                updateAnalyser()
            })
            updateAnalyser()
        }
        connectables = [...node.connectables.values()]
        updateAnalyser()
        node.onConnectableCreated.add(registerConnectable)

        // Effects
        const view = nodeViewOf(node)

        const graph = new Node3DGraph()

        const effects = EffectSystem.forMesh(
            node.enclosingBox.getScene(), node.enclosingBox, null,
            () => Color3.White().toColor4(1),
            () => this._currentNodeProfile(graph, view),
        )

        effects.activate(() => analyser.snapshot())

        node.onDispose.add(()=>{
            connectables = []
            updateAnalyser()
            effects.dispose()
            analyser.dispose()
        })

        for(const connection of node.connections.values()){
            if(connection.inputConnectable!.instance===node) this.registerConnection(graph, analyser, connection)
        }
        node.onConnectionCreated.add((connection)=>{
            if(connection.inputConnectable!.instance===node) this.registerConnection(graph, analyser, connection)
        })

    }

    /** Register a connection for visual effects. */
    registerConnection(
        graph: Node3DGraph,
        outputAnalyser: AudioAnalyser,
        connection: N3DConnectionInstance,
    ){
        const that = this

        // Analyser nod
        let midiAnalyser: MidiAnalyser | null = null
        let midiTapTarget: object | null = null
        let midiTapOriginal: unknown | null = null
        let midiTapInstalled: unknown | null = null
        ;(()=>{
            const cfg = connection.inputConnectable?.config as { type?: string|Symbol, wamNode?: unknown }
            if (cfg.type !== 'midi') return
            const target = cfg.wamNode as { scheduleEvents?: (...args: unknown[]) => unknown } | undefined
            if (target === undefined || typeof target.scheduleEvents !== 'function') return

            const analyser = new MidiAnalyser()
            const original = target.scheduleEvents.bind(target)
            const tapped = (...args: unknown[]) => {
                // capture before delegating so a downstream throw doesn't suppress visuals
                for (const a of args) analyser.capture(a)
                return original(...args)
            }
            target.scheduleEvents = tapped

            midiAnalyser = analyser
            midiTapTarget = target
            midiTapOriginal = original
            midiTapInstalled = tapped
        })()


        // Effects
        function getProfile(){
            const isBidirectionnal = connection.inputConnectable!.config.direction === "bidirectional" &&
            connection.outputConnectable!.config.direction === "bidirectional"
            const speed = graph.isLive(edgeViewOf(connection)) ? LIVE_SPEED : IDLE_SPEED
            return tubeProfile(speed, isBidirectionnal)
        }

        const effects = EffectSystem.forMesh(
            connection.inputConnectable?.instance.enclosingBox.getScene()!, connection.tube, connection.arrow ?? null,
            () => connection.color,
            () => getProfile()
        )

        if (midiAnalyser) {
            effects.activate(() => midiSnapshotAsAudioSignal(midiAnalyser!.snapshot()))
        } else {
            effects.activate(() => outputAnalyser.snapshot() ?? STATIC_CABLE_SIGNAL)
        }

        connection.onDispose.add(()=>{
            if (!midiAnalyser) return
            if (midiTapTarget && midiTapInstalled && midiTapOriginal) {
                const target = midiTapTarget as { scheduleEvents?: unknown }
                if (target.scheduleEvents === midiTapInstalled) {
                    target.scheduleEvents = midiTapOriginal
                }
            }
            midiAnalyser.dispose()
        })
    }

    private getAudioNode(connectable: N3DConnectableInstance): AudioNode | null {
        const c = connectable

        const cfg = c.config as { type: string | Symbol, direction: string, audioNode?: unknown }
        if (cfg.type !== 'audio') return null
        const node = cfg.audioNode
        if ((node instanceof AudioNode) === false) return null
        return node
    }

    /**
     * Profile selection per frame. Role + graph-validity decide whether this
     * node plays its full character (in a valid source→sink chain) or sits
     * muted (orphan / standalone). Shake-warning is handled separately by
     * the red bounding box mesh, so no flag here.
     */
    private _currentNodeProfile(graph: Node3DGraph, view: NodeView): EffectProfile {
        return this.profileForNode(graph.roleOf(view), graph.inValidPath(view))
    }

    /**
     * Pick the per-node visual profile from graph state + role. Invalid path →
     * muted (dormant); valid path → role-based character.
     */
    private profileForNode(role: Role, inValidPath: boolean): EffectProfile {
        if (!inValidPath) return MUTED_NODE_PROFILE
        switch (role) {
            case 'source':     return SOURCE_NODE_PROFILE
            case 'sink':       return SINK_NODE_PROFILE
            case 'effect':     return EFFECT_NODE_PROFILE
            case 'visualizer': return VIZ_NODE_PROFILE
            default:           return MUTED_NODE_PROFILE
        }
    }

}


// ---------------------------------------------------------------------------
// Per-node visual profiles. Driven by graph state (inValidPath) + role
// inferred from connectables. Each profile is a (id, effects) bundle handed
// to EffectSystem; effects layer continuous breathing (corona) with
// event-driven punches (spark, wave) so silence shows nothing and loud
// passages show plenty.
// ---------------------------------------------------------------------------

/**
 * Source node: small breathing corona whose color tracks the live spectrum.
 * No sparks here — generator-type sources (NoteBox, Oscillator, sequencers)
 * tend to read as "always busy" when the spark trigger fires on any flux,
 * so the visual would be permanent noise rather than a meaningful accent.
 */
const SOURCE_NODE_PROFILE: EffectProfile = {
    id: 'node_source',
    effects: {
        audio_corona: {
            radiusSource: 'strength',
            baseRadius: 0.35,
            peakRadius: 0.65,
            thickness: 0.035,
            colorMode: 'spectrum',
            spectrumGain: 2.6,
            spectrumBassGain: 1.3,
            spectrumMidGain: 1.4,
            spectrumTrebleGain: 1.8,
            brightness: 1.0,
            brightnessSource: 'strength',
            floorBrightness: 0.0,
            peakBrightness: 0.7,
            secondary: false,
            smoothing: 100,
        },
    },
}

/**
 * Sink node: full visual presence.
 * - audio_corona: continuously-modulated halo whose color comes from the
 *   live spectrum (R=bass, G=mid, B=treble). Sustained presence that *is*
 *   the harmonic content.
 * - audio_scale: bounding box (and the GLB inside it) rides the kick (bass).
 * - audio_spark: spectrum-colored particle bursts on flux onsets.
 * - audio_wave: rare high-threshold ring explosions, per-ring spectrum-colored.
 */
const SINK_NODE_PROFILE: EffectProfile = {
    id: 'node_sink',
    effects: {
        audio_corona: {
            radiusSource: 'strength',
            baseRadius: 0.45,
            peakRadius: 0.95,
            thickness: 0.045,
            colorMode: 'spectrum',
            spectrumGain: 2.8,
            spectrumBassGain: 1.2,
            spectrumMidGain: 1.6,
            spectrumTrebleGain: 2.4,
            spectrumFloor: 0.04,
            brightness: 1.3,
            brightnessSource: 'strength',
            floorBrightness: 0.0,
            peakBrightness: 0.95,
            secondary: true,
            secondaryScale: 0.6,
            smoothing: 90,
        },
        audio_scale: {
            source: 'bass',
            baseScale: 1,
            peakScale: 1.4,
            attack: 25,
            release: 240,
            threshold: 0.02,
            autoNormalize: true,
            peakHalfLife: 1800,
            response: 'linear',
        },
        audio_spark: {
            triggerSource: 'flux',
            triggerThreshold: 0.28,
            refractory: 80,
            burstCount: 18,
            capacity: 140,
            minSize: 0.045,
            maxSize: 0.11,
            minLifeTime: 0.35,
            maxLifeTime: 0.8,
            emitPower: 2.0,
            emitRadius: 0.18,
            colorMode: 'spectrum',
            spectrumGain: 3.2,
            spectrumBassGain: 1.0,
            spectrumMidGain: 1.5,
            spectrumTrebleGain: 2.2,
            brightness: 1.4,
        },
        audio_wave: {
            source: 'flux',
            lifetime: 1800,
            startDiameter: 0.35,
            endDiameter: 3.2,
            thickness: 0.05,
            threshold: 0.55,
            sensitivity: 2.0,
            refractory: 700,
            envelopeHalfLife: 800,
            maxRings: 6,
            colorMode: 'spectrum',
            spectrumGain: 3.0,
            spectrumBassGain: 1.2,
            spectrumMidGain: 1.5,
            spectrumTrebleGain: 2.2,
            brightness: 1.2,
            thicknessSource: 'bass',
            thicknessReactivity: 2.2,
        },
    },
}

/** Visualizer node: silent, lets the visualizer GUI itself carry the visuals. */
const VIZ_NODE_PROFILE: EffectProfile = {
    id: 'node_viz',
    effects: {},
}

/**
 * Mid-chain effect node: no per-node visuals. Cable visuals already convey
 * what's flowing through; piling sparks on every intermediate node clutters
 * the chain.
 */
const EFFECT_NODE_PROFILE: EffectProfile = {
    id: 'node_effect',
    effects: {},
}

/** Orphan / standalone: no effects. */
const MUTED_NODE_PROFILE: EffectProfile = {
    id: 'node_muted',
    effects: {},
}

const IDLE_SPEED = 600
const LIVE_SPEED = 250

/** Fallback signal handed to cable effects when neither analyser is producing data. */
const STATIC_CABLE_SIGNAL = { strength: 0, tone: 0 } as const

/**
 * Map a MIDI snapshot onto the AudioSignal shape so cable effects can read it
 * with their normal feature names. The mappings are deliberate:
 *  - `flux`   ← `onset`   : flux is the cable's universal "trigger" feature;
 *                           MIDI noteOn is the equivalent transient.
 *  - `tone`   ← `pitch`   : `tone` drives default color/height mapping; for
 *                           MIDI we map directly to the played pitch.
 *  - `strength` ← `activity`: number of held notes ≈ "loudness".
 *  - `bass`/`mid`/`treble` are projected from pitch so spectrum-mode colors
 *    pick a band that mirrors the pitch register.
 *  - the native MIDI fields (`onset`, `pitch`, `velocity`, `activity`) are
 *    also kept so effects can opt in by name.
 */
function midiSnapshotAsAudioSignal(midi: MidiSignalSnapshot) {
    const v = midi.velocity > 0 ? midi.velocity : 1
    const lit = midi.onset * v
    // Three-bin pitch projection: low pitch → bass channel, mid → mid, high → treble.
    const bass   = midi.pitch < 0.40 ? lit : 0
    const mid    = midi.pitch >= 0.40 && midi.pitch < 0.70 ? lit : 0
    const treble = midi.pitch >= 0.70 ? lit : 0
    return {
        strength: midi.activity,
        tone:     midi.pitch,
        flux:     midi.onset,
        peak:     midi.onset,
        bass, mid, treble,
        onset:    midi.onset,
        pitch:    midi.pitch,
        velocity: midi.velocity,
        activity: midi.activity,
    }
}

function tubeProfile(speed: number, converging: boolean): EffectProfile {
    return {
        id: `tube_${converging ? 'bidi' : 'fwd'}_${speed}`,
        effects: {
            pbrWave: {
                mode: converging ? 'converging' : 'forward',
                speed,
                waveFreq: 6,
                sharpness: 3,
                floor: 0.20,
                tint: { r: 0.6, g: 0.85, b: 1 },
                metallic: 0.35,
                roughness: 0.55,
                source: 'strength',
                reactivity: 2.5,
                floorBoost: 0.4,
                // Tube tint now sweeps with the spectral centroid — bass-heavy
                // material reads warm, brightness reads cool. The cable
                // visually paints the harmonic content flowing through it.
                tintSource: 'tone',
                hueLow: 30,
                hueHigh: 220,
                // Wave sharpness spikes on transients so the moving peak
                // "snaps" rather than gliding through busy passages.
                sharpnessSource: 'flux',
                sharpnessReactivity: 6,
            },
            cable_note_flow: {
                triggerSource: 'flux',
                triggerThreshold: 0.22,
                refractory: 100,
                maxCount: 14,
                speedSource: 'strength',
                baseSpeed: 0.4,
                reactivity: 1.8,
                smoothing: 110,
                // 12-color chromatic wheel keyed off tone. Notes jump between
                // discrete musical buckets instead of gliding through a
                // gradient — reads as "notes on a scale" rather than a smooth
                // continuum. Pair with `colorMode: 'spectrum'` to switch to
                // RGB = (bass, mid, treble) literal-spectrum coloring.
                colorMode: 'palette',
                paletteSource: 'tone',
                brightness: 1.6,
                heightSource: 'tone',
                heightSpread: 0.22,
                size: 0.12,
            },
        },
    }
}