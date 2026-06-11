

import { AbstractMesh, Matrix, Observable, Ray, Scene, Vector3, WebXRInputSource } from "@babylonjs/core";

/**
 * Class representing the pointer input of a controller. It provides the position and orientation of the pointer, as well as the mesh it is targeting (if any).
 */
export class AbstractPointerInput {

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
    readonly onMove = new Observable<this>()

    /** The observable that is notified when the pointer targets a new mesh. */
    readonly onNewTarget = new Observable<this>()

    /** The observable that is notified when the pointer is removed. */
    readonly onRemove = new Observable<this>()

    /** The observable that is notified when the pointer is initialized. */
    readonly onInit = new Observable<this>()

    _raytrace(
        origin: Vector3,
        forward: Vector3,
        right: Vector3,
        up: Vector3,
        scenes: Scene[]
    ) {
        // Matrix        
        this.right.copyFrom(right)
        this.up.copyFrom(up)
        this.forward.copyFrom(forward)
        this.origin.copyFrom(origin)

        this.matrix.setRowFromFloats(0, this.right.x, this.right.y, this.right.z, 0)
        this.matrix.setRowFromFloats(1, this.up.x, this.up.y, this.up.z, 0)
        this.matrix.setRowFromFloats(2, this.forward.x, this.forward.y, this.forward.z, 0)
        this.matrix.setRowFromFloats(3, this.origin.x, this.origin.y, this.origin.z, 1)
        
        // Ray casting
        for(let i=scenes.length-1; i>=0; i--){
            const ray = new Ray(this.origin, this.forward)

            const pickInfo = scenes[i].pickWithRay(ray)
            if (pickInfo) {
                this.hit = pickInfo.hit
                if (pickInfo.pickedPoint) this.target.copyFrom(pickInfo.pickedPoint!)
                this.targetMesh = pickInfo.pickedMesh
            }
            else {
                this.hit = false
                this.targetMesh = null
            }
            if(this.targetMesh!=null)break
        }

        // Send events
        if (this.targetMesh != this.previousMesh) {
            this.onNewTarget.notifyObservers(this)
            this.previousMesh = this.targetMesh
        }

        this.onMove.notifyObservers(this)
    }

    /**
     * Make the pointer input state change on webxr inputs source
     * @param inputSource 
     */
    _registerXRObserver(controller: WebXRInputSource, scenes: Scene[]): { remove(): void } {
        const that = this

        let disposed = false

        const o = controller.onDisposeObservable.addOnce(() => disposed = true)


        scenes[0].onAfterPhysicsObservable.add(function tick() {

            if (disposed) {
                if(that.targetMesh!=null){
                    that.hit = false
                    that.targetMesh = null
                    that.onNewTarget.notifyObservers(that)
                }
                that.onRemove.notifyObservers(that)
                scenes[0].onAfterPhysicsObservable.removeCallback(tick)
                return
            }

            that.onInit.notifyObservers(that)

            const root = controller.pointer
            if (root){
                that._raytrace(root.position, root.forward, root.right, root.up, scenes)
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
     * Make the pointer input state change on camera inputs source
     * @param inputSource 
     */
    _registerCameraObserver(scenes: Scene[]): { remove(): void } {
        const that = this

        let disposed = false

        that.onInit.notifyObservers(that)

        scenes[0].onAfterPhysicsObservable.add(function tick() {
            if (disposed) {
                if(that.targetMesh!=null){
                    that.hit = false
                    that.targetMesh = null
                    that.onNewTarget.notifyObservers(that)
                }
                that.onRemove.notifyObservers(that)
                scenes[0].onAfterPhysicsObservable.removeCallback(tick)
                return
            }

            that.onInit.notifyObservers(that)

            const camera = scenes[0].activeCamera!
            if (camera){
                const forward = camera.getForwardRay().direction
                const up = camera.upVector.normalizeToNew()
                const right = forward.cross(up).negateInPlace().normalize()

                that._raytrace(camera.position, forward, right, up, scenes)
            }
        })

        return {
            remove() {
                if (!disposed) {
                    disposed = true
                }
            }
        }
    }

    /**
     * Make the pointer input state change on mouse inputs
     * @param inputSource 
     */
    _registerMouseObserver(scenes: Scene[]): { remove(): void } {
        const that = this

        let canvas = scenes[0].getEngine().getRenderingCanvas()
        if (!canvas) return { remove() { } } // No canvas, no mouse input

        that.onInit.notifyObservers(that)

        const mousemove = (e: MouseEvent) => {
            const canvas_x = e.clientX - canvas!.getBoundingClientRect().left
            const canvas_y = e.clientY - canvas!.getBoundingClientRect().top

            const pickInfo = scenes[0].pick(canvas_x, canvas_y)
            const ray = pickInfo?.ray!!

            that._raytrace(
                ray.origin,
                ray.direction,
                ray.direction.cross(Vector3.Up()).negateInPlace().normalize(),
                ray.direction.cross(ray.direction.cross(Vector3.Up()).negateInPlace().normalize()).negateInPlace().normalize(),
                scenes
            )
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