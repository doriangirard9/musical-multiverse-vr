/**
 * Adapter from concrete Node3DInstance / N3DConnectableInstance / N3DConnectionInstance
 * to the abstract NodeView / PortView / EdgeView shapes consumed by Node3DGraph.
 *
 * Views are cached per concrete instance so BFS visited-sets work via reference equality.
 */
import { N3DConnectableInstance } from "../instance/N3DConnectableInstance"
import { N3DConnectionInstance } from "../instance/N3DConnectionInstance"
import { Node3DInstance } from "../instance/Node3DInstance"
import { Direction, EdgeView, NodeView, PortView } from "./Node3DGraph"

const nodeCache = new WeakMap<Node3DInstance,         NodeView>()
const portCache = new WeakMap<N3DConnectableInstance, PortView>()
const edgeCache = new WeakMap<N3DConnectionInstance,  EdgeView>()

export function nodeViewOf(instance: Node3DInstance, id: string = ""): NodeView {
    let v = nodeCache.get(instance)
    if (v) return v
    v = {
        id,
        // tags read from the factory the instance was built from — the kind is
        // already resolved to its factory at creation time.
        tags: instance.factory.tags,
        get ports() {
            const out: PortView[] = []
            for (const c of instance.connectables.values()) out.push(portViewOf(c))
            return out
        },
    }
    nodeCache.set(instance, v)
    return v
}

export function portViewOf(connectable: N3DConnectableInstance): PortView {
    let v = portCache.get(connectable)
    if (v) return v
    v = {
        direction: connectable.config.direction as Direction,
        type: typeof connectable.config.type === 'string' ? connectable.config.type : 'unknown',
        get connections() {
            const out: EdgeView[] = []
            for (const conn of connectable.connections) out.push(edgeViewOf(conn))
            return out
        },
    }
    portCache.set(connectable, v)
    return v
}

export function edgeViewOf(connection: N3DConnectionInstance, id: string = ""): EdgeView {
    let v = edgeCache.get(connection)
    if (v) return v
    v = {
        id,
        get outputNode() { return nodeViewOf(connection.outputConnectable!.instance) },
        get inputNode()  { return nodeViewOf(connection.inputConnectable!.instance) },
        get outputPort() { return portViewOf(connection.outputConnectable!) },
        get inputPort()  { return portViewOf(connection.inputConnectable!) },
    }
    edgeCache.set(connection, v)
    return v
}
