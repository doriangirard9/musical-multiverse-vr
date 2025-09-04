import { Color3, Color4, CreateCylinder, Quaternion, Scene, Vector3, VertexBuffer } from "@babylonjs/core"
import { SyncSerializable } from "../network/sync/SyncSerializable"
import { Doc } from "yjs"
import { SyncManager } from "../network/sync/SyncManager"
import { MeshUtils } from "../node3d/tools"

/**
 * Une connection entre deux connectable de deux Node3D.
 * Gère le visuel et la logique des connections.
 */
export class VisualTube{

    private tube
    public on_dispose = ()=>{}

    constructor(
        private scene: Scene,
        private tubes: SyncManager<VisualTube,any>,
    ){
        this.tube = CreateCylinder("connection tube",{
            height: 1,
            diameter: .25,
            tessellation: 6
        },this.scene)
    }

    // Connection
    private cA = Vector3.Zero()
    private cB = Vector3.Zero()
    private buildTimeout?: any

    /**
     * Connect la node3D à deux connections. Pas de synchronisation.
     * @param cA 
     * @param cB 
     * @returns 
     */
    private set(a: Vector3, b: Vector3): boolean{

        if(!this.buildTimeout)this.buildTimeout = setTimeout(()=>{
            this.cA.copyFrom(a)
            this.cB.copyFrom(b)
            
            // Some calculations
            const offset = a.subtract(b)
            const length = offset.length()*.8
            offset.normalize()

            const pointA = a
            const pointB = b

            const orientation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), offset.normalizeToNew(), new Quaternion())
            
            // Move the tube
            const tubeCenter = pointA.scale(.6).add(pointB.scale(.4))
            this.tube.setAbsolutePosition(tubeCenter)
            this.tube.rotationQuaternion = orientation
            this.tube.scaling.set(1,length,1)

            this.buildTimeout = undefined
        },10)
        return true
    }

    move(a: Vector3, b: Vector3){
        this.set(a,b)
        this.set_states("position")
    }

    setColor(color: Color4){
        MeshUtils.setColor(this.tube, color)
        this.set_states("color")
    }

    dispose(){
        this.on_dispose()
        if(this.buildTimeout) clearTimeout(this.buildTimeout)
        this.tube.dispose()
    }

    //// Synchronization ////
    private set_states: (key: string) => void = () => {}
    
    async initSync(_: string, set_state: (key: string) => void) { this.set_states = set_state }

    disposeSync(): void { this.set_states = ()=>{} }

    askStates(): void {
        this.set_states("position")
        this.set_states("color")
    }

    async removeState(_: string) { }

    async setState(key: string, value: SyncSerializable) {
        if(key=="position"){
            const [a,b] = value as [number[], number[]]
            this.cA.fromArray(a)
            this.cB.fromArray(b)
            this.set(this.cA, this.cB)
        }
        else if(key=="color"){
            MeshUtils.setColor(this.tube, Color4.FromArray(value as number[]))
        }
    }

    async getState(key: string): Promise<SyncSerializable> {
        if(key=="position"){
            return [this.cA.asArray(), this.cB.asArray()]
        }
        else if(key=="color"){
            return [...this.tube.getVerticesData(VertexBuffer.ColorKind)!!.slice(0,4)]
        }
        else return null
    }

    remove(){
        this.tubes.remove(this)
    }

    static getSyncManager(scene: Scene, doc: Doc){
        const syncmanager: SyncManager<VisualTube,any> = new SyncManager({
            name: "node3d_connections",
            doc,
            async create() { return new VisualTube(scene, syncmanager) },
            async on_add(instance) { instance.on_dispose = ()=> syncmanager.remove(instance) },
            async on_remove(instance) { instance.dispose() },
        })
        return syncmanager
    }
}