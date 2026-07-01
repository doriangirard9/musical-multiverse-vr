import { AbstractMesh, Color3, CreateCylinder, CreateSphere, Observer, Quaternion, Scene, Vector3 } from "@babylonjs/core"
import { SyncManager } from "../../network/sync/SyncManager"
import { N3DConnectableInstance } from "./N3DConnectableInstance"
import { Node3DInstance } from "./Node3DInstance"
import { SyncSerializable } from "../../network/sync/SyncSerializable"
import { Doc } from "yjs"
import { MeshUtils } from "../tools"
import { ShakeBehavior } from "../../behaviours/ShakeBehavior"
import { SceneManager } from "../../app/SceneManager"
import { MenuSystem } from "../../app"
import { EffectProfile, EffectSystem } from "../../visual/effects"
import { Node3DGraph } from "../graph/Node3DGraph"
import { edgeViewOf } from "../graph/Node3DGraphAdapter"
import { MidiAnalyser, MidiSignalSnapshot } from "../../utils/MidiAnalyser"

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

/**
 * Une connection entre deux connectable de deux Node3D.
 * Gère le visuel et la logique des connections.
 */
export class N3DConnectionInstance{

    private static readonly DEBUG_LOG = false;
    private static readonly CENTER_NODE_SIZE_FACTOR = 3;

    private _tube
    private _center: AbstractMesh
    private shake
    private arrow?: AbstractMesh
    public on_dispose = ()=>{}

    constructor(
        private scene: Scene,
        private nodes: SyncManager<Node3DInstance,any>,
        private connections: SyncManager<N3DConnectionInstance,any>,
        private menus: MenuSystem,
    ){
        this._tube = CreateCylinder("connection tube",{
            height: 1,
            diameter: .25*Node3DInstance.CONNECTION_SIZE_MULTIPLIER,
            tessellation: 6
        },this.scene)

        this._center = CreateSphere("connection center node", {
            diameter: .25*Node3DInstance.CONNECTION_SIZE_MULTIPLIER*N3DConnectionInstance.CENTER_NODE_SIZE_FACTOR,
            segments: 10,
        }, this.scene)

        SceneManager.getInstance().getShadowGenerator().addShadowCaster(this._tube, false)

        this.shake = new ShakeBehavior()
        this.shake.shake_threshold = 5
        this._tube.addBehavior(this.shake)
        this.shake.on_shake = (power, counter) => {
            this._tube.visibility = Math.max(0, 1 - power / 12)
            if(counter>10) connections.remove(this)
        }
        this.shake.on_stop = (_, __) => {
            this._tube.visibility = .8
        }
        this.shake.on_pick = () => {
            this._tube.visibility = .8
        }
        this.shake.on_drop = () => {
            this._tube.visibility = 1
        }
        
    }

    // Public API
    /**
     * Connect two connectable by this connections.
     * If this connections already connect two connectable the old connection is closed.
     * If any of the two given connectabe is null, no new connection is created but the old one is closed.
     * @param connectableA 
     * @param connectableB 
     */
    public set(connectableA: N3DConnectableInstance|null, connectableB: N3DConnectableInstance|null){
        if(connectableA && connectableB)this.connect(connectableA,connectableB)
        this.set_states("connectables")
    }

    get inputConnectable(){ return this.cInput }

    get outputConnectable(){ return this.cOutput }

    get isConnecting(){ return this.cOutput!=null && this.cInput!=null }

    get tube(){ return this._tube }

    get guideMesh(){ return this._center }

    public contains(mesh: AbstractMesh): boolean {
        return mesh === this._tube
            || mesh.isDescendantOf(this._tube)
            || mesh === this._center
            || mesh.isDescendantOf(this._center)
    }



    // Connection
    private cOutput = null as N3DConnectableInstance|null
    private cInput = null as N3DConnectableInstance|null
    private observables = [] as Observer<any>[]
    private color = Color3.White().toColor4(1)
    private buildTimeout?: any
    private _effectSystem: EffectSystem | null = null
    private static readonly _graph = new Node3DGraph()
    private connectionObject: any = null
    private _midiAnalyser: MidiAnalyser | null = null
    private _midiTapTarget: object | null = null
    private _midiTapOriginal: ((...args: unknown[]) => unknown) | null = null
    private _midiTapInstalled: ((...args: unknown[]) => unknown) | null = null

    /**
     * Connect la node3D à deux connections. Pas de synchronisation.
     * @param cA 
     * @param cB 
     * @returns 
     */
    private connect(cA: N3DConnectableInstance, cB: N3DConnectableInstance): boolean{
        this.disconnect()

        // Check that the connection is not a self connection
        if(cA==cB){
            this.menus.showMessage("Can't connect a node to itself", "red")
            return false
        }

        // Check that the connection does not already exists
        for(const connection of cA.connections){
            if(connection.cInput == cB || connection.cOutput == cB){
                this.menus.showMessage(`Already connected to ${cB.config.label}`, "red")
                return false
            }
        }

        // Check that the connection don't have the maximum number of connection
        if(cA.connections.size >= (cA.config.max_connections??Number.MAX_SAFE_INTEGER)){
            this.menus.showMessage(`The first connectable already have the maximum number of connection`, "red")
            return false
        }

        if(cB.connections.size >= (cB.config.max_connections??Number.MAX_SAFE_INTEGER)){
            this.menus.showMessage(`The second connectable already have the maximum number of connection`, "red")
            return false
        }
        
        // Check that the connections directions are compatible
        let canConnect = false
        if([cA.config.direction, cB.config.direction].includes("bidirectional")) canConnect = true
        else if(cA.config.direction != cB.config.direction) canConnect = true
        if(!canConnect){
            this.menus.showMessage(`Cannot connect a ${cA.config.direction} port to a ${cB.config.direction} port`, "red")
            return false
        }

        // Check that the connections types are compatibles
        if(cA.config.type != cB.config.type){
            this.menus.showMessage(`Can't connect a ${cA.config.type} to a ${cB.config.type}`, "red")
            return false
        }

        // Get the connectable order
        let [input,output] = (()=>{
            if(cA.config.direction == "input") return [cA, cB]
            else if(cB.config.direction == "input") return [cB, cA]
            else if(cA.config.direction == "output") return [cB, cA]
            else if(cB.config.direction == "output") return [cA, cB]
            else return [cB, cA]
        })()

        // Logical connection
        this.connectionObject = input.config.connectAsInput()
        output.config.connectAsOutput(this.connectionObject)
        
        this.cOutput = output
        this.cInput = input
        
        this.cOutput.connections.add(this)
        this.cInput.connections.add(this)

        this.color = this.cOutput.config.color.toColor4(1)

        // Visual connection
        const inputMesh = input.config.meshes[0]
        const outputMesh = output.config.meshes[0]

        if(![input.config.direction, output.config.direction].includes("bidirectional")){
            this.arrow = CreateCylinder("connection arrow",{
                height: Node3DInstance.CONNECTION_SIZE_MULTIPLIER,
                diameterBottom: .5*Node3DInstance.CONNECTION_SIZE_MULTIPLIER,
                diameterTop: 0,
                tessellation: 6,
            },this.scene)
            SceneManager.getInstance().getShadowGenerator().addShadowCaster(this.arrow, false)
            MeshUtils.setColor(this.arrow, this.color)
        }

        SceneManager.getInstance().getShadowGenerator().addShadowCaster(this._center, false)

        MeshUtils.setColor(this._tube, this.color)
        MeshUtils.setColor(this._center, this.color)

        const connection = this
        function movetube(){
            if(!connection.buildTimeout) connection.buildTimeout = setTimeout(()=>{
                // Some calculations
                const offset = inputMesh.absolutePosition.subtract(outputMesh.absolutePosition)
                const length = offset.length()
                const tubeLength = (length - Node3DInstance.CONNECTION_SIZE_MULTIPLIER)
                offset.normalize()

                const pointA = outputMesh.absolutePosition
                const pointB = connection._tube ? offset.scale(tubeLength).addInPlace(pointA) : inputMesh.absolutePosition
                const pointC = inputMesh.absolutePosition

                const orientation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), offset.normalizeToNew(), new Quaternion())
                
                // Move the tube
                const tubeCenter = pointA.add(pointB).scaleInPlace(.5)
                connection._tube.setAbsolutePosition(tubeCenter)
                connection._tube.rotationQuaternion = orientation
                connection._tube.scaling.set(1,tubeLength,1)
                connection._center.setAbsolutePosition(pointA.add(pointC).scaleInPlace(.5))

                // Move the arrow
                if(connection.arrow){
                    const arrowCenter = pointB.add(pointC).scaleInPlace(.5)
                    connection.arrow.setAbsolutePosition(arrowCenter)
                    connection.arrow.rotationQuaternion = orientation
                }


                connection.buildTimeout = undefined
            },20)
        }
        this.observables.push(
            inputMesh.onAfterWorldMatrixUpdateObservable.add(movetube),
            outputMesh.onAfterWorldMatrixUpdateObservable.add(movetube)
        )
        movetube()

        // MIDI tap. For MIDI cables, hook a passive listener onto the target
        // wamNode's scheduleEvents (which is how every source dispatches MIDI
        // in this codebase) so the cable's MidiAnalyser sees noteOn / noteOff
        // events as they flow. Limitation: multiple incoming MIDI cables
        // landing on the same target will each see all incoming events — they
        // can't be attributed back to a specific source. In practice routings
        // are 1→1 and this reads correctly; complex fan-in just looks "busy".
        this._installMidiTap()

        // Effect creation
        this._createEffectSystem()
        return true
    }

    private _createEffectSystem() {
        this._effectSystem?.dispose()
        this._effectSystem = EffectSystem.forMesh(
            this.scene, this.tube, this.arrow ?? null,
            () => this.color,
            () => this._getConnectionProfilEffect()
        )
        // Pick the signal source by cable protocol. Audio cables read the
        // upstream node's analyser snapshot; MIDI cables read this cable's
        // own MidiAnalyser, reshaped onto the AudioSignal fields so cable
        // effects don't need to special-case the protocol. Falls back to
        // the static silent signal when no live source is available.
        const upstream = this.cOutput?.instance
        const midiAnalyser = this._midiAnalyser
        if (midiAnalyser !== null) {
            this._effectSystem.activate(() => midiSnapshotAsAudioSignal(midiAnalyser.snapshot()))
        } else {
            this._effectSystem.activate(() => upstream?.getAudioSnapshot() ?? STATIC_CABLE_SIGNAL)
        }
    }

    /**
     * Wrap the target wamNode's `scheduleEvents` to feed each MIDI event into
     * the per-cable {@link MidiAnalyser}. The original method is preserved and
     * restored on disconnect so the audio path is never altered.
     */
    private _installMidiTap(): void {
        if (this.cInput === null) return
        const cfg = this.cInput.config as { type?: string|Symbol, wamNode?: unknown }
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
        this._midiAnalyser = analyser
        this._midiTapTarget = target
        this._midiTapOriginal = original
        this._midiTapInstalled = tapped
    }

    /**
     * Remove the MIDI tap if we installed one. Restores the wamNode's original
     * scheduleEvents only if no other code wrapped it in the meantime — if
     * something else stacked on top of ours, we leave it alone to avoid
     * yanking the rug out from under that wrapper.
     */
    private _uninstallMidiTap(): void {
        if (this._midiAnalyser === null) return
        if (this._midiTapTarget !== null && this._midiTapInstalled !== null && this._midiTapOriginal !== null) {
            const target = this._midiTapTarget as { scheduleEvents?: unknown }
            if (target.scheduleEvents === this._midiTapInstalled) {
                target.scheduleEvents = this._midiTapOriginal
            }
        }
        this._midiAnalyser.dispose()
        this._midiAnalyser = null
        this._midiTapTarget = null
        this._midiTapOriginal = null
        this._midiTapInstalled = null
    }

    private _getConnectionProfilEffect() : EffectProfile {
        const bidi = this._isConnectionBidirectional(this.cInput!, this.cOutput!)
        const speed = N3DConnectionInstance._graph.isLive(edgeViewOf(this)) ? LIVE_SPEED : IDLE_SPEED
        return tubeProfile(speed, bidi)
    }

    private _isConnectionBidirectional(input: N3DConnectableInstance, output: N3DConnectableInstance) {
        return input.config.direction === "bidirectional"
            || output.config.direction === "bidirectional"
    }

    private disconnect(){
        const {cOutput,cInput} = this
        if(cOutput && cInput){
            this._uninstallMidiTap()
            this._effectSystem?.dispose()
            this._effectSystem = null
            cInput.config.disconnectAsInput(this.connectionObject)
            cOutput.config.disconnectAsOutput(this.connectionObject)
            cOutput.connections.delete(this)
            cInput.connections.delete(this)
            this.cInput = null
            this.cOutput = null
            this.observables.forEach(it=>it.remove())
            this.arrow?.dispose()
            this.arrow = undefined
            this._center.dispose()
        }
    }


    //// Pulse Visual ////
    private pulseTimeout?: any
    public pulse(strength: number, tone: number){
        if(this.pulseTimeout) clearTimeout(this.pulseTimeout)

        const color = Color3.FromHSV(tone*360, 1-strength, 1).toColor4(1).multiplyInPlace(this.color)
        MeshUtils.setColor(this._tube, color)
        if(this._center) MeshUtils.setColor(this._center, color)

        this.pulseTimeout = setTimeout(()=>{
            MeshUtils.setColor(this._tube, this.color)
            if(this._center) MeshUtils.setColor(this._center, this.color)
        }, 100)
    }


    //// Synchronization ////
    private set_states: (key: string) => void = () => {}
    
    async initSync(_: string, set_state: (key: string) => void) {
        this.set_states = set_state
    }

    disposeSync(): void {
        this.set_states = ()=>{}
    }

    askStates(): void {
        this.set_states("connectables")
    }

    async removeState(_: string) { }

    async setState(key: string, value: SyncSerializable) {
        if(key=="connectables"){
            const {fromId,fromPortId,toId,toPortId} = value as {fromId:string, fromPortId:string, toId:string, toPortId:string}
            
            if (N3DConnectionInstance.DEBUG_LOG) console.log("TRET Wait for node "+fromId)
            const from = await this.nodes.get(fromId) ?? null
            if (N3DConnectionInstance.DEBUG_LOG) console.log(`TRET  ${this.connections.getId(this)}: ${from} -> *`)
            const to = await this.nodes.get(toId) ?? null
            if (N3DConnectionInstance.DEBUG_LOG) console.log(`TRET ${this.connections.getId(this)}: * -> ${to}`)

            const fromConnectable = from?.connectables?.get(fromPortId)
            const toConnectable = to?.connectables?.get(toPortId)
            
            this.disconnect()
            if(fromConnectable && toConnectable) this.connect(fromConnectable,toConnectable)
        }
    }

    async getState(key: string): Promise<SyncSerializable> {
        if(key=="connectables"){
            const fromId = this.cInput==null ? "none" : this.nodes.getId(this.cInput.instance)??null
            const toId = this.cOutput==null ? "none" : this.nodes.getId(this.cOutput.instance)??null
            const fromPortId = this.cInput==null ? "none" : this.cInput.config.id
            const toPortId = this.cOutput==null ? "none" : this.cOutput.config.id
            return {fromId, fromPortId, toId, toPortId}
        }
        else return null
    }

    dispose(){
        this.on_dispose()
        this.disconnect()
        this._tube.dispose()
    }

    remove(){
        this.connections.remove(this)
    }


    static getSyncManager(
        scene: Scene,
        doc: Doc,
        nodes: SyncManager<Node3DInstance, any>,
        messages: MenuSystem,
        onAdd?: (instance:N3DConnectionInstance)=>void,
        onRemove?: (instance:N3DConnectionInstance)=>void,
    ){
        const syncmanager: SyncManager<N3DConnectionInstance,any> = new SyncManager({
            name: "node3d_connections",
            doc,
            async create() { return new N3DConnectionInstance(scene, nodes, syncmanager, messages) },
            async on_add(instance) {
                instance.on_dispose = ()=> syncmanager.remove(instance)
                onAdd?.(instance)
            },
            async on_remove(instance) {
                onRemove?.(instance)
                instance.dispose()
            },
        })
        return syncmanager
    }
}
