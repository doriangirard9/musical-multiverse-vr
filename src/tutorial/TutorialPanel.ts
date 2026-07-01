import { Quaternion, Vector3 } from "@babylonjs/core"
import { Container, Control, Rectangle, TextBlock } from "@babylonjs/gui"
import { AbstractMenu } from "../menus/AbstractMenu"
import { SceneManager } from "../app/SceneManager"
import type { TutorialStep } from "./TutorialScenario"

export class TutorialPanel extends AbstractMenu {
    private readonly background: Rectangle
    private readonly progressText: TextBlock
    private readonly titleText: TextBlock
    private readonly objectiveText: TextBlock
    private readonly hintText: TextBlock
    private readonly followObserver
    private fixedHeight: number | null = null

    constructor(scenes: SceneManager) {
        super(scenes.getScene(), scenes.getUtilityLayer().utilityLayerScene, { interactable: false })
        this.initPanel("tutorial_objective", 3.7, 0.82, 2560)

        this.background = new Rectangle("tutorial_background")
        this.background.background = "rgba(8, 16, 22, 0.92)"
        this.background.color = "#56d6c9"
        this.background.thickness = 3
        this.background.cornerRadius = 26
        this.texture.addControl(this.background)

        const content = new Container("tutorial_content")
        this.background.addControl(content)

        this.progressText = this.createText(24, "#56d6c9")
        this.place(this.progressText, 4, 7, 92, 10)
        content.addControl(this.progressText)

        this.titleText = this.createText(40, "white")
        this.titleText.fontWeight = "700"
        this.place(this.titleText, 4, 17, 92, 18)
        content.addControl(this.titleText)

        this.objectiveText = this.createText(31, "white")
        this.objectiveText.textWrapping = true
        this.place(this.objectiveText, 4, 37, 92, 30)
        content.addControl(this.objectiveText)

        this.hintText = this.createText(22, "#b9c8d0")
        this.hintText.textWrapping = true
        this.place(this.hintText, 4, 70, 92, 17)
        content.addControl(this.hintText)

        this._root.scaling.setAll(0.74)
        this.show()

        const scene = scenes.getScene()
        this.followObserver = scene.onBeforeRenderObservable.add(() => {
            const camera = scene.activeCamera
            if (!camera) return

            const ray = camera.getForwardRay()
            const forward = new Vector3(ray.direction.x, 0, ray.direction.z)
            if (forward.lengthSquared() < 0.0001) return
            forward.normalize()

            this.fixedHeight ??= ray.origin.y + 0.08
            const target = ray.origin
                .add(forward.scale(1.34))
            target.y = this.fixedHeight

            this._root.position.scaleInPlace(0.82).addInPlace(target.scale(0.18))
            this._root.rotationQuaternion = Quaternion.FromLookDirectionLH(forward.scale(-1), Vector3.Up())
        })
    }

    setStep(step: TutorialStep, current: number, total: number): void {
        this.progressText.text = step.id === "complete" ? "PARCOURS ACCOMPLI" : `OBJECTIF ${current}/${total}`
        this.titleText.text = step.title
        this.objectiveText.text = step.objective
        this.hintText.text = step.hint
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

    override dispose(): void {
        this.followObserver?.remove()
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
