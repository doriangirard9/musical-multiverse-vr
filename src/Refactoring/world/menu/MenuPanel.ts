import { CreatePlane, Material, Mesh, Quaternion, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { AdvancedDynamicTexture, Button, Control, ScrollViewer, StackPanel } from "@babylonjs/gui"
import { InputToPointerBehavior } from "../../xr/inputs/tools/InputToPointer"
import { InputManager } from "../../xr/inputs/InputManager"

export interface MenuButton{
    label: string
    color: string
    onClick: () => void
}

/**
 * A simple menu pannel that show text buttons in front of the users.
 */
export class MenuPanel {

    plane: Mesh
    texture: AdvancedDynamicTexture

    constructor(
        private scene: Scene,
        renderScene: Scene,
        buttonsInfo: MenuButton[]
    ) {
        const that = this
        
        this.plane = CreatePlane("MenuPanel", {width: 1, height: 2}, renderScene)

        this.texture = AdvancedDynamicTexture.CreateForMesh(this.plane, 256, 512)

        this.plane.addBehavior(new InputToPointerBehavior())

        const scroll = new ScrollViewer()
        scroll.background = "rgb(0,0,0,0.5)"

        const buttons = new StackPanel()
        buttons.isVertical = true
        buttons.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
        buttons.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
        
        that.place(scroll, 0, 0, 100, 100)
        this.texture.addControl(scroll)

        scroll.addControl(buttons)
        scroll.height = "100%"

        // Buttons
        for(const buttonInfo of buttonsInfo){
            const button = Button.CreateSimpleButton(buttonInfo.label, buttonInfo.label)
            button.color = buttonInfo.color
            button.textBlock!.fontSize = 20
            button.textBlock!.outlineColor = "black"
            button.textBlock!.outlineWidth = 4
            button.width = "230px"
            button.height= "80px"
            button.setPaddingInPixels(5,5,5,5)
            button.pointerEnterAnimation = () => {
                button.background = "rgb(255,255,255,0.2)"
            }
            button.pointerOutAnimation = () => {
                button.background = "rgb(0,0,0,0)"
            }
            button.pointerUpAnimation = ()=>{
                button.scaleX = 1
                button.scaleY = 1
                try{
                    buttonInfo.onClick()
                }catch(e){
                    console.error("Error in button click handler:", e)
                }
            }
            button.pointerDownAnimation = ()=>{
                button.scaleX = 0.95
                button.scaleY = 0.95
                console.log("Button down:", buttonInfo.label)
            }
            buttons.addControl(button)
        }
    }

    makeFollow(distance = 2) {
        const o = this.scene.onAfterPhysicsObservable.add(() => {
            const ray = this.scene.activeCamera!.getForwardRay()
            const d = ray.direction.multiplyByFloats(1,0,1)
            const position = d.scale(distance).addInPlace(ray.origin)
            this.plane.position.addInPlace(position).scaleInPlace(0.5)
            this.plane.rotationQuaternion = Quaternion.FromLookDirectionLH(d.scale(-1), Vector3.Up())
                .multiplyInPlace(Quaternion.FromEulerAngles(0.1, 0, 0))
        })

        this.plane.onDisposeObservable.addOnce(() => {
            o.remove()
        })

        return o
    }

    show() {
        this.plane.isVisible = true
    }

    hide() {
        this.plane.isVisible = false
    }

    toggle() {
        if (this.plane.isVisible) {
            this.hide()
        }
        else {
            this.show()
        }
    }

    place(control: Control, x: number, y: number, width: number, height: number) {
        control.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
        control.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
        control.left = x + "%"
        control.top = y + "%"
        control.width = width + "%"
        control.height = height + "%"
    }

    dispose() {
        this.plane.dispose()
        this.texture.dispose()
    }
}
