import { Observable, Observer, Quaternion, Vector3 } from "@babylonjs/core"
import { Node3DFrame, Node3DHandle, Node3DHandleConnectable, Node3DHandleConnection, Node3DHandleParameter } from "../Node3DHandle"
import { Node3DInstance } from "./Node3DInstance"
import { N3DParameterInstance, ParameterChangeMode } from "./N3DParameterInstance"
import { NetworkManager } from "../../network/NetworkManager"
import { ConnectionManager } from "../../app/node3d/ConnectionManager"
import { Serialization } from "../../app/node3d/Serialization"

/**
 * A handle on a node, given to another node.
 *
 * @remarks
 * A handle is a view of bounded lifetime on a `Node3DInstance`, never the instance itself. There
 * is one per connection that delivers it, one per node for the node's own `self`, and one per node
 * created or cloned through the context. What matters is what happens at its end: everything the
 * receiver registered through the handle is detached when the handle is disposed, whether the
 * receiver thought of it or not, so a node that forgets to clean up cannot keep reaching a node
 * that is gone, nor be reached by one.
 *
 * A handle dies with the first of: the node it stands for, any of the nodes that own it, or an
 * explicit `dispose` (the connection that delivered it being closed). All three roads are
 * synchronous, none waits on the network.
 *
 * The singletons of the host are only reached inside methods: this file sits in an import cycle
 * with the builder, which holds a top level await, and the cycle only holds because nothing here
 * is evaluated at load time.
 */
export class N3DHandleInstance implements Node3DHandle {

    constructor(
        /** The node this handle stands for. */
        readonly target: Node3DInstance,
        owner: Node3DInstance,
    ){
        this.relays.push(
            target.onMove.add(() => this.onMove.notifyObservers()),
            target.onGrab.add(() => this.onGrab.notifyObservers()),
            target.onRelease.add(() => this.onRelease.notifyObservers()),
            target.onParameterChanged.add(event => this.onParameterChanged.notifyObservers(event)),
        )

        // Not among the relays: it fires while the target is notifying its disposal, and taking it
        // off the observable at that moment would skip the next observer, another handle on the
        // same node. Being a one shot, it takes itself off, deferred, as it should.
        target.onDispose.addOnce(() => this.dispose())
        this.alsoOwnedBy(owner)
    }

    /** Notified when the node moves. */
    readonly onMove = new Observable<void>()

    /** Notified when hands take the node. */
    readonly onGrab = new Observable<void>()

    /** Notified when the last hand lets go of the node. */
    readonly onRelease = new Observable<void>()

    /** Notified when a parameter of the node changes its value. */
    readonly onParameterChanged = new Observable<{id: string, value: number}>()

    /** Notified once, when the handle stops being worth anything. */
    readonly onDispose = new Observable<void>()

    /** The observers laid on the target, taken off at disposal. */
    private readonly relays: Observer<any>[] = []

    /** How to leave each owner, called at disposal. */
    private readonly disown: (() => void)[] = []

    /** The parameter views handed out so far, one per parameter, so their observables are stable. */
    private readonly parameters = new Map<string, HandleParameter>()

    /** The handles on the other ends of the connections, one per node, so they are not made twice. */
    private readonly children = new Map<Node3DInstance, N3DHandleInstance>()

    /** The owners, kept so children can be given the same ones. */
    private readonly owners: Node3DInstance[] = []

    private disposed = false

    /**
     * Give the handle one more owner: it now dies with that node too.
     *
     * @remarks
     * The receiver of a connection handle is only known after `connectAsInput` has returned it, so
     * the connection adds the receiver here, once it knows both ends.
     */
    alsoOwnedBy(owner: Node3DInstance): void {
        if(this.disposed || this.owners.includes(owner)) return
        this.owners.push(owner)
        this.disown.push(owner.own(() => this.dispose()))
    }

    dispose(): void {
        if(this.disposed) return
        this.disposed = true
        this.onDispose.notifyObservers()
        for(const relay of this.relays) relay.remove()
        this.relays.length = 0
        for(const leave of this.disown) leave()
        this.disown.length = 0
        for(const parameter of this.parameters.values()) parameter.dispose()
        this.parameters.clear()
        for(const child of this.children.values()) child.dispose()
        this.children.clear()
        this.onMove.clear()
        this.onGrab.clear()
        this.onRelease.clear()
        this.onParameterChanged.clear()
        this.onDispose.clear()
    }



    //// Identity ////

    get id(): string|undefined {
        if(!this.isAlive) return undefined
        return NetworkManager.getInstance().node3d.nodes.getId(this.target)
    }

    get kind(): string|undefined {
        const id = this.id
        if(id === undefined) return undefined
        return NetworkManager.getInstance().node3d.nodes.getData(id)
    }

    get label(): string { return this.target.factory.label }

    get isAlive(): boolean { return !this.disposed && !this.target.isDisposed }



    //// Frame ////

    getFrame(): Node3DFrame {
        if(!this.isAlive || !this.target.hasBoundingBox) return {position: Vector3.Zero(), rotation: Quaternion.Identity(), scale: 1}
        const box = this.target.boundingBoxMesh
        return {
            position: box.absolutePosition.clone(),
            rotation: (box.rotationQuaternion ?? Quaternion.Identity()).clone(),
            scale: box.scaling.x,
        }
    }

    setFrame(frame: Partial<Node3DFrame>): void {
        if(!this.isAlive || !this.target.hasBoundingBox) return
        const box = this.target.boundingBoxMesh
        if(frame.rotation) box.rotationQuaternion = frame.rotation.clone()
        if(frame.scale !== undefined) box.scaling.setAll(frame.scale)
        if(frame.position) box.setAbsolutePosition(frame.position)
        this.target.updatePosition()
    }

    getExtent(): Vector3 {
        if(!this.isAlive || !this.target.hasBoundingBox) return Vector3.Zero()
        return this.target.boundingBoxMesh.getBoundingInfo().boundingBox.extendSizeWorld.clone()
    }

    get isLocked(): boolean { return this.isAlive && this.target.hasBoundingBox && this.target.isLocked }

    set isLocked(value: boolean) {
        if(this.isAlive && this.target.hasBoundingBox) this.target.isLocked = value
    }

    get isHeld(): boolean { return this.isAlive && this.target.isHeld }



    //// Parameters ////

    getParameters(): Node3DHandleParameter[] {
        if(!this.isAlive) return []
        return [...this.target.parameters.keys()].map(id => this.getParameter(id)!)
    }

    getParameter(id: string): Node3DHandleParameter|undefined {
        if(!this.isAlive) return undefined
        const instance = this.target.parameters.get(id)
        if(!instance) return undefined

        // A parameter removed and made again under the same id is a new parameter.
        const known = this.parameters.get(id)
        if(known?.instance === instance) return known
        known?.dispose()
        const parameter = new HandleParameter(instance)
        this.parameters.set(id, parameter)
        return parameter
    }



    //// Connections ////

    getConnectables(): Node3DHandleConnectable[] {
        if(!this.isAlive) return []
        return [...this.target.connectables.values()].map(({config}) => ({
            id: config.id,
            label: config.label,
            type: config.type,
            direction: config.direction,
            color: config.color,
        }))
    }

    getConnections(): Node3DHandleConnection[] {
        if(!this.isAlive) return []
        const connections: Node3DHandleConnection[] = []
        for(const connection of this.target.connections){
            const output = connection.outputConnectable
            const input = connection.inputConnectable
            if(!output || !input) continue
            connections.push({
                from: this.handleOf(output.instance),
                fromPort: output.config.id,
                to: this.handleOf(input.instance),
                toPort: input.config.id,
                disconnect: () => connection.remove(),
            })
        }
        return connections
    }

    connect(portId: string, other: Node3DHandle, otherPortId: string): string|null {
        if(!this.isAlive) return "This node is gone"
        if(!(other instanceof N3DHandleInstance) || !other.isAlive) return "The other node is gone"
        const port = this.target.connectables.get(portId)
        const otherPort = other.target.connectables.get(otherPortId)
        if(!port) return `No connectable ${portId}`
        if(!otherPort) return `No connectable ${otherPortId}`
        const refusal = port.canConnectTo(otherPort)
        if(refusal !== null) return refusal
        ConnectionManager.getInstance().connect(port, otherPort)
        return null
    }

    /**
     * The handle on another node reached through a connection, made once and kept.
     *
     * @remarks
     * The children share the owners of their parent and die with it, so a receiver walking the
     * connections gets handles as well behaved as the one it was given.
     */
    private handleOf(instance: Node3DInstance): N3DHandleInstance {
        if(instance === this.target) return this
        const known = this.children.get(instance)
        if(known && known.isAlive) return known
        const child = new N3DHandleInstance(instance, this.owners[0])
        for(const owner of this.owners) child.alsoOwnedBy(owner)
        child.onDispose.addOnce(() => { if(this.children.get(instance) === child) this.children.delete(instance) })
        this.children.set(instance, child)
        return child
    }



    //// Life ////

    delete(): void {
        if(this.isAlive) void this.target.dispose()
    }

    async clone(frame?: Partial<Node3DFrame>): Promise<Node3DHandle|null> {
        if(this.id === undefined || this.kind === undefined) return null
        const origin = this.getFrame()
        const serialization = Serialization.getInstance()
        const [copy] = await serialization.load(serialization.save([this.target], false))
        if(copy === undefined || this.disposed) return null
        const handle = new N3DHandleInstance(copy, this.owners[0])
        for(const owner of this.owners) handle.alsoOwnedBy(owner)
        handle.setFrame({...origin, ...frame})
        return handle
    }

}



/**
 * A parameter of a node, seen through a handle.
 *
 * @remarks
 * Values are written as a hand would write them, so they are synchronized and pass the lock an
 * automation may hold, since the one asking is a node and not a hand on the knob.
 */
class HandleParameter implements Node3DHandleParameter {

    constructor(readonly instance: N3DParameterInstance){
        this.relay = instance.onValueChanged.add(value => this.onValueChanged.notifyObservers(value))
    }

    /** Notified when the value changes. */
    readonly onValueChanged = new Observable<number>()

    private readonly relay: Observer<number>

    get id(): string { return this.instance.config.id }

    getLabel(): string { return this.instance.config.getLabel() }
    getMin(): number { return this.instance.getMin() }
    getMax(): number { return this.instance.getMax() }
    getStepSize(): number { return this.instance.getStepSize() }
    getExponant(): number { return this.instance.getExponant() }
    getValue(): number { return this.instance.getValue() }
    setValue(value: number): void { this.instance.setValue(value, ParameterChangeMode.MANUAL) }
    getNormalizedValue(): number { return this.instance.getNormalizedValue() }
    setNormalizedValue(value: number): void { this.instance.setNormalizedValue(value, ParameterChangeMode.MANUAL) }
    stringify(value: number): string { return this.instance.config.stringify(value) }

    dispose(): void {
        this.relay.remove()
        this.onValueChanged.clear()
    }
}
