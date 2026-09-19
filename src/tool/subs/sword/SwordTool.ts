import { AbstractMesh, Color3, CreateBox, ImportMeshAsync, Mesh, Observer, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { BoxDriver } from "../common/BoxDriver"
import { NetworkManager } from "../../../network/NetworkManager"
import SWORD_MODEL_URL from "./sword.glb?url"
import THUMBNAIL_URL from "./thumbnail.png?url"

/**
 * The length of the sword, from the hand to the tip. Three times the length of the magic wand, whose
 * placement the sword shares otherwise.
 */
const LENGTH = 0.6

/**
 * The half turn putting the sword the right way round.
 *
 * The model already lies along the axis the hand points at, but with its tip towards the wrist:
 * the glTF has it pointing towards -Z, which the axis conversion of the import turns into +Z.
 */
const MODEL_YAW = Math.PI

/**
 * The quarter turn of the sword around its own axis, so the flat of the blade faces sideways and
 * its edge cuts the way the hand swings.
 */
const MODEL_ROLL = Math.PI / 2

/**
 * How much the sword points above the pointing direction of the hand, in radians. Raised like a
 * wand, but further, so the blade stands up from the fist the way a sword is held.
 */
const TILT = Math.PI * 65 / 180

/**
 * Where the grip sits relative to the hand, in meters: a little back, below and to the left of the controller, so
 * the pommel rests in the fist rather than on top of it.
 */
const GRIP_OFFSET = new Vector3(-0.01, -0.07, -0.07)

/** How fast the blade has to move for its edge to cut, in meters per second. */
const CUT_SPEED = 1.2

/** The color of the cutting edge. */
const EDGE_COLOR = new Color3(1, 0, 0)

/** How much of the cutting edge can be seen through. */
const EDGE_ALPHA = 0.35

/**
 * A sword whose blade cuts what it goes through when it is swung fast enough.
 *
 * @remarks
 * The blade is fitted with a box hugging the model, turned with it, which shows red when the
 * sword moves faster than {@link CUT_SPEED}. While it shows, every node and every connection its
 * box meets is removed from the world. A sword moved slowly cuts nothing, so the world can be
 * walked through with it in hand.
 */
export class SwordTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context
        this.#loadModel()
        this.#observer = context.scene.onBeforeRenderObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#context.scene.onBeforeRenderObservable.remove(this.#observer)
        this.#isDisposed = true
        this.#driver?.dispose()
        this.#driver = undefined
        this.#edge?.dispose(false, true)
        this.#edge = undefined
        this.#model?.dispose(false, true)
        this.#model = undefined
    }

    readonly #context: ToolContext

    readonly #observer: Observer<Scene>

    #isDisposed = false

    #model?: TransformNode

    /** The box hugging the blade, in the frame of the blade, whose bounding box is the edge. */
    #edge?: Mesh

    /** The box of matter carried by the blade, so the sword plays the instruments it is pushed into. */
    #driver?: BoxDriver

    /** Where the edge was on the last frame, to read its speed from. */
    #lastPosition?: Vector3

    /**
     * Read the speed of the blade, show the edge when it is fast enough and cut what it meets.
     */
    #update(): void {
        const edge = this.#edge
        if(!edge) return

        const position = edge.getAbsolutePosition().clone()
        const dt = this.#context.scene.getEngine().getDeltaTime() / 1000
        const last = this.#lastPosition
        this.#lastPosition = position
        if(!last || dt <= 0) return

        const speed = Vector3.Distance(last, position) / dt
        const cutting = speed >= CUT_SPEED
        edge.isVisible = cutting
        if(cutting) this.#cut(edge)
    }

    /** Remove every node and every connection the edge meets. */
    #cut(edge: Mesh): void {
        const network = NetworkManager.getInstance().node3d

        for(const [, node] of [...network.nodes.entries()]){
            if(edge.intersectsMesh(node.boundingBoxMesh, true)) network.nodes.remove(node)
        }

        for(const [, connection] of [...network.connections.entries()]){
            if(edge.intersectsMesh(connection.tube, true)) connection.remove()
        }
    }

    /**
     * Load the sword model and hang it on the hand, unless the attachment is gone by then.
     *
     * @remarks
     * The model is laid out by a holder node rather than by the imported root itself: that root
     * carries the axis conversion glTF files are imported with, which writing an orientation over it
     * would throw away. The holder takes the placement, the imported roots keep their own.
     */
    #loadModel(): void {
        ImportMeshAsync(SWORD_MODEL_URL, this.#context.scene).then(result => {
            if(this.#isDisposed === true){
                for(const mesh of result.meshes) mesh.dispose(false, true)
                return
            }

            // The grip raises the whole sword above the pointing direction of the hand; the holder
            // then lays the model along the raised axis.
            const grip = new TransformNode("sword grip", this.#context.scene)
            grip.parent = this.#context.visual
            grip.rotation.x = -TILT
            grip.position.copyFrom(GRIP_OFFSET)

            const holder = new TransformNode("sword", this.#context.scene)
            holder.parent = grip

            // The model comes in one unit long, centered on the origin and already lying along the
            // axis the hand points at, but the wrong way round: a half turn puts its tip forward,
            // and half its length of offset brings its base onto the hand and its tip outward.
            holder.rotationQuaternion = Quaternion.FromEulerAngles(0, MODEL_YAW, MODEL_ROLL)
            holder.scaling.setAll(LENGTH)
            holder.position.z = LENGTH / 2

            for(const mesh of result.meshes){
                mesh.isPickable = false
                if(mesh.parent === null) mesh.parent = holder
            }
            this.#model = grip
            this.#edge = this.#createEdge(holder, result.meshes)
            this.#createDriver(this.#edge)
        })
    }

    /**
     * Build the box hugging the blade: the bounds of the model in the frame of its holder, so the
     * box turns with the sword instead of lying along the axes of the world.
     */
    #createEdge(holder: TransformNode, meshes: AbstractMesh[]): Mesh {
        holder.computeWorldMatrix(true)
        const toHolder = holder.getWorldMatrix().clone().invert()

        const min = new Vector3(Infinity, Infinity, Infinity)
        const max = new Vector3(-Infinity, -Infinity, -Infinity)
        for(const mesh of meshes){
            if(mesh.getTotalVertices() === 0) continue
            mesh.computeWorldMatrix(true)
            const toLocal = mesh.getWorldMatrix().multiply(toHolder)
            for(const corner of mesh.getBoundingInfo().boundingBox.vectors){
                const point = Vector3.TransformCoordinates(corner, toLocal)
                min.minimizeInPlace(point)
                max.maximizeInPlace(point)
            }
        }

        const size = max.subtract(min)
        const edge = CreateBox("sword edge", { width: size.x, height: size.y, depth: size.z }, this.#context.scene)
        edge.parent = holder
        edge.position = min.add(max).scaleInPlace(0.5)
        edge.isPickable = false
        edge.isVisible = false

        const material = new StandardMaterial("sword edge", this.#context.scene)
        material.diffuseColor = EDGE_COLOR
        material.emissiveColor = EDGE_COLOR
        material.alpha = EDGE_ALPHA
        material.backFaceCulling = false
        edge.material = material

        return edge
    }

    /**
     * Hang the box of matter on the blade, carried where the edge is.
     *
     * @remarks
     * The blade is the visual, so the box of the driver itself stays hidden. Its size is the size
     * of the edge in the world, the edge being scaled with the model.
     */
    #createDriver(edge: Mesh): void {
        const box = edge.getBoundingInfo().boundingBox
        const size = box.maximum.subtract(box.minimum).scaleInPlace(LENGTH)
        const rotation = new Quaternion()

        this.#driver = new BoxDriver({
            label: `sword ${this.#context.side}`,
            scene: this.#context.scene,
            controller: this.#context.controller,
            size,
            position: () => edge.getAbsolutePosition(),
            rotation: () => Quaternion.FromRotationMatrixToRef(edge.getWorldMatrix().getRotationMatrix(), rotation),
            direction: () => this.#context.controller.pointer.forward,
            baseVisible: false,
        })
    }

}

/** The kind of the hand holding a sword. */
export const SWORD_TOOL_KIND: ToolKind = {
    label: "Sword",
    description: "A blade that cuts away every node and every connection it passes through, as long as it is swung fast enough.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "wide"],
    create: context => new SwordTool(context),
}
