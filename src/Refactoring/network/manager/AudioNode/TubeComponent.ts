import {AudioNodeComponent} from "./AudioNodeComponent.ts";
import * as Y from "yjs";
import {PortParam} from "../../../shared/SharedTypes.ts";
import {AudioEventBus, AudioEventPayload} from "../../../eventBus/AudioEventBus.ts";
import {AudioNodeState} from "../../types.ts";

export class TubeComponent {
    private readonly parent: AudioNodeComponent;
    private readonly networkConnections: Y.Map<PortParam>;

    private audioEventBus: AudioEventBus = AudioEventBus.getInstance();

    constructor(parent: AudioNodeComponent) {
        this.parent = parent;
    }

    public initialize(): void {
        this.networkConnections = this.parent.getNetworkConnections();
        this.setupEventListeners();
        this.setupNetworkObservers();
        console.log(`[TubeComponent] Initialized`);
    }

    private setupEventListeners(): void {
        this.audioEventBus.on('CONNECT_NODES', (payload) => {
            if (payload.source === 'user' && !this.parent.isProcessingYjsEvent) {
                //this.withLocalProcessing(() => this.handleNodeConnection(payload));
                console.log("[NetworkManager] Muted node connection event");
            }
        });

        this.audioEventBus.on('DISCONNECT_NODES', this.handleNodeDisconnection.bind(this));
    }

    private setupNetworkObservers(): void {
        this.networkConnections.observe((event) => {
            if (!this.parent.isProcessingLocalEvent) {
                this.parent.withNetworkProcessing(() => this.handleConnectionUpdates(event));
            }
        });
    }

    private handleNodeConnection(payload: AudioEventPayload['CONNECT_NODES']): void {
        // Check if the connection already exists in network storage
        if (!this.isConnectionStoredInNetwork(payload.sourceId, payload.targetId, payload.isSrcMidi)) {
            const connectionId = `${payload.sourceId}-${payload.targetId}-${Date.now()}`;
            console.log('[NetworkManager] Storing new connection:', connectionId);
            this._networkConnections.set(connectionId, {
                sourceId: payload.sourceId,
                targetId: payload.targetId,
                isSrcMidi: payload.isSrcMidi
            });
        } else {
            console.log('[NetworkManager] Connection already stored in network:', {
                sourceId: payload.sourceId,
                targetId: payload.targetId,
                isSrcMidi: payload.isSrcMidi
            });
        }

    }

    private handleConnectionUpdates(event: Y.YMapEvent<{sourceId: string, targetId: string, isSrcMidi: boolean}>): void {
        event.changes.keys.forEach((change, key) => {
            if (change.action === "add") {
                const connection = this._networkConnections.get(key);
                if (connection && !this.isConnectionExists(connection.sourceId, connection.targetId, connection.isSrcMidi)) {
                    console.log('[NetworkManager] Processing new network connection:', connection);
                    this.attemptConnection(connection);
                } else if (connection) {
                    console.log('[NetworkManager] Skipping existing connection:', connection);
                }
            }
        });
    }

    private async handleNodeDisconnection(payload: AudioEventPayload['DISCONNECT_NODES']): Promise<void> {
        if (payload.source === 'network') return;

        const sourceNode = this._audioNodes3D.get(payload.sourceId);
        const targetNode = this._audioNodes3D.get(payload.targetId);

        if (!sourceNode || !targetNode) return;

        const sourceState = await sourceNode.getState();
        const targetState = await targetNode.getState();
        this.withLocalProcessing(() => {
            this._networkAudioNodes3D.set(payload.sourceId, sourceState as AudioNodeState);
            this._networkAudioNodes3D.set(payload.targetId, targetState as AudioNodeState);
        });
    }
    private isConnectionExists(sourceId: string, targetId: string, isSrcMidi: boolean): boolean {
        const sourceNode = this._audioNodes3D.get(sourceId);
        const targetNode = this._audioNodes3D.get(targetId);

        if (!sourceNode || !targetNode) {
            return false;
        }

        // Check MIDI connections
        if (isSrcMidi) {
            return sourceNode.outputArcsMidi.some(arc =>
                arc.inputNode.id === targetId && arc.outputNode.id === sourceId
            ) || targetNode.inputArcsMidi.some(arc =>
                arc.outputNode.id === sourceId && arc.inputNode.id === targetId
            );
        }

        // Check audio connections
        return sourceNode.outputArcs.some(arc =>
            arc.inputNode.id === targetId && arc.outputNode.id === sourceId
        ) || targetNode.inputArcs.some(arc =>
            arc.outputNode.id === sourceId && arc.inputNode.id === targetId
        );
    }

    private async attemptConnection(connection: {sourceId: string, targetId: string, isSrcMidi: boolean}, attempt = 0): Promise<void> {
        const sourceNode = this._audioNodes3D.get(connection.sourceId);
        const targetNode = this._audioNodes3D.get(connection.targetId);

        if (sourceNode && targetNode) {
            // Check if connection already exists before attempting to create it
            if (!this.isConnectionExists(connection.sourceId, connection.targetId, connection.isSrcMidi)) {
                this.eventBus.emit('APPLY_CONNECTION', connection);
                return;
            } else {
                console.log(`Connection already exists between ${connection.sourceId} and ${connection.targetId}`);
                return;
            }
        }

        if (attempt < NetworkManager.MAX_CONNECTION_ATTEMPTS) {
            setTimeout(() => {
                this.attemptConnection(connection, attempt + 1);
            }, NetworkManager.CONNECTION_RETRY_DELAY);
        } else {
            console.warn('Failed to establish connection after max attempts:', connection);
        }
    }
}