import { Scene } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../../node3d/Node3D";
import { Node3DGUIContext } from "../../node3d/Node3DGUIContext";
import { ThumbnailRenderer } from "./ThumbnailRenderer";
import * as B from "@babylonjs/core";
import * as tools from "../../node3d/tools";


export class N3DThumbnailRenderer {


    private renderer
    private aggregator!: ReturnType<ThumbnailRenderer["createAggregator"]>
    private ctx!: Node3DGUIContext

    constructor(
        readonly scene: Scene,
        size: number,
        parallelCount: number = 2,
    ){
        this.renderer = new ThumbnailRenderer(scene, size, parallelCount)
    }


    async initialize(){
        await this.renderer.initialize()

        this.aggregator = this.renderer.createAggregator()
        
        const ctx: Node3DGUIContext = this.ctx = {
            babylon: B,
            materialLight: new B.StandardMaterial("light", this.scene),
            materialMat: new B.StandardMaterial("mat", this.scene),
            materialMetal: new B.StandardMaterial("metal", this.scene),
            materialShiny: new B.StandardMaterial("shiny", this.scene),
            materialTransparent: new B.StandardMaterial("transparent", this.scene),
            tools,
            scene: this.scene,
            highlight() { },
            unhighlight() { },
        }

        return this
    }


    async render(factory: Node3DFactory<Node3DGUI,Node3D>){
        // Prepare
        const gui = await factory.createGUI(this.ctx)
        if(!gui.root) throw new Error("Failed to create GUI for thumbnail rendering")
        gui.root.position.copyFromFloats(0,-100,0)
        // The thumbnail camera looks straight down, but a node's interactive face
        // is at -Z (spawn orients +Z away from the player). Lay the node on its
        // back so the front face points up (-Z → +Y) and faces the camera.
        gui.root.rotationQuaternion = B.Quaternion.FromUnitVectorsToRef(
            new B.Vector3(0, 0, -1), new B.Vector3(0, 1, 0), new B.Quaternion(),
        )

        // Render
        const image = await this.aggregator.draw(gui.root)

        // Cleanup
        await gui.dispose()
        await gui.root.dispose()
        return image
    }

    dispose(){
        this.aggregator.dispose()
        this.ctx.materialLight.dispose()
        this.ctx.materialMat.dispose()
        this.ctx.materialMetal.dispose()
        this.ctx.materialShiny.dispose()
        this.ctx.materialTransparent.dispose()
    }

}