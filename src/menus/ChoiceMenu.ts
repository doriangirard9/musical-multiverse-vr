import { Scene } from "@babylonjs/core"
import { Button, Control, ScrollViewer, StackPanel, TextBlock } from "@babylonjs/gui"
import { AbstractMenu } from "./AbstractMenu"

export interface MenuButton{
    label: string
    color?: string
    click?: () => void,
}

/**
 * A simple menu panel that show text buttons in front of the users.
 */
export class ChoiceMenu extends AbstractMenu {

    buttons: StackPanel

    constructor(
        scene: Scene,
        renderScene: Scene,
        buttonsInfo?: MenuButton[]
    ) {
        super(scene, renderScene)
        
        this.initPanel("choice_menu", 1.2, 1.5, 256)


        const that = this

        const scroll = new ScrollViewer()
        scroll.background = "rgb(0,0,0,0.5)"
        this.scrollViewer = scroll   // enable joystick scrolling

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

        function styleTextBlock(text: TextBlock, info: MenuButton, width: number){
            const baseSize = 25
            
            text.color = info.color ?? "white"
            text.text = info.label
            text.fontSize = baseSize
            
            const w = info.label.length*baseSize*.6
            if(w>width) text.fontSize = baseSize * width / w
                
            text.outlineColor = "black"
            text.outlineWidth = 4
        }

        function styleButton(button: Button, info: MenuButton){
            button.color = info.color ?? "white"
            button.background = "rgb(0,0,0,0)"
            button.width = "230px"
            button.height= "60px"
            button.setPaddingInPixels(5,5,5,5)
            button.pointerEnterAnimation = () => {
                button.background = "rgb(255,255,255,0.2)"
            }
            button.pointerOutAnimation = () => {
                button.background = "rgb(0,0,0,0)"
            }
            button.pointerUpAnimation = () => {
                button.scaleX = 1
                button.scaleY = 1
            }
            button.pointerDownAnimation = ()=>{
                button.scaleX = 0.95
                button.scaleY = 0.95
            }
            styleTextBlock(button.textBlock!, info, 230)
        }

        this.buttons.clearControls()
        for(const buttonInfo of buttonsInfo){
            if(buttonInfo.click){
                const button = Button.CreateSimpleButton(buttonInfo.label, buttonInfo.label)
                styleButton(button, buttonInfo)

                const b = button.pointerUpAnimation
                button.pointerUpAnimation = ()=>{
                    b()
                    try{
                        buttonInfo.click?.()
                    }catch(e){
                        console.error("Error in button click handler:", e)
                    }
                }
                
                this.buttons.addControl(button)
            }
            else{
                const text = new TextBlock()
                styleTextBlock(text!, buttonInfo, 230)
                text.width = "230px"
                text.height= "40px"
                text.setPaddingInPixels(5,5,5,5)
                this.buttons.addControl(text)
            }
        }
    }

}
