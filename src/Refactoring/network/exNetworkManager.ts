import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import * as B from "@babylonjs/core";
import { Awareness } from 'y-protocols/awareness';
import {AudioNode3D} from "../ConnecterWAM/AudioNode3D.ts";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {PlayerManager} from "../app/PlayerManager.ts";
import {AudioEventBus, AudioEventPayload} from "../eventBus/AudioEventBus.ts";
import {AudioNodeState, PlayerState} from "./types.ts";
import {NodeTransform, ParamUpdate} from "../shared/SharedTypes.ts";
import {Player} from "../app/Player.ts";

const SIGNALING_SERVER = 'ws://localhost:3001';//'wss://musical-multiverse-vr.onrender.com';

interface PendingConnection {
    sourceId: string;
    targetId: string;
    attempts: number;
    maxAttempts: number;
}

export class exNetworkManager {
    // Private readonly properties
    private readonly _doc: Y.Doc;
    private readonly _id: string;
    private readonly eventBus = AudioEventBus.getInstance();
    private readonly _audioNodes3D = new Map<string, AudioNode3D>();
    private readonly _pendingConnections = new Map<string, PendingConnection>();
    private static readonly MAX_CONNECTION_ATTEMPTS = 5;
    private static readonly CONNECTION_RETRY_DELAY = 1000;

    // Y.js maps
    private _networkAudioNodes3D!: Y.Map<AudioNodeState>;
    private _networkPlayers!: Y.Map<PlayerState>;
    private _networkParamUpdates!: Y.Map<ParamUpdate>;
    private _networkConnections!: Y.Map<{sourceId: string, targetId: string,isSrcMidi: boolean}>;


   // State flags
    private isProcessingYjsEvent = false;
    private isProcessingLocalEvent = false;

    // Public observables
    public onAudioNodeChangeObservable = new B.Observable<{
        action: 'add' | 'delete',
        state: AudioNodeState
    }>();
    public onPlayerChangeObservable = new B.Observable<{
        action: 'add' | 'delete',
        state: PlayerState
    }>();

    // Awareness
    private awareness!: Awareness;
    private _keepAlive: NodeJS.Timeout | undefined;
    private _lastKnownPlayerIds = new Map<string, string>();


    private constructor() {
        this._doc = new Y.Doc();
        this._id = PlayerManager.getInstance().getId();
        this.initializeYMaps();
        this.setupEventListeners();
        console.log("Current player id:", this._id);
    }

    public static getInstance(){
        if (!this.instance) {
            this.instance = new NetworkManager();
        }
        return this.instance;
    }
    private initializeYMaps(): void {
        this._networkParamUpdates = this._doc.getMap('paramUpdates');
        this._networkConnections = this._doc.getMap('connections');

    }

    private setupEventListeners(): void {
        // Parameter changes
        this.eventBus.on('PARAM_CHANGE', (payload) => {
            if (payload.source === 'user' && !this.isProcessingYjsEvent) {
                this.withLocalProcessing(() => this.handleParamChange(payload));
            }
        });


        // Node connections
        this.eventBus.on('CONNECT_NODES', (payload) => {
            if (payload.source === 'user' && !this.isProcessingYjsEvent) {
                //this.withLocalProcessing(() => this.handleNodeConnection(payload));
                console.log("[NetworkManager] Muted node connection event");
            }
        });

        // Node disconnections
        this.eventBus.on('DISCONNECT_NODES', this.handleNodeDisconnection.bind(this));

        // WAM loaded
        this.eventBus.on('WAM_LOADED', (payload) => {
            console.log('[NetworkManager] WAM loaded, checking existing connections:', payload.nodeId);
            //this.processConnectionsForNode(payload.nodeId);
        });

    }

    private withLocalProcessing<T>(action: () => T): T {
        this.isProcessingLocalEvent = true;
        try {
            return action();
        } finally {
            this.isProcessingLocalEvent = false;
        }
    }

    private withNetworkProcessing<T>(action: () => T): T {
        this.isProcessingYjsEvent = true;
        try {
            return action();
        } finally {
            this.isProcessingYjsEvent = false;
        }
    }

    private handleParamChange(payload: AudioEventPayload['PARAM_CHANGE']): void {
        const { nodeId, paramId, value } = payload;
        const update: ParamUpdate = { nodeId, paramId, value: value };
        const key = `${nodeId}-${paramId}-${Date.now()}`;
        console.log("Sending param update:", update);
        this._networkParamUpdates.set(key, update);
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

    private isConnectionStoredInNetwork(sourceId: string, targetId: string, isSrcMidi: boolean): boolean {
        // Check all stored connections
        let isStored = false;
        this._networkConnections.forEach((connection, _) => {
            if (connection.sourceId === sourceId &&
                connection.targetId === targetId &&
                connection.isSrcMidi === isSrcMidi) {
                isStored = true;
            }
        });
        return isStored;
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



    private setupNetworkObservers(): void {
        // Audio nodes observer
        this._networkAudioNodes3D.observe((event) => {
            if (!this.isProcessingLocalEvent) {
                this.withNetworkProcessing(() => {
                    event.changes.keys.forEach(this.handleAudioNodeChange.bind(this));
                });
            }
        });


        // Parameters observer
        this._networkParamUpdates.observe((event) => {
            if (!this.isProcessingLocalEvent) {
                this.withNetworkProcessing(() => this.handleParameterUpdates(event));
            }
        });

        // Positions observer


        // Connections observer
        this._networkConnections.observe((event) => {
            if (!this.isProcessingLocalEvent) {
                this.withNetworkProcessing(() => this.handleConnectionUpdates(event));
            }
        });

    }

    private handleParameterUpdates(event: Y.YMapEvent<ParamUpdate>): void {
        event.changes.keys.forEach((change, key) => {
            if (change.action === "add") {
                const update = this._networkParamUpdates.get(key);
                if (update) {
                    const node = this._audioNodes3D.get(update.nodeId);
                    if (node instanceof Wam3D) {
                        this.withNetworkProcessing(() => {
                            node.updateSingleParameter(update.paramId, update.value);
                        });
                    }
                    this._networkParamUpdates.delete(key);
                }
            }
        });
    }











    public async createNetworkAudioNode3D(audioNode3D: AudioNode3D): Promise<void> {
        const state: AudioNodeState = await audioNode3D.getState();
        await this.addRemoteAudioNode3D(audioNode3D);
        this.isProcessingLocalEvent = true;
        try {
            // Sauvegarder la position
            this._networkPositions.set(state.id, {
                position: {
                    x: audioNode3D.boundingBox.position.x,
                    y: audioNode3D.boundingBox.position.y,
                    z: audioNode3D.boundingBox.position.z
                },
                rotation: {
                    x: audioNode3D.boundingBox.rotation.x,
                    y: audioNode3D.boundingBox.rotation.y,
                    z: audioNode3D.boundingBox.rotation.z
                }
            });

            // Propager au réseau
            this._networkAudioNodes3D.set(state.id, state);
        } finally {
            this.isProcessingLocalEvent = false;
        }
    }


    public async addRemoteAudioNode3D(audioNode3D: AudioNode3D): Promise<void> {
        const state: AudioNodeState = await audioNode3D.getState();
        this._audioNodes3D.set(state.id, audioNode3D);
    }

    public getAudioNode3D(id: string): AudioNode3D | undefined {
        return this._audioNodes3D.get(id);
    }

    public removeNetworkAudioNode3D(id: string): void {
        if (this._networkAudioNodes3D.has(id)) {
            this._networkAudioNodes3D.delete(id);
        }
    }

    public addRemotePlayer(player: Player): void {
        this._players.set(player.id, player);
    }

    public getPlayer(id: string): Player | undefined {
        return this._players.get(id);
    }

    public removeRemotePlayer(playerId: string): void {
        this._players.delete(playerId);
    }

    public updatePlayerState(playerState: PlayerState): void {
        this._networkPlayers.set(playerState.id, playerState);
    }

    public getNodePosition(id: string): NodeTransform | undefined {
        return this._networkPositions.get(id);
    }
    public dispose(): void {
        // Clean up Y.js resources
        this._doc.destroy();

        // Clean up event listeners
        if (this._keepAlive) clearInterval(this._keepAlive);
        this.awareness?.destroy();

        // Clear all maps
        this._audioNodes3D.clear();
        this._players.clear();
        this._peerToPlayerMap.clear();
        this._pendingConnections.clear();

        // Clean up observables
        this.onAudioNodeChangeObservable.clear();
        this.onPlayerChangeObservable.clear();
    }
}