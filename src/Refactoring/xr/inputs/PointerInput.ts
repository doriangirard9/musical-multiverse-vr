import { AbstractMesh, Matrix, Observable, Ray, Scene, Vector3, WebXRAbstractMotionController, WebXRInputSource } from "@babylonjs/core";
import { ControllerInput } from "./ControllerInput";

export class PointerInput {

    constructor(
        readonly controller: ControllerInput|null
    ){}

    readonly matrix = Matrix.Identity()
    readonly origin = new Vector3(0, 0, 0)
    readonly forward = new Vector3(0, 0, 0)
    readonly up = new Vector3(0, 0, 0)
    readonly right = new Vector3(0, 0, 0)

    readonly target = new Vector3(0, 0, 0)
    public targetMesh = null as AbstractMesh | null
    public previousMesh: AbstractMesh | null = null
    public hit = false

    readonly onMove = new Observable<PointerInput>()
    readonly onNewTarget = new Observable<PointerInput>()
    readonly onRemove = new Observable<PointerInput>()
    readonly onInit = new Observable<PointerInput>()


    /**
     * Make the pointer input state change on webxr inputs source
     * @param inputSource 
     */
    _registerXRObserver(controller: WebXRInputSource, scene: Scene): { remove(): void } {
        const that = this

        let disposed = false

        const o = controller.onDisposeObservable.addOnce(() => disposed = true)

        const motionController = controller.motionController!!

        requestAnimationFrame(function tick() {
            that.onInit.notifyObservers(that)
            if (disposed) {
                if(that.targetMesh!=null){
                    that.hit = false
                    that.targetMesh = null
                    that.onNewTarget.notifyObservers(that)
                }
                that.onRemove.notifyObservers(that)
                return
            }

            // Copy position
            const root = motionController.rootMesh
            if (!root) return
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


            requestAnimationFrame(tick)
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

        window.addEventListener("mousemove", mousemove)

        return {
            remove() {
                window.removeEventListener("mousemove", mousemove)
                that.onRemove.notifyObservers(that)
            }
        }

    }

}