import { Color3, CreatePolygon, Scene, Vector2, Vector3 } from "@babylonjs/core"
import earcut from "earcut";


export class SoundwaveEmitter {

    base_model

    constructor(
        scene: Scene,
        readonly height: number = 1,
        readonly duration: number = 1000,
        readonly maxScale: number = 5,
        readonly maxVisibility: number = 0.5,
    ){

        // Base Model
        const outside = [] as Vector3[]
        const inside = [] as Vector3[]
        for(let i=0; i<15; i++){
            let x = Math.sin(i/15*Math.PI*2)
            let y = -Math.cos(i/15*Math.PI*2)
            outside.push(new Vector3(x, 0, y))
            inside.push(new Vector3(x*0.8, 0, y*0.8))
        }
        this.base_model = CreatePolygon("polygon", {shape: outside, holes: [inside], depth:.05}, scene, earcut)
        this.base_model.isPickable = false
        this.base_model.checkCollisions = false
        this.base_model.position.y = 99999
    }

    spawn(position: Vector2, color: Color3){
        const instance = this.base_model.clone("soundwave emitter instance")
        instance.registerInstancedBuffer("color", 4)
        instance.instancedBuffers.color = color.toColor4(1)
        instance.position.copyFromFloats(position.x, this.height, position.y)
        instance.visibility = 0
        instance.checkCollisions = false
        instance.isPickable = false
        
        let i = 0
        const o = this.base_model.getScene().onAfterPhysicsObservable.add(()=>{
            i++
            const advancement = i/this.duration
            if(advancement>=1){
                instance.dispose()
                o.remove()
            }
            else{
                const scale = advancement*this.maxScale
                const visibility = Math.sin(advancement*Math.PI)*this.maxVisibility
                instance.scaling.setAll(scale)
                instance.visibility = visibility
            }
        })
    }

}
