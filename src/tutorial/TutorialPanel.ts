import { Observable, Quaternion, Vector3 } from "@babylonjs/core"
import { Button, Container, Control, Rectangle, TextBlock } from "@babylonjs/gui"
import { AbstractMenu } from "../menus/AbstractMenu"
import { SceneManager } from "../app/SceneManager"
import type { TutorialStep } from "./TutorialScenario"

export class TutorialPanel extends AbstractMenu {
    readonly onAdvanceRequested = new Observable<void>()
    private readonly background: Rectangle
    private readonly progressText: TextBlock
    private readonly titleText: TextBlock
    private readonly objectiveText: TextBlock
    private readonly hintText: TextBlock
    private readonly footerText: TextBlock
    private readonly nextButton: Button
    private readonly followObserver

    private static readonly SHOP_DISTANCE = 2
    private static readonly SHOP_HEIGHT = 1
    private static readonly PANEL_HEIGHT = 0.68
    private static readonly PANEL_WIDTH = 3.05
    private static readonly PANEL_MARGIN = 0.08
    private static readonly PANEL_OFFSET_Y =
        (TutorialPanel.SHOP_HEIGHT / 2)
        + (TutorialPanel.PANEL_HEIGHT / 2)
        + TutorialPanel.PANEL_MARGIN

    constructor(scenes: SceneManager) {
        super(scenes.getScene(), scenes.getUtilityLayer().utilityLayerScene)
        this.initPanel("tutorial_objective", TutorialPanel.PANEL_WIDTH, TutorialPanel.PANEL_HEIGHT, 2048)

        this.background = new Rectangle("tutorial_background")
        this.background.background = "rgba(8, 16, 22, 0.92)"
        this.background.color = "#56d6c9"
        this.background.thickness = 3
        this.background.cornerRadius = 26
        this.texture.addControl(this.background)

        const content = new Container("tutorial_content")
        this.background.addControl(content)

        this.progressText = this.createText(24, "#56d6c9")
        this.place(this.progressText, 3, 6, 94, 11)
        content.addControl(this.progressText)

        this.titleText = this.createText(38, "white")
        this.titleText.fontWeight = "700"
        this.place(this.titleText, 3, 17, 94, 18)
        content.addControl(this.titleText)

        this.objectiveText = this.createText(29, "white")
        this.objectiveText.textWrapping = true
        this.place(this.objectiveText, 4, 36, 92, 24)
        content.addControl(this.objectiveText)

        this.hintText = this.createText(22, "#b9c8d0")
        this.hintText.textWrapping = true
        this.place(this.hintText, 4, 61, 92, 14)
        content.addControl(this.hintText)

        this.footerText = this.createText(20, "#d9edf1")
        this.place(this.footerText, 4, 77, 58, 10)
        content.addControl(this.footerText)

        this.nextButton = Button.CreateSimpleButton("tutorial_next", "Suivant")
        this.nextButton.color = "#10231f"
        this.nextButton.background = "#7ee787"
        this.nextButton.thickness = 0
        this.nextButton.cornerRadius = 22
        this.nextButton.fontSize = 26
        this.nextButton.fontFamily = "Trebuchet MS"
        this.nextButton.fontWeight = "700"
        this.nextButton.isVisible = false
        this.nextButton.onPointerUpObservable.add(() => this.onAdvanceRequested.notifyObservers())
        this.place(this.nextButton, 66, 75, 28, 13)
        content.addControl(this.nextButton)

        this.footerText.text = ""
        this.show()

        const scene = scenes.getScene()
        this.followObserver = scene.onBeforeRenderObservable.add(() => {
            const camera = scene.activeCamera
            if (!camera) return

            const ray = camera.getForwardRay()
            const forward = new Vector3(ray.direction.x, 0, ray.direction.z)
            if (forward.lengthSquared() < 0.0001) return
            forward.normalize()

            const target = ray.origin
                .add(forward.scale(TutorialPanel.SHOP_DISTANCE))
                .addInPlace(Vector3.Up().scale(TutorialPanel.PANEL_OFFSET_Y))
            const targetRotation = Quaternion.FromLookDirectionLH(forward.scale(-1), Vector3.Up())

            const positionDiff = Vector3.DistanceSquared(this.root.position, target)
            if (positionDiff > 0.4) {
                this.root.position.scaleInPlace(0.95).addInPlace(target.scale(0.05))
            }
            this.root.rotationQuaternion = targetRotation
        })
    }

    setStep(step: TutorialStep, current: number, total: number): void {
        this.progressText.text = step.id === "complete" ? "PARCOURS ACCOMPLI" : `OBJECTIF ${current}/${total}`
        this.titleText.text = step.title
        this.objectiveText.text = step.objective
        this.hintText.text = step.hint
        this.setAdvancePrompt("")
        this.background.color = step.id === "complete" ? "#ffd166" : "#56d6c9"
        this.background.background = step.id === "complete"
            ? "rgba(43, 32, 8, 0.94)"
            : "rgba(9, 18, 25, 0.92)"
    }

    showFeedback(message: string, type: "success" | "hint"): void {
        this.objectiveText.text = message
        this.background.color = type === "success" ? "#7ee787" : "#ffca5c"
        this.background.background = type === "success"
            ? "rgba(9, 42, 24, 0.95)"
            : "rgba(54, 36, 7, 0.95)"
    }

    setAdvancePrompt(message: string, buttonLabel: string = "Suivant"): void {
        const visible = message.trim().length > 0
        this.footerText.text = message
        this.nextButton.textBlock!.text = buttonLabel
        this.nextButton.isVisible = visible
    }

    override dispose(): void {
        this.followObserver?.remove()
        this.onAdvanceRequested.clear()
        super.dispose()
    }

    private createText(fontSize: number, color: string): TextBlock {
        const text = new TextBlock()
        text.fontFamily = "Trebuchet MS"
        text.fontSize = fontSize
        text.color = color
        text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
        text.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
        return text
    }
}
