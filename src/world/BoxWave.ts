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
        // Local size: the box is a child of the target, so the scaling of the target is applied to it
        // already. Sized in world space, a scaled target scaled it twice.
        const bb = target.getBoundingInfo().boundingBox
        this.box = CreateBox("boxWave", {
            width: bb.maximum.x - bb.minimum.x,
            height: bb.maximum.y - bb.minimum.y,
            depth: bb.maximum.z - bb.minimum.z,
        }, target.getScene())
        this.box.parent = target
        this.box.position.copyFrom(bb.center)
        this.box.isPickable = false
        this.box.visibility = 0.5
        MeshUtils.setColor(this.box, color)

        // Animated and disposed before the scene renders, not from the box's own before render event:
        // disposed there, the box was still drawn that frame from released buffers, which flashed
        // the view at the end of every wave.
        const scene = target.getScene()
        const observer = scene.onBeforeRenderObservable.add(() => {
            if(this.box.isDisposed()){
                observer.remove()
                return
            }
            const elapsed = Date.now() - this.start
            const scale = 1 + elapsed / 1000 * this.intensity
            this.box.scaling.set(scale, scale, scale)
            this.box.visibility = Math.max(0, 0.5 - elapsed / 1000 * this.intensity)
            if(this.box.visibility <= 0){
                observer.remove()
                this.box.dispose()
            }
        })
    }



}
