import { NetworkManager } from "../network/NetworkManager"
import type { Node3DInstance } from "../node3d/instance/Node3DInstance"
import type { N3DConnectionInstance } from "../node3d/instance/N3DConnectionInstance"
import { SceneManager } from "../app/SceneManager"
import { ShopMenuSystem } from "../app/ShopMenuSystem"
import { WamTransportManager } from "../app/WamTransportManager"
import { TutorialPanel } from "./TutorialPanel"
import { TUTORIAL_KINDS, TUTORIAL_STEPS, type TutorialStep, type TutorialStepId } from "./TutorialScenario"
import {
    AbstractMesh,
    BoundingInfo,
    Color3,
    CreateBox,
    CreatePlane,
    CreateSphere,
    CreateTorus,
    DynamicTexture,
    Mesh,
    Observer,
    Quaternion,
    StandardMaterial,
    Vector3,
    WebXRState,
} from "@babylonjs/core"
import { XRManager } from "../xr/XRManager"
import { InputManager } from "../xr/inputs/InputManager"
import { Node3dManager } from "../app/Node3dManager"
import { ConnectionManager } from "../app/ConnectionManager"
import type { N3DConnectableInstance } from "../node3d/instance/N3DConnectableInstance"
import type { N3DParameterInstance } from "../node3d/instance/N3DParameterInstance"
import { N3DText } from "../node3d/instance/utils/N3DText"

const TOTAL_OBJECTIVES = TUTORIAL_STEPS.length - 1
const BEAT_KINDS = {
    sequencer: "sequencer16",
    drum: "wam3d-Drum",
    output: "audiooutput",
} as const

const TUTORIAL_CHAIN_ORDER = [
    TUTORIAL_KINDS.piano,
    TUTORIAL_KINDS.synth,
    TUTORIAL_KINDS.delay,
    TUTORIAL_KINDS.output,
] as const

type TutorialChainKind = (typeof TUTORIAL_CHAIN_ORDER)[number]

type FireworkParticle = {
    birth: number
    drift: Vector3
    mesh: Mesh
    origin: Vector3
}

type CompletionBanner = {
    anchor: Mesh
    text: N3DText
    notes: Mesh[]
    noteMaterials: StandardMaterial[]
    noteBaseOffsets: Vector3[]
}

type TutorialGuideTarget = {
    label: string
    color: string
    mesh?: AbstractMesh
    meshes?: AbstractMesh[]
    position?: Vector3
    size?: Vector3
}

class TutorialGuide {
    private readonly frame: Mesh
    private readonly material: StandardMaterial
    private readonly text: N3DText
    private readonly observer: Observer<any>
    private readonly pulseSeed = Math.random() * Math.PI * 2
    private disposed = false

    constructor(target: TutorialGuideTarget) {
        const scene = SceneManager.getInstance().getScene()
        this.frame = CreateBox(`tutorial-guide-${target.label}`, { size: 1 }, scene)
        this.frame.isPickable = false
        this.frame.checkCollisions = false
        this.frame.renderOutline = true
        this.frame.outlineWidth = 0.03

        this.material = new StandardMaterial(`tutorial-guide-material-${target.label}`, scene)
        this.material.emissiveColor = Color3.FromHexString(target.color)
        this.material.diffuseColor = Color3.FromHexString(target.color)
        this.material.alpha = 0.18
        this.material.wireframe = true
        this.frame.material = this.material
        this.frame.outlineColor = Color3.FromHexString(target.color)

        this.text = new N3DText(`tutorial-guide-text-${target.label}`, [this.frame], SceneManager.getInstance().getUtilityLayer().utilityLayerScene)
        this.text.set([{ content: `↓ ${target.label}`, color: target.color, size: 0.72 }])
        this.text.show()

        this.observer = scene.onBeforeRenderObservable.add(() => {
            if (this.disposed) return
            try {
                const bounds = target.meshes?.length
                    ? this.getBounds(target.meshes)
                    : target.mesh
                        ? this.getBounds([target.mesh])
                        : null
                const center = bounds
                    ? bounds.boundingSphere.centerWorld
                    : target.position?.clone() ?? Vector3.Zero()
                const extents = bounds
                    ? bounds.boundingBox.extendSizeWorld.scale(2)
                    : target.size?.clone() ?? new Vector3(0.18, 0.18, 0.18)
                const minSize = 0.12
                const pulse = 1 + Math.sin(performance.now() * 0.007 + this.pulseSeed) * 0.08
                const thickness = 0.045

                this.frame.setAbsolutePosition(center)
                this.frame.rotationQuaternion = Quaternion.Identity()
                this.frame.scaling.set(
                    Math.max(minSize, extents.x + thickness) * pulse,
                    Math.max(minSize, extents.y + thickness) * pulse,
                    Math.max(minSize, extents.z + thickness) * pulse,
                )
                this.material.alpha = 0.14 + Math.sin(performance.now() * 0.009 + this.pulseSeed) * 0.05
                this.text.updatePosition()
            } catch (error) {
                console.warn("[Tutorial] Guide update failed", target.label, error)
                this.dispose()
            }
        })
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.observer.remove()
        this.text.dispose()
        this.frame.dispose()
        this.material.dispose()
    }

    private getBounds(meshes: AbstractMesh[]): BoundingInfo | null {
        const candidates = meshes
            .filter((mesh): mesh is AbstractMesh => !!mesh && !mesh.isDisposed())
            .flatMap(mesh => {
                try {
                    return [mesh, ...mesh.getChildMeshes(false)]
                } catch {
                    return [mesh]
                }
            })
            .filter(candidate =>
                !candidate.isDisposed()
                && candidate.isEnabled()
                && (candidate.isVisible || candidate.visibility > 0.001)
                && candidate.getTotalVertices() > 0,
            )

        const source = (candidates.length > 0 ? candidates : meshes)
            .filter(candidate => !candidate.isDisposed())

        if (source.length === 0) return null

        let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
        let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)

        for (const candidate of source) {
            const info = candidate.getBoundingInfo()
            min = Vector3.Minimize(min, info.boundingBox.minimumWorld)
            max = Vector3.Maximize(max, info.boundingBox.maximumWorld)
        }

        return new BoundingInfo(min, max)
    }
}

export class TutorialController {
    private readonly panel = new TutorialPanel(SceneManager.getInstance())
    private readonly network = NetworkManager.getInstance().node3d
    private readonly shop = ShopMenuSystem.getInstance()
    private readonly transport: WamTransportManager
    private readonly watchedNodes = new Set<Node3DInstance>()
    private readonly guides: TutorialGuide[] = []
    private readonly recommendedPositions = new Map<string, Vector3>()
    private readonly guidedParameterIds = new Map<string, string[]>()
    private stepIndex = 0
    private advancing = false
    private tutorialFinished = false
    private initialTempo: number
    private notesPlayed = 0
    private beatDemoPromise: Promise<void> | null = null
    private beatDemoReady = false
    private tutorialAnchor = Vector3.Zero()
    private tutorialForward = new Vector3(0, 0, 1)
    private tutorialRight = new Vector3(1, 0, 0)
    private speakerRecoveredForRestore = false
    private speakerRecoveryPending = false
    private moveOrigin = InputManager.getInstance().head.origin.clone()
    private moveForward = new Vector3(InputManager.getInstance().head.forward.x, 0, InputManager.getInstance().head.forward.z).normalize()
    private locomotionTranslated = false
    private locomotionRotated = false
    private completionObserver?: Observer<any>
    private fireworks: FireworkParticle[] = []
    private lastFireworkBeat = -1
    private completionBanner: CompletionBanner | null = null

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
        this.captureTutorialAnchor()
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
        this.network.onConnectionRemoved.add(connection => {
            this.handleConnectionRemoved(connection)
            this.reconcile()
        })
        this.network.onNodeRemoved.add(node => {
            this.handleNodeRemoved(node)
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

        this.panel.onAdvanceRequested.add(() => this.advanceAfterAcknowledgement())

        SceneManager.getInstance().getScene().onBeforeRenderObservable.add(() => {
            this.trackLocomotion()
            if (this.currentStep.id === "move-around" || this.currentStep.id.startsWith("place-")) {
                this.reconcile()
            }
            const placeKind = this.getPlacementKind(this.currentStep.id)
            if (placeKind) {
                this.trySnapNodeToRecommendedPosition(placeKind, 0.42)
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
        if (step.id === "move-around") {
            this.moveOrigin = InputManager.getInstance().head.origin.clone()
            const forward = new Vector3(InputManager.getInstance().head.forward.x, 0, InputManager.getInstance().head.forward.z)
            this.moveForward = forward.lengthSquared() > 0.0001 ? forward.normalize() : new Vector3(0, 0, 1)
            this.locomotionTranslated = false
            this.locomotionRotated = false
        }
        if (step.id.startsWith("place-")) {
            this.ensureRecommendedPositions()
        }
        if (step.awaitAdvanceOnly) {
            this.advancing = true
        }
        this.panel.setStep(step, Math.min(this.stepIndex + 1, TOTAL_OBJECTIVES), TOTAL_OBJECTIVES)
        if (step.awaitAdvanceOnly) {
            this.panel.setAdvancePrompt("Pointez le bouton puis validez avec la gâchette quand vous êtes prêt.", step.advanceLabel ?? "Suivant")
        }
        this.renderBrowserHud(step)
        this.updateGuides()
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
            <div class="wj-tutorial-actions" id="wj-tutorial-actions"></div>
        `

        this.renderBrowserActions(el)
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
        } else if (step === "restore-output-connection" && this.connectionMatches(connection, TUTORIAL_KINDS.delay, TUTORIAL_KINDS.output)) {
            this.completeCurrentStep()
        } else if (step.startsWith("connect-")) {
            this.showHint(`Cette connexion est valide, mais l’objectif actuel reste : ${this.currentStep.objective}`)
        }

        this.updateGuides()
    }

    private handleConnectionRemoved(connection: N3DConnectionInstance): void {
        if (
            this.currentStep.id === "remove-output-connection"
            && this.connectionMatches(connection, TUTORIAL_KINDS.delay, TUTORIAL_KINDS.output)
        ) {
            this.completeCurrentStep()
        }
        this.updateGuides()
    }

    private handleNodeRemoved(node: Node3DInstance): void {
        this.watchedNodes.delete(node)
        if (
            this.currentStep.id === "remove-output-connection"
            && this.getNodeKind(node) === TUTORIAL_KINDS.output
        ) {
            void this.recoverSpeakerAfterMistake()
            return
        }
        this.updateGuides()
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

        node.onParameterChanged.add(({ id }) => {
            const kind = this.getNodeKind(node)
            if (this.currentStep.id === "shape-sound" && kind === TUTORIAL_KINDS.synth && this.matchesGuidedParameter(kind, id)) {
                this.completeCurrentStep()
            } else if (this.currentStep.id === "shape-delay" && kind === TUTORIAL_KINDS.delay && this.matchesGuidedParameter(kind, id)) {
                this.completeCurrentStep()
            }
        })
    }

    private reconcile(): void {
        if (this.tutorialFinished || this.currentStep.id === "complete") return
        if (this.advancing) return

        const step = this.currentStep
        if (step.id === "move-around") {
            return
        }
        if (step.id === "play-chain" || step.id === "shape-sound" || step.id === "shape-delay") {
            return
        }
        if (step.id === "welcome-intro") {
            return
        }
        if (step.id === "open-shop" && this.shop.isOpened()) {
            this.completeCurrentStep()
            return
        }
        const placeKind = this.getPlacementKind(step.id)
        if (placeKind && this.isNodeNearRecommendedPosition(placeKind, 0.44)) {
            this.completeCurrentStep()
            return
        }
        if (step.id === "start-transport" && this.beatDemoReady && this.transport.isPlaying) {
            this.completeCurrentStep()
            return
        }
        if (step.id === "change-tempo" && this.transport.getTempo() !== this.initialTempo) {
            this.completeCurrentStep()
            return
        }
        if (step.id === "remove-output-connection" && !this.hasConnection(TUTORIAL_KINDS.delay, TUTORIAL_KINDS.output)) {
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
        const successMessage = this.getStepSuccessMessage()
        this.panel.showFeedback(successMessage, "success")
        this.clearGuides()

        const browserHud = document.getElementById("wj-tutorial-hud")
        browserHud?.classList.add("wj-tutorial-success")
        if (browserHud) {
            const objective = browserHud.querySelector("span")
            if (objective) objective.textContent = successMessage
            const hint = browserHud.querySelector("small")
            if (hint) hint.textContent = "Cliquez sur Suivant quand vous avez fini de lire."
        }

        this.panel.setAdvancePrompt(
            "Pointez le bouton puis validez avec la gâchette quand vous êtes prêt.",
            this.currentStep.advanceLabel ?? "Suivant",
        )
        if (browserHud) this.renderBrowserActions(browserHud)
    }

    private getStepSuccessMessage(): string {
        if (this.currentStep.id === "remove-output-connection" && this.speakerRecoveredForRestore) {
            this.speakerRecoveredForRestore = false
            return "Le Speaker a été supprimé par erreur : il a été remis à sa place. Il ne reste plus qu’à recréer la connexion."
        }
        return this.currentStep.success
    }

    private showHint(message: string): void {
        if (this.advancing) return
        this.panel.showFeedback(message, "hint")
        this.panel.setAdvancePrompt("")
        const browserHud = document.getElementById("wj-tutorial-hud")
        browserHud?.classList.add("wj-tutorial-hint")
        if (browserHud) {
            const hint = browserHud.querySelector("small")
            if (hint) hint.textContent = message
            this.renderBrowserActions(browserHud)
        }

        window.setTimeout(() => {
            if (!this.advancing) this.renderStep()
        }, this.readingDuration(message))
    }

    private advanceAfterAcknowledgement(): void {
        if (!this.advancing) return
        if (this.currentStep.id === "complete") {
            this.finishTutorial()
            return
        }
        const previousStep = this.currentStep.id
        this.stepIndex = Math.min(this.stepIndex + 1, TUTORIAL_STEPS.length - 1)
        this.advancing = false
        console.info("[Tutorial] Advancing", { from: previousStep, to: this.currentStep.id })
        try {
            this.renderStep()
            this.reconcile()
            console.info("[Tutorial] Step ready", { step: this.currentStep.id })
        } catch (error) {
            console.error("[Tutorial] Failed while advancing step", {
                from: previousStep,
                to: this.currentStep.id,
                error,
            })
            throw error
        }
    }

    private renderBrowserActions(container: HTMLElement): void {
        const actions = container.querySelector<HTMLDivElement>("#wj-tutorial-actions")
        if (!actions) return
        actions.innerHTML = ""
        if (!this.advancing) return

        const button = document.createElement("button")
        button.className = "wj-btn wj-btn-tutorial"
        button.textContent = this.currentStep.advanceLabel ?? "Suivant"
        button.addEventListener("click", () => this.advanceAfterAcknowledgement())
        actions.appendChild(button)
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

        const center = this.tutorialAnchor
            .add(this.tutorialForward.scale(0.08))
            .addInPlaceFromFloats(0, 1.38, 0)

        const manager = Node3dManager.getInstance()
        const sequencer = await manager.addNode3d(
            BEAT_KINDS.sequencer,
            center.add(this.tutorialRight.scale(-1.55)),
        )
        const drum = await manager.addNode3d(BEAT_KINDS.drum, center)
        const output = await manager.addNode3d(
            BEAT_KINDS.output,
            center.add(this.tutorialRight.scale(1.55)),
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

    private updateGuides(): void {
        this.clearGuides()
        if (this.advancing && !this.currentStep.awaitAdvanceOnly) return

        for (const target of this.getGuideTargetsForCurrentStep()) {
            try {
                this.guides.push(new TutorialGuide(target))
            } catch (error) {
                console.warn("[Tutorial] Failed to create guide target", target.label, error)
            }
        }
    }

    private clearGuides(): void {
        while (this.guides.length > 0) {
            this.guides.pop()?.dispose()
        }
    }

    private getGuideTargetsForCurrentStep(): TutorialGuideTarget[] {
        const step = this.currentStep.id
        const placementKind = this.getPlacementKind(step)
        if (placementKind) {
            return this.getPlacementGuides(placementKind)
        }
        if (step === "connect-midi") {
            return this.getPortGuideTargets(TUTORIAL_KINDS.piano, "midi", "output", "Sortie MIDI", "#7ee787")
                .concat(this.getPortGuideTargets(TUTORIAL_KINDS.synth, "midi", "input", "Entrée MIDI", "#7ee787"))
        }
        if (step === "connect-delay") {
            return this.getPortGuideTargets(TUTORIAL_KINDS.synth, "audio", "output", "Sortie audio", "#56d6c9")
                .concat(this.getPortGuideTargets(TUTORIAL_KINDS.delay, "audio", "input", "Entrée audio", "#56d6c9"))
        }
        if (step === "connect-output" || step === "restore-output-connection") {
            return this.getPortGuideTargets(TUTORIAL_KINDS.delay, "audio", "output", "Vers le Speaker", "#56d6c9")
                .concat(this.getPortGuideTargets(TUTORIAL_KINDS.output, "audio", "input", "Entrée du Speaker", "#56d6c9"))
        }
        if (step === "remove-output-connection") {
            const speaker = this.findNode(TUTORIAL_KINDS.output)
            const targets: TutorialGuideTarget[] = []
            if (speaker) targets.push(this.getWholeNodeGuideTarget(speaker, "Ouvrir le menu du Speaker", "#ffca5c"))
            return targets
        }
        if (step === "shape-sound") {
            return this.getParameterGuideTargets(TUTORIAL_KINDS.synth, [
                /cutoff/i,
                /filter/i,
                /freq/i,
            ], "#7ee787")
        }
        if (step === "shape-delay") {
            return this.getParameterGuideTargets(TUTORIAL_KINDS.delay, [
                /mix/i,
                /time/i,
                /feedback/i,
            ], "#56d6c9")
        }
        return []
    }

    private getPlacementGuides(kind: TutorialChainKind): TutorialGuideTarget[] {
        const node = this.findNode(kind)
        const target = this.recommendedPositions.get(kind)
        const label = this.getKindLabel(kind)
        const guides: TutorialGuideTarget[] = []
        if (node) guides.push(this.getWholeNodeGuideTarget(node, `Attraper ${label}`, "#7ee787"))
        if (target) {
            guides.push({
                position: target,
                size: new Vector3(1.12, 0.62, 1.12),
                label: "Poser ici",
                color: "#56d6c9",
            })
        }
        return guides
    }

    private getPortGuideTargets(
        kind: string,
        type: string,
        direction: "input" | "output",
        label: string,
        color: string,
    ): TutorialGuideTarget[] {
        const node = this.findNode(kind)
        const port = node ? this.findPort(node, type, direction) : undefined
        const mesh = port?.config.meshes[0]
        if (!mesh || mesh.isDisposed()) return []
        return [{ mesh, label, color }]
    }

    private getParameterGuideTargets(kind: string, patterns: RegExp[], color: string): TutorialGuideTarget[] {
        const node = this.findNode(kind)
        if (!node) return []
        const guided = this.findInterestingParameters(node, patterns)
        this.guidedParameterIds.set(kind, guided.map(param => param.config.id))
        return guided.flatMap(param => param.config.meshes[0]
            && !param.config.meshes[0].isDisposed()
            ? [{ mesh: param.config.meshes[0], label: param.config.getLabel(), color }]
            : []
        )
    }

    private trackLocomotion(): void {
        if (this.currentStep.id !== "move-around") return
        const head = InputManager.getInstance().head
        const current = head.origin
        const delta = current.subtract(this.moveOrigin)
        if (!this.locomotionTranslated && delta.length() > 0.55) {
            this.locomotionTranslated = true
        }

        const forward = new Vector3(head.forward.x, 0, head.forward.z)
        if (forward.lengthSquared() < 0.0001) return
        forward.normalize()
        const dot = Vector3.Dot(this.moveForward, forward)
        if (!this.locomotionRotated && dot < 0.8) {
            this.locomotionRotated = true
        }
    }

    private captureTutorialAnchor(): void {
        const head = InputManager.getInstance().head
        const forward = new Vector3(head.forward.x, 0, head.forward.z)
        if (forward.lengthSquared() < 0.0001) forward.copyFromFloats(0, 0, 1)
        forward.normalize()

        const right = Vector3.Cross(Vector3.Up(), forward)
        if (right.lengthSquared() < 0.0001) right.copyFromFloats(1, 0, 0)
        right.normalize()

        this.tutorialForward = forward
        this.tutorialRight = right
        this.tutorialAnchor = head.origin
            .add(forward.scale(2.15))
            .addInPlaceFromFloats(0, -0.12, 0)
    }

    private ensureRecommendedPositions(): void {
        const offsets: Record<TutorialChainKind, { right: number, forward: number }> = {
            [TUTORIAL_KINDS.piano]: { right: -3.45, forward: 0.16 },
            [TUTORIAL_KINDS.synth]: { right: -0.88, forward: 0.16 },
            [TUTORIAL_KINDS.delay]: { right: 0.88, forward: 0.16 },
            [TUTORIAL_KINDS.output]: { right: 2.6, forward: 0.16 },
        }

        for (const kind of TUTORIAL_CHAIN_ORDER) {
            if (this.recommendedPositions.has(kind)) continue
            const { right, forward } = offsets[kind]
            this.recommendedPositions.set(
                kind,
                this.tutorialAnchor
                    .add(this.tutorialRight.scale(right))
                    .addInPlace(this.tutorialForward.scale(forward)),
            )
        }
    }

    private isNodeNearRecommendedPosition(kind: string, maxDistance: number): boolean {
        const node = this.findNode(kind)
        const target = this.recommendedPositions.get(kind)
        if (!node || !target) return false
        return Vector3.Distance(node.boundingBoxMesh.absolutePosition, target) <= maxDistance
    }

    private trySnapNodeToRecommendedPosition(kind: string, snapDistance: number): void {
        const node = this.findNode(kind)
        const target = this.recommendedPositions.get(kind)
        if (!node || !target) return
        if (Vector3.Distance(node.boundingBoxMesh.absolutePosition, target) > snapDistance) return
        node.boundingBoxMesh.setAbsolutePosition(target)
        node.updatePosition()
    }

    private async recoverSpeakerAfterMistake(): Promise<void> {
        if (this.speakerRecoveryPending || this.findNode(TUTORIAL_KINDS.output)) return
        this.speakerRecoveryPending = true
        try {
            this.ensureRecommendedPositions()
            const position = this.recommendedPositions.get(TUTORIAL_KINDS.output)?.clone()
                ?? this.tutorialAnchor.add(this.tutorialRight.scale(2.6)).addInPlace(this.tutorialForward.scale(0.16))
            const speaker = await Node3dManager.getInstance().addNode3d(TUTORIAL_KINDS.output, position)
            if (speaker) {
                speaker.boundingBoxMesh.setAbsolutePosition(position)
                speaker.updatePosition()
                this.watchNode(speaker)
            }
            this.speakerRecoveredForRestore = true
            this.completeCurrentStep()
        } finally {
            this.speakerRecoveryPending = false
            this.updateGuides()
        }
    }

    private finishTutorial(): void {
        this.tutorialFinished = true
        this.advancing = false
        this.clearGuides()
        this.panel.hide()
        document.getElementById("wj-tutorial-hud")?.remove()
        this.startCompletionFireworks()
    }

    private startCompletionFireworks(): void {
        if (this.completionObserver) return
        const scene = SceneManager.getInstance().getScene()
        const palette = ["#ffd166", "#56d6c9", "#ff7eb6", "#7ee787"]
        const particles: FireworkParticle[] = []
        this.completionBanner = this.createCompletionBanner()

        for (let i = 0; i < 28; i++) {
            const mesh = CreateSphere(`tutorial-firework-${i}`, { diameter: 0.07, segments: 6 }, scene)
            const material = new StandardMaterial(`tutorial-firework-mat-${i}`, scene)
            const color = Color3.FromHexString(palette[i % palette.length])
            material.emissiveColor = color
            material.diffuseColor = color
            material.alpha = 0
            mesh.material = material
            mesh.isPickable = false
            mesh.setEnabled(false)
            particles.push({
                mesh,
                birth: -1,
                origin: Vector3.Zero(),
                drift: Vector3.Zero(),
            })
        }

        this.fireworks = particles
        this.lastFireworkBeat = -1
        this.completionObserver = scene.onBeforeRenderObservable.add(() => {
            const tempo = Math.max(1, this.transport.getTempo())
            const beatDuration = 60 / tempo
            const time = this.transport.getElapsedSeconds()
            const beatIndex = Math.floor(time / beatDuration)
            if (beatIndex !== this.lastFireworkBeat) {
                this.lastFireworkBeat = beatIndex
                this.spawnFireworkBurst(time)
                this.pulseCompletionBanner(beatIndex)
            }

            for (const particle of this.fireworks) {
                const material = particle.mesh.material as StandardMaterial
                if (particle.birth < 0) {
                    material.alpha = 0
                    continue
                }
                const age = time - particle.birth
                if (age > beatDuration * 1.8) {
                    particle.birth = -1
                    particle.mesh.setEnabled(false)
                    material.alpha = 0
                    continue
                }

                const life = age / (beatDuration * 1.8)
                particle.mesh.setEnabled(true)
                particle.mesh.position.copyFrom(
                    particle.origin
                        .add(particle.drift.scale(life))
                        .addInPlaceFromFloats(0, 2.8 * life, 0),
                )
                particle.mesh.scaling.setAll(1 + life * 0.8)
                material.alpha = Math.max(0, 0.95 - life)
            }
        })
    }

    private spawnFireworkBurst(now: number): void {
        const available = this.fireworks.filter(particle => particle.birth < 0).slice(0, 7)
        if (available.length === 0) return

        const base = this.tutorialAnchor
            .add(this.tutorialForward.scale(0.2))
            .addInPlaceFromFloats(0, 2.35, 0)

        for (let i = 0; i < available.length; i++) {
            const particle = available[i]
            const lateral = (i - (available.length - 1) / 2) * 0.38
            particle.birth = now
            particle.origin = base
                .add(this.tutorialRight.scale(lateral))
                .addInPlace(this.tutorialForward.scale(-0.15 * Math.abs(lateral)))
            particle.drift = new Vector3(lateral * 0.8, 0, (Math.random() - 0.5) * 0.55)
            particle.mesh.setEnabled(true)
        }
    }

    private createCompletionBanner(): CompletionBanner {
        const scene = SceneManager.getInstance().getScene()
        const anchor = CreateBox("tutorial-complete-anchor", { size: 0.1 }, scene)
        anchor.isVisible = false
        anchor.isPickable = false
        anchor.setAbsolutePosition(
            this.tutorialAnchor
                .add(this.tutorialForward.scale(0.2))
                .addInPlaceFromFloats(0, 1.95, 0),
        )

        const text = new N3DText("tutorial-complete-text", [anchor], SceneManager.getInstance().getUtilityLayer().utilityLayerScene)
        text.set([
            { content: "WAM JAM PARTY", size: 1.15, color: "#ffd166" },
        ])
        text.show()

        const notes: Mesh[] = []
        const noteMaterials: StandardMaterial[] = []
        const noteBaseOffsets: Vector3[] = []
        const glyphs = ["♪", "♫", "♩", "♬", "♪", "♫"]
        for (let i = 0; i < 6; i++) {
            const note = CreatePlane(`tutorial-complete-note-${i}`, { size: 0.26 }, scene)
            note.billboardMode = Mesh.BILLBOARDMODE_ALL
            const material = new StandardMaterial(`tutorial-complete-note-mat-${i}`, scene)
            const texture = new DynamicTexture(`tutorial-complete-note-tex-${i}`, { width: 256, height: 256 }, scene, true)
            texture.hasAlpha = true
            texture.drawText(glyphs[i % glyphs.length], 128, 176, "bold 180px Trebuchet MS", "#56d6c9", "transparent", true, true)
            material.diffuseTexture = texture
            material.opacityTexture = texture
            material.emissiveTexture = texture
            material.disableLighting = true
            material.useAlphaFromDiffuseTexture = true
            note.material = material
            note.isPickable = false
            const offset = this.tutorialRight.scale((i - 2.5) * 0.42).addInPlaceFromFloats(0, 0.05 + Math.sin(i) * 0.08, 0.18)
            note.position.copyFrom(anchor.absolutePosition.add(offset))
            notes.push(note)
            noteMaterials.push(material)
            noteBaseOffsets.push(offset)
        }

        return { anchor, text, notes, noteMaterials, noteBaseOffsets }
    }

    private pulseCompletionBanner(beatIndex: number): void {
        if (!this.completionBanner) return
        const colors = ["#ffd166", "#56d6c9", "#ff7eb6", "#7ee787"]
        const color = colors[beatIndex % colors.length]
        const textSize = 1.12 + (beatIndex % 2 === 0 ? 0.06 : 0)
        this.completionBanner.text.set([
            { content: "WAM JAM PARTY", size: textSize, color },
        ])
        this.completionBanner.text.updatePosition()

        for (let i = 0; i < this.completionBanner.notes.length; i++) {
            const note = this.completionBanner.notes[i]
            const material = this.completionBanner.noteMaterials[i]
            const noteColor = colors[(beatIndex + i) % colors.length]
            const texture = material.diffuseTexture as DynamicTexture | null
            if (texture) {
                texture.clear()
                texture.drawText(["♪", "♫", "♩", "♬"][((beatIndex + i) % 4)], 128, 176, "bold 180px Trebuchet MS", noteColor, "transparent", true, true)
            }
            const pulse = 1 + ((beatIndex + i) % 2 === 0 ? 0.22 : 0.08)
            note.scaling.setAll(pulse)
            const bob = ((beatIndex + i) % 3) * 0.05
            note.position.copyFrom(this.completionBanner.anchor.absolutePosition.add(this.completionBanner.noteBaseOffsets[i]).addInPlaceFromFloats(0, bob, 0))
        }
    }

    private getWholeNodeGuideTarget(node: Node3DInstance, label: string, color: string): TutorialGuideTarget {
        const meshes = this.getNodeGuideMeshes(node)
        return meshes.length > 0
            ? { meshes, label, color }
            : { mesh: node.boundingBoxMesh, label, color }
    }

    private getNodeGuideMeshes(node: Node3DInstance): AbstractMesh[] {
        const rawBoxes = (node as unknown as { boxes?: AbstractMesh[] }).boxes
        if (Array.isArray(rawBoxes) && rawBoxes.length > 0) {
            return rawBoxes.filter(mesh => !mesh.isDisposed() && mesh.isEnabled() && (mesh.isVisible || mesh.visibility > 0.001))
        }

        const candidates = [
            ...node.buttons.values(),
            ...node.parameters.values(),
            ...node.connectables.values(),
        ]
            .flatMap(entry => entry.config.meshes)
            .filter(mesh => !mesh.isDisposed() && mesh.isEnabled() && (mesh.isVisible || mesh.visibility > 0.001))
        return candidates
    }

    private getPlacementKind(step: TutorialStepId): TutorialChainKind | null {
        if (step === "place-piano") return TUTORIAL_KINDS.piano
        if (step === "place-synth") return TUTORIAL_KINDS.synth
        if (step === "place-delay") return TUTORIAL_KINDS.delay
        if (step === "place-output") return TUTORIAL_KINDS.output
        return null
    }

    private findInterestingParameters(node: Node3DInstance, patterns: RegExp[]): N3DParameterInstance[] {
        const parameters = [...node.parameters.values()]
        const matched: typeof parameters = []
        for (const pattern of patterns) {
            const found = parameters.find(param => pattern.test(param.config.id) || pattern.test(param.config.getLabel()))
            if (found && !matched.includes(found)) matched.push(found)
        }
        if (matched.length > 0) return matched
        return parameters.slice(0, Math.min(2, parameters.length))
    }

    private matchesGuidedParameter(kind: string, id: string): boolean {
        const guided = this.guidedParameterIds.get(kind)
        if (!guided || guided.length === 0) return true
        return guided.includes(id)
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
        if (step === "restore-output-connection") return [TUTORIAL_KINDS.delay, TUTORIAL_KINDS.output]
        return null
    }

    private findNode(kind: string): Node3DInstance | undefined {
        return [...this.network.nodes.entries()]
            .find(([, node]) => this.getNodeKind(node) === kind)?.[1]
    }

    private findConnection(fromKind: string, toKind: string): N3DConnectionInstance | undefined {
        return [...this.network.connections.entries()]
            .find(([, connection]) => this.connectionMatches(connection, fromKind, toKind))?.[1]
    }

    private getNodeKind(node: Node3DInstance): string | undefined {
        const id = this.network.nodes.getId(node)
        return id ? this.network.nodes.getData(id) : undefined
    }

    private getKindLabel(kind: string): string {
        if (kind === TUTORIAL_KINDS.piano) return "LivePiano"
        if (kind === TUTORIAL_KINDS.synth) return "Pro54"
        if (kind === TUTORIAL_KINDS.delay) return "Ping Pong Delay"
        if (kind === TUTORIAL_KINDS.output) return "Speaker"
        return kind
    }

    private escapeHtml(value: string): string {
        const div = document.createElement("div")
        div.textContent = value
        return div.innerHTML
    }
}
