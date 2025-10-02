import { AbstractMesh, CreatePlane } from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";

/**
 * A simple text display used for parameters and buttons.
 */
export class N3DText{

    plane
    block
    texture

    constructor(label:string, private targets: AbstractMesh[]){
        const plane = this.plane = CreatePlane(`${label} text plane`, { size: 1, width: 5 }, targets[0].getScene())
        plane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL
        plane.setEnabled(false)

        const texture = this.texture = AdvancedDynamicTexture.CreateForMesh(plane, 1024, Math.floor(1024/5))
        
        const block = this.block = new TextBlock()
        block.fontSize = 50
        block.color = 'white'
        block.outlineColor = 'black'
        block.outlineWidth = 5
        texture.addControl(block)
    }

    set(value: string){
        this.block.text = value
    }

    show(){
        this.plane.setEnabled(true)
    }

    hide(){
        this.plane.setEnabled(false)
    }

    dispose(){
        this.block.dispose()
        this.texture.dispose()
        this.plane.dispose()
    }

    updatePosition(){
        const target = this.targets.reduce((a,b)=>a.absolutePosition.y>b.absolutePosition.y?a:b)

        const position = target.getBoundingInfo().boundingBox.centerWorld.clone()
        position.y += target.getBoundingInfo().boundingBox.extendSizeWorld.y/2
        position.y += this.plane.getBoundingInfo().boundingBox.extendSizeWorld.y
        this.plane.setAbsolutePosition(position)
    }

}