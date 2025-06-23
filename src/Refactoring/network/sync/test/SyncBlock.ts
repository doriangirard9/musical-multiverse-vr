import { ActionManager, Color3, CreateBox, ExecuteCodeAction, Quaternion, Scene, SixDofDragBehavior, Vector3 } from "@babylonjs/core";
import { MeshUtils } from "../../../ConnecterWAM/node3d/tools";
import { Synchronized } from "../Synchronized";
import { SyncSerializable } from "../SyncSerializable";
import { SyncManager } from "../SyncManager";
import { Doc } from "yjs";


export class SyncBlock implements Synchronized{

    mesh

    constructor(scene: Scene, manager: SyncManager<SyncSerializable,SyncBlock>){
        this.mesh = CreateBox("syncedBlock", {size: 1}, scene)

        const dragBehavior = new SixDofDragBehavior()
        dragBehavior.onDragObservable.add(() => {
            this.set_states("transform")
        })
        this.mesh.rotationQuaternion = Quaternion.Identity()
        this.mesh.addBehavior(dragBehavior)

        const actionManager = this.mesh.actionManager = new ActionManager(scene)
        actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnRightPickTrigger, ()=>{
            this.color = Color3.Random()
            this.set_states("color")
        }))

        actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnCenterPickTrigger, ()=>{
            manager.remove(this.id)
        }))

        this.color = Color3.Red()
    }


    private _color = new Color3(1, 0, 0)

    get color(){ return this._color }
    
    set color(value: Color3){
        this._color = value
        MeshUtils.setColor(this.mesh, value.toColor4(1))
    }


    //// Synchronization ////
    public id = ""

    private set_states: (key: string) => void = () => {}

    async initSync(id: string, set_state: (key: string) => void) {
        this.id = id
        this.set_states = set_state
    }

    disposeSync(): void {
        this.id = ""
        this.set_states = ()=>{}
    }

    askStates(): void {
        this.set_states("color")
        this.set_states("transform")
    }

    async setState(key: string, value: SyncSerializable) {
        if(key=="color") this.color = Color3.FromArray(value as number[])
        else if(key=="transform"){
            const transform = value as {position:number[],rotation:number[]}
            this.mesh.position = Vector3.FromArray(transform.position)
            this.mesh.rotationQuaternion = Quaternion.FromArray(transform.rotation)
        }
    }

    async removeState(_: string) { }

    async getState(key: string): Promise<SyncSerializable> {
        if(key=="color") return this.color.asArray()
        else if(key=="transform") return {position:this.mesh.position.asArray(), rotation:this.mesh.rotationQuaternion!!.asArray()}
        else return null
    }

    dispose(){
        this.mesh.dispose()
    }

    static getSyncManager(scene: Scene, doc: Doc){
        const syncmanager: SyncManager<SyncSerializable,SyncBlock> = new SyncManager({
            name: "synctest_syncblock",
            doc,
            async create() { return new SyncBlock(scene, syncmanager) },
            async on_remove(instance) { instance.dispose() },
        })
        return syncmanager
    }

}