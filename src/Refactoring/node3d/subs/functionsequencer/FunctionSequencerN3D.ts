import { AbstractMesh, Color3, TransformNode } from "@babylonjs/core"
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D"
import type { Node3DContext } from "../../Node3DContext"
import type { Node3DGUIContext } from "../../Node3DGUIContext"
import { InputPressBehavior } from "../../../xr/inputs/tools/InputPressBehavior"
import { ScriptExecutor } from "./ScriptExecutor"
import { MidiEventManager } from "./MidiEventManager"
import { FunctionKernelImpl } from "./FunctionKernelImpl"
import { FunctionAPI, NoteDefinition, ParameterDefinition } from "./FunctionAPI"
import { RemoteUI, RemoteUIElement } from "./RemoteUI"

const DEFAULT_SCRIPT = `// Function Sequencer Script
// Test UI Generation

class MySequencer {
    constructor() {
        this.step = 0
        this.isRunning = false
        this.noteLength = 0.25
    }
    
    init() {
        // Register parameters
        api.registerParameters([
            {
                id: "rate",
                config: {
                    label: "Rate",
                    type: "float",
                    minValue: 0.1,
                    maxValue: 2.0,
                    defaultValue: 1.0
                }
            },
            {
                id: "velocity",
                config: {
                    label: "Velocity",
                    type: "int",
                    minValue: 1,
                    maxValue: 127,
                    defaultValue: 100
                }
            }
        ])
        
        // Build UI
        const controlsRow = ui.Row("controls", [
            ui.Action("start", { label: "Start" }),
            ui.Action("stop", { label: "Stop" }),
            ui.Toggle("running", { label: "Running" })
        ])
        
        const paramsRow = ui.Row("parameters", [
            ui.Knob("rate", { label: "Rate", showValue: true }),
            ui.Knob("velocity", { label: "Velocity", showValue: true }),
            ui.Slider("noteLength", { label: "Note Length", width: 0.3 })
        ])
        
        const infoCol = ui.Col("info", [
            ui.Label("Function Sequencer Test"),
            ui.Label("Step: 0"),
            ui.Select("scale", { label: "Scale" })
        ])
        
        api.registerUI(
            ui.Col("main", [
                infoCol,
                controlsRow,
                paramsRow
            ])
        )
    }
    
    onTick(tick) {
        if (!this.isRunning) return
        
        const params = api.getParams()
        const rate = params.rate || 1.0
        const velocity = params.velocity || 100
        
        // Trigger every 24 ticks (16th note at 96 PPQN)
        if (tick % Math.floor(24 / rate) === 0) {
            this.step = (this.step + 1) % 8
            
            // Play C major scale
            const notes = [60, 62, 64, 65, 67, 69, 71, 72]
            const note = notes[this.step]
            
            api.emitNote(0, note, velocity, this.noteLength)
            
            // Highlight step
            ui.Highlight("start", this.step % 2 === 0)
        }
    }
    
    onAction(name) {
        if (name === "start") {
            this.isRunning = true
            this.step = 0
        } else if (name === "stop") {
            this.isRunning = false
            this.step = 0
        }
    }
    
    onMidi(bytes) {
        // Pass through MIDI
        api.emitMidiEvent(bytes, api.getCurrentTime())
    }
    
    onCustomNoteList(noteList) {
        console.log("Custom note list:", noteList)
    }
}

return new MySequencer()
`

/**
 * GUI du Function Sequencer Node3D
 */
export class FunctionSequencerN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext
    root!: TransformNode

    base!: AbstractMesh
    playButton!: AbstractMesh
    stopButton!: AbstractMesh
    
    midiOutputMesh!: AbstractMesh
    parameterMeshes: AbstractMesh[] = []

    uiContainer!: TransformNode
    
    worldSize: number = 2

    constructor(public factory: FunctionSequencerN3DFactory) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        this.context = context

        // Root - tout sera enfant de ce transform
        this.root = new B.TransformNode("functionseq_root")

        // Base principale - occupe le bas du cube [-0.5, 0.5]
        // Dimensions dans l'espace [-0.5, 0.5]
        const baseWidth = 0.8
        const baseHeight = 0.15
        const baseDepth = 0.8
        
        this.base = B.CreateBox("functionseq_base", {
            width: baseWidth,
            height: baseHeight,
            depth: baseDepth
        }, context.scene)
        this.base.material = context.materialMat
        this.base.parent = this.root
        // Positionner en bas du cube: y va de -0.5 à -0.5+baseHeight
        this.base.position.set(0, -0.5 + baseHeight / 2, 0)
        T.MeshUtils.setColor(this.base, Color3.FromHexString("#2C3E50").toColor4())

        // Bouton Play (cylindre vert) - à gauche
        const buttonSize = 0.12
        this.playButton = B.CreateCylinder("play_button", {
            height: buttonSize * 0.4,
            diameter: buttonSize
        }, context.scene)
        this.playButton.material = context.materialMat
        this.playButton.parent = this.root
        // Position: gauche (-X), au-dessus de la base, devant (+Y)
        this.playButton.position.set(-baseWidth / 4, -0.5 + baseHeight + buttonSize / 2, baseDepth / 4)
        T.MeshUtils.setColor(this.playButton, Color3.Green().toColor4())
        this.playButton.rotation.x = Math.PI / 2

        // Bouton Stop (cube rouge) - à droite
        this.stopButton = B.CreateBox("stop_button", {
            size: buttonSize * 0.8
        }, context.scene)
        this.stopButton.material = context.materialMat
        this.stopButton.parent = this.root
        // Position: droite (+X), au-dessus de la base, devant (+Y)
        this.stopButton.position.set(baseWidth / 4, -0.5 + baseHeight + buttonSize / 2, baseDepth / 4)
        T.MeshUtils.setColor(this.stopButton, Color3.Red().toColor4())

        // Connecteur MIDI Output - sur le côté droit
        const connectorSize = 0.1
        this.midiOutputMesh = B.CreateSphere("midi_output", {
            diameter: connectorSize
        }, context.scene)
        this.midiOutputMesh.material = context.materialMat
        this.midiOutputMesh.parent = this.root
        // Position: à droite (+X), au niveau de la base, au centre (Y=0)
        this.midiOutputMesh.position.set(0.5 - connectorSize / 2, -0.5 + baseHeight / 2, 0)
        T.MeshUtils.setColor(this.midiOutputMesh, T.MidiN3DConnectable.OutputColor.toColor4())

        // Container pour l'UI générée dynamiquement
        // Positionner au-dessus des boutons
        this.uiContainer = new B.TransformNode("ui_container")
        this.uiContainer.parent = this.root
        this.uiContainer.position.set(0, -0.5 + baseHeight + buttonSize + 0.1, 0)
    }

    async dispose() {
        this.root.dispose()
    }
}

/**
 * Node3D du Function Sequencer
 */
export class FunctionSequencerN3D implements Node3D {

    private observers: { remove(): void }[] = []
    
    // Context
    private context: Node3DContext
    
    // Composants
    private scriptExecutor: ScriptExecutor
    private midiEventManager: MidiEventManager
    private kernel: FunctionKernelImpl
    private api: FunctionAPI
    private ui: RemoteUI

    // État
    private isPlaying: boolean = false
    private currentTick: number = 0
    private tickInterval: number | null = null
    private tempo: number = 120
    private scriptCode: string = DEFAULT_SCRIPT

    // Connectables
    private midiOutput: any

    constructor(context: Node3DContext, private gui: FunctionSequencerN3DGUI) {
        const { tools: T } = context
        this.context = context

        // Initialiser les composants
        this.midiEventManager = new MidiEventManager()
        this.kernel = new FunctionKernelImpl(this.midiEventManager, this.tempo)
        this.api = new FunctionAPI(this.kernel)
        this.ui = new RemoteUI(this.kernel)
        this.scriptExecutor = new ScriptExecutor()

        // Configurer les callbacks du kernel
        this.setupKernelCallbacks()

        // Configurer le callback d'émission MIDI
        this.midiEventManager.setEmitCallback((bytes: number[]) => {
            this.emitMidi(bytes)
        })

        // Hitbox sur la base
        context.addToBoundingBox(gui.base)

        // Créer les connectables
        this.setupConnectables(context, T)

        // Configurer les interactions
        this.setupInteractions()

        // Charger et initialiser le script par défaut
        this.loadAndInitScript(this.scriptCode)
    }

    /**
     * Configure les callbacks du kernel
     */
    private setupKernelCallbacks(): void {
        this.kernel.setHighlightCallback((name: string, value: boolean) => {
            // TODO: Implémenter le highlight pour les éléments UI custom
            console.log("Highlight:", name, value)
        })

        this.kernel.setEmitEventCallback((event) => {
            // Les événements MIDI sont déjà gérés par le MidiEventManager
            console.log("Event emitted:", event)
        })

        this.kernel.setUIChangeCallback((ui: RemoteUIElement) => {
            // TODO: Implémenter le rendu d'UI custom
            // Pour l'instant, on utilise uniquement createParameter
            console.log("UI registered:", ui)
        })

        this.kernel.setParametersChangeCallback((params: ParameterDefinition[]) => {
            this.createParameters(this.context, params)
        })

        this.kernel.setNoteListChangeCallback((noteList?: NoteDefinition[]) => {
            // Propager la note list en amont si nécessaire
            console.log("Note list changed:", noteList)
        })

        this.kernel.setStateChangeCallback(() => {
            const stateObj = this.kernel.getAllAdditionalState()
            this.scriptExecutor.onStateChange(stateObj)
        })
    }

    /**
     * Configure les connectables MIDI
     */
    private setupConnectables(context: Node3DContext, T: any): void {
        // MIDI Output - émet les événements MIDI
        this.midiOutput = new T.MidiN3DConnectable.ListOutput(
            "midi_output",
            [this.gui.midiOutputMesh],
            "MIDI Out"
        )
        context.createConnectable(this.midiOutput)
    }

    /**
     * Configure les interactions (boutons)
     */
    private setupInteractions(): void {
        // Bouton Play
        const playPress = new InputPressBehavior(
            () => {
                this.play()
            },
            () => { }
        )
        this.gui.playButton.addBehavior(playPress)
        this.observers.push({
            remove: () => this.gui.playButton.removeBehavior(playPress)
        })

        // Bouton Stop
        const stopPress = new InputPressBehavior(
            () => {
                this.stop()
            },
            () => { }
        )
        this.gui.stopButton.addBehavior(stopPress)
        this.observers.push({
            remove: () => this.gui.stopButton.removeBehavior(stopPress)
        })
    }

    /**
     * Crée les paramètres Node3D à partir des paramètres du script
     */
    private createParameters(context: Node3DContext, params: ParameterDefinition[]): void {
        const { babylon: B, tools: T } = this.gui.context
        
        // Nettoyer les anciens paramètres
        this.gui.parameterMeshes.forEach(mesh => mesh.dispose())
        this.gui.parameterMeshes = []

        // Créer un mesh pour chaque paramètre
        // Les positionner en cercle autour du centre, au-dessus de la base
        const radius = 0.3
        const baseY = -0.5 + 0.15 + 0.08 // baseHeight + buttonSize/2 + offset
        
        params.forEach((param, index) => {
            const angle = (index / params.length) * Math.PI * 2
            const x = Math.cos(angle) * radius
            const z = Math.sin(angle) * radius
            
            // Créer une sphère pour le paramètre
            const mesh = B.CreateSphere(`param_${param.id}`, { diameter: 0.08 }, this.gui.context.scene)
            mesh.material = this.gui.context.materialMat
            mesh.parent = this.gui.root
            mesh.position.set(x, baseY, z)
            T.MeshUtils.setColor(mesh, Color3.Blue().toColor4())
            
            this.gui.parameterMeshes.push(mesh)

            // Enregistrer le paramètre avec Node3D
            context.createParameter({
                id: param.id,
                getLabel: () => param.config.label || param.id,
                getStepCount: () => {
                    if (param.config.type === 'int') {
                        return (param.config.maxValue || 127) - (param.config.minValue || 0)
                    }
                    return 100
                },
                getValue: () => {
                    const value = this.kernel.getParameterState(param.id)
                    const min = param.config.minValue || 0
                    const max = param.config.maxValue || 1
                    return (value - min) / (max - min)
                },
                setValue: (normalizedValue: number) => {
                    const min = param.config.minValue || 0
                    const max = param.config.maxValue || 1
                    const value = normalizedValue * (max - min) + min
                    this.kernel.setParameterValue(param.id, value)
                    
                    // Mettre à jour le visuel
                    mesh.scaling.setAll(normalizedValue * 0.8 + 0.4)
                    context.notifyStateChange(param.id)
                },
                meshes: [mesh],
                stringify: (normalizedValue: number) => {
                    const min = param.config.minValue || 0
                    const max = param.config.maxValue || 1
                    const value = normalizedValue * (max - min) + min
                    const rounded = param.config.type === 'int' ? Math.round(value) : value.toFixed(2)
                    return `${param.config.label || param.id}: ${rounded}`
                }
            })
        })
    }

    /**
     * Charge et initialise un script
     */
    private loadAndInitScript(code: string): void {
        const loadResult = this.scriptExecutor.loadScript(code)
        if (!loadResult.success) {
            console.error("Failed to load script:", loadResult.error)
            return
        }

        const initResult = this.scriptExecutor.initialize(this.api, this.ui)
        if (!initResult.success) {
            console.error("Failed to initialize script:", initResult.error)
            return
        }

        this.scriptCode = code
        console.log("Script loaded and initialized successfully")
    }

    /**
     * Démarre la lecture
     */
    private play(): void {
        if (this.isPlaying) return

        this.isPlaying = true
        this.currentTick = 0
        this.midiEventManager.start()

        // Notifier le script
        this.scriptExecutor.onTransportStart({
            currentBar: 0,
            currentBarStarted: 0,
            tempo: this.tempo,
            timeSigNumerator: 4,
            timeSigDenominator: 4,
            playing: true
        })

        // Démarrer le timer de tick (96 PPQN)
        const tickDuration = (60 / this.tempo) / 96 * 1000 // en ms
        this.tickInterval = setInterval(() => {
            this.onTick()
        }, tickDuration) as unknown as number

        console.log("Playing...")
    }

    /**
     * Arrête la lecture
     */
    private stop(): void {
        if (!this.isPlaying) return

        this.isPlaying = false
        
        if (this.tickInterval !== null) {
            clearInterval(this.tickInterval)
            this.tickInterval = null
        }

        this.midiEventManager.stop()
        this.currentTick = 0

        // Notifier le script
        this.scriptExecutor.onTransportStop({
            currentBar: 0,
            currentBarStarted: 0,
            tempo: this.tempo,
            timeSigNumerator: 4,
            timeSigDenominator: 4,
            playing: false
        })

        console.log("Stopped")
    }

    /**
     * Appelé à chaque tick (96 fois par beat)
     */
    private onTick(): void {
        if (!this.isPlaying) return

        // Mettre à jour le gestionnaire d'événements MIDI
        const currentTime = Date.now() / 1000 // Simuler le temps audio
        this.midiEventManager.update(currentTime)

        // Appeler le script
        this.scriptExecutor.onTick(this.currentTick)

        this.currentTick++
    }

    /**
     * Émet un événement MIDI vers l'output
     */
    private emitMidi(bytes: number[]): void {
        if (!this.midiOutput || !this.midiOutput.connections) return

        this.midiOutput.connections.forEach((conn: any) => {
            conn.scheduleEvents({
                type: "wam-midi",
                time: conn.context.currentTime,
                data: { bytes }
            })
        })
    }

    // Implémentation de Node3D

    async setState(key: string, value: any): Promise<void> {
        if (key === "script") {
            this.loadAndInitScript(value)
        } else if (key === "tempo") {
            this.tempo = value
            this.kernel.tempo = value
        } else if (key === "playing") {
            if (value && !this.isPlaying) {
                this.play()
            } else if (!value && this.isPlaying) {
                this.stop()
            }
        } else {
            // État additionnel géré par le script
            this.kernel.setAdditionalState(key, value)
        }
    }

    async getState(key: string): Promise<any> {
        if (key === "script") {
            return this.scriptCode
        } else if (key === "tempo") {
            return this.tempo
        } else if (key === "playing") {
            return this.isPlaying
        } else {
            return this.kernel.getAdditionalState(key)
        }
    }

    getStateKeys(): string[] {
        return [
            "script",
            "tempo",
            "playing",
            ...Object.keys(this.kernel.getAllAdditionalState())
        ]
    }

    async dispose(): Promise<void> {
        this.stop()
        this.observers.forEach(obs => obs.remove())
        this.gui.parameterMeshes.forEach(mesh => mesh.dispose())
    }
}

/**
 * Factory du Function Sequencer Node3D
 */
export class FunctionSequencerN3DFactory implements Node3DFactory<FunctionSequencerN3DGUI, FunctionSequencerN3D> {

    label = "Function Sequencer"
    description = "Live-code a MIDI sequencer with JavaScript"
    tags = ["midi", "sequencer", "live_coding", "generator", "effect"]

    async createGUI(context: Node3DGUIContext): Promise<FunctionSequencerN3DGUI> {
        const gui = new FunctionSequencerN3DGUI(this)
        await gui.init(context)
        return gui
    }

    async create(context: Node3DContext, gui: FunctionSequencerN3DGUI): Promise<FunctionSequencerN3D> {
        return new FunctionSequencerN3D(context, gui)
    }

    static DEFAULT = new FunctionSequencerN3DFactory()
}
