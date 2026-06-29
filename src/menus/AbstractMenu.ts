import { CreatePlane, Mesh, Scene, Quaternion, Vector3, Observable, TransformNode } from "@babylonjs/core"
import { AdvancedDynamicTexture, Control, Rectangle, ScrollViewer } from "@babylonjs/gui"
import { InputToPointerBehavior } from "../xr/inputs/tools/InputToPointer"
import { PointerInput } from "../xr/inputs/PointerInput"
import { N3DText } from "../node3d/instance/utils/N3DText"
import { InputHoverBehavior } from "../node3d/tools"
import { InputManager } from "../xr/inputs"

export class AbstractMenu {
    protected root!: TransformNode
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
        // Dispose if already initialized
        if(this.root) this.root.dispose()
        if(this.plane) this.plane.dispose()
        if(this.texture) this.texture.dispose()
        if(this.label) this.label.dispose()

        this.root = new TransformNode(name, this.scene)
        
        this.plane = CreatePlane(name, { width:1, height:1 }, this.renderScene)
        this.plane.parent = this.root
        this.plane.scaling.set(width, height, 1)

        if(this.options.interactable ?? true){
            // Inputs to pointer behavior
            const pointer_controls = new InputToPointerBehavior()
            this.plane.addBehavior(pointer_controls)

            // Scroll
            const SCROLL_RATE = 0.05

            const inputs = InputManager.getInstance()

            let scrollinterval: {remove():void}|null = null
            let scrollinterval2: {remove():void}|null = null
            const hover = new InputHoverBehavior(
                ()=>{
                    scrollinterval = inputs.right.thumbstick.setPullInterval(50, (_x,y)=>{
                        this.scrollByFraction(-y * SCROLL_RATE)
                    })
                    scrollinterval2 = inputs.screen.thumbstick.setPullInterval(50, (_x,y)=>{
                        this.scrollByFraction(-y * SCROLL_RATE)
                    })
                },
                ()=>{
                    if(scrollinterval){
                        scrollinterval.remove()
                        scrollinterval = null
                    }
                    if(scrollinterval2){
                        scrollinterval2.remove()
                        scrollinterval2 = null
                    }
                },
            )
            this.plane.addBehavior(hover)
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

    protected resizePanel(width: number, height: number, textureResolution: number = 512) {
        this.plane.scaling.set(width, height, 1)
        const textureHeight = Math.round(textureResolution * (height / width))
        this.texture.scaleTo(textureResolution, textureHeight)
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
            const positionDiff = Vector3.DistanceSquared(this.root.position, targetPosition)
            if (positionDiff > 0.4) {
                this.root.position.scaleInPlace(.95).addInPlace(targetPosition.scaleInPlace(.05))
            }

            this.root.rotationQuaternion = targetRotation
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
                
            this.root.scaling.setAll(.15*sizeMultiplier)

            // Rotate
            this.root.rotationQuaternion = Quaternion.FromLookDirectionLH(
                head.direction.scale(-1),
                head_up
            )
        })

        const o2 = pointer.onMove.add(() => {
            // Place
            const targetPosition = pointer.forward.scale(-.1).addInPlace(pointer.origin)
            this.root.position.scaleInPlace(.2).addInPlace(targetPosition.scaleInPlace(.8))
        })

        return {
            remove(){
                if(shown) options.onHide?.()
                o.remove()
                o2.remove()
            }
        }
    }

    // Scroll
    /** Subclasses set this to their scrollable content so thumbsticks can scroll it. */
    public scrollViewer?: ScrollViewer

    /** Scroll the menu by a fraction of its range (joystick scrolling). No-op if
     *  the menu has no scroll or no overflow. dy>0 scrolls down, dy<0 scrolls up. */
    public scrollByFraction(dy: number): void {
        const bar = this.scrollViewer?.verticalBar
        if (!bar) return
        const min = bar.minimum ?? 0
        const max = bar.maximum ?? 1
        bar.value = Math.max(min, Math.min(max, bar.value + dy * (max - min)))
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
