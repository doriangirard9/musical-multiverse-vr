import { CreatePlane, Mesh, Scene, Quaternion, Vector3, Observer } from "@babylonjs/core"
import { AdvancedDynamicTexture, Control, Rectangle } from "@babylonjs/gui"
import { InputToPointerBehavior } from "../../xr/inputs/tools/InputToPointer"
import { PointerInput } from "../../xr/inputs/PointerInput"

export class PanelBase {
    protected plane!: Mesh
    protected texture!: AdvancedDynamicTexture
    protected label?: any // N3DText or similar label object
    private followObservable?: Observer<any>

    constructor(
        protected scene: Scene,
        protected renderScene: Scene,
    ) {}

    /**
     * Initialize the panel with given dimensions
     * @param name Panel name
     * @param width Plane width
     * @param height Plane height
     * @param textureResolution Base texture resolution (width). Height is calculated from plane aspect ratio
     */
    protected initPanel(name: string, width: number, height: number, textureResolution: number = 512) {
        this.plane = CreatePlane(name, { width, height }, this.renderScene)
        this.plane.addBehavior(new InputToPointerBehavior())

        // Calculate texture height based on plane aspect ratio
        const textureHeight = Math.round(textureResolution * (height / width))

        this.texture = AdvancedDynamicTexture.CreateForMesh(
            this.plane,
            textureResolution,
            textureHeight
        )
    }

    /**
     * Initialize the N3DText label popup
     * @param name Label name
     * @param labelClass The N3DText class (passed to avoid circular imports)
     */
    protected initLabel(name: string, labelClass: any = null) {
        if (!labelClass) return
        
        this.label = new labelClass(name, [this.plane], this.renderScene)
        this.label.plane.renderingGroupId = 1
        this.label.list.background = "rgb(0,0,0,0.5)"
    }

    /**
     * Show the panel
     */
    show() {
        this.plane.isVisible = true
    }

    /**
     * Hide the panel
     */
    hide() {
        this.plane.isVisible = false
    }

    /**
     * Toggle visibility
     */
    toggle() {
        this.plane.isVisible ? this.hide() : this.show()
    }

    /**
     * Get visibility state
     */
    get isVisible() {
        return this.plane.isVisible
    }

    /**
     * Position a control on the texture using percentage coordinates
     */
    protected place(control: Control, x: number, y: number, width: number, height: number) {
        control.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
        control.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
        control.left = x + "%"
        control.top = y + "%"
        control.width = width + "%"
        control.height = height + "%"
    }

    /**
     * Create a semi-transparent rectangle
     */
    protected rect(backgroundColor: string = "rgb(0,0,0,0.5)") {
        const rect = new Rectangle()
        rect.background = backgroundColor
        return rect
    }

    /**
     * Make the panel follow the camera head
     * @param distance Distance from camera
     * @returns Observable to unsubscribe
     */
    followHead(distance: number = 2) {
        this.stopFollowing()

        this.followObservable = this.scene.onAfterPhysicsObservable.add(() => {
            const ray = this.scene.activeCamera!.getForwardRay()
            const d = ray.direction.multiplyByFloats(1, 0, 1).normalize()
            const position = d.scale(distance).addInPlace(ray.origin)

            // Get target position and rotation
            const targetPosition = position
            const targetRotation = Quaternion.FromLookDirectionLH(d.scale(-1), Vector3.Up())
                .multiplyInPlace(Quaternion.FromEulerAngles(0.1, 0, 0))

            // Smooth positioning
            const positionDiff = Vector3.DistanceSquared(this.plane.position, targetPosition)
            if (positionDiff > 0.4) {
                this.plane.position.scaleInPlace(.95).addInPlace(targetPosition.scaleInPlace(.05))
            }

            this.plane.rotationQuaternion = targetRotation
        })

        this.plane.onDisposeObservable.addOnce(() => {
            this.stopFollowing()
        })

        return this.followObservable
    }

    /**
     * Make the panel follow a pointer input
     * @param pointer Pointer input to follow
     * @returns Observable to unsubscribe
     */
    followPointer(pointer: PointerInput) {
        this.stopFollowing()

        this.followObservable = this.scene.onAfterPhysicsObservable.add(() => {
            const head = this.scene.activeCamera!.getForwardRay()

            // Get how much the user is looking in the pointer direction
            const lookDir = head.direction.clone()
            const handDir = pointer.origin.subtract(head.origin).normalize()
            const lookAmount = Vector3.Dot(lookDir, handDir)

            // Scale
            const sizeMultiplier = (
                (Math.max(0.8,lookAmount)-.8)*(1/.2) // To 0..1
                * .8 + .2 // To 0.2..1
            )
                
            this.plane.scaling.setAll(.15*sizeMultiplier)

            // Place
            const targetPosition = pointer.origin.clone()
            this.plane.position.scaleInPlace(.5).addInPlace(targetPosition.scaleInPlace(.5))

            // Rotate
            const d = head.direction.multiplyByFloats(1, 0, 1).normalize()
            this.plane.rotationQuaternion = Quaternion.FromLookDirectionLH(d.scale(-1), Vector3.Up())
        })

        this.plane.onDisposeObservable.addOnce(() => {
            this.stopFollowing()
        })

        return this.followObservable
    }

    /**
     * Stop following any target
     */
    protected stopFollowing() {
        if (this.followObservable) {
            this.followObservable.remove()
            this.followObservable = undefined
        }
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.stopFollowing()
        if (this.label) {
            this.label.dispose?.()
        }
        this.texture.dispose()
        this.plane.dispose()
    }
}
