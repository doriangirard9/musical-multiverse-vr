import { CreatePlane, Mesh, Scene, Quaternion, Vector3, Observable } from "@babylonjs/core"
import { AdvancedDynamicTexture, Control, Rectangle } from "@babylonjs/gui"
import { InputToPointerBehavior } from "../xr/inputs/tools/InputToPointer"
import { PointerInput } from "../xr/inputs/PointerInput"
import { N3DText } from "../node3d/instance/utils/N3DText"

export class AbstractMenu {
    protected plane!: Mesh
    protected texture!: AdvancedDynamicTexture
    protected label?: N3DText

    constructor(
        protected scene: Scene,
        protected renderScene: Scene,
        protected options: {
            interactable?: boolean, // Whether the menu should be interactable (default: true)
        } = {}
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

        if(this.options.interactable ?? true){
            this.plane.addBehavior(new InputToPointerBehavior())
        }
        else{
            this.plane.isPickable = false
        }

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
    protected initLabel(name: string) {        
        this.label = new N3DText(name, [this.plane], this.renderScene)
        this.label!.plane.renderingGroupId = 1
        this.label!.list.background = "rgb(0,0,0,0.5)"
    }


    readonly onShow = new Observable<void>()
    readonly onHide = new Observable<void>()

    /**
     * Show the panel
     */
    show() {
        if(this.plane.isVisible) return

        this.plane.isVisible = true
        this.onShow.notifyObservers()
    }

    /**
     * Hide the panel
     */
    hide() {
        if(!this.plane.isVisible) return

        this.plane.isVisible = false
        this.label?.hide()
        this.onHide.notifyObservers()
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
        const o = this.scene.onAfterPhysicsObservable.add(() => {
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

        return o
    }

    /**
     * Make the panel follow a pointer input
     * @param pointer Pointer input to follow
     * @returns Observable to unsubscribe
     */
    followPointer(
        pointer: PointerInput,
        options: {
            onShow?(): void,
            onHide?(): void,
        } = {}
    ) {

        let shown = false

        const o = this.scene.onAfterPhysicsObservable.add(() => {
            const head = this.scene.activeCamera!.getForwardRay()
            const head_up = this.scene.activeCamera!.upVector

            // Get how much the user is looking in the pointer direction
            const lookDir = head.direction.clone()
            const handDir = pointer.origin.subtract(head.origin).normalize()
            const lookAmount = Vector3.Dot(lookDir, handDir)

            if(lookAmount>.9){
                if(!shown){
                    options.onShow?.()
                    shown = true
                }
            }
            else{
                if(shown){
                    options.onHide?.()
                    shown = false
                }
            }

            // Scale
            const sizeMultiplier = (
                (Math.max(0.8,lookAmount)-.8)*(1/.2) // To 0..1
                * .8 + .2 // To 0.2..1
            )
                
            this.plane.scaling.setAll(.15*sizeMultiplier)

            // Rotate
            this.plane.rotationQuaternion = Quaternion.FromLookDirectionLH(
                head.direction.scale(-1),
                head_up
            )
        })

        const o2 = pointer.onMove.add(() => {
            // Place
            const targetPosition = pointer.forward.scale(-.1).addInPlace(pointer.origin)
            this.plane.position.scaleInPlace(.2).addInPlace(targetPosition.scaleInPlace(.8))
        })

        return {
            remove(){
                if(shown) options.onHide?.()
                o.remove()
                o2.remove()
            }
        }
    }

    /**
     * Dispose all resources
     */
    dispose() {
        if (this.label) {
            this.label?.dispose?.()
        }
        this.texture.dispose()
        this.plane.dispose()
    }
}
