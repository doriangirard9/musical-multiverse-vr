import { Scene } from "@babylonjs/core"
import { Container, Control, TextBlock } from "@babylonjs/gui"
import { AbstractMenu } from "./AbstractMenu"

/**
 * A simple menu that show a text message in front of the users.
 */
export class MessageMenu extends AbstractMenu {

    text: TextBlock

    constructor(
        scene: Scene,
        renderScene: Scene,
        message?: string,
        color?: string
    ) {
        super(scene, renderScene, {interactable:false})
        
        this.initPanel("MessageMenu", 3.5, .6, 512)


        const that = this

        const back = new Container()
        back.background = "rgb(0,0,0,0.5)"
        back.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
        back.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
        that.place(back, 0, 0, 100, 100)
        this.texture.addControl(back)

        const text = this.text = new TextBlock()
        this.text.fontSize = 20
        this.text.outlineColor = "black"
        this.text.outlineWidth = 8
        this.text.textWrapping = true
        back.addControl(text)

        this.set(message ?? "", color ?? "white")
    }

    set(message: string, color: string){
        this.text.color = color
        this.text.text = message
    }

}
