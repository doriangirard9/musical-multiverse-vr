import { AbstractMesh, Color4, CreateCylinder, CreatePolygon, InstancedMesh, Mesh, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { MeshUtils } from "../node3d/tools/utils/MeshUtils";

export const AsyncLoading = {

    create<T>(scene: Scene, promise: Promise<T>){
        const root = new TransformNode("async loading root", scene)

        const instance = this.getLoading(scene).createInstance("loading")
        instance.isPickable = false
        instance.checkCollisions = false
        instance.billboardMode = AbstractMesh.BILLBOARDMODE_ALL
        instance.setParent(root)
        instance.resetLocalMatrix()

        const o = scene.onAfterPhysicsObservable.add(()=>{
            instance.rotation.z -= 0.1
        })

        instance.onDisposeObservable.add(()=>{
            o.remove()
        })

        const p = promise.then((result)=>{
            instance.dispose()
            return result
        }).catch(e=>{
            console.error("Error while loading async content",e)
            instance.dispose()
            const error = this.getCross(scene).createInstance("error")
            error.billboardMode = AbstractMesh.BILLBOARDMODE_ALL
            error.setParent(root)
            error.resetLocalMatrix()
            error.isPickable = false
            error.checkCollisions = false
            setTimeout(()=>{
                error.dispose()
            },5000)
            return null
        })

        return {root,promise:p}
    },

    getLoading(scene: Scene): Mesh{
        return this.createModel(scene, "async loading model", ()=>{
            const points = [] as Vector3[]

            function* variables(){
                for(let i=0; i<14; i++){
                    yield [i,1]
                }
                for(let i=0; i<14; i++){
                    yield [13-i,0]
                }
            }

            for(const [r,d] of variables()){
                let x = Math.sin(r/15*Math.PI*2)
                let y = -Math.cos(r/15*Math.PI*2)
                let z = 0.7+d*0.3
                points.push(new Vector3(x*z, 0, y*z))
            }
            
            return points
        },()=>{})
    },

    getCross(scene: Scene): Mesh{
        return this.createModel(scene, "async cross model", ()=>{
            const points = [] as Vector3[]

            for(let a=0; a<4; a++){
                let x = Math.sin(a/4*Math.PI*2)
                let y = -Math.cos(a/4*Math.PI*2)
                let sx = y * 0.2
                let sy = -x * 0.2
                points.push(
                    new Vector3(x*.2+sx, 0, y*.2+sy),
                    new Vector3(x+sx, 0, y+sy),
                    new Vector3(x-sx, 0, y-sy)
                )
            }
            
            return points
        }, it=>{
            it.rotation.z = -Math.PI/4
            MeshUtils.setColor(it, new Color4(1,0,0,1))
        })
    },

    createModel(scene: Scene, name: string, points: ()=>Vector3[], meshmodifier: (mesh:Mesh)=>void): Mesh{
        return this.store(scene, name, ()=>{
            const po = CreatePolygon(name, {shape: points(), depth:.05}, scene)
            po.rotation.x = Math.PI/2
            po.bakeCurrentTransformIntoVertices()
            meshmodifier(po)
            po.bakeCurrentTransformIntoVertices()
            po.position.y = 99999
            return po
        })
    },

    store<T>(obj:any, name: string, factory:()=>T): T{
        if(obj[name]) return obj[name]
        const value = factory()
        obj[name] = value
        return value
    },
}