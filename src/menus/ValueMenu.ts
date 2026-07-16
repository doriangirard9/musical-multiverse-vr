import { Scene } from "@babylonjs/core"
import { Container, Control, TextBlock } from "@babylonjs/gui"
import { AbstractMenu } from "./AbstractMenu"

/**
 * A menu that displays a value.
 * Can be used to display a parameter value, such as volume or brightness.
 */
export class ValueMenu extends AbstractMenu {

    private _name: TextBlock
    private _value: TextBlock

    constructor(
        scene: Scene,
        renderScene: Scene,
    ) {
        super(scene, renderScene, {interactable:false})
        
        this.initPanel("ValueMenu", 1, 3*1/5, 512)

        const that = this

        const back = new Container()
        back.background = "rgb(0,0,0,0.5)"
        back.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
        back.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
        that.place(back, 0, 0, 100, 100)
        this.texture.addControl(back)

        const name = this._name = new TextBlock()
        name.fontSize = 100
        name.outlineColor = "black"
        name.outlineWidth = 8
        name.textWrapping = true
        name.color = "white"
        name.fontSizeInPixels = 40
        ValueMenu.fitText(name, 1.3)
        back.addControl(name)
        that.place(name, 0, 0, 100, 50)

        const value = this._value = new TextBlock()
        value.text = "0%"
        value.fontSize = 100
        value.outlineColor = "black"
        value.outlineWidth = 8
        value.textWrapping = true
        value.color = "white"
        value.fontSizeInPixels = 100
        ValueMenu.fitText(value, 1.3)
        back.addControl(value)
        that.place(value, 0, 50, 100, 50)

        this.name = "Volume"
        this.valueText = "50%"
    }

    /** Set the name of the value. */
    set name(v: string){
        if(v.length>15) v = "..."+v.slice(-15)
        this._name.fontSizeInPixels = 100
        this._name.text = v
    }

    /** Set the stringified value. */
    set valueText(v: string){
        this._value.fontSizeInPixels = 100
        this._value.text = v
    }
}