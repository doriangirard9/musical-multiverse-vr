import {Color4, MeshBuilder, Node, TransformNode, Vector3} from "@babylonjs/core";
import { N3DPreviewer } from "./N3DPreviewer";
import { Node3dManager } from "../app/Node3dManager";
import { N3DShared } from "../node3d/instance/N3DShared";
import {N3DText} from "../node3d/instance/utils/N3DText.ts";
import {MeshUtils} from "../node3d/tools";

/**
 * A node3D shop.
 * Take a mesh as input, find all subnode whome names starts with "placement", and replace
 * them with nodes3D previews.
 * 
 * To choose the placement that will be used first, the placement are sorted by their name in alphabetical order.
 */
export class Node3DShop {

    private free_positions = [] as number[]
    private positions = [] as {name:string, parent:Node, position:Vector3, rotation:Vector3, scaling:Vector3, type: 'gen'|'inst'|'effect', preview?:N3DPreviewer}[]
    readonly root
    private disposed = false

    constructor(
        target: TransformNode,
        config?:{order?:"sorted"|"random"|"nothing"},
    ){

        for(const mesh of target.getChildMeshes(false)){
            if(mesh.name.includes("placement")){
                console.log(mesh.name)
                let rotation: Vector3
                if(mesh.rotationQuaternion) rotation = mesh.rotationQuaternion.toEulerAngles()
                else rotation = mesh.rotation

                this.positions.push({
                    name: mesh.name,
                    parent: mesh.parent!!,
                    position: mesh.position.clone(),
                    rotation: rotation,
                    scaling: mesh.scaling.clone(),
                    type: mesh.name.includes("gen_") ? 'gen' :
                        mesh.name.includes("inst_") ? 'inst' : 'effect'
                })
                this.free_positions.push(this.positions.length-1)

                if (mesh.name === "inst_placement.052") {
                    console.log("Found inst_placement.052, creating text")
                    const text = new N3DText("INSTRUMENTS", [mesh])
                    text.plane.billboardMode = TransformNode.BILLBOARDMODE_NONE
                    text.set("INSTRUMENTS")
                    text.updatePosition()
                    text.plane.scaling = new Vector3(1.5,1.5,1.5)
                    text.plane.setAbsolutePosition(new Vector3(-11.4,-1.25,21.3))
                    text.plane.rotation.y = Math.PI * 3 / 2
                    text.show()
                }
                if (mesh.name === "gen_placement.055") {
                    console.log("Found gen_placement.055, creating text")
                    const text = new N3DText("GENERATEURS", [mesh])
                    text.plane.billboardMode = TransformNode.BILLBOARDMODE_NONE
                    text.set("GENERATEURS")
                    text.updatePosition()
                    text.plane.scaling = new Vector3(1.5,1.5,1.5)
                    text.plane.setAbsolutePosition(new Vector3(-11.4,-1.25,24.4))
                    text.plane.rotation.y = Math.PI * 3 / 2
                    text.show()
                }
                if (mesh.name === "placement.059") {
                    console.log("Found effect_placement.059, creating text")
                    const text = new N3DText("EFFETS", [mesh])
                    text.plane.billboardMode = TransformNode.BILLBOARDMODE_NONE
                    text.set("EFFETS")
                    text.updatePosition()
                    text.plane.scaling = new Vector3(1.5,1.5,1.5)
                    text.plane.setAbsolutePosition(new Vector3(-11.4,-1.25,29.35))
                    text.plane.rotation.y = Math.PI * 3 / 2
                    text.show()
                }
                mesh.dispose()
            }
        }
        // backside panel pour faire ressortir les couleurs des categories
        const backsidePanelInst = MeshBuilder.CreatePlane("backside panel instrument", {size: 3}, target.getScene())
        backsidePanelInst.position = new Vector3(-12.2, 1, 24.5)
        backsidePanelInst.rotation.y = Math.PI * 3 / 2
        backsidePanelInst.scaling.y = 2
        MeshUtils.setColor(backsidePanelInst,new Color4().fromHexString("#b55920"))

        const backsidePanelGen = MeshBuilder.CreatePlane("backside panel generator", {size: 3}, target.getScene())
        backsidePanelGen.position = new Vector3(-12.2, 1, 21.23)
        backsidePanelGen.rotation.y = Math.PI * 3 / 2
        backsidePanelGen.scaling.y = 2
        MeshUtils.setColor(backsidePanelGen,new Color4().fromHexString("#bebd47"))

        const backsidePanelEffect = MeshBuilder.CreatePlane("backside panel effect", {size: 3}, target.getScene())
        backsidePanelEffect.position = new Vector3(-12.2, 1, 29.35)
        backsidePanelEffect.rotation.y = Math.PI * 3 / 2
        backsidePanelEffect.scaling.y = 2
        backsidePanelEffect.scaling.x = 2.1
        MeshUtils.setColor(backsidePanelEffect,new Color4().fromHexString("#3f6eb3"))


        switch(config?.order??"sorted"){
            case "sorted":
                this.free_positions.sort((a,b)=>this.positions[a].name.localeCompare(this.positions[b].name))
                break
            case "random":
                this.free_positions.sort(() => Math.random() - 0.5)
                break
            default:
        }

        this.root = target
    }

    async initialize(shared: N3DShared, node3DManager: Node3dManager, kinds?: string[]){
        const kindsToUse = kinds || Node3DShop.SHOP_KINDS

        // Séparer les positions par type
        const genPositions = this.free_positions.filter(i => this.positions[i].type === 'gen')
        const instPositions = this.free_positions.filter(i => this.positions[i].type === 'inst')
        const effectPositions = this.free_positions.filter(i => this.positions[i].type === 'effect')

        const tasks = []
        /*
         * Si tu as une idée plus propre pour faire ça, je suis preneur.
         */
        for(let i = 0; i < Math.min(Node3DShop.GEN_KINDS.length, genPositions.length); i++){
            tasks.push(this.createPreview(shared, node3DManager, Node3DShop.GEN_KINDS[i], genPositions[i]))
        }

        for(let i = 0; i < Math.min(Node3DShop.INST_KINDS.length, instPositions.length); i++){
            tasks.push(this.createPreview(shared, node3DManager, Node3DShop.INST_KINDS[i], instPositions[i]))
        }

        for(let i = 0; i < Math.min(Node3DShop.EFFECT_KINDS.length, effectPositions.length); i++){
            tasks.push(this.createPreview(shared, node3DManager, Node3DShop.EFFECT_KINDS[i], effectPositions[i]))
        }

        await Promise.all(tasks)
    }
    private async createPreview(shared: N3DShared, node3DManager: Node3dManager, kind: string, positionIndex: number){
        const preview = new N3DPreviewer(shared, kind, node3DManager)
        await preview.initialize()
        if(this.disposed) return

        const positions = this.positions[positionIndex]
        preview.root.parent = positions.parent
        preview.root.position.copyFrom(positions.position)
        preview.root.rotation.copyFrom(positions.rotation)
        preview.root.scaling.copyFrom(positions.scaling).scaleInPlace(2)
        preview.root.rotationQuaternion = null
        positions.preview = preview
    }
    dispose(){
        this.disposed = true
        this.positions.forEach(({preview: mesh})=>mesh?.dispose())
        this.root.dispose()
    }

    static GEN_KINDS = [
        "livepiano", "maracas", "notesbox","oscillator",//"pianoroll"
    ]

    static INST_KINDS = [
        "tiny54", "flute", "guitar"
    ]

    // Removed "kverb" -> crashes the app

    static EFFECT_KINDS = [
        "audiooutput", "voxamp", "disto_machine",
        "wam3d-Big Muff", "wam3d-Grey Hole","wam3d-Ping Pong Delay",
    ]

    static SHOP_KINDS = [
        ...Node3DShop.GEN_KINDS,
        ...Node3DShop.INST_KINDS,
        ...Node3DShop.EFFECT_KINDS
    ]

    static SHOP_MODEL_URL: string
}

Node3DShop.SHOP_MODEL_URL = (await import("./music_shop.glb?url")).default