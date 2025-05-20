import {Nullable} from "@babylonjs/core";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {MessageManager} from "../app/MessageManager.ts";
import {IOEventBus, IOEventPayload} from "../eventBus/IOEventBus.ts";
import { ConnectionManager } from "./ConnectionManager.ts";
import {NetworkEventBus} from "../eventBus/NetworkEventBus.ts";
import {NetworkManager} from "../network/NetworkManager.ts";
import {AudioManager} from "../app/AudioManager.ts";
import {AudioOutput3D} from "../app/AudioOutput3D.ts";

export class IOManager {
    private _messageManager: MessageManager;

    private _inputNode: Nullable<Wam3D> = null;
    private _outputNode: Nullable<Wam3D> = null;
    private _inputPortId: string | null = null;
    private _outputPortId: string | null = null;

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
        this.ioEventBus.on('IO_CONNECT', payload => {
            this.handler(payload);
        });

        this.ioEventBus.on('IO_CONNECT_AUDIO_OUTPUT', payload => {
            this.audioOutputHandler(payload);
        });

        // Écouter les événements de connexions depuis le réseau
        this.ioEventBus.on('NETWORK_CONNECTION_ADDED', payload => {
            this.handleNetworkConnectionAdded(payload);
        });

        this.ioEventBus.on('NETWORK_CONNECTION_REMOVED', payload => {
            this.handleNetworkConnectionRemoved(payload);
        });

        this.ioEventBus.on('NETWORK_AUDIO_OUTPUT_ADDED', payload => {
            this.handleNetworkAudioOutputAdded(payload);
        });

        this.ioEventBus.on('NETWORK_AUDIO_OUTPUT_REMOVED', _ => {
            //todo
        });
    }

    private async handleNetworkAudioOutputAdded(payload: IOEventPayload['NETWORK_AUDIO_OUTPUT_ADDED']): Promise<void> {
        const { audioOutputId, state } = payload;

        // Vérifier si l'AudioOutput3D existe déjà
        const existingNode = NetworkManager.getInstance().getAudioNodeComponent().getNodeById(audioOutputId);

        if (existingNode) {
            // S'il existe déjà, mettre à jour son état
            existingNode.setState(state)
            return;
        }

        // Créer un nouvel AudioOutput3D
        const node = await AudioManager.getInstance().createAudioOutput3D(audioOutputId);
        node.setState(state);

        // Enregistrer dans la collection d'AudioOutputComponent
        NetworkManager.getInstance().getAudioNodeComponent().getAudioOutputComponent().addAudioOutput(audioOutputId, node);
    }

    /**
     * Gère l'ajout d'une connexion depuis le réseau
     */
    private handleNetworkConnectionAdded(payload: IOEventPayload['NETWORK_CONNECTION_ADDED']): void {
        const { connectionId, portParam } = payload;
        console.log(`[IOManager] Creating connection from network: ${connectionId}`);

        // Retrouver les nœuds dans AudioNodeComponent
        const audioNodeComponent = NetworkManager.getInstance().getAudioNodeComponent();
        const sourceNode = audioNodeComponent.getAudioNode(portParam.sourceId);
        const targetNode = audioNodeComponent.getAudioNode(portParam.targetId);

        if (!sourceNode || !targetNode) {
            console.warn(`[IOManager] Nodes not found for connection:`, {
                sourceId: portParam.sourceId,
                targetId: portParam.targetId,
                sourceFound: !!sourceNode,
                targetFound: !!targetNode
            });
            return;
        }

        // Déterminer les ports d'entrée et de sortie
        const outputPortId = portParam.portId;
        const inputPortId = this.getCorrespondingInputPort(outputPortId);

        // Obtenir les meshes des ports
        const outputPortMesh = sourceNode.getPortMesh(outputPortId);
        const inputPortMesh = targetNode.getPortMesh(inputPortId);

        if (outputPortMesh && inputPortMesh) {
            // Créer la connexion visuelle
            this.connectionManager.createConnectionArc(
                connectionId,
                outputPortMesh,
                sourceNode.id,
                inputPortMesh,
                targetNode.id
            );

            // Connecter les ports audio/MIDI
            sourceNode.connectPorts(outputPortId, targetNode, inputPortId);

            console.log(`[IOManager] Network connection created: ${connectionId}`);
        } else {
            console.error("[IOManager] Failed to get port meshes for network connection");
        }
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
     * Détermine le port d'entrée correspondant au port de sortie
     */
    private getCorrespondingInputPort(outputPortId: string): string {
        switch (outputPortId) {
            case 'audioOut':
                return 'audioIn';
            case 'midiOut':
                return 'midiIn';
            default:
                // Fallback - pourrait être amélioré selon votre logique
                return outputPortId.includes('audio') ? 'audioIn' : 'midiIn';
        }
    }

    /**
     * Réinitialise l'état de la connexion en cours et annule l'aperçu.
     */
    private _cancelAndResetConnection(): void {
        this.connectionManager.cancelConnectionPreview();
        this._resetConnectionState();
    }

    /**
     * Handle IO connection events between nodes
     */
    private handler(data: IOEventPayload['IO_CONNECT']) {
        console.log(`Événement : ${data.pickType}, nœud ${data.node.id}, port ${data.portId}`);

        switch (data.pickType) {
            case "down":
                if (data.isInput) {
                    this._inputNode = data.node;
                    this._inputPortId = data.portId;
                } else {
                    this._outputNode = data.node;
                    this._outputPortId = data.portId;
                }
                // Start preview for the port
                this.connectionManager.startConnectionPreview(data.node, data.portId);
                break;

            case "up":
                let actualOutputNode: Nullable<Wam3D> = null;
                let actualOutputPortId: Nullable<string> = null;
                let actualInputNode: Nullable<Wam3D> = null;
                let actualInputPortId: Nullable<string> = null;

                if (data.isInput && this._outputNode && this._outputPortId) {
                    actualOutputNode = this._outputNode;
                    actualOutputPortId = this._outputPortId;
                    actualInputNode = data.node;
                    actualInputPortId = data.portId;
                } else if (!data.isInput && this._inputNode && this._inputPortId) {
                    actualOutputNode = data.node;
                    actualOutputPortId = data.portId;
                    actualInputNode = this._inputNode;
                    actualInputPortId = this._inputPortId;
                }

                if (actualOutputNode && actualInputNode && actualOutputPortId && actualInputPortId) {
                    if (actualOutputNode.id === actualInputNode.id) {
                        this._messageManager.showMessage("Can't connect a node to itself", 3000);
                    } else {
                        const outputPortMesh = actualOutputNode.getPortMesh(actualOutputPortId);
                        const inputPortMesh = actualInputNode.getPortMesh(actualInputPortId);

                        if (outputPortMesh && inputPortMesh) {
                            const connectionId = `${actualOutputNode.id}_${actualOutputPortId}_to_${actualInputNode.id}_${actualInputPortId}`;
                            console.log("[IOManager] Creating connection:", connectionId);

                            // Connecter les ports (audio/MIDI)
                            actualOutputNode.connectPorts(actualOutputPortId, actualInputNode, actualInputPortId);

                            // Créer la connexion visuelle
                            this.connectionManager.createConnectionArc(
                                connectionId,
                                outputPortMesh,
                                actualOutputNode.id,
                                inputPortMesh,
                                actualInputNode.id
                            );

                            // Stocker dans le réseau (Y.js)
                            this.networkEventBus.emit('STORE_CONNECTION_TUBE', {
                                connectionId: connectionId,
                                portParam: {
                                    sourceId: actualOutputNode.id,
                                    targetId: actualInputNode.id,
                                    portId: actualOutputPortId,
                                }
                            });
                        } else {
                            console.error("[IOManager] Failed to get port meshes for visual connection");
                        }
                    }
                } else {
                    console.log("[IOManager] Released with incomplete connection state - canceling");
                }
                this._cancelAndResetConnection();
                break;

            case "out":
                console.log("[IOManager] Pointer out - canceling preview");
                this._cancelAndResetConnection();
                break;
        }
    }

    /**
     * Handle connections to AudioOutput3D
     */
    private audioOutputHandler(data: IOEventPayload['IO_CONNECT_AUDIO_OUTPUT']) {
        const audioOutput = data.audioOutput;

        switch (data.pickType) {
            case "down":
                // AudioOutput ne peut pas initier une connexion
                break;

            case "up":
                // Connecter un nœud WAM à l'AudioOutput
                if (this._outputNode && this._outputPortId) {
                    if (this._outputNode.id !== audioOutput.id) {
                        const sourceWamAudioNode = this._outputNode.getAudioNode();
                        const targetAudioOutputNode = audioOutput.getAudioNode();

                        if (sourceWamAudioNode && targetAudioOutputNode) {
                            sourceWamAudioNode.connect(targetAudioOutputNode);

                            const outputPortMesh = this._outputNode.getPortMesh(this._outputPortId);
                            const audioOutputMesh = audioOutput.getPortMesh();
                            if (outputPortMesh && audioOutputMesh) {
                                const connectionId = `${this._outputNode.id}_${this._outputPortId}_to_audioOutput_${audioOutput.id}`;
                                this.connectionManager.createConnectionArc(
                                    connectionId,
                                    outputPortMesh,
                                    this._outputNode.id,
                                    audioOutputMesh,
                                    audioOutput.id
                                );
                            }
                            console.log("[IOManager] Connected", this._outputNode.id, "to audio output", audioOutput.id);
                        } else {
                            console.error("[IOManager] Failed to get audio nodes for connection to AudioOutput");
                        }
                    } else {
                        this._messageManager.showMessage("Can't connect a node to itself", 2000);
                    }
                } else {
                    console.log("[IOManager] Released on AudioOutput but no WAM output was being dragged.");
                }
                this._cancelAndResetConnection();
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
        this.networkEventBus.emit('REMOVE_CONNECTION_TUBE', {
            connectionId: connectionId
        });

        // TODO
        //if (sourceNode && targetNode) {
        //    sourceNode.disconnectPorts(portId, targetNode, targetPortId);
        //}
    }

    private _resetConnectionState() {
        this._inputNode = null;
        this._outputNode = null;
        this._inputPortId = null;
        this._outputPortId = null;
    }
}