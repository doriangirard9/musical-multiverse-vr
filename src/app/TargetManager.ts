import { AbstractMesh, Observable } from "@babylonjs/core"
import { N3DConnectionInstance } from "../node3d/instance/N3DConnectionInstance"
import { Node3DInstance } from "../node3d/instance/Node3DInstance"
import { ControllerInput, InputManager } from "../xr/inputs"
import { Node3dManager } from "./Node3dManager"
import { SceneManager } from "./SceneManager"


/**
 * Manager responsible of searching the game object
 * actually pointed by the controller.
 */
export class TargetManager {

    // Instance
    static _instance?: TargetManager

    static async initialize(...network: ConstructorParameters<typeof TargetManager>){
        this._instance = new TargetManager(...network)
    }

    static getInstance(): TargetManager {
        if(!this._instance) throw new Error("TargetManager not initialized. Call initialize() first.")
        return this._instance
    }

    left
    right
    screen
    controller_to_target

    constructor(
        readonly scene: SceneManager,
        readonly inputs: InputManager,
        readonly nodeManager: Node3dManager,
    ){
        this.left = new TargetManagerController(inputs.left, this)

        this.right = new TargetManagerController(inputs.right, this)

        this.screen = new TargetManagerController(inputs.screen, this)

        this.controller_to_target = new Map([
            [inputs.left, this.left],
            [inputs.right, this.right],
            [inputs.screen, this.screen],
        ])
    }

}

export interface TargetManagerTarget {
    node?: Node3DInstance
    connection?: N3DConnectionInstance
}

export class TargetManagerController{

    /** Called on target change */
    onNewTarget = new Observable<{old:TargetManagerTarget, new:TargetManagerTarget}>()

    /** Get the current target of the controller */
    get target(){ return this._current }


    private _current: TargetManagerTarget = {}

    constructor(readonly controller: ControllerInput, readonly targetManager: TargetManager){
        const {pointer} = controller
        pointer.onNewTarget.add(()=>{
            const pointed = pointer.targetMesh

            const new_target = pointed==undefined ? {} : this.getAssociatedObject(pointed)
            const old_target = this._current

            this._current = new_target

            const same = (
                new_target?.node==old_target?.node &&
                new_target?.connection==old_target?.connection
            )
            

            if(!same) this.onNewTarget.notifyObservers({old: old_target, new: new_target})
        })
    }

    private getAssociatedObject(pointed: AbstractMesh): TargetManagerTarget{
        // Node3DInstances
        for(const [_,node] of this.targetManager.nodeManager.getRegistry().nodes.entries())
            if(pointed==node.boundingBoxMesh || pointed.isDescendantOf(node.boundingBoxMesh))
                return {node}
        
        // Node3DConnectionInstances
        for(const [_,connection] of this.targetManager.nodeManager.getRegistry().connections.entries())
            if(pointed==connection.tube || pointed.isDescendantOf(connection.tube))
                return {connection}

        return {}
    }

}