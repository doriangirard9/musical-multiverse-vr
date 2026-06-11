import { AbstractMesh, Behavior, Color3, CreateBox, Nullable, Scene } from "@babylonjs/core";
import { MeshUtils } from "../node3d/tools";

/**
 * A simple box shaped highlighting effect.
 * When attached to a abstract mesh, it highlight it.
 */
export class BoxHighlight implements Behavior<AbstractMesh>{

    box

    constructor(
        scene: Scene,
        color: Color3 = Color3.White()
    ){
        this.box = CreateBox("box", {size:1}, scene)
        this.box.visibility = 0.2
        this.box.isPickable = false
        this.box.checkCollisions = false
        this.box.doNotSyncBoundingInfo = false
        this.box.setEnabled(false)
        MeshUtils.setColor(this.box, color.toColor4(1))
    }

    get name(){ return this.constructor.name }

    attachedNode!: Nullable<AbstractMesh>

    init(): void { }

    attach(target: AbstractMesh): void {
        try{
        this.detach()

        this.attachedNode = target

        this.box.setEnabled(true)

        const place = ()=>{
            const bbox = target.getBoundingInfo().boundingBox
            this.box.position.copyFrom(bbox.centerWorld)
            this.box.scaling = bbox.extendSizeWorld.scale(2.1)
        }

        const o2 = target.onAfterWorldMatrixUpdateObservable.add(()=>{
            place()
        })
        place()

        this.detach = ()=>{
            o2.remove()
            this.attachedNode = null
            this.box.setEnabled(false)
            this.detach = ()=>{}
        }
        }catch(e){
            console.error("Error attaching highlight to target", target, e)
        }
    }

    detach = ()=>{}
}