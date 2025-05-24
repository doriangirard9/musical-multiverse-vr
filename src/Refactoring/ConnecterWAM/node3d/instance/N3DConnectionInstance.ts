import { Color3, CreateCylinder, Observer, Scene } from "@babylonjs/core"
import { SyncManager } from "../../../network/sync/SyncManager"
import { N3DConnectableInstance } from "./N3DConnectableInstance"
import { Node3DInstance } from "./Node3DInstance"
import { SyncSerializable } from "../../../network/sync/SyncSerializable"
import { Doc } from "yjs"
import { UIManager } from "../../../app/UIManager"

/**
 * Une connection entre deux connectable de deux Node3D.
 * Gère le visuel et la logique des connections.
 */
export class N3DConnectionInstance{

    private tube

    constructor(
        scene: Scene,
        private nodes: SyncManager<any,Node3DInstance>,
        private connections: SyncManager<any,N3DConnectionInstance>,
        private messages: UIManager
    ){
        this.tube = CreateCylinder("tube",{
            height: .5,
            diameter: .5,
            subdivisions: 6,
        },scene)
    }

    // Public API

    /**
     * Connect two connectable by this connections.
     * If this connections already connect two connectable the old connection is closed.
     * If any of the two given connectabe is null, no new connection is created but the old one is closed.
     * @param connectableA 
     * @param connectableB 
     */
    public set(connectableA: N3DConnectableInstance|null, connectableB: N3DConnectableInstance|null){
        if(connectableA && connectableB)this.connect(connectableA,connectableB)
        this.set_states("connectables")
    }

    get inputConnectable(){ return this.cInput }

    get outputConnectable(){ return this.cOutput }

    get isConnecting(){ return this.cOutput!=null && this.cInput!=null }

    // Connection
    private cOutput = null as N3DConnectableInstance|null
    private cInput = null as N3DConnectableInstance|null
    private observables = [] as Observer<any>[]
    private color = Color3.White() //TODO: Gérer la couleur de la connexion
    private buildTimeout?: any

    /**
     * Connect la node3D à deux connections. Pas de synchronisation.
     * @param cA 
     * @param cB 
     * @returns 
     */
    private connect(cA: N3DConnectableInstance, cB: N3DConnectableInstance): boolean{
        this.disconnect()

        // Check if the connection is not a self connection
        if(cA==cB){
            this.messages.showMessage("Can't connect a node to itself", 2000)
            return false
        }

        // Check if the connection don't have the maximum number of connection
        if(cA.connections.size >= (cA.config.max_connections??Number.MAX_SAFE_INTEGER)){
            this.messages.showMessage(`The first connectable already have the maximum number of connection`,2000)
        }

        if(cB.connections.size >= (cB.config.max_connections??Number.MAX_SAFE_INTEGER)){
            this.messages.showMessage(`The second connectable already have the maximum number of connection`,2000)
        }
        
        // Check if connection direction are compatible
        let canConnect = false
        if([cA.config.direction, cB.config.direction].includes("bidirectional")) canConnect = true
        else if(cA.config.direction != cB.config.direction) canConnect = true
        if(!canConnect){
            this.messages.showMessage(`Cannot connect a ${cA.config.direction} port to a ${cB.config.direction} port`, 2000)
            return false
        }

        // Check if connection type are compatible
        if(cA.config.type != cB.config.type){
            this.messages.showMessage(`Can't connect a ${cA.config.type} to a ${cB.config.type}`, 2000)
            return false
        }

        // Get the connectable order
        let [input,output] = (()=>{
            if(cA.config.direction == "input") return [cA, cB]
            else if(cB.config.direction == "input") return [cB, cA]
            else if(cA.config.direction == "output") return [cB, cA]
            else if(cB.config.direction == "output") return [cA, cB]
            else return [cB, cA]
        })()

        // Logical connection
        output.config.connect(input.config.receive.bind(input.config))
        input.config.connect(output.config.receive.bind(output.config))
        
        this.cOutput = output
        this.cInput = input
        
        this.cOutput.connections.add(this)
        this.cInput.connections.add(this)

        this.color = this.cOutput.config.color

        // Visual connection
        const inputMesh = input.config.meshes[0]
        const outputMesh = output.config.meshes[1]

        const connection = this
        function movetube(){
            // TODO: Gérer vraiment le visuel des connexions
            if(!connection.buildTimeout)connection.buildTimeout = setTimeout(()=>{
                const center = inputMesh.absolutePosition.add(outputMesh.absolutePosition).scaleInPlace(.5)
                connection.tube.setAbsolutePosition(center)
                connection.buildTimeout = undefined
            },20)
        }
        this.observables.push(
            inputMesh.onAfterWorldMatrixUpdateObservable.add(movetube),
            outputMesh.onAfterWorldMatrixUpdateObservable.add(movetube)
        )
        movetube()

        return true
    }

    private disconnect(){
        const {cOutput,cInput} = this
        if(cOutput && cInput){
            cOutput.config.connect(cInput.config.receive.bind(cInput.config))
            cInput.config.connect(cOutput.config.receive.bind(cOutput.config))
            cOutput.connections.delete(this)
            cInput.connections.delete(this)
            this.cInput = null
            this.cOutput = null
            this.observables.forEach(it=>it.remove())
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
        this.set_states("connectables")
    }

    async removeState(_: string) { }

    async setState(key: string, value: SyncSerializable) {
        if(key=="connectables"){
            const {fromId,fromPortId,toId,toPortId} = value as {fromId:string, fromPortId:string, toId:string, toPortId:string}
            const from = await this.nodes.getInstance(fromId) ?? null
            const to = await this.nodes.getInstance(toId) ?? null
            const fromConnectable = from?.connectables?.get(fromPortId)
            const toConnectable = to?.connectables?.get(toPortId)
            this.disconnect()
            if(fromConnectable && toConnectable) this.connect(fromConnectable,toConnectable)
        }
    }

    async getState(key: string): Promise<SyncSerializable> {
        if(key=="connectables"){
            const fromId = this.cInput==null ? "none" : this.nodes.getId(this.cInput.instance)??null
            const toId = this.cOutput==null ? "none" : this.nodes.getId(this.cOutput.instance)??null
            const fromPortId = this.cInput==null ? "none" : this.cInput.config.id
            const toPortId = this.cOutput==null ? "none" : this.cOutput.config.id
            return {fromId, fromPortId, toId, toPortId}
        }
        else return null
    }

    dispose(){
        this.disconnect()
    }

    remove(){
        this.connections.remove(this)
    }


    static getSyncManager(
        scene: Scene,
        doc: Doc,
        nodes: SyncManager<any, Node3DInstance, any>,
        messages: UIManager
    ){
        const syncmanager: SyncManager<SyncSerializable,N3DConnectionInstance,any> = new SyncManager({
            name: "node3d_connections",
            doc,
            async create() { return new N3DConnectionInstance(scene, nodes, syncmanager, messages) },
            async on_remove(instance) { instance.dispose() },
        })
        return syncmanager
    }
}