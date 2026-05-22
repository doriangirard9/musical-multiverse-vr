import { AbstractMesh, Color4, CreateBox, Mesh } from "@babylonjs/core";
import { MeshUtils } from "../node3d/tools";


export class BoxWave {

    private box: Mesh
    private start = Date.now()

    constructor(
        private target: AbstractMesh,
        private color: Color4,
        private intensity: number
    ){
        const bb = target.getBoundingInfo().boundingBox
        this.box = CreateBox("boxWave", {
            width: (bb.maximumWorld.x - bb.minimumWorld.x),
            height: (bb.maximumWorld.y - bb.minimumWorld.y),
            depth: (bb.maximumWorld.z - bb.minimumWorld.z),
        }, target.getScene())
        this.box.parent = target
        this.box.isPickable = false
        this.box.visibility = 0.5
        MeshUtils.setColor(this.box, color)

        this.box.onBeforeRenderObservable.add(() => {
            const elapsed = Date.now() - this.start
            const scale = 1 + elapsed / 1000 * this.intensity
            this.box.scaling.set(scale, scale, scale)
            this.box.visibility = Math.max(0, 0.5 - elapsed / 1000 * this.intensity)
            if(this.box.visibility <= 0){
                this.box.dispose()
            }
        })
    }



}