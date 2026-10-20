import { AbstractMesh, ImportMeshAsync, Matrix, Quaternion, TransformNode, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"
import PARAMETER_MODEL_URL from "./parameter.glb?url"
import { BoxDriver } from "../common/BoxDriver"
import THUMBNAIL_URL from "./thumbnail.png?url"

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

        context.interactions.pointer.enable()
        context.interactions.parameters.enable()
        context.interactions.buttons.enable()

        this.#loadModel()
    }

    public dispose(): void {
        this.#driver?.dispose()
        this.#driver = undefined
        this.#context.interactions.pointer.disable()
        this.#context.interactions.parameters.disable()
        this.#context.interactions.buttons.disable()
        this.#visual.remove()
        this.#isDisposed = true
        this.#model?.dispose(false, true)
        this.#model = undefined
    }

    readonly #context: ToolContext

    /**
     * The box of matter around the key, what actually plays the instruments.
     * Created once the model is loaded, since it is cut to the bounds of the model.
     */
    #driver?: BoxDriver

    readonly #visual: ReturnType<typeof tools.InputVisualPointer.CreateSimple>

    #model?: TransformNode

    #isDisposed = false

    /**
     * Load the model and hang it on the hand, unless the attachment is gone by then.
     *
     * It is laid out by a holder node, the imported root carrying the axis conversion of the glTF
     * import, and its center stays on the origin of the pointer.
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

            const bounds = ParameterTool.#boundsOf(result.meshes, holder)

            for(const mesh of result.meshes){
                mesh.isPickable = false
                if(mesh.parent === null) mesh.parent = holder
            }
            this.#model = holder

            if(bounds !== null) this.#createDriver(bounds)
        })
    }

    /**
     * The own box of the model in the space of the hand: the bounding box of its mesh, as the mesh
     * turns it, carried through the placement of the holder.
     *
     * Not the box the axes cut around the model, but the one the mesh was built in, so a tilted
     * mesh keeps its tilt. None when the model has no geometry. It has to be read before the model
     * is hung on the hand, while its roots still stand at the origin of the world.
     */
    static #boundsOf(meshes: AbstractMesh[], holder: TransformNode): { center: Vector3, rotation: Quaternion, size: Vector3 } | null {
        let mesh: AbstractMesh | undefined
        for(const candidate of meshes){
            if(candidate.getTotalVertices() === 0) continue
            if(mesh === undefined || candidate.getTotalVertices() > mesh.getTotalVertices()) mesh = candidate
        }
        if(mesh === undefined) return null

        const box = mesh.getBoundingInfo().boundingBox
        const placement = Matrix.Compose(holder.scaling, holder.rotationQuaternion!, holder.position)
        const transform = mesh.computeWorldMatrix(true).multiply(placement)

        const scaling = new Vector3()
        const rotation = new Quaternion()
        const translation = new Vector3()
        transform.decompose(scaling, rotation, translation)

        const localCenter = box.minimum.add(box.maximum).scaleInPlace(0.5)
        return {
            center: Vector3.TransformCoordinates(localCenter, transform),
            rotation,
            size: box.maximum.subtract(box.minimum).multiplyInPlace(scaling),
        }
    }

    /**
     * Hang the box of matter on the hand, carried where the model is.
     *
     * The key is a box of matter cut to the model, so it plays the instruments it is pushed into.
     *
     * @param bounds - The box of the model in the space of the hand.
     */
    #createDriver(bounds: { center: Vector3, rotation: Quaternion, size: Vector3 }): void {
        const pointer = this.#context.controller.pointer
        const position = new Vector3()
        const rotation = new Quaternion()
        const handRotation = new Quaternion()

        this.#driver = new BoxDriver({
            label: `parameter ${this.#context.side}`,
            scene: this.#context.scene,
            controller: this.#context.controller,
            size: bounds.size,
            position: () => {
                Vector3.TransformNormalToRef(bounds.center, pointer.matrix, position)
                return position.addInPlace(pointer.origin)
            },
            rotation: () => {
                Quaternion.FromRotationMatrixToRef(pointer.matrix.getRotationMatrix(), handRotation)
                return handRotation.multiplyToRef(bounds.rotation, rotation)
            },
            direction: () => pointer.forward,
            baseVisible: false,
        })
    }

}

/** The kind of the hand that only tunes the nodes. */
export const PARAMETER_TOOL_KIND: ToolKind = {
    label: "Parameter",
    description: "A hand that only tunes: it drags parameters and presses buttons, and never moves or grabs anything.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "distance", "precise"],
    create: context => new ParameterTool(context),
}
