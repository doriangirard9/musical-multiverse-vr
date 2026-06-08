import { Quaternion, Vector3 } from "@babylonjs/core";
import { ConnectionManager } from "./ConnectionManager";
import { NetworkManager } from "../network/NetworkManager";
import { Node3DGraphDescription } from "../network/Node3DNetwork";
import { N3DConnectionInstance } from "../node3d/instance/N3DConnectionInstance";
import { Node3DInstance } from "../node3d/instance/Node3DInstance";
import { Node3dManager } from "./Node3dManager";

/**
 * Serialization of the game objets (Node3D, connections, etc...)
 */
export class Serialization {

    private mNode = Node3dManager.getInstance()

    private mConnection = ConnectionManager.getInstance()

    private network = NetworkManager.getInstance().node3d

    private constructor(){}

    private static instance: Serialization

    static getInstance(): Serialization {
        if(!Serialization.instance) Serialization.instance = new Serialization()
        return Serialization.instance
    }

    /**
     * Save a graph of Node3DInstances and their connections.
     * It returns a description of the graph that can be used to recreate it later.
     * If addConnected is true, it will also include the nodes that are connected to the target nodes, and their connections.
     * @param targetNodes The nodes to save. If addConnected is true, it will also include the nodes that are connected to these nodes, and their connections.
     * @param addConnected If true, it will also include the nodes that are connected to the target nodes, and their connections. If false, it will only include the target nodes and the connections between them. Default is true.
     * @returns The description of the graph, including the nodes and their connections. The nodes are described by their kind, position, rotation, and additional data. The connections are described by the indices of the from and to nodes in the nodes array, and the ids of the connectables that are connected.
     */
    public save(targetNodes: Node3DInstance[], addConnected: boolean=true){

        // Get the target nodes
        let nodes = new Set<Node3DInstance>()
        function addNode(node: Node3DInstance){
            if(nodes.has(node)) return
            nodes.add(node)
            if(addConnected){
                // On récupère les nodes connectés
                const connections = [...node.connectables.values()].flatMap(it=>[...it.connections.values()])
                const connectedNode = connections.map(c=>{
                    if(c.inputConnectable?.instance==node) return c.outputConnectable!!.instance
                    else return c.inputConnectable!!.instance
                })
                
                for(const connected of connectedNode) addNode(connected)
            }
        }
        for(const node of targetNodes) addNode(node)

        // Get all the connections
        const connections = new Set<N3DConnectionInstance>()
        for(const node of nodes){
            for(const connectable of node.connectables.values()){
                for(const connection of connectable.connections.values()){
                    connections.add(connection)
                }
            }
        }
        
        // Prepare data
        const nodeList = [...nodes.values()]
        const nodeToIndex = new Map(nodeList.map((it,i)=>[it,i]))

        // Assemble
        const description: Node3DGraphDescription = { nodes: [], connections: [] }
        for(const node of nodeList){
            const id = this.network.nodes.getId(node)!!
            description.nodes.push({
                kind: this.network.nodes.getData(id)!!,
                position: node.boundingBoxMesh.position.asArray(),
                rotation: node.boundingBoxMesh.rotationQuaternion!!.asArray(),
                data: this.network.nodes.getState(id),
            })
        }

        console.log(targetNodes.map(it=>[...it.connectables.values()].map(it=>[...it.connections.values()])))

        for(const connection of connections){
            const fromNode = connection.outputConnectable!!.instance
            const toNode = connection.inputConnectable!!.instance
            if(nodes.has(fromNode) && nodes.has(toNode)){
                description.connections.push({
                    from: nodeToIndex.get(fromNode)!!,
                    to: nodeToIndex.get(toNode)!!,
                    fromConnectable: connection.outputConnectable!!.config.id,
                    toConnectable: connection.inputConnectable!!.config.id,
                })
            }
        }

        return description
    }

    /**
     * Load a graph of Node3DInstances and their connections from a description. It creates the nodes and connections in the scene according to the description.
     * @param description The description of the graph, including the nodes and their connections. The nodes are described by their kind, position, rotation, and additional data. The connections are described by the indices of the from and to nodes in the nodes array, and the ids of the connectables that are connected.
     * @returns The list of the created Node3DInstances. The order of the nodes in the list is the same as the order of the nodes in the description.
     */
    public async load(description: Node3DGraphDescription): Promise<Node3DInstance[]>{
        const nodes = (await Promise.all(description.nodes.map(async nodeDesc => {
            const node = await this.mNode.addNode3d(
                nodeDesc.kind,
                Vector3.FromArray(nodeDesc.position)
            )
            if(!node) return

            node.boundingBoxMesh.rotationQuaternion = Quaternion.FromArray(nodeDesc.rotation)
            node.boundingBoxMesh.position = Vector3.FromArray(nodeDesc.position)
            node.updatePosition()

            const id = this.network.nodes.getId(node)!!
            await this.network.nodes.setState(id, nodeDesc.data)

            return node
        }))).filter(it=>it!=undefined)

        await Promise.all(description.connections.map(async connectionDesc => {
            const fromNode = nodes[connectionDesc.from]
            const toNode = nodes[connectionDesc.to]
            if(!fromNode || !toNode) return

            const from = fromNode.connectables.get(connectionDesc.fromConnectable)
            const to = toNode.connectables.get(connectionDesc.toConnectable)
            if(!from || !to) return
            
            this.mConnection.connect(from,to)
        }))

        return nodes
    }

}