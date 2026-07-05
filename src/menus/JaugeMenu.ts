import { Scene } from "@babylonjs/core"
import { Container, Control, Rectangle, TextBlock } from "@babylonjs/gui"
import { AbstractMenu } from "./AbstractMenu"


export class JaugeMenu extends AbstractMenu {

    private _name: TextBlock
    private _value: TextBlock
    private jauge

    constructor(
        scene: Scene,
        renderScene: Scene,
    ) {
        super(scene, renderScene, {interactable:false})
        
        this.initPanel("JaugeMenu", 1, 3, 512)

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
        JaugeMenu.fitText(name, 1.3)
        back.addControl(name)
        that.place(name, 0, 0, 100, 10)

        const value = this._value = new TextBlock()
        value.text = "0%"
        value.fontSize = 100
        value.outlineColor = "black"
        value.outlineWidth = 8
        value.textWrapping = true
        value.color = "white"
        value.fontSizeInPixels = 100
        JaugeMenu.fitText(value, 1.3)
        back.addControl(value)
        that.place(value, 0, 10, 100, 10)

        const jauge = this.jauge = new Jauge("blue", 10)
        back.addControl(jauge.root)
        that.place(jauge.root, 20, 20, 60, 80)

        this.name = "Volume"
        this.valueText = "50%"
    }

    set name(v: string){
        if(v.length>15) v = "..."+v.slice(-15)
        this._name.fontSizeInPixels = 100
        this._name.text = v
    }

    set valueText(v: string){
        this._value.fontSizeInPixels = 100
        this._value.text = v
    }

    set value(v: number){
        this.jauge.value = v
    }
}

class Jauge{

    private container
    private filling
    private bar
    private fillingValue = 0.5

    constructor(
        color: string = "white",
        private thickness: number = 2,
    ){
        this.container = new Rectangle()
        this.container.color = "white"
        this.container.thickness = thickness

        this.filling = new Container()
        this.filling.background = color
        this.filling.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
        this.filling.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
        this.container.addControl(this.filling)

        this.bar = new Container()
        this.bar.background = "white"
        this.bar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
        this.bar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
        this.container.addControl(this.bar)

        this.container.onDirtyObservable.add(() => {
            this.update()
        })
        
        this.update()
    }

    private update(){

        let fx = this.thickness
        let fy = this.thickness
        let fw = this.container.widthInPixels-this.thickness*2-this.thickness*2
        let fh = this.container.heightInPixels-this.thickness*2-this.thickness*2

        this.filling.heightInPixels = fh * this.fillingValue
        this.filling.widthInPixels = fw
        this.filling.topInPixels = fy + fh * (1-this.fillingValue)
        this.filling.leftInPixels = fx

        this.bar.heightInPixels = this.thickness*2
        this.bar.widthInPixels = this.container.widthInPixels
        this.bar.topInPixels = fy + fh * (1-this.fillingValue) - this.thickness
        this.bar.leftInPixels = -this.thickness
    }

    /** The jauge root control. */
    get root(){ return this.container }

    /** Change the value of the jauge */
    set value(v: number){
        this.fillingValue = Math.max(0, Math.min(1, v))
        this.update()
    }

    /** Dispose the jauge and its controls. */
    dispose(){
        this.container.dispose()
    }
}