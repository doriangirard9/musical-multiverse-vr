import { ImportMeshAsync, Quaternion, TransformNode } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"
import PARAMETER_MODEL_URL from "./parameter.glb?url"

/** The size the model is shown at, in meters, its center resting on the hand. */
const MODEL_SIZE = 0.2

/**
 * The half turn putting the model the right way round: as the magic wand, the glTF has it pointing
 * towards -Z, which the axis conversion of the import turns into +Z.
 */
const MODEL_YAW = Math.PI

/**
 * The hand that only tunes: it shows the ray of its controller and lets the parameters be dragged
 * and the buttons be pressed, and nothing else. The nodes it sweeps through are neither grabbed
 * nor linked.
 */
export class ParameterTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context
        this.#visual = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)

        context.interactions.parameters.enable()
        context.interactions.buttons.enable()

        this.#loadModel()
    }

    public dispose(): void {
        this.#context.interactions.parameters.disable()
        this.#context.interactions.buttons.disable()
        this.#visual.remove()
        this.#isDisposed = true
        this.#model?.dispose(false, true)
        this.#model = undefined
    }

    readonly #context: ToolContext

    readonly #visual: ReturnType<typeof tools.InputVisualPointer.CreateSimple>

    #model?: TransformNode

    #isDisposed = false

    /**
     * Load the model and hang it on the hand, unless the attachment is gone by then.
     *
     * @remarks
     * Laid out by a holder node rather than by the imported root itself, as the magic wand is: the
     * root carries the axis conversion of the glTF import, which writing an orientation over it
     * would throw away. Unlike the wand, the model is not pushed forward: its center stays on the
     * origin of the pointer.
     */
    #loadModel(): void {
        ImportMeshAsync(PARAMETER_MODEL_URL, this.#context.scene).then(result => {
            if(this.#isDisposed === true){
                for(const mesh of result.meshes) mesh.dispose(false, true)
                return
            }

            const holder = new TransformNode("parameter tool", this.#context.scene)
            holder.parent = this.#context.visual
            holder.rotationQuaternion = Quaternion.FromEulerAngles(0, MODEL_YAW, 0)
            holder.scaling.setAll(MODEL_SIZE)

            for(const mesh of result.meshes){
                mesh.isPickable = false
                if(mesh.parent === null) mesh.parent = holder
            }
            this.#model = holder
        })
    }

}

/** The kind of the hand that only tunes the nodes. */
export const PARAMETER_TOOL_KIND: ToolKind = {
    label: "Parameter",
    description: "A hand that only tunes: it drags the parameters and presses the buttons of the nodes, and leaves them where they are.",
    tags: ["tool", "distance", "precise"],
    create: context => new ParameterTool(context),
}
