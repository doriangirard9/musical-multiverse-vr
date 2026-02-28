import { AbstractMesh, Color3, CreatePlane, Scene, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture, Container, StackPanel, TextBlock } from "@babylonjs/gui";

const TEXT_SCALE = .5

export type N3DTextDescription = {
    size?:number,
    color?: string,
    underline?: boolean,
    content:string
}[]

/**
 * A simple text display used for parameters and buttons.
 */
export class N3DText{

    plane
    list
    texture

    constructor(label:string, private targets: AbstractMesh[], scene: Scene){
        const plane = this.plane = CreatePlane(`${label} text plane`, { size: 1*TEXT_SCALE, width: 4*TEXT_SCALE }, scene)
        plane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL
        plane.setEnabled(false)
        plane.isPickable = false

        const texture = this.texture = AdvancedDynamicTexture.CreateForMesh(plane, 1024, Math.floor(1024/4))

        const list = this.list = new StackPanel()
        list.isVertical = true
        list.width = texture.getSize().width+"px"
        list.height = texture.getSize().height+"px"

        texture.addControl(list)
    }

    set(value: N3DTextDescription|string){
        if(typeof value === "string") value = [{content: value}]

        this.list.clearControls()
        for(const line of value){
            const size = (line.size ?? 1) * 50
            const color = line.color ?? "white"

            const block = new TextBlock()
            block.fontSize = size
            block.color = color
            block.outlineColor = 'black'
            block.underline = !!line.underline
            block.outlineWidth = size/10
            block.textWrapping = true
            block.text = line.content
            block.height = size+"px"
            block.lineSpacing = size/2
            block.onLinesReadyObservable.addOnce(()=>{
                block.height = Math.ceil(block.lines.length*size*1.3)+"px"
                block.lines
            })
            
            this.list.addControl(block)
        }
    }

    show(){
        this.plane.setEnabled(true)
    }

    hide(){
        this.plane.setEnabled(false)
    }

    dispose(){
        this.list.dispose()
        this.texture.dispose()
        this.plane.dispose()
    }

    updatePosition(){
        const target = this.targets.reduce((a,b)=>a.absolutePosition.y>b.absolutePosition.y?a:b)

        const distance = target.getAbsolutePosition().subtract(target.getScene().activeCamera!!.position).length()
        const globalScale = new Vector3().setAll(TEXT_SCALE*distance*2)
        this.plane.scaling.copyFrom(globalScale)

        this.plane.computeWorldMatrix(true)
        this.plane.refreshBoundingInfo(true,true)

        const position = target.getBoundingInfo().boundingBox.centerWorld.clone()
        position.y += target.getBoundingInfo().boundingBox.extendSizeWorld.y/2
        position.y += this.plane.getBoundingInfo().boundingBox.extendSizeWorld.y/2
        this.plane.setAbsolutePosition(position)
    }

}