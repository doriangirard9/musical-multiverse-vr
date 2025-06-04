import { ImportMeshAsync, LoadAssetContainerAsync, LoadSceneAsync, TransformNode, Vector3 } from "@babylonjs/core";
import { Node3dManager } from "../app/Node3dManager";
import { N3DShared } from "../node3d/instance/N3DShared";
import { Node3DFactory, Node3DGUI } from "../node3d/Node3D";
import { AudioOutputN3DFactory } from "../node3d/subs/AudioOutputN3D";
import { LivePianoN3DFactory } from "../node3d/subs/LivePianoN3D";
import { MaracasN3DFactory } from "../node3d/subs/maracas/MaracasN3D";
import { N3DPreviewer } from "../node3d/instance/N3DPreviewer";
import { OscillatorN3DFactory } from "../node3d/subs/OscillatorN3D";
import { Wam3DGeneratorN3DFactory } from "../node3d/subs/Wam3DGeneratorN3D";

const STAND_MODEL_URL = (await import("./stand.glb?url")).default

/**
 * A wooden stand, with a Node3D preview ontop that can be dragged to create a new Node3D.
 */
export class Node3DStand{

    root: TransformNode
    preview!: N3DPreviewer

    constructor(
        private shared: N3DShared,
        private factory: Node3DFactory<Node3DGUI,any>,
        private kind: string,
        private node3DManager: Node3dManager,
    ){
        this.root = new TransformNode(`${factory.label} stand root`)
    }

    async initialize(){
        const stand_root = (await ImportMeshAsync(STAND_MODEL_URL,this.shared.scene)).meshes[0]
        const stand_mesh = stand_root.getChildMeshes().find(m => m.name === "stand")!!
        const preview_target = stand_root.getChildMeshes().find(m => m.name === "placement")!!
        
        const preview = this.preview = new N3DPreviewer(this.shared, this.factory, this.kind, this.node3DManager)
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


// TODO: Il faut changer Node3DBuilder pour pouvoir récupérer directement une Node3Dfactory à partir
// de son nom.
const STANDS: {factory:Node3DFactory<Node3DGUI,any>, kind:string}[]=[
    {factory: LivePianoN3DFactory, kind:"livepiano"},
    {factory: MaracasN3DFactory, kind:"maracas"},
    {factory: AudioOutputN3DFactory, kind:"audiooutput"},
    {factory: OscillatorN3DFactory, kind:"oscillator"},
]

export async function createStandCollection(shared: N3DShared, node3DManager: Node3dManager): Promise<{root: TransformNode, stands:Node3DStand[]}>{
    const root = new TransformNode("stand collection", shared.scene)
    const offset = new Vector3(-.5,0,0)
    const added = new Vector3(-.7,0,0)
    const stands = await Promise.all(STANDS.map(async({factory,kind})=>{
        const stand = new Node3DStand(shared,factory,kind,node3DManager)
        await stand.initialize()
        stand.root.parent = root
        stand.root.position.copyFrom(offset)
        
        added.scaleInPlace(-1)
        offset.scaleInPlace(-1).addInPlace(added)
        return stand
    }))
    return {root,stands}
}