import { NetworkManager } from "../network/NetworkManager"
import type { Node3DInstance } from "../node3d/instance/Node3DInstance"
import type { N3DConnectionInstance } from "../node3d/instance/N3DConnectionInstance"
import { SceneManager } from "../app/SceneManager"
import { ShopMenuSystem } from "../app/ShopMenuSystem"
import { WamTransportManager } from "../app/WamTransportManager"
import { TutorialPanel } from "./TutorialPanel"
import { TUTORIAL_KINDS, TUTORIAL_STEPS, type TutorialStep, type TutorialStepId } from "./TutorialScenario"
import {
    Color3,
    CreateTorus,
    StandardMaterial,
    Vector3,
    WebXRState,
} from "@babylonjs/core"
import { XRManager } from "../xr/XRManager"
import { InputManager } from "../xr/inputs/InputManager"
import { Node3dManager } from "../app/Node3dManager"
import { ConnectionManager } from "../app/ConnectionManager"
import type { N3DConnectableInstance } from "../node3d/instance/N3DConnectableInstance"

const TOTAL_OBJECTIVES = TUTORIAL_STEPS.length - 1
const BEAT_KINDS = {
    sequencer: "sequencer16",
    drum: "wam3d-Drum",
    output: "audiooutput",
} as const

export class TutorialController {
    private readonly panel = new TutorialPanel(SceneManager.getInstance())
    private readonly network = NetworkManager.getInstance().node3d
    private readonly shop = ShopMenuSystem.getInstance()
    private readonly transport: WamTransportManager
    private readonly watchedNodes = new Set<Node3DInstance>()
    private stepIndex = 0
    private advancing = false
    private initialTempo: number
    private notesPlayed = 0
    private beatDemoPromise: Promise<void> | null = null
    private beatDemoReady = false

    private constructor(audioContext: AudioContext) {
        this.transport = WamTransportManager.getInstance(audioContext)
        this.initialTempo = this.transport.getTempo()
    }

    static start(audioContext: AudioContext): TutorialController {
        const controller = new TutorialController(audioContext)
        controller.initialize()
        return controller
    }

    static startWhenInXR(audioContext: AudioContext): void {
        const baseExperience = XRManager.getInstance().xrHelper?.baseExperience
        if (!baseExperience) return
        if (baseExperience.state === WebXRState.IN_XR) {
            TutorialController.start(audioContext)
            return
        }

        const observer = baseExperience.onStateChangedObservable.add(state => {
            if (state !== WebXRState.IN_XR) return
            baseExperience.onStateChangedObservable.remove(observer)
            TutorialController.start(audioContext)
        })
    }

    private initialize(): void {
        this.shop.onOpened.add(() => this.handleShopOpened())
        this.shop.onNavigationSelected.add(event => {
            if (event.level === "menu") this.handleShopNavigation(event.label)
        })
        this.shop.onItemSelected.add(kind => this.handleShopItem(kind))

        this.network.onNodeAdded.add(node => {
            this.watchNode(node)
            this.reconcile()
        })
        this.network.onConnectionAdded.add(connection => {
            this.handleConnection(connection)
            this.reconcile()
        })

        for (const [, node] of this.network.nodes.entries()) this.watchNode(node)

        this.transport.onChange(() => {
            const step = this.currentStep
            if (step.id === "start-transport" && this.beatDemoReady && this.transport.isPlaying) {
                this.completeCurrentStep()
            } else if (step.id === "change-tempo" && this.transport.getTempo() !== this.initialTempo) {
                this.completeCurrentStep()
            }
        })

        this.renderStep()
        this.reconcile()
    }

    private get currentStep(): TutorialStep {
        return TUTORIAL_STEPS[this.stepIndex]
    }

    private renderStep(): void {
        const step = this.currentStep
        this.panel.setStep(step, Math.min(this.stepIndex + 1, TOTAL_OBJECTIVES), TOTAL_OBJECTIVES)
        this.renderBrowserHud(step)
        if (step.id === "start-transport") void this.ensureBeatDemo()
    }

    private renderBrowserHud(step: TutorialStep): void {
        let el = document.getElementById("wj-tutorial-hud") as HTMLDivElement | null
        if (!el) {
            el = document.createElement("div")
            el.id = "wj-tutorial-hud"
            el.className = "wj-tutorial-hud"
            document.body.appendChild(el)
        }

        el.classList.remove("wj-tutorial-success", "wj-tutorial-hint")
        el.classList.toggle("wj-tutorial-complete", step.id === "complete")
        el.innerHTML = `
            <div class="wj-tutorial-progress">
                ${step.id === "complete" ? "PARCOURS ACCOMPLI" : `OBJECTIF ${Math.min(this.stepIndex + 1, TOTAL_OBJECTIVES)}/${TOTAL_OBJECTIVES}`}
            </div>
            <strong>${this.escapeHtml(step.title)}</strong>
            <span>${this.escapeHtml(step.objective)}</span>
            <small>${this.escapeHtml(step.hint)}</small>
        `
    }

    private handleShopOpened(): void {
        if (this.currentStep.id === "open-shop") this.completeCurrentStep()
    }

    private handleShopNavigation(label: string): void {
        const expected = this.currentStep.expectedSection
        if (!expected || label === expected) return
        this.showHint(`Bonne exploration. Pour l’objectif actuel, ouvrez plutôt la section ${expected}.`)
    }

    private handleShopItem(kind: string): void {
        const expected = this.currentStep.expectedKind
        if (!expected || kind === expected) return

        const expectedStep = TUTORIAL_STEPS.find(step => step.expectedKind === kind)
        const detail = expectedStep
            ? `${this.getKindLabel(kind)} sera utile à l’étape « ${expectedStep.title} ».`
            : "Ce module ne fait pas partie de ce parcours."
        this.showHint(`${detail} L’objectif actuel reste : ${this.currentStep.objective}`)
    }

    private handleConnection(connection: N3DConnectionInstance): void {
        const step = this.currentStep.id
        if (step === "connect-midi" && this.connectionMatches(connection, TUTORIAL_KINDS.piano, TUTORIAL_KINDS.synth)) {
            this.completeCurrentStep()
        } else if (step === "connect-delay" && this.connectionMatches(connection, TUTORIAL_KINDS.synth, TUTORIAL_KINDS.delay)) {
            this.completeCurrentStep()
        } else if (step === "connect-output" && this.connectionMatches(connection, TUTORIAL_KINDS.delay, TUTORIAL_KINDS.output)) {
            this.completeCurrentStep()
        } else if (step.startsWith("connect-")) {
            this.showHint(`Cette connexion est valide, mais l’objectif actuel reste : ${this.currentStep.objective}`)
        }
    }

    private watchNode(node: Node3DInstance): void {
        if (this.watchedNodes.has(node)) return
        this.watchedNodes.add(node)

        for (const button of node.buttons.values()) {
            button.onPressed.add(() => {
                if (this.getNodeKind(node) !== TUTORIAL_KINDS.piano) return
                if (!["play-first-note", "play-chain"].includes(this.currentStep.id)) return

                this.notesPlayed++
                const requiredNotes = this.currentStep.id === "play-chain" ? 3 : 1
                if (this.notesPlayed >= requiredNotes) this.completeCurrentStep()
            })
        }

        node.onParameterChanged.add(() => {
            const kind = this.getNodeKind(node)
            if (this.currentStep.id === "shape-sound" && kind === TUTORIAL_KINDS.synth) {
                this.completeCurrentStep()
            } else if (this.currentStep.id === "shape-delay" && kind === TUTORIAL_KINDS.delay) {
                this.completeCurrentStep()
            }
        })
    }

    private reconcile(): void {
        if (this.advancing || this.currentStep.id === "complete") return

        const step = this.currentStep
        if (step.id === "start-transport" && this.beatDemoReady && this.transport.isPlaying) {
            this.completeCurrentStep()
            return
        }
        if (step.id === "change-tempo" && this.transport.getTempo() !== this.initialTempo) {
            this.completeCurrentStep()
            return
        }
        if (step.expectedKind && this.hasNode(step.expectedKind)) {
            this.completeCurrentStep()
            return
        }

        const requiredConnection = this.connectionKindsForStep(step.id)
        if (requiredConnection && this.hasConnection(...requiredConnection)) {
            this.completeCurrentStep()
        }
    }

    private completeCurrentStep(): void {
        if (this.advancing || this.currentStep.id === "complete") return
        this.advancing = true
        this.notesPlayed = 0
        this.panel.showFeedback(this.currentStep.success, "success")

        const browserHud = document.getElementById("wj-tutorial-hud")
        browserHud?.classList.add("wj-tutorial-success")
        if (browserHud) {
            const objective = browserHud.querySelector("span")
            if (objective) objective.textContent = this.currentStep.success
        }

        window.setTimeout(() => {
            this.stepIndex = Math.min(this.stepIndex + 1, TUTORIAL_STEPS.length - 1)
            this.advancing = false
            this.renderStep()
            if (this.currentStep.id === "complete") this.showCompletion()
            else this.reconcile()
        }, this.readingDuration(this.currentStep.success))
    }

    private showHint(message: string): void {
        if (this.advancing) return
        this.panel.showFeedback(message, "hint")
        const browserHud = document.getElementById("wj-tutorial-hud")
        browserHud?.classList.add("wj-tutorial-hint")
        if (browserHud) {
            const hint = browserHud.querySelector("small")
            if (hint) hint.textContent = message
        }

        window.setTimeout(() => {
            if (!this.advancing) this.renderStep()
        }, this.readingDuration(message))
    }

    private showCompletion(): void {
        const toast = document.createElement("div")
        toast.className = "wj-tutorial-toast"
        toast.textContent = "Le beat tourne : jouez par-dessus !"
        document.body.appendChild(toast)
        window.setTimeout(() => toast.remove(), this.readingDuration(toast.textContent ?? ""))
    }

    private async ensureBeatDemo(): Promise<void> {
        if (this.beatDemoPromise) return this.beatDemoPromise

        this.beatDemoPromise = this.createBeatDemo().catch(error => {
            this.beatDemoPromise = null
            console.error("[Tutorial] Failed to create beat demo:", error)
            this.showHint("La batterie n’a pas pu apparaître. Réessayez en relançant le tutoriel.")
        })
        return this.beatDemoPromise
    }

    private async createBeatDemo(): Promise<void> {
        this.showHint("Le séquenceur 16, le drum sampler et leur sortie audio apparaissent déjà câblés et configurés.")

        const inputs = InputManager.getInstance()
        const forward = new Vector3(inputs.head.forward.x, 0, inputs.head.forward.z)
        if (forward.lengthSquared() < 0.0001) forward.copyFromFloats(0, 0, 1)
        forward.normalize()
        const right = Vector3.Cross(Vector3.Up(), forward).normalize()
        const center = inputs.head.origin
            .add(forward.scale(2.8))
            .addInPlaceFromFloats(0, -0.55, 0)

        const manager = Node3dManager.getInstance()
        const sequencer = await manager.addNode3d(
            BEAT_KINDS.sequencer,
            center.add(right.scale(-1.35)),
        )
        const drum = await manager.addNode3d(BEAT_KINDS.drum, center)
        const output = await manager.addNode3d(
            BEAT_KINDS.output,
            center.add(right.scale(1.35)),
        )
        if (!sequencer || !drum || !output) throw new Error("A beat module could not be created")

        this.configureDrumPattern(sequencer)

        const sequencerMidi = this.findPort(sequencer, "midi", "output")
        const drumMidi = this.findPort(drum, "midi", "input")
        const drumAudio = this.findPort(drum, "audio", "output")
        const outputAudio = this.findPort(output, "audio", "input")
        if (!sequencerMidi || !drumMidi || !drumAudio || !outputAudio) {
            throw new Error("A beat module exposes an unexpected connection layout")
        }

        const connections = ConnectionManager.getInstance()
        connections.connect(sequencerMidi, drumMidi)
        connections.connect(drumAudio, outputAudio)

        this.createTempoPulse(sequencer)
        this.beatDemoReady = true
        this.renderStep()
        this.reconcile()
    }

    private configureDrumPattern(sequencer: Node3DInstance): void {
        const rows = [
            { row: 0, midi: 36, steps: [0, 4, 8, 12] },
            { row: 1, midi: 38, steps: [4, 12] },
            { row: 2, midi: 39, steps: [4, 12] },
        ]

        for (const { row, midi, steps } of rows) {
            sequencer.parameters.get(`sequencer_note_midi_${row}`)?.setValue(midi / 128)
            for (const step of steps) {
                sequencer.parameters.get(`sequencer_note_${row}_${step}`)?.setValue(1)
            }
        }
    }

    private findPort(
        node: Node3DInstance,
        type: string,
        direction: "input" | "output",
    ): N3DConnectableInstance | undefined {
        return [...node.connectables.values()].find(port => {
            return port.config.type === type && port.config.direction === direction
        })
    }

    private createTempoPulse(sequencer: Node3DInstance): void {
        const scene = SceneManager.getInstance().getScene()
        const pulse = CreateTorus("tutorial tempo pulse", {
            diameter: 0.55,
            thickness: 0.045,
            tessellation: 24,
        }, scene)
        const material = new StandardMaterial("tutorial tempo pulse material", scene)
        material.emissiveColor = Color3.FromHexString("#FFD166")
        material.diffuseColor = Color3.FromHexString("#56D6C9")
        material.alpha = 0.9
        pulse.material = material
        pulse.isPickable = false
        pulse.parent = sequencer.boundingBoxMesh
        pulse.position.set(0, 0.55, 0)
        pulse.rotation.x = Math.PI / 2

        scene.onBeforeRenderObservable.add(() => {
            if (!this.transport.isPlaying) {
                pulse.scaling.setAll(0.85)
                material.alpha = 0.35
                return
            }

            const beatSeconds = 60 / this.transport.getTempo()
                * 4 / this.transport.getTimeSignature().denominator
            const phase = (this.transport.getElapsedSeconds() % beatSeconds) / beatSeconds
            const strength = Math.pow(1 - phase, 5)
            pulse.scaling.setAll(0.9 + strength * 0.65)
            material.alpha = 0.35 + strength * 0.65
        })
    }

    private readingDuration(message: string): number {
        const words = message.trim().split(/\s+/).filter(Boolean).length
        return Math.min(7000, Math.max(2200, 700 + words * 320))
    }

    private hasNode(kind: string): boolean {
        return [...this.network.nodes.entries()].some(([, node]) => this.getNodeKind(node) === kind)
    }

    private hasConnection(fromKind: string, toKind: string): boolean {
        return [...this.network.connections.entries()]
            .some(([, connection]) => this.connectionMatches(connection, fromKind, toKind))
    }

    private connectionMatches(connection: N3DConnectionInstance, fromKind: string, toKind: string): boolean {
        const outputNode = connection.outputConnectable?.instance
        const inputNode = connection.inputConnectable?.instance
        if (!outputNode || !inputNode) return false
        return this.getNodeKind(outputNode) === fromKind && this.getNodeKind(inputNode) === toKind
    }

    private connectionKindsForStep(step: TutorialStepId): [string, string] | null {
        if (step === "connect-midi") return [TUTORIAL_KINDS.piano, TUTORIAL_KINDS.synth]
        if (step === "connect-delay") return [TUTORIAL_KINDS.synth, TUTORIAL_KINDS.delay]
        if (step === "connect-output") return [TUTORIAL_KINDS.delay, TUTORIAL_KINDS.output]
        return null
    }

    private getNodeKind(node: Node3DInstance): string | undefined {
        const id = this.network.nodes.getId(node)
        return id ? this.network.nodes.getData(id) : undefined
    }

    private getKindLabel(kind: string): string {
        if (kind === TUTORIAL_KINDS.piano) return "LivePiano"
        if (kind === TUTORIAL_KINDS.synth) return "Pro54"
        if (kind === TUTORIAL_KINDS.delay) return "Ping Pong Delay"
        if (kind === TUTORIAL_KINDS.output) return "Audio Output"
        return kind
    }

    private escapeHtml(value: string): string {
        const div = document.createElement("div")
        div.textContent = value
        return div.innerHTML
    }
}
