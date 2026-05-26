import { ImportMeshAsync, TransformNode, Vector3 } from "@babylonjs/core";
import { Node3dManager } from "../app/Node3dManager";
import { N3DShared } from "../node3d/instance/N3DShared";
import { N3DPreviewer } from "./N3DPreviewer";

const STAND_MODEL_URL = (await import("./stand.glb?url")).default

/**
 * A wooden stand, with a Node3D preview ontop that can be dragged to create a new Node3D.
 */
export class Node3DStand{

    root: TransformNode
    preview!: N3DPreviewer

    constructor(
        private shared: N3DShared,
        private kind: string,
        private node3DManager: Node3dManager,
    ){
        this.root = new TransformNode(`${kind} stand root`)
    }

    async initialize(){
        const stand_root = (await ImportMeshAsync(STAND_MODEL_URL,this.shared.scene)).meshes[0]
        const stand_mesh = stand_root.getChildMeshes().find(m => m.name === "stand")!!
        const preview_target = stand_root.getChildMeshes().find(m => m.name === "placement")!!
        
        const preview = this.preview = new N3DPreviewer(this.shared, this.kind, this.node3DManager)
        await preview.initialize()

        preview.root.parent = this.root
        preview.root.position.copyFrom(preview_target.position)
        preview.root.rotation.copyFrom(preview_target.rotation)
        preview.root.rotationQuaternion = preview_target.rotationQuaternion?.clone() ?? null

        stand_mesh.parent = this.root

        preview_target.dispose()
        stand_root.dispose()
    }

    dispose(){
        this.preview.dispose()
        this.root.dispose()
    }

}

const STANDS = [ "livepiano", "maracas", "audiooutput", "oscillator"]

export async function createStandCollection(shared: N3DShared, node3DManager: Node3dManager): Promise<{root: TransformNode, stands:Node3DStand[]}>{
    const root = new TransformNode("stand collection", shared.scene)
    const offset = new Vector3(-.5,0,0)
    const added = new Vector3(-.7,0,0)
    const stands = await Promise.all(STANDS.map(async(kind)=>{
        const stand = new Node3DStand(shared,kind,node3DManager)
        await stand.initialize()
        stand.root.parent = root
        stand.root.position.copyFrom(offset)
        
        added.scaleInPlace(-1)
        offset.scaleInPlace(-1).addInPlace(added)
        return stand
    }))
    return {root,stands}
}