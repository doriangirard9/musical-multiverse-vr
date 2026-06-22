import { AbstractMesh, Color3, CreateCylinder, CreateSphere, Observer, Quaternion, Scene, Vector3 } from "@babylonjs/core"
import { SyncManager } from "../../network/sync/SyncManager"
import { N3DConnectableInstance } from "./N3DConnectableInstance"
import { Node3DInstance } from "./Node3DInstance"
import { SyncSerializable } from "../../network/sync/SyncSerializable"
import { Doc } from "yjs"
import { MeshUtils } from "../tools"
import { ShakeBehavior } from "../../behaviours/ShakeBehavior"
import { SceneManager } from "../../app/SceneManager"
import { MenuSystem } from "../../app"

/**
 * A connection between two connectables of two Node3Ds.
 * Handles the visual and logic of connections.
 */
export class N3DConnectionInstance{
    private static readonly DEBUG_LOG = false;
    private static readonly CENTER_NODE_SIZE_FACTOR = 0.72;
    private static readonly CENTER_NODE_SCALE_RESPONSE = 0.5;

    private _tube
    private shake
    private arrow?: AbstractMesh
    private centerNode?: AbstractMesh
    public on_dispose = ()=>{}

    constructor(
        private scene: Scene,
        private nodes: SyncManager<Node3DInstance,any>,
        private connections: SyncManager<N3DConnectionInstance,any>,
        private menus: MenuSystem,
    ){
        this._tube = CreateCylinder("connection tube",{
            height: 1,
            diameter: .25*Node3DInstance.CONNECTION_SIZE_MULTIPLIER,
            tessellation: 6
        },this.scene)

        SceneManager.getInstance().getShadowGenerator().addShadowCaster(this._tube, false)

        this.shake = new ShakeBehavior()
        this.shake.shake_threshold = 5
        this._tube.addBehavior(this.shake)
        this.shake.on_shake = (power, counter) => {
            this._tube.visibility = Math.max(0, 1 - power / 12)
            if(counter>10) connections.remove(this)
        }
        this.shake.on_stop = (_, __) => {
            this._tube.visibility = .8
        }
        this.shake.on_pick = () => {
            this._tube.visibility = .8
        }
        this.shake.on_drop = () => {
            this._tube.visibility = 1
        }
        
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

    get tube(){ return this._tube }

    public contains(mesh: AbstractMesh): boolean {
        return mesh === this._tube
            || mesh.isDescendantOf(this._tube)
            || mesh === this.centerNode
            || (!!this.centerNode && mesh.isDescendantOf(this.centerNode))
    }



    // Connection
    private cOutput = null as N3DConnectableInstance|null
    private cInput = null as N3DConnectableInstance|null
    private observables = [] as Observer<any>[]
    private color = Color3.White().toColor4(1)
    private buildTimeout?: any

    private connectionObject: any = null
    private centerNodeBaseDiameter = Node3DInstance.CONNECTION_SIZE_MULTIPLIER
    private inputBaseScale = 1
    private outputBaseScale = 1

    private getMeshDiameter(mesh: AbstractMesh): number {
        mesh.computeWorldMatrix(true)
        const bounds = mesh.getBoundingInfo().boundingBox.extendSizeWorld
        return Math.max(bounds.x, bounds.y, bounds.z) * 2
    }

    private getConnectableDiameter(connectable: N3DConnectableInstance): number {
        const diameters = connectable.config.meshes
            .map(mesh => this.getMeshDiameter(mesh))
            .filter(diameter => Number.isFinite(diameter) && diameter > 0)

        if (diameters.length === 0) {
            return Node3DInstance.CONNECTION_SIZE_MULTIPLIER
        }

        return Math.max(...diameters)
    }

    private getNodeScale(connectable: N3DConnectableInstance): number {
        const scaling = connectable.instance.boundingBoxMesh.scaling
        return Math.max(scaling.x, scaling.y, scaling.z, 0.0001)
    }

    /**
     * Connect the node to two connectables. No synchronization.
     * @param cA
     * @param cB
     * @returns 
     */
    private connect(cA: N3DConnectableInstance, cB: N3DConnectableInstance): boolean{
        this.disconnect()

        // Check that the connection is not a self connection
        if(cA==cB){
            this.menus.showMessage("Can't connect a node to itself", "red")
            return false
        }

        // Check that the connection does not already exists
        for(const connection of cA.connections){
            if(connection.cInput == cB || connection.cOutput == cB){
                this.menus.showMessage(`Already connected to ${cB.config.label}`, "red")
                return false
            }
        }

        // Check that the connection don't have the maximum number of connection
        if(cA.connections.size >= (cA.config.max_connections??Number.MAX_SAFE_INTEGER)){
            this.menus.showMessage(`The first connectable already have the maximum number of connection`, "red")
            return false
        }

        if(cB.connections.size >= (cB.config.max_connections??Number.MAX_SAFE_INTEGER)){
            this.menus.showMessage(`The second connectable already have the maximum number of connection`, "red")
            return false
        }
        
        // Check that the connections directions are compatible
        let canConnect = false
        if([cA.config.direction, cB.config.direction].includes("bidirectional")) canConnect = true
        else if(cA.config.direction != cB.config.direction) canConnect = true
        if(!canConnect){
            this.menus.showMessage(`Cannot connect a ${cA.config.direction} port to a ${cB.config.direction} port`, "red")
            return false
        }

        // Check that the connections types are compatibles
        if(cA.config.type != cB.config.type){
            this.menus.showMessage(`Can't connect a ${cA.config.type} to a ${cB.config.type}`, "red")
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
        this.connectionObject = input.config.connectAsInput()
        output.config.connectAsOutput(this.connectionObject)
        
        this.cOutput = output
        this.cInput = input
        
        this.cOutput.connections.add(this)
        this.cInput.connections.add(this)

        this.color = this.cOutput.config.color.toColor4(1)

        // Visual connection
        const inputMesh = input.config.meshes[0]
        const outputMesh = output.config.meshes[0]

        if(![input.config.direction, output.config.direction].includes("bidirectional")){
            this.arrow = CreateCylinder("connection arrow",{
                height: Node3DInstance.CONNECTION_SIZE_MULTIPLIER,
                diameterBottom: .5*Node3DInstance.CONNECTION_SIZE_MULTIPLIER,
                diameterTop: 0,
                tessellation: 6,
            },this.scene)
            SceneManager.getInstance().getShadowGenerator().addShadowCaster(this.arrow, false)
            MeshUtils.setColor(this.arrow, this.color)
        }

        this.inputBaseScale = this.getNodeScale(input)
        this.outputBaseScale = this.getNodeScale(output)
        this.centerNodeBaseDiameter = (
            this.getConnectableDiameter(input) +
            this.getConnectableDiameter(output)
        ) / 2 * N3DConnectionInstance.CENTER_NODE_SIZE_FACTOR

        this.centerNode = CreateSphere("connection center node", {
            diameter: 1,
            segments: 10,
        }, this.scene)
        SceneManager.getInstance().getShadowGenerator().addShadowCaster(this.centerNode, false)

        MeshUtils.setColor(this._tube, this.color)
        MeshUtils.setColor(this.centerNode, this.color)

        const connection = this
        function movetube(){
            if(!connection.buildTimeout) connection.buildTimeout = setTimeout(()=>{
                // Some calculations
                const offset = inputMesh.absolutePosition.subtract(outputMesh.absolutePosition)
                const length = offset.length()
                const tubeLength = (length - Node3DInstance.CONNECTION_SIZE_MULTIPLIER)
                offset.normalize()

                const pointA = outputMesh.absolutePosition
                const pointB = connection._tube ? offset.scale(tubeLength).addInPlace(pointA) : inputMesh.absolutePosition
                const pointC = inputMesh.absolutePosition
                const inputScaleFactor = connection.getNodeScale(input) / connection.inputBaseScale
                const outputScaleFactor = connection.getNodeScale(output) / connection.outputBaseScale
                const averageScaleDelta = (
                    (inputScaleFactor - 1) +
                    (outputScaleFactor - 1)
                ) / 2
                const centerScaleFactor = 1 + averageScaleDelta * N3DConnectionInstance.CENTER_NODE_SCALE_RESPONSE
                const centerDiameter = connection.centerNodeBaseDiameter * centerScaleFactor

                const orientation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), offset.normalizeToNew(), new Quaternion())
                
                // Move the tube
                const tubeCenter = pointA.add(pointB).scaleInPlace(.5)
                connection._tube.setAbsolutePosition(tubeCenter)
                connection._tube.rotationQuaternion = orientation
                connection._tube.scaling.set(1,tubeLength,1)
                connection.centerNode?.setAbsolutePosition(pointA.add(pointC).scaleInPlace(.5))
                connection.centerNode?.scaling.setAll(centerDiameter)

                // Move the arrow
                if(connection.arrow){
                    const arrowCenter = pointB.add(pointC).scaleInPlace(.5)
                    connection.arrow.setAbsolutePosition(arrowCenter)
                    connection.arrow.rotationQuaternion = orientation
                }


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
            cInput.config.disconnectAsInput(this.connectionObject)
            cOutput.config.disconnectAsOutput(this.connectionObject)
            cOutput.connections.delete(this)
            cInput.connections.delete(this)
            this.cInput = null
            this.cOutput = null
            this.observables.forEach(it=>it.remove())
            this.arrow?.dispose()
            this.arrow = undefined
            this.centerNode?.dispose()
            this.centerNode = undefined
        }
    }


    //// Pulse Visual ////
    private pulseTimeout?: any
    public pulse(strength: number, tone: number){
        if(this.pulseTimeout) clearTimeout(this.pulseTimeout)

        const color = Color3.FromHSV(tone*360, 1-strength, 1).toColor4(1).multiplyInPlace(this.color)
        MeshUtils.setColor(this._tube, color)
        if(this.centerNode) MeshUtils.setColor(this.centerNode, color)

        this.pulseTimeout = setTimeout(()=>{
            MeshUtils.setColor(this._tube, this.color)
            if(this.centerNode) MeshUtils.setColor(this.centerNode, this.color)
        }, 100)
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
            
            if (N3DConnectionInstance.DEBUG_LOG) console.log("TRET Wait for node "+fromId)
            const from = await this.nodes.get(fromId) ?? null
            if (N3DConnectionInstance.DEBUG_LOG) console.log(`TRET  ${this.connections.getId(this)}: ${from} -> *`)
            const to = await this.nodes.get(toId) ?? null
            if (N3DConnectionInstance.DEBUG_LOG) console.log(`TRET ${this.connections.getId(this)}: * -> ${to}`)

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
        this.on_dispose()
        this.disconnect()
        this._tube.dispose()
    }

    remove(){
        this.connections.remove(this)
    }


    static getSyncManager(
        scene: Scene,
        doc: Doc,
        nodes: SyncManager<Node3DInstance, any>,
        messages: MenuSystem,
        onAdd?: (instance:N3DConnectionInstance)=>void,
        onRemove?: (instance:N3DConnectionInstance)=>void,
    ){
        const syncmanager: SyncManager<N3DConnectionInstance,any> = new SyncManager({
            name: "node3d_connections",
            doc,
            async create() { return new N3DConnectionInstance(scene, nodes, syncmanager, messages) },
            async on_add(instance) {
                instance.on_dispose = ()=> syncmanager.remove(instance)
                onAdd?.(instance)
            },
            async on_remove(instance) {
                onRemove?.(instance)
                instance.dispose()
            },
        })
        return syncmanager
    }
}
