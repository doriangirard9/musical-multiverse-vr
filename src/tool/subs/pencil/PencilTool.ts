import { AbstractMesh, ImportMeshAsync, Quaternion, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { DrawingStroke, DrawingSystem } from "../../../app/social/DrawingSystem"
import PENCIL_MODEL_URL from "./pencil.glb?url"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The distance from the controller to the tip of the pencil, where the stroke is drawn. */
const TIP_DISTANCE = 0.15

/** The delay between two points of a stroke, in milliseconds. */
const STROKE_INTERVAL = 50

/** The yaw applied to the pencil model so its tip points away from the hand. */
const MODEL_YAW = Math.PI / 2

/** The scale applied to the pencil model, whose authored size is too large for a hand. */
const MODEL_SCALE = 1 / 3

/** How far above the hand the pencil sits, as a fraction of its own size. */
const MODEL_LIFT = 0.05

/**
 * The hand holding a pencil: pressing the trigger starts a stroke, which follows the tip of the
 * pencil until the trigger is released. The strokes belong to {@link DrawingSystem}, so they are
 * shared with the other players.
 */
export class PencilTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context
        this.#loadModel()

        this.#trigger = context.controller.trigger.setPressInterval(
            STROKE_INTERVAL,
            () => this.#stroke?.add(this.#tipPosition()),
            () => { this.#stroke = DrawingSystem.getInstance().startStroke() },
            () => { this.#stroke = null },
        )
    }

    public dispose(): void {
        this.#trigger.remove()
        this.#stroke = null
        this.#isDisposed = true
        this.#model?.dispose(false, true)
        this.#model = undefined
    }

    readonly #context: ToolContext

    readonly #trigger: { remove(): void }

    #stroke: DrawingStroke | null = null

    #model?: AbstractMesh

    #isDisposed = false

    /** The world position of the tip of the pencil, where the stroke is drawn. */
    #tipPosition(): Vector3 {
        const pointer = this.#context.controller.pointer
        return pointer.origin.add(pointer.forward.scale(TIP_DISTANCE))
    }

    /** The largest extent of the model once scaled, in meters. */
    #modelSize(model: AbstractMesh): number {
        model.computeWorldMatrix(true)
        const { min, max } = model.getHierarchyBoundingVectors(true)
        const size = max.subtract(min)
        return Math.max(size.x, size.y, size.z)
    }

    /** Load the pencil model and hang it on the hand, unless the attachment is gone by then. */
    #loadModel(): void {
        ImportMeshAsync(PENCIL_MODEL_URL, this.#context.scene).then(result => {
            const model = result.meshes[0]
            if(this.#isDisposed === true){
                model.dispose(false, true)
                return
            }
            model.parent = this.#context.visual

            // The glTF root carries its own orientation, so the yaw is composed with it, not written over it.
            const yaw = Quaternion.FromEulerAngles(0, MODEL_YAW, 0)
            model.rotationQuaternion = model.rotationQuaternion === null ? yaw : model.rotationQuaternion.multiply(yaw)
            model.scaling.scaleInPlace(MODEL_SCALE)
            model.position.y = MODEL_LIFT * this.#modelSize(model)

            for(const mesh of result.meshes) mesh.isPickable = false
            this.#model = model
        })
    }

}

/** The kind of the hand holding a pencil. */
export const PENCIL_TOOL_KIND: ToolKind = {
    label: "Pencil",
    description: "A pencil drawing in the world as long as the trigger is held, the strokes being shared with the other players.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "precise"],
    create: context => new PencilTool(context),
}
