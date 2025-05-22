import { WritableObject } from "@babylonjs/core";
import { Wam3D } from "../ConnecterWAM/Wam3D.ts";
import { MessageManager } from "../app/MessageManager.ts";
import { IOEventBus, IOEventPayload } from "../eventBus/IOEventBus.ts";
import { ConnectionManager } from "./ConnectionManager.ts";
import { NetworkEventBus } from "../eventBus/NetworkEventBus.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { AudioManager } from "../app/AudioManager.ts";
import { Node3DInstance } from "../ConnecterWAM/node3d/instance/Node3DInstance.ts";
import { Node3DConnectable } from "../ConnecterWAM/node3d/Node3DConnectable.ts";
import { WamNode } from "@webaudiomodules/api";
import { AudioNode3D } from "../ConnecterWAM/AudioNode3D.ts";

export class IOManager {
    private _messageManager: MessageManager;

    private currentPort: SimplifiedConnectable|null = null;

    private static instance: IOManager;
    private connectionManager: ConnectionManager = ConnectionManager.getInstance();
    private ioEventBus: IOEventBus = IOEventBus.getInstance();
    private networkEventBus: NetworkEventBus = NetworkEventBus.getInstance();

    private constructor() {
        this._messageManager = new MessageManager();
        this.onIOEvent();
    }

    public static getInstance(): IOManager {
        if (!IOManager.instance) {
            IOManager.instance = new IOManager();
        }
        return IOManager.instance;
    }

    private onIOEvent(): void {
        this.ioEventBus.on('IO_CONNECT', payload => this.commonHandler(payload))

        // Écouter les événements de connexions depuis le réseau
        this.ioEventBus.on('NETWORK_CONNECTION_ADDED', payload => this.handleNetworkConnectionAdded(payload))

        this.ioEventBus.on('NETWORK_CONNECTION_REMOVED', payload => this.handleNetworkConnectionRemoved(payload))

        this.ioEventBus.on('NETWORK_AUDIO_OUTPUT_ADDED', payload => this.handleNetworkAudioOutputAdded(payload))

        this.ioEventBus.on('NETWORK_AUDIO_OUTPUT_REMOVED', _ => {
            //TODO: Suppression d'une audio output
        });
    }

    private async handleNetworkAudioOutputAdded(payload: IOEventPayload['NETWORK_AUDIO_OUTPUT_ADDED']): Promise<void> {
        const { audioOutputId, state } = payload;
        const existingNode = NetworkManager.getInstance().getAudioNodeComponent().getNodeById(audioOutputId);

        if (existingNode) {
            //@ts-ignore
            existingNode.setState(state)
            return;
        }

        const node = await AudioManager.getInstance().createAudioOutput3D(audioOutputId);
        node.setState(state);
        NetworkManager.getInstance().getAudioNodeComponent().getAudioOutputComponent().addAudioOutput(audioOutputId, node);
    }

    /**
     * Gère l'ajout d'une connexion depuis le réseau
     */
    private handleNetworkConnectionAdded(payload: IOEventPayload['NETWORK_CONNECTION_ADDED']): void {
        const { connectionId, portParam } = payload;
        console.log(`[IOManager] Creating connection from network: ${connectionId}`);

        const audioNodeComponent = NetworkManager.getInstance().getAudioNodeComponent();

        // Récupérer les audio nodes source et cible
        const sourceNode = audioNodeComponent.getAudioNode(portParam.sourceId)
        const targetNode = audioNodeComponent.getAudioNode(portParam.targetId)

        if (!sourceNode) { console.warn(`[IOManager] Source node not found: ${portParam.sourceId}`); return; }
        if (!targetNode) { console.warn(`[IOManager] Target node not found: ${portParam.targetId}`); return; }

        // On récupère les connectables source et cible
        const sourceConnectable = (()=>{
            if(sourceNode instanceof Wam3D) return this.wam3dToNode3d(sourceNode, portParam.sourceId)
            else{
                const i = (sourceNode as Node3DInstance).connectables.get(portParam.sourceId)
                return i ? this.connectableToNode3d(sourceNode,i.config) as SimplifiedConnectable : undefined
            }
        })()

        const targetConnectable = (()=>{
            if(targetNode instanceof Wam3D) return this.wam3dToNode3d(targetNode, portParam.targetId)
            else{
                const i = (sourceNode as Node3DInstance).connectables.get(portParam.sourceId)
                return i ? this.connectableToNode3d(sourceNode,i.config) as SimplifiedConnectable : undefined
            }
        })()

        if (!sourceConnectable) { console.warn(`[IOManager] Source port not found on source node`); return }
        if (!targetConnectable) { console.warn(`[IOManager] Target port not found on target node`); return }

        // On connecte !
        const result = this.connectConnectables(sourceConnectable,targetConnectable)
        
        if(result) console.log(`[IOManager] WAM-to-Node connection created: ${result.connectionId}`)
        else console.warn(`[IOManager] WAM-to-Node connection failed`)
    }
    /**
     * Gère la suppression d'une connexion depuis le réseau
     */
    private handleNetworkConnectionRemoved(payload: IOEventPayload['NETWORK_CONNECTION_REMOVED']): void {
        const { connectionId } = payload;
        console.log(`[IOManager] Removing connection from network: ${connectionId}`);

        // Supprimer la connexion visuelle
        this.connectionManager.deleteConnectionArcById(connectionId);

        // TODO: Implémenter la déconnexion des ports audio/MIDI si nécessaire
        // Pour cela, il faudrait parser le connectionId ou stocker plus d'infos
    }

    /**
     * Réinitialise l'état de la connexion en cours et annule l'aperçu.
     */
    private _cancelAndResetConnection(): void {
        this.connectionManager.cancelConnectionPreview()
        this.currentPort = null
    }

    /**
     * Pour simplifier le code, je cache les Wam3d et les Node3D derrière la même interface: SimplifiedConnectable 
     */

    /**
     * Obtenir une SimplifiedConnectable à partir d'un Node3D
    */
    private connectableToNode3d(instance: AudioNode3D, connectable: Node3DConnectable): SimplifiedConnectable{
        const connectable3d = connectable as Node3DConnectable
        const simplifiedConnectable: SimplifiedConnectable = {
            id: connectable3d.id,
            meshes: connectable3d.meshes,
            direction: connectable3d.direction,
            type: connectable3d.type,
            nodeid: instance.id,
            receive(value) { connectable3d.receive(value) },
            connect(sender) { connectable3d.connect(sender) },
            disconnect(sender) { connectable3d.disconnect(sender) },
        }
        return simplifiedConnectable
    }

    /**
     * Obtenir une SimplifiedConnectable à partir d'un Wam3D.
     * En attendant, pour faciliter les test j'ignore complétement connection strategy.
    */
    private wam3dToNode3d(wam3d:Wam3D, portId: string): SimplifiedConnectable{
        let connectable: WritableObject<Partial<SimplifiedConnectable>>|undefined
        if(portId.endsWith("Out")){
            if(portId.startsWith("audio")){
                connectable = {
                    connect(_) { },
                    disconnect(_) { },
                    direction: 'output',
                    type: "audio",
                    receive(value) {
                        if(typeof value == "object"){
                            if("connectAudio" in value){
                                wam3d.getAudioNode().connect(value.connectAudio as AudioNode)
                            }
                            else if("disconnectAudio" in value){
                                wam3d.getAudioNode().disconnect(value.disconnectAudio as AudioNode)
                            }
                        }
                    },
                }
            }
            else{
                connectable = {
                    connect(_) { },
                    disconnect(_) { },
                    direction: 'output',
                    type: "midi",
                    receive(value) {
                        if(typeof value == "object"){
                            if("connectMidi" in value){
                                ;(wam3d.getAudioNode() as WamNode).connectEvents((value.connectMidi as WamNode).instanceId)
                            }
                            else if("disconnectMidi" in value){
                                ;(wam3d.getAudioNode() as WamNode).disconnectEvents((value.disconnectMidi as WamNode).instanceId)
                            }
                        }
                    },
                }
            }
        }
        else{
            if(portId?.startsWith("audio")){
                connectable = {
                    connect(sender) { sender({connectAudio:wam3d.getAudioNode()}) },
                    disconnect(sender) { sender({disconnectAudio:wam3d.getAudioNode()}) },
                    direction: 'input',
                    type: "audio",
                    receive(_) { },
                }
            }
            else{
                connectable = {
                    connect(sender) { sender({connectMidi:wam3d.getAudioNode()}) },
                    disconnect(sender) { sender({disconnectMidi:wam3d.getAudioNode()}) },
                    direction: 'input',
                    type: "midi",
                    receive(_) {},
                }
            }
        }
        connectable.meshes = [wam3d.getPortMesh(portId)!!]
        connectable.id = portId
        connectable.nodeid = wam3d.id
        return connectable as SimplifiedConnectable
    }

    /**
     * Connect two connectables
     * @param connectA connectable to connect from
     * @param connectB  Connectable to connect to
     * @returns If the connection was successful returns the connection informations, else null
     */
    private connectConnectables(connectA: SimplifiedConnectable, connectB: SimplifiedConnectable) {

        // Check if the connection is not a self connection
        if(connectA.nodeid==connectB.nodeid){
            this._messageManager.showMessage("Can't connect a node to itself", 2000)
            return null
        }
        
        // Check if connection direction are compatible
        let canConnect = false
        if([connectA.direction, connectB.direction].includes("bidirectional")) canConnect = true
        else if(connectA.direction != connectB.direction) canConnect = true
        if(!canConnect){
            this._messageManager.showMessage(`Cannot connect a ${connectA.direction} port to a ${connectB.direction} port`, 2000)
            return null
        }

        // Check if connection type are compatible
        if(connectA.type != connectB.type){
            console.log("connection ",connectA," ",connectB)
            this._messageManager.showMessage(`Can't connect a ${connectA.type} to a ${connectB.type}`, 2000)
            return null
        }

        // Get the connectable order
        let [input,output] = (()=>{
            if(connectA.direction == "input") return [connectA, connectB]
            else if(connectB.direction == "input") return [connectB, connectA]
            else if(connectA.direction == "output") return [connectB, connectA]
            else if(connectB.direction == "output") return [connectA, connectB]
            else return [connectA, connectB]
        })()

        // Connect !
        const connectionId = `${input.nodeid}_${input.id}_to_${output.nodeid}_${output.id}`;
        this.connectionManager.createConnectionArc(
            connectionId,
            output.meshes[0], output.nodeid,
            input.meshes[0], input.nodeid
        );
        output.connect(input.receive.bind(input))
        input.connect(output.receive.bind(output))
        return {connectionId,input,output}
    }

    private commonHandler(data: IOEventPayload['IO_CONNECT']) {
        const {pickType} = data

        switch (pickType) {
            case "down":
                if("node" in data) this.currentPort = this.wam3dToNode3d(data.node, data.portId)
                else this.currentPort = this.connectableToNode3d(data.instance, data.connectable)
                this.connectionManager.startConnectionPreview(this.currentPort.nodeid, this.currentPort.meshes[0], this.currentPort.id)
                break

            case "up":
                if(this.currentPort){
                    let connectA = this.currentPort

                    let connectB = (()=>{
                        if("node" in data) return this.wam3dToNode3d(data.node, data.portId)
                        else return this.connectableToNode3d(data.instance, data.connectable)
                    })()

                    // Ensuite on crée la connexion
                    if(connectA){
                        const result = this.connectConnectables(connectA, connectB)
                        if(result){
                            const {connectionId, input, output} = result
                            this.networkEventBus.emit('STORE_CONNECTION_TUBE',{
                                connectionId,
                                portParam: {
                                    sourceId: output.id,
                                    targetId: input.id,
                                    sourcePortId: output.id,
                                    targetPortId: input.id,
                                }
                            })
                        }
                    }
                }
                this._cancelAndResetConnection()
                break;

            case "out":
                this._cancelAndResetConnection();
                break;
        }
    }

    public disconnectNodes(sourceNodeId: string, portId: string, targetNodeId: string, targetPortId: string): void {
        const connectionId = `${sourceNodeId}_${portId}_to_${targetNodeId}_${targetPortId}`;

        console.log(`[IOManager] Disconnecting: ${connectionId}`);

        // Supprimer la connexion visuelle
        this.connectionManager.deleteConnectionArcById(connectionId);

        // Supprimer du réseau
        this.networkEventBus.emit('REMOVE_CONNECTION_TUBE', { connectionId: connectionId });
    }
}

type SimplifiedConnectable = { nodeid: string } & Pick<Node3DConnectable,'connect'|'disconnect'|'receive'|'direction'|'type'|'id'|'meshes'>