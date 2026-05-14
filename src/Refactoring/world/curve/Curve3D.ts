import { Color4, CreateLines, Immutable, Mesh, Scene, Vector3 } from "@babylonjs/core";
import { Synchronized } from "../../network/sync/Synchronized";
import { SyncSerializable } from "../../network/sync/SyncSerializable";
import { Doc } from "yjs";
import { SyncManager } from "../../network/sync/SyncManager";

/**
 * A simple 3D curve visual, defined by a list of points. The curve is rendered as a line strip.
 * The curve is synchronizable, and can be shared across the network.
 */
export class Curve3D implements Synchronized {

    constructor(readonly color: Color4, readonly scene: Scene){}


    // Points
    private _points: Vector3[] = []

    set points(points: Vector3[]){
        this._points = points
        this.updateMesh()
        this.set_state?.("points")
    }

    get points(): Immutable<Vector3>[] { return this._points }


    // Mesh
    private _mesh?: Mesh

    updateMesh(){
        if(this._mesh){
            this._mesh.dispose()
            this._mesh = undefined
        }
        if(this._points.length >= 2){
            this._mesh = CreateLines("curve3d", {
                points: this._points, 
                colors: Array.from({length: this._points.length}, _ => this.color),
                updatable: false,
            }, this.scene)
            this._mesh.isPickable = false
            this._mesh.checkCollisions = false
        }
    }

    private disposed = false

    dispose(){
        if(this.disposed)return
        this.disposed = true

        this._mesh?.dispose()
        this.on_dispose?.()
    }

    on_dispose?: ()=>void


    // Synchronized
    private set_state?: (key: string) => void

    async initSync(id: string, set_state: (key: string) => void) {
        this.set_state = set_state
    }

    disposeSync(): void { this.set_state = undefined }

    askStates(): void { this.set_state?.("points") }

    async setState(key: string, value: SyncSerializable) {
        if(key === "points"){
            this._points = (value as number[][]).map(arr => new Vector3(arr[0], arr[1], arr[2]))
            this.updateMesh()
        }
    }

    async removeState(key: string) {}

    async getState(key: string): Promise<SyncSerializable> {
        if(key === "points"){
            return this.points.map(it=>it.asArray())
        }
        return null
    }

    static getSyncManager(
        doc: Doc,
        scene: Scene,
        onAdd?: (instance:Curve3D)=>void,
        onRemove?: (instance:Curve3D)=>void,
    ) {
        const syncmanager: SyncManager<Curve3D,string> = new SyncManager({
            name: "3d_curve",
            doc,
            async on_add(instance) {
                instance.on_dispose = () => syncmanager.remove(instance)
                onAdd?.(instance)
            },
            async create(_, __, color) { return new Curve3D(Color4.FromHexString(color),scene) },
            async on_remove(instance) {
                onRemove?.(instance)
                instance.dispose()
            },
        })
        // syncmanager.add(node_id,node,kind)
        return syncmanager
    }
}