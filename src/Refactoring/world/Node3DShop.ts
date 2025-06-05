import { Node, TransformNode, Vector3 } from "@babylonjs/core";
import { N3DPreviewer } from "./N3DPreviewer";
import { Node3dManager } from "../app/Node3dManager";
import { N3DShared } from "../node3d/instance/N3DShared";

/**
 * A node3D shop.
 * Take a mesh as input, find all subnode whome names starts with "placement", and replace
 * them with nodes3D previews.
 * 
 * To choose the placement that will be used first, the placement are sorted by their name in alphabetical order.
 */
export class Node3DShop {

    private free_positions = [] as number[]
    private positions = [] as {name:string, parent:Node, position:Vector3, rotation:Vector3, scaling:Vector3, preview?:N3DPreviewer}[]
    readonly root
    private disposed = false

    constructor(
        target: TransformNode,
        config?:{order?:"sorted"|"random"|"nothing"},
    ){

        for(const mesh of target.getChildMeshes(false)){
            if(mesh.name.startsWith("placement")){
                let rotation: Vector3
                if(mesh.rotationQuaternion) rotation = mesh.rotationQuaternion.toEulerAngles()
                else rotation = mesh.rotation

                this.positions.push({
                    name: mesh.name,
                    parent: mesh.parent!!,
                    position: mesh.position.clone(),
                    rotation: rotation,
                    scaling: mesh.scaling.clone()
                })
                this.free_positions.push(this.positions.length-1)
                mesh.dispose()
            }
        }

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

    async initialize(shared: N3DShared, node3DManager: Node3dManager, kinds: string[]){
        await Promise.all(kinds.map(async(kind)=>{
            if(this.free_positions.length === 0)return
            const preview = new N3DPreviewer(shared, kind, node3DManager)
            await preview.initialize()
            if(this.disposed)return
            const pindex = this.free_positions.shift()!!
            const positions = this.positions[pindex]
            preview.root.parent = positions.parent
            preview.root.position.copyFrom(positions.position)
            preview.root.rotation.copyFrom(positions.rotation)
            preview.root.scaling.copyFrom(positions.scaling).scaleInPlace(2)
            preview.root.rotationQuaternion = null
            positions.preview = preview
        }))
    }

    dispose(){
        this.disposed = true
        this.positions.forEach(({preview: mesh})=>mesh?.dispose())
        this.root.dispose()
    }

    static SHOP_KINDS=  [
        "livepiano", "maracas", "audiooutput", "oscillator", "notesbox",
        "modal", "tiny54", "voxamp", "flute", "disto_machine", "guitar", "kverb",
    ]

    static SHOP_MODEL_URL: string
}

Node3DShop.SHOP_MODEL_URL = (await import("./music_shop.glb?url")).default