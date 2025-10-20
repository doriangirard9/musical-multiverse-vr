import { DynamicTexture, Mesh, MeshBuilder, Scene, TransformNode } from "@babylonjs/core"
import { AdvancedDynamicTexture, Container, Grid, MultiLine, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui"

export interface Menu2Config{
    label: string,
    buttons: {
        label: string,
        icon?: TransformNode,
        action: () => void
    }[]
}

export class Menu2{

    plane: Mesh
    texture: AdvancedDynamicTexture

    constructor(scene: Scene, config: Menu2Config){
        // Plan
        this.plane = MeshBuilder.CreatePlane(`${config.label} menu plane`, {width:1, height:0.5}, scene)
        this.texture = AdvancedDynamicTexture.CreateForMesh(this.plane, 1024, 512)
        this.texture.background = "red"
        
        // Lignes
        const multiline = new StackPanel()
        multiline.isVertical = true
        this.texture.addControl(multiline)

        // Texte
        multiline.addControl(new TextBlock("title","Test"))
        multiline.addControl(new TextBlock("line1","Ligne "))
        multiline.addControl(new TextBlock("line2","Ligne 2"))
        
    }
}