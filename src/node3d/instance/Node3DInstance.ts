import {
    TransformNode,
    AbstractMesh,
    Mesh,
    MeshBuilder,
    Vector3,
    Quaternion, Color3,
    Vector2,
    Observer,
    Observable,
    Color4
} from "@babylonjs/core";
import { Node3DConnectable } from "../Node3DConnectable";
import { Node3DParameter } from "../Node3DParameter";
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import { BoundingBox } from "../../behaviours/boundingBox/BoundingBox";
import { N3DParameterInstance } from "./N3DParameterInstance";
import { N3DConnectableInstance } from "./N3DConnectableInstance";
import { IOEventBus } from "../../eventBus/IOEventBus";
import { XRManager } from "../../xr/XRManager";
import { SyncManager } from "../../network/sync/SyncManager";
import { Node3dManager } from "../../app/Node3dManager";
import { Doc } from "yjs";
import { Synchronized } from "../../network/sync/Synchronized";
import { N3DHighlighter } from "./utils/N3DHighlighter";
import { N3DShared } from "./N3DShared";
import { AutomationN3DConnectable, MeshUtils } from "../tools";
import { SceneManager } from "../../app/SceneManager.ts";
import { InputManager } from "../../xr/inputs/InputManager.ts";
import { BoxWave } from "../../world/BoxWave.ts";
import { MenuSystem } from "../../app/MenuSystem.ts";
import { AbstractMenu } from "../../menus/AbstractMenu.ts";
import { ChoiceMenu } from "../../menus/ChoiceMenu.ts";
import { ShakeBehavior } from "../../behaviours/ShakeBehavior.ts";
import { N3DConnectionInstance } from "./N3DConnectionInstance.ts";
import { N3DButtonInstance } from "./N3DButtonInstance.ts";
import { EffectProfile, EffectSystem } from "../../visual/effects";
import { Node3DGraph, NodeView, Role } from "../graph/Node3DGraph";
import { nodeViewOf } from "../graph/Node3DGraphAdapter";
import { AudioAnalyser, AudioSignalSnapshot } from "../../utils/AudioAnalyser";

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

/**
 * Pick the per-node visual profile from graph state + role. Invalid path →
 * muted (dormant); valid path → role-based character.
 */
function profileForNode(role: Role, inValidPath: boolean): EffectProfile {
    if (!inValidPath) return MUTED_NODE_PROFILE
    switch (role) {
        case 'source':     return SOURCE_NODE_PROFILE
        case 'sink':       return SINK_NODE_PROFILE
        case 'effect':     return EFFECT_NODE_PROFILE
        case 'visualizer': return VIZ_NODE_PROFILE
        default:           return MUTED_NODE_PROFILE
    }
}

export class Node3DInstance implements Synchronized {

    static readonly SIZE_MULTIPLIER = .2
    static readonly CONNECTION_SIZE_MULTIPLIER = .1

    constructor(
        private shared: N3DShared,
        readonly factory: Node3DFactory<Node3DGUI, Node3D>,
    ) { }

    private declare gui: Node3DGUI
    private declare node: Node3D
    readonly parameters = new Map<string, N3DParameterInstance>()
    readonly buttons = new Map<string, N3DButtonInstance>()
    readonly connectables = new Map<string, N3DConnectableInstance>()
    readonly onParameterChanged = new Observable<{ id: string, value: number }>()
    private declare root_transform: TransformNode
    private highlighter!: N3DHighlighter
    private observers = new Set<Observer<any>>()
    public on_dispose = () => { }

    /**
     * Live audio-feature snapshot from the analyser tapped onto this node's
     * primary audio path. Returns null for nodes with no audio connectable
     * (purely structural / control-only nodes). Cheap; safe per frame —
     * cable EffectSystems pull this each tick to colour and time their
     * visuals to what's actually flowing through.
     */
    public getAudioSnapshot(): AudioSignalSnapshot | null {
        return this._audioAnalyser?.snapshot() ?? null
    }

    async instantiate() {
        const { scene, highlightLayer, utilityLayer, babylon, tools } = this.shared

        const instance = this

        const highlighter = this.highlighter = new N3DHighlighter(highlightLayer)
        const menus = MenuSystem.getInstance()
        let lastMenu: AbstractMenu|null = null

        // GUI related things
        const root_transform = this.root_transform = new TransformNode("node3d root", scene)

        const gui_root_transform = new TransformNode("node3d gui root", scene)

        this.gui = await this.factory.createGUI({
            babylon, tools, scene,

            materialLight: this.shared.materialLight,
            materialTransparent: this.shared.materialTransparent,
            materialMat: this.shared.materialMat,
            materialMetal: this.shared.materialMetal,
            materialShiny: this.shared.materialShiny,

            highlight: (...p) => highlighter.highlight(...p),
            unhighlight: (...p) => highlighter.unhighlight(...p)
        })

        gui_root_transform.parent = root_transform
        this.gui.root.parent = gui_root_transform
        gui_root_transform.scaling.setAll(this.gui.worldSize * Node3DInstance.SIZE_MULTIPLIER)


        // Node related things
        // TODO: Better exception handling
        try{
            this.node = await this.factory.create({
                audioCtx: this.shared.audioContext,
                audioEngine: this.shared.audioEngine,
                groupId: this.shared.groupId,
                tools,
                inputs: InputManager.getInstance(),

                // Le nom du wam
                setLabel(label: string) {
                    root_transform.name = `${label} root`
                },

                // Les paramètres draggables
                createParameter(info: Node3DParameter) {
                    const param = new N3DParameterInstance(instance, instance.root_transform, highlightLayer, utilityLayer, info)
                    instance.parameters.set(info.id, param)
                    let last_value = 0
                    const connectableinfo = new AutomationN3DConnectable.Input(
                        `${info.id}_connectable`,
                        info.meshes,
                        "",
                        {
                            getName() { return info.getLabel() },
                            getStepCount() { return info.getStepCount() },
                            stringify(value) { return info.stringify(value) },
                            setValue(value) { 
                                param.setValueAutomated(value)
                                last_value = value
                            },
                            lock(isLocked) {
                                if(!isLocked) param.setValue(last_value)
                                param.isLocked = isLocked
                            },
                        },
                    )
                    const connectable = new N3DConnectableInstance(instance, connectableinfo, highlightLayer, utilityLayer, IOEventBus.getInstance(), true, false)
                    instance.connectables.set(connectableinfo.id, connectable)
                },
                removeParameter(id: Node3DParameter["id"]) {
                    instance.parameters.get(id)?.dispose()
                    instance.parameters.delete(id)
                    instance.connectables.get(`${id}_connectable`)?.dispose()
                },

                // Les outputs et inputs que l'on peut connecter
                createConnectable(info: Node3DConnectable) {
                    const connectable = new N3DConnectableInstance(instance, info, highlightLayer, utilityLayer, IOEventBus.getInstance())
                    instance.connectables.set(info.id, connectable)
                },
                removeConnectable(id: Node3DConnectable["id"]) {
                    instance.connectables.get(id)?.dispose()
                    instance.connectables.delete(id)
                },

                createButton(info) {
                    const button = new N3DButtonInstance(instance, instance.root_transform, highlightLayer, utilityLayer, info)
                    instance.buttons.set(info.id, button)
                },
                removeButton(id) {
                    instance.buttons.get(id)?.dispose()
                    instance.buttons.delete(id)
                },

                // Les mesh qui font partis de la bounding box
                // En attendant la bounding box est une boite qui les englobes
                addToBoundingBox(mesh: AbstractMesh) {
                    instance.boxes.push(mesh)

                    instance.updateBoundingBox()
                },
                removeFromBoundingBox(mesh: AbstractMesh) {
                    const idx = instance.boxes.indexOf(mesh)
                    if (idx >= 0) instance.boxes.splice(idx, 1)
                    instance.updateBoundingBox()
                },

                // Afficher un menu ou un message
                openMenu(choices: { label: string; color?: string, click?: () => void; }[]) {
                    if(lastMenu && lastMenu instanceof ChoiceMenu && lastMenu===menus.current_menu){
                        lastMenu.set(choices)
                    }
                    else{
                        const new_menu = new ChoiceMenu(scene, utilityLayer.utilityLayerScene, choices)
                        lastMenu = new_menu
                        lastMenu.onHide.addOnce(() => lastMenu = null)
                        menus.open(new_menu, true)
                    }
                },
                closeMenu() {
                    if(menus.current_menu==lastMenu) menus.close()
                },
                showMessage(message: string) {
                    menus.showMessage(message)
                },
                sendSignal(position, red, green, blue) {
                    SceneManager.getInstance().getWaveGround().putWorldSpace(position, red, green, blue)
                    SceneManager.getInstance().getSoundwaveEmitter().spawn(new Vector2(position.x, position.z), new Color3(red, green, blue))
                    new BoxWave(
                        instance.boundingBoxMesh,
                        new Color3(red, green, blue).toColor4(1),
                        1
                    )
                },

                getPlayerPosition() {
                    const xrManager = XRManager.getInstance();
                    if (xrManager.xrHelper && xrManager.xrHelper.baseExperience) {
                        const vrCamera = xrManager.xrHelper.baseExperience.camera;
                        return { position: vrCamera.globalPosition.clone(), rotation: vrCamera.absoluteRotation.clone() }
                    }
                    else return { position: Vector3.Zero(), rotation: Quaternion.Identity() }
                },

                getPosition() {
                    return { position: instance.root_transform.absolutePosition.clone(), rotation: instance.root_transform.absoluteRotationQuaternion.clone() }
                },

                delete() {
                    instance.dispose()
                },

                notifyStateChange(key: string) {
                    instance.set_state(key)
                },

                observe(observable, observer) {
                    const o = observable.add(observer)
                    instance.observers.add(o)
                    return o 
                },

            }, this.gui)
        }catch(e){
            this.gui.dispose()
            gui_root_transform.dispose()
            root_transform.dispose()
            return
        }

        // Audio reactivity: tap an analyser onto whichever audio connectable
        // best represents this node (output for sources, input for sinks).
        //
        // updateBoundingBoxNow already ran during factory.create() (via
        // addToBoundingBox), constructing the EffectSystem and activating it
        // with a static signal. Now that the connectables exist and we can
        // attach an analyser, re-activate with the live snapshot provider so
        // every effect (and every downstream cable) sees real audio data.
        const audioNode = this.findAudioNodeToMonitor()
        if (audioNode !== null) {
            const analyser = new AudioAnalyser(this.shared.audioContext)
            this._audioAnalyser = analyser
            analyser.tap(audioNode)
            this._nodeEffect?.activate(() => analyser.snapshot())
        }
    }

    /**
     * Pick the audio connectable to monitor: output side for sources, input
     * side for sinks. Effects with both pick output (lets cables downstream
     * see the processed signal).
     */
    private findAudioNodeToMonitor(): AudioNode | null {
        let outputAudio: AudioNode | null = null
        let inputAudio: AudioNode | null = null
        for (const c of this.connectables.values()) {
            const cfg = c.config as { type: string | Symbol, direction: string, audioNode?: unknown }
            if (cfg.type !== 'audio') continue
            const node = cfg.audioNode
            if ((node instanceof AudioNode) === false) continue
            if (cfg.direction === 'output' && outputAudio === null) outputAudio = node as AudioNode
            else if (cfg.direction === 'input' && inputAudio === null) inputAudio = node as AudioNode
        }
        return outputAudio ?? inputAudio
    }

    //// BOUNDING BOX ////
    private boxes = [] as AbstractMesh[]
    private bounding_mesh = null as null | Mesh
    private red_bounding_mesh = null as null | Mesh
    private bounding_box = null as null | BoundingBox
    private doUpdateBoundingBox = false
    private shake: ShakeBehavior|null = null
    private _nodeEffect: EffectSystem | null = null
    private _audioAnalyser: AudioAnalyser | null = null
    private static readonly _graph = new Node3DGraph()

    get boundingBoxMesh() { return this.bounding_box!!.boundingBox }

    private updateBoundingBoxNow() {
        if (this.disposed) return

        // The bounding mesh gets recreated; the effect attached to it must too.
        this._nodeEffect?.dispose()
        this._nodeEffect = null

        if (this.bounding_mesh) this.shared.shadowGenerator.removeShadowCaster(this.bounding_mesh)
        this.bounding_box?.dispose()
        this.bounding_mesh?.dispose()
        this.red_bounding_mesh?.dispose()


        // Update bounds shape
        const bounds = this.boxes
            .map(it => it.getHierarchyBoundingVectors(true))
            .reduce((a, b) => ({ min: a.min.minimizeInPlace(b.min), max: a.max.maximizeInPlace(b.max) }))

        const size = bounds.max.subtractInPlace(bounds.min)
        this.bounding_mesh = MeshBuilder.CreateBox('box', {
            width: size.x,
            height: size.y,
            depth: size.z,
        }, this.shared.scene)
        size.scaleInPlace(.5)
        this.bounding_mesh.position.subtractInPlace(bounds.min).subtractInPlace(size)
        //this.bounding_mesh.isVisible = false
        this.bounding_mesh.visibility = 0
        this.bounding_mesh.receiveShadows = false
        this.bounding_mesh.checkCollisions = false
        this.bounding_mesh.isPickable = false

        this.root_transform.parent = this.bounding_mesh

        this.bounding_box = new BoundingBox(this.bounding_mesh)

        // Shake to delete
        // [YASSINE_CEST_LA] J'ai remplacé par le ShakeBehaviour:
        //  Meilleur séparation du code, plus flexible, plus réutilisable et comme ça c'est le même comportement
        //  pour tous ce qui se base sur le shake (cables, bounding box, etc).
        //  Si le shake marche mal, il faut corriger le ShakeBehaviour.
        const bbox = this.bounding_box.boundingBox

        const red_box = this.red_bounding_mesh = bbox.clone("red_box", bbox, true)
        red_box.makeGeometryUnique()
        MeshUtils.setColor(red_box, new Color4(1, 0, 0,1))
        red_box.resetLocalMatrix()
        red_box.isPickable = false
        red_box.checkCollisions = false
        red_box.visibility = 0

        this.shake = new ShakeBehavior()
        this.shake.shake_threshold = 5
        bbox.addBehavior(this.shake)
        this.shake.on_shake = (_, counter) => {
            red_box.visibility = Math.min(1, counter / 12)
            if(counter>10) this.dispose()
        }
        this.shake.on_stop = (_, __) => {
            red_box.visibility = 0
        }
        this.shake.on_drop = () => {
            red_box.visibility = 0
        }


        // On position change
        this.set_state("position")
        this.bounding_box.on_move = () => this.set_state("position")

        // Shadow Generator
        this.shared.shadowGenerator.addShadowCaster(this.bounding_mesh, false)

        // Per-node effect — provider polled each frame and rebuilds on profile
        // id flip (e.g. when the graph rewires and this node's role changes).
        // Activated with whatever live or static signal source is currently
        // available; instantiate() upgrades to the analyser-backed provider
        // once the connectables exist.
        const view = nodeViewOf(this)
        this._nodeEffect = EffectSystem.forMesh(
            this.shared.scene, this.bounding_mesh, null,
            () => Color3.White().toColor4(1),
            () => this._currentNodeProfile(view),
        )
        const analyser = this._audioAnalyser
        if (analyser !== null) {
            this._nodeEffect.activate(() => analyser.snapshot())
        } else {
            this._nodeEffect.activate({ strength: 0, tone: 0 })
        }
    }

    /**
     * Profile selection per frame. Role + graph-validity decide whether this
     * node plays its full character (in a valid source→sink chain) or sits
     * muted (orphan / standalone). Shake-warning is handled separately by
     * the red bounding box mesh, so no flag here.
     */
    private _currentNodeProfile(view: NodeView): EffectProfile {
        const graph = Node3DInstance._graph
        return profileForNode(graph.roleOf(view), graph.inValidPath(view))
    }

    /** Every connection touching this node (deduplicated across all its ports). */
    get connections(): N3DConnectionInstance[] {
        const set = new Set<N3DConnectionInstance>()
        for (const c of this.connectables.values()) for (const conn of c.connections) set.add(conn)
        return [...set]
    }

    private updateBoundingBox() {
        if (!this.bounding_box) this.updateBoundingBoxNow()
        else if (!this.doUpdateBoundingBox) {
            this.doUpdateBoundingBox = true
            setTimeout(() => {
                this.updateBoundingBoxNow()
                this.doUpdateBoundingBox = false
            })
        }
    }

    ///// Synchronized ////
    set_state: (key: string) => void = () => { }

    async initSync(_: string, set_state: (key: string) => void): Promise<void> {
        this.set_state = set_state
    }

    askStates(): void {
        this.set_state("position")
        for (const key of this.node.getStateKeys()) this.set_state(key)
        for (const [id, param] of this.parameters) if(!param.config.notSynced) this.set_state("node3d_parameter_"+id)
    }

    public async getState(key: string): Promise<any> {
        if (key == "position") return {
            position: this.bounding_box?.boundingBox.position.asArray(),
            rotation: this.bounding_box?.boundingBox.rotationQuaternion?.asArray() ?? [],
            scale: this.bounding_box?.boundingBox.scaling.x ?? 1,
        }
        else if (key.startsWith("node3d_parameter_")) {
            const id = key.substring("node3d_parameter_".length)
            const param = this.parameters.get(id)
            if (param && !param.config.notSynced) return param.config.getValue()
        }
        else return this.node.getState(key)
    }

    public async setState(key: string, value: any): Promise<void> {
        if (key == "position") {
            this.bounding_box?.boundingBox.position.fromArray(value.position)
            this.bounding_box?.boundingBox.rotationQuaternion?.fromArray(value.rotation)
            this.bounding_box?.boundingBox.scaling.setAll(value.scale)
        } else if (key === "delete") {
            if (this.disposed) return
            await this.dispose()

        } else if (key.startsWith("node3d_parameter_")) {
            const id = key.substring("node3d_parameter_".length)
            const param = this.parameters.get(id)
            if (param && !param.config.notSynced) param.config.setValue(value)
        }
        else this.node.setState(key, value)
    }

    public updatePosition(){
        if(this.disposed) return
        this.set_state("position")
    }

    async removeState(_key: string): Promise<void> { }

    disposeSync(): void { this.set_state = () => { } }

    private disposed = false

    public async dispose() {
        if (this.disposed) return
        this.on_dispose()
        this.disposed = true
        this.set_state("delete")
        this.highlighter.dispose()
        this._nodeEffect?.dispose()
        this._nodeEffect = null
        this._audioAnalyser?.dispose()
        this._audioAnalyser = null
        this.bounding_box?.dispose()
        this.bounding_mesh?.dispose()
        this.parameters.forEach(it => it.dispose())
        this.buttons.forEach(it => it.dispose())
        this.connectables.forEach(it => it.dispose())
        this.observers.forEach(observable => observable.remove())
        this.observers.clear()
        await this.node.dispose()
        await this.gui.dispose()
    }

    static getSyncManager(
        doc: Doc,
        audioManager: Node3dManager,
        onAdd?: (instance:Node3DInstance)=>void,
        onRemove?: (instance:Node3DInstance)=>void,
    ) {
        const syncmanager: SyncManager<Node3DInstance, string> = new SyncManager({
            name: "node3d_instances",
            doc,
            async on_add(instance) {
                instance.on_dispose = () => syncmanager.remove(instance)
                onAdd?.(instance)
            },
            async create(_, __, kind) { return (await audioManager.builder.create(kind)) as Node3DInstance },
            async on_remove(instance) {
                onRemove?.(instance)
                await instance.dispose()
            },
        })
        // syncmanager.add(node_id,node,kind)
        return syncmanager
    }
}
