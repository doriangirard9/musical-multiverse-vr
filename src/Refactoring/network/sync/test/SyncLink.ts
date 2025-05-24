import { AbstractMesh, CreateTube, Observer, Scene } from "@babylonjs/core"
import { Synchronized } from "../Synchronized"
import { SyncManager } from "../SyncManager"
import { SyncBlock } from "./SyncBlock"
import { Doc } from "yjs"
import { SyncSerializable } from "../SyncSerializable"


export class SyncLink implements Synchronized{

    constructor(
        private scene: Scene, 
        private blocks: SyncManager<any, SyncBlock>,
    ){
    }

    private mesh?: AbstractMesh
    private from_observable?: Observer<any>
    private to_observable?: Observer<any>
    private from: SyncBlock|null = null
    private to: SyncBlock|null = null

    setPath(from: SyncBlock|null, to: SyncBlock|null){
        this.set_path(from,to)
        this.set_states("border")
    }

    private set_path(from: SyncBlock|null, to: SyncBlock|null){
        // Remove old
        this.mesh?.dispose()
        this.from_observable?.remove()
        this.to_observable?.remove()
        this.from_observable = undefined
        this.to_observable = undefined

        // Add new
        this.from = from
        this.to = to
        if(from && to){
            this.from_observable = from.mesh.onAfterWorldMatrixUpdateObservable.add(() => this.buildMesh())
            this.to_observable = to.mesh.onAfterWorldMatrixUpdateObservable.add(() => this.buildMesh())
            this.buildMesh()
        }
    }

    private buildTimeout?: any
    private buildMesh(){
        if(!this.buildTimeout){
            this.buildTimeout = setTimeout(()=>{
                if(this.mesh){
                    this.mesh.dispose()
                }
                this.mesh = CreateTube("syncedLink", {
                    path: [this.from!!.mesh.absolutePosition, this.to!!.mesh.absolutePosition],
                    tessellation: 5,
                    radius:.1
                },this.scene)
                this.buildTimeout = undefined
            },100)
        }
    }



    //// Synchronization ////
    private set_states: (key: string) => void = () => {}
    
    async initSync(_: string, set_state: (key: string) => void) {
        this.set_states = set_state
    }

    disposeSync(): void {
        this.set_states = ()=>{}
    }

    askStates(): void {
        this.set_states("border")
    }

    async removeState(_: string) { }

    async setState(key: string, value: SyncSerializable) {
        console.log("setState",key,value)
        if(key=="border"){
            const {fromid,toid} = value as {fromid:string, toid:string}
            console.log("PathId ",fromid," to ",toid)
            console.log("PathNow ", this.blocks.getInstanceNow(fromid), " to ", this.blocks.getInstanceNow(toid))
            const from = await this.blocks.getInstance(fromid) ?? null
            const to = await this.blocks.getInstance(toid) ?? null
            console.log("Path ",from," to ",to)
            this.set_path(from,to)
        }
    }

    async getState(key: string): Promise<SyncSerializable> {
        if(key=="border") return {fromid: this.from?.id??null, toid: this.to?.id??null}
        else return null
    }

    dispose(){
        this.set_path(null,null)
    }



    static getSyncManager(scene: Scene, doc: Doc, blocks: SyncManager<any, SyncBlock>){
        const syncmanager: SyncManager<SyncSerializable,SyncLink> = new SyncManager({
            name: "synctest_synclink",
            doc,
            async create() { return new SyncLink(scene, blocks) },
            async on_remove(instance) { instance.dispose() },
        })
        return syncmanager
    }

}