import { Scene } from "@babylonjs/core"
import { Button, Control, ScrollViewer, StackPanel } from "@babylonjs/gui"
import { PanelBase } from "./PanelBase"

export interface MenuButton{
    label: string
    color: string
    onClick: () => void
}

/**
 * A simple menu panel that show text buttons in front of the users.
 */
export class MenuPanel extends PanelBase {

    buttons: StackPanel

    constructor(
        scene: Scene,
        renderScene: Scene,
        buttonsInfo?: MenuButton[]
    ) {
        super(scene, renderScene)
        
        this.initPanel("MenuPanel", .75, 1.5, 256)


        const that = this

        const scroll = new ScrollViewer()
        scroll.background = "rgb(0,0,0,0.5)"

        const buttons = this.buttons = new StackPanel()
        buttons.isVertical = true
        buttons.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
        buttons.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
        
        that.place(scroll, 0, 0, 100, 100)
        this.texture.addControl(scroll)

        scroll.addControl(buttons)
        scroll.height = "100%"

        if(buttonsInfo) this.set(buttonsInfo)
    }

    set(buttonsInfo: MenuButton[]){
        this.buttons.clearControls()
        for(const buttonInfo of buttonsInfo){
            const button = Button.CreateSimpleButton(buttonInfo.label, buttonInfo.label)
            button.color = buttonInfo.color
            button.textBlock!.fontSize = 25
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
                console.log("Button up:", buttonInfo.label)
            }
            button.pointerDownAnimation = ()=>{
                button.scaleX = 0.95
                button.scaleY = 0.95
                console.log("Button down:", buttonInfo.label)
            }
            this.buttons.addControl(button)
        }
    }

}
