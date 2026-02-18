import { AbstractMesh, Matrix, Observable, Ray, Scene, Vector3, WebXRAbstractMotionController, WebXRInputSource } from "@babylonjs/core";
import { ControllerInput } from "./ControllerInput";

/**
 * Class representing the pointer input of a controller. It provides the position and orientation of the pointer, as well as the mesh it is targeting (if any).
 */
export class PointerInput {

    constructor(
        readonly controller: ControllerInput
    ){}

    /**
      * The matrix that represents the pointer position and orientation in world space.
      * Forward is +Z
      * Up is +Y
      * Right is +X
      */
    readonly matrix = Matrix.Identity()

    /** The position of the pointer in world space. */
    readonly origin = new Vector3(0, 0, 0)

    /** The forward vector of the pointer in world space. */
    readonly forward = new Vector3(0, 0, 0)

    /** The up vector of the pointer in world space. */
    readonly up = new Vector3(0, 0, 0)

    /** The right vector of the pointer in world space. */
    readonly right = new Vector3(0, 0, 0)

    /** The target point of the pointer in world space. Valid only if {@link hit} is true */
    readonly target = new Vector3(0, 0, 0)

    /** The mesh targeted by the pointer. Null if no mesh is targeted. */
    public targetMesh = null as AbstractMesh | null

    /** The mesh previously targeted by the pointer. Null if no mesh was previously targeted. */
    public previousMesh: AbstractMesh | null = null

    /** Whether the pointer is hitting a mesh. */
    public hit = false

    /** The observable that is notified when the pointer moves. */
    readonly onMove = new Observable<PointerInput>()

    /** The observable that is notified when the pointer targets a new mesh. */
    readonly onNewTarget = new Observable<PointerInput>()

    /** The observable that is notified when the pointer is removed. */
    readonly onRemove = new Observable<PointerInput>()

    /** The observable that is notified when the pointer is initialized. */
    readonly onInit = new Observable<PointerInput>()


    /**
     * Make the pointer input state change on webxr inputs source
     * @param inputSource 
     */
    _registerXRObserver(controller: WebXRInputSource, scene: Scene): { remove(): void } {
        const that = this

        let disposed = false

        const o = controller.onDisposeObservable.addOnce(() => disposed = true)

        scene.onAfterPhysicsObservable.add(function tick() {
            that.onInit.notifyObservers(that)
            if (disposed) {
                if(that.targetMesh!=null){
                    that.hit = false
                    that.targetMesh = null
                    that.onNewTarget.notifyObservers(that)
                }
                that.onRemove.notifyObservers(that)
                scene.onAfterPhysicsObservable.removeCallback(tick)
                return
            }

            // Copy position
            const root = controller.pointer
            if (root){
                that.matrix.copyFrom(root.getWorldMatrix())
                that.origin.copyFrom(root.position)
                that.forward.copyFrom(root.forward)
                that.up.copyFrom(root.up)
                that.right.copyFrom(root.right)

                // Ray casting
                const ray = new Ray(that.origin, that.forward)
                const pickInfo = scene.pickWithRay(ray)
                if (pickInfo) {
                    that.hit = pickInfo.hit
                    if (pickInfo.pickedPoint) that.target.copyFrom(pickInfo.pickedPoint!)
                    that.targetMesh = pickInfo.pickedMesh
                }
                else {
                    that.hit = false
                    that.targetMesh = null
                }

                that.onMove.notifyObservers(that)

                if (that.targetMesh != that.previousMesh) {
                    that.onNewTarget.notifyObservers(that)
                    that.previousMesh = that.targetMesh
                }
            }
        })

        return {
            remove() {
                if (!disposed) {
                    disposed = true
                    o.remove()
                }
            }
        }
    }

    /**
     * Make the pointer input state change on mouse inputs
     * @param inputSource 
     */
    _registerMouseObserver(scene: Scene): { remove(): void } {
        const that = this

        let canvas = scene.getEngine().getRenderingCanvas()
        if (!canvas) return { remove() { } } // No canvas, no mouse input

        that.onInit.notifyObservers(that)

        const mousemove = (e: MouseEvent) => {
            const canvas_x = e.clientX - canvas!.getBoundingClientRect().left
            const canvas_y = e.clientY - canvas!.getBoundingClientRect().top
            const pickInfo = scene.pick(canvas_x, canvas_y)
            const ray = pickInfo?.ray!!

            // Set position
            that.origin.copyFrom(ray.origin)
            that.forward.copyFrom(ray.direction)
            that.right.copyFrom(ray.direction.cross(Vector3.Up()).negate().normalize())
            that.up.copyFrom(that.right.cross(ray.direction).negate().normalize())
            this.matrix.setRowFromFloats(0, that.right.x, that.right.y, that.right.z, 0)
            this.matrix.setRowFromFloats(1, that.up.x, that.up.y, that.up.z, 0)
            this.matrix.setRowFromFloats(2, that.forward.x, that.forward.y, that.forward.z, 0)
            this.matrix.setRowFromFloats(3, that.origin.x, that.origin.y, that.origin.z, 1)

            // Ray
            this.hit = pickInfo.hit
            if (pickInfo.pickedPoint) this.target.copyFrom(pickInfo.pickedPoint)
            this.targetMesh = pickInfo.pickedMesh

            that.onMove.notifyObservers(that)

            if (that.targetMesh != that.previousMesh) {
                that.onNewTarget.notifyObservers(that)
                that.previousMesh = that.targetMesh
            }
        }

        window.addEventListener("pointermove", mousemove)

        return {
            remove() {
                window.removeEventListener("pointermove", mousemove)
                that.onRemove.notifyObservers(that)
            }
        }

    }

}