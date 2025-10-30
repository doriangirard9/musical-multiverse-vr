import { Color4, CreateCylinder, Quaternion, Scene, Vector3, VertexBuffer } from "@babylonjs/core"
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
    private arrow
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
        
        // Add arrow for direction indication (smaller diameter to facilitate connections)
        this.arrow = CreateCylinder("connection arrow",{
            height: 1,
            diameterBottom: .3,
            diameterTop: 0,
            tessellation: 6,
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
            
            // Calculate direction from A (source) to B (target)
            const direction = b.subtract(a)
            const totalLength = direction.length()
            direction.normalize()

            const orientation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, new Quaternion())
            
            // Reserve 1 unit for the arrow, rest is tube
            const arrowLength = 1
            const tubeLength = Math.max(0.1, totalLength - arrowLength)
            
            // Tube: from A to (almost) B, leaving space for arrow
            const tubeEndPoint = a.add(direction.scale(tubeLength))
            const tubeCenter = a.add(tubeEndPoint).scale(0.5)
            this.tube.setAbsolutePosition(tubeCenter)
            this.tube.rotationQuaternion = orientation
            this.tube.scaling.set(1, tubeLength, 1)
            
            // Arrow: from end of tube to B (the remaining space)
            const arrowCenter = tubeEndPoint.add(b).scale(0.5)
            this.arrow.setAbsolutePosition(arrowCenter)
            this.arrow.rotationQuaternion = orientation
            this.arrow.scaling.set(1, arrowLength, 1)

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
        MeshUtils.setColor(this.arrow, color)
        this.set_states("color")
    }

    dispose(){
        this.on_dispose()
        if(this.buildTimeout) clearTimeout(this.buildTimeout)
        this.tube.dispose()
        this.arrow.dispose()
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
            const color = Color4.FromArray(value as number[])
            MeshUtils.setColor(this.tube, color)
            MeshUtils.setColor(this.arrow, color)
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
            name: "visual_connection",
            doc,
            async create() { return new VisualTube(scene, syncmanager) },
            async on_add(instance) { instance.on_dispose = ()=> syncmanager.remove(instance) },
            async on_remove(instance) { instance.dispose() },
        })
        return syncmanager
    }
}