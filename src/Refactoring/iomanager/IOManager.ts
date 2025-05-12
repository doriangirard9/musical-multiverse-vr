import {Nullable} from "@babylonjs/core";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts"; // Assurez-vous que le type de retour de getAudioNode est correct
import {MessageManager} from "../app/MessageManager.ts";
import {IOEventBus, IOEventPayload} from "../eventBus/IOEventBus.ts";
import { ConnectionManager } from "./ConnectionManager.ts";

// Si AudioOutput3D a une structure connue, vous pouvez la typer ici pour plus de clarté
// Sinon, laissez data.audioOutput être de type any ou le type importé si vous l'avez.
// Par exemple : import { AudioOutput3D } from "./AudioOutput3D";
// Et dans audioOutputHandler: data: IOEventPayload['IO_CONNECT_AUDIO_OUTPUT'] // où audioOutput est de type AudioOutput3D

export class IOManager {
    private _messageManager: MessageManager;

    private _inputNode: Nullable<Wam3D> = null;
    private _outputNode: Nullable<Wam3D> = null;
    private _inputPortId: string | null = null;
    private _outputPortId: string | null = null;

    private static instance: IOManager;
    private connectionManager: ConnectionManager = ConnectionManager.getInstance();
    private ioEventBus: IOEventBus = IOEventBus.getInstance();

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
                            console.log("[*] Connecting output", actualOutputNode.id, actualOutputPortId, "to input", actualInputNode.id, actualInputPortId);
                            actualOutputNode.connectPorts(actualOutputPortId, actualInputNode, actualInputPortId);
                            this.connectionManager.createConnectionArc(
                                connectionId,
                                outputPortMesh,
                                actualOutputNode.id,
                                inputPortMesh,
                                actualInputNode.id
                            );
                        } else {
                            console.error("[*] Failed to get port meshes for visual connection");
                        }
                    }
                } else {
                    console.log("[*] Released with incomplete connection state - canceling");
                }
                this._cancelAndResetConnection();
                break;

            case "out":
                console.log("[*] Pointer out - canceling preview");
                this._cancelAndResetConnection();
                break;
        }
    }

    /**
     * Handle connections to AudioOutput3D
     */
    private audioOutputHandler(data: IOEventPayload['IO_CONNECT_AUDIO_OUTPUT']) {
        const audioOutput = data.audioOutput; // audioOutput est ici le vrai objet AudioOutput3D

        switch (data.pickType) {
            case "down":
                // Si on ne peut pas initier une connexion *depuis* un AudioOutput, cette partie reste vide.
                // Si on clique sur un AudioOutput pour démarrer une connexion, il faudrait stocker
                // this._inputNode = audioOutput; (ou un équivalent si AudioOutput n'est pas un Wam3D)
                // Mais votre logique actuelle suggère qu'AudioOutput est toujours une cible.
                break;

            case "up":
                // On essaie de connecter le this._outputNode (un Wam3D) à l'audioOutput
                if (this._outputNode && this._outputPortId) {
                    // Assurez-vous que audioOutput a bien une propriété 'id' si vous faites cette comparaison
                    if (this._outputNode.id !== audioOutput.id) {
                        const sourceWamAudioNode = this._outputNode.getAudioNode();
                        // Assurez-vous que votre audioOutput a une méthode getAudioNode()
                        const targetAudioOutputNode = audioOutput.getAudioNode();

                        if (sourceWamAudioNode && targetAudioOutputNode) {
                            sourceWamAudioNode.connect(targetAudioOutputNode);

                            const outputPortMesh = this._outputNode.getPortMesh(this._outputPortId);
                            // Assurez-vous que votre audioOutput a une méthode getPortMesh()
                            const audioOutputMesh = audioOutput.getPortMesh();
                            if (outputPortMesh && audioOutputMesh) {
                                const connectionId = `${this._outputNode.id}_${this._outputPortId}_to_audioOutput_${audioOutput.id}`;
                                this.connectionManager.createConnectionArc(
                                    connectionId,
                                    outputPortMesh,
                                    this._outputNode.id,
                                    audioOutputMesh,
                                    audioOutput.id // L'ID de la cible est celui de l'audioOutput
                                );
                            }
                            console.log("[*] Connected", this._outputNode.id, "to audio output", audioOutput.id);
                        } else {
                            console.error("[*] Failed to get audio nodes for connection to AudioOutput");
                        }
                    } else {
                        this._messageManager.showMessage("Can't connect a node to itself", 2000);
                    }
                } else {
                    console.log("[*] Released on AudioOutput but no WAM output was being dragged.");
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
        this.connectionManager.deleteConnectionArcById(connectionId);
        // TODO: Handle the actual WAM disconnection
        console.log(`[*] Disconnected ${sourceNodeId}:${portId} from ${targetNodeId}:${targetPortId}`);
    }

    public onNodeDelete(nodeId: string): void {
        this.connectionManager.deleteArcsForNode(nodeId);
        // TODO: Handle the actual WAM disconnections
        console.log(`[*] Removed all connections for deleted node: ${nodeId}`);
    }

    private _resetConnectionState() {
        this._inputNode = null;
        this._outputNode = null;
        this._inputPortId = null;
        this._outputPortId = null;
    }
}