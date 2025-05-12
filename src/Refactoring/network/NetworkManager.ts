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

/**
 * Manages network synchronization for audio nodes and players in a WebXR environment.
 * Uses Y.js for CRDT-based state synchronization and WebRTC for peer-to-peer communication.
 *
 * @events
 * - PARAM_CHANGE: Emitted when a parameter value changes on an audio node
 * - POSITION_CHANGE: Emitted when an audio node's position changes
 * - CONNECT_NODES: Emitted when two audio nodes are connected
 * - DISCONNECT_NODES: Emitted when two audio nodes are disconnected
 * - WAM_LOADED: Emitted when a WAM is fully loaded
 *
 * @observables
 * - onAudioNodeChangeObservable: Notifies about audio node additions and deletions
 * - onPlayerChangeObservable: Notifies about player additions and deletions
 *
 */
export class NetworkManager {
    // Private readonly properties
    private readonly _doc: Y.Doc;
    private readonly _id: string;
    private readonly eventBus = AudioEventBus.getInstance();
    private readonly _audioNodes3D = new Map<string, AudioNode3D>();
    private readonly _players = new Map<string, Player>();
    private readonly _peerToPlayerMap = new Map<string, string>();
    private readonly _pendingConnections = new Map<string, PendingConnection>();
    private static readonly MAX_CONNECTION_ATTEMPTS = 5;
    private static readonly CONNECTION_RETRY_DELAY = 1000;
    private static instance: NetworkManager;
    // Y.js maps
    private _networkAudioNodes3D!: Y.Map<AudioNodeState>;
    private _networkPlayers!: Y.Map<PlayerState>;
    private _networkParamUpdates!: Y.Map<ParamUpdate>;
    private _networkPositions!: Y.Map<NodeTransform>;
    private _networkConnections!: Y.Map<{sourceId: string, targetId: string,isSrcMidi: boolean}>;


    // Y.js Wam Sampler
    private _networkWamSampler!: Y.Map<{nodeId: string, preset: string}>;
    private _networkWamNotes! : Y.Map<{nodeId: string, midiNote: number, velocity: number, timestamp: number}>;
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
        this._networkPositions = this._doc.getMap('positions');
        this._networkConnections = this._doc.getMap('connections');
        this._networkWamSampler = this._doc.getMap('wamSampler');
        this._networkWamNotes = this._doc.getMap('wamNotes');
    }

    private setupEventListeners(): void {
        // Parameter changes
        this.eventBus.on('PARAM_CHANGE', (payload) => {
            if (payload.source === 'user' && !this.isProcessingYjsEvent) {
                this.withLocalProcessing(() => this.handleParamChange(payload));
            }
        });

        // Position changes
        this.eventBus.on('POSITION_CHANGE', (payload) => {
            if (payload.source === 'user' && !this.isProcessingYjsEvent) {
                this.withLocalProcessing(() => this.handlePositionChange(payload));
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

        /* WAM Sampler Preset Change
         * - Réception de l'événement de changement de preset
         * - Crée ou met à jour le preset dans yjs
         */
        this.eventBus.on('WAM_SAMPLER_PRESET_CHANGE', (payload : AudioEventPayload["WAM_SAMPLER_PRESET_CHANGE"]) => {
            if (!this.isProcessingYjsEvent) {
                this.withLocalProcessing(() => {
                    this._networkWamSampler.set(payload.nodeId, {nodeId: payload.nodeId, preset: payload.preset});
                });
            }
        });

        /* WAM Sampler Get Preset
         * - Réception de l'événement de demande de preset
         * - Répondre avec le preset actuel pour ce nodeId
         * - Réponse reçue dans WamSampler3D.ts
         */
        this.eventBus.on('WAM_SAMPLER_GET_PRESET', (payload: AudioEventPayload['WAM_SAMPLER_GET_PRESET']) => {
            let foundPreset: string | null = null;
            console.log(this._networkWamSampler);
            // Chercher le preset pour ce nodeId
            this._networkWamSampler.forEach((value, _) => {
                if (value.nodeId === payload.nodeId) {
                    foundPreset = value.preset;
                    console.log("Current preset : ", foundPreset);
                }
            });

            // Répondre avec le preset trouvé (ou null si aucun preset trouvé)
            this.eventBus.emit('WAM_SAMPLER_PRESET_RESPONSE', {
                nodeId: payload.nodeId,
                preset: foundPreset
            });
        });

        /* WAM Sampler Play
         * - Réception de l'événement de lecture de note
         */
        this.eventBus.on('WAM_SAMPLER_NOTE_PLAY', (payload: AudioEventPayload["WAM_SAMPLER_NOTE_PLAY"]) => {
            if (!this.isProcessingYjsEvent) {
                this.withLocalProcessing(() => {
                    // Générer un ID unique pour chaque événement de note
                    const noteId = `${payload.nodeId}_${payload.timestamp}`;
                    this._networkWamNotes.set(noteId, {
                        nodeId: payload.nodeId,
                        midiNote: payload.midiNote,
                        velocity: payload.velocity,
                        timestamp: payload.timestamp
                    });
                });
            }
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

    private handlePositionChange(payload: AudioEventPayload['POSITION_CHANGE']): void {
        const transform: NodeTransform = {
            position: {
                x: payload.position.x,
                y: payload.position.y,
                z: payload.position.z
            },
            rotation: {
                x: payload.rotation.x,
                y: payload.rotation.y,
                z: payload.rotation.z
            }
        };
        this._networkPositions.set(payload.nodeId, transform);
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

    public connect(roomName: string): void {
        const provider = new WebrtcProvider(roomName, this._doc, {
            signaling: [SIGNALING_SERVER]
        });

        this.setupAwareness(provider);
        this.setupNetworkObservers();
    }

    private setupAwareness(provider: WebrtcProvider): void {
        this.awareness = provider.awareness;
        this.awareness.setLocalStateField('playerId', this._id);
        this.awareness.on('change', this.handleAwarenessChange.bind(this));

        this.awareness.setLocalStateField('lastActive', Date.now());

        /*
         * Dans la doc Y.JS un client est déconnecté après 30s d'inactivités
         * (https://docs.yjs.dev/api/about-awareness) leur conseil → broadcast un message avant 30s
         */
        this._keepAlive = setInterval(() => {
            this.awareness.setLocalStateField('lastActive', Date.now());
        },15000);

        this.handlePeerRemoval = this.handlePeerRemoval.bind(this);
        this._networkAudioNodes3D = this._doc.getMap('audioNodes3D');
        this._networkPlayers = this._doc.getMap('players');
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

        // Players observer
        this._networkPlayers.observe((event) => {
            event.changes.keys.forEach(this.handlePlayerChange.bind(this));
        });

        // Parameters observer
        this._networkParamUpdates.observe((event) => {
            if (!this.isProcessingLocalEvent) {
                this.withNetworkProcessing(() => this.handleParameterUpdates(event));
            }
        });

        // Positions observer
        this._networkPositions.observe((event) => {
            if (!this.isProcessingLocalEvent) {
                this.withNetworkProcessing(() => this.handlePositionUpdates(event));
            }
        });

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

    private handlePositionUpdates(event: Y.YMapEvent<NodeTransform>): void {
        event.changes.keys.forEach((change, key) => {
            if (change.action === "update" || change.action === "add") {
                const update = this._networkPositions.get(key);
                if (update) {
                    const node = this._audioNodes3D.get(key);
                    if (node) {
                        node.updatePosition(
                            new B.Vector3(
                                update.position.x,
                                update.position.y,
                                update.position.z
                            ),
                            new B.Vector3(
                                update.rotation.x,
                                update.rotation.y,
                                update.rotation.z
                            )
                        );
                        this.eventBus.emit('POSITION_CHANGE', {
                            nodeId: key,
                            position: {
                                x: update.position.x,
                                y: update.position.y,
                                z: update.position.z
                            },
                            rotation: {
                                x: update.rotation.x,
                                y: update.rotation.y,
                                z: update.rotation.z
                            },
                            source: 'network'
                        });
                    }
                }
            }
        });
    }

    private handleAwarenessChange({ added, updated, removed }: {
        added: number[],
        updated: number[],
        removed: number[]
    }): void {
        const states = this.awareness.getStates();

        added.forEach(peerId => {
            console.log(`Peer ${peerId} connected.`);
            const state = states.get(peerId);
            if (state?.playerId) {
                this._peerToPlayerMap.set(String(peerId), state.playerId);
                this._lastKnownPlayerIds.set(String(peerId), state.playerId);
            }
        });

        updated.forEach(peerId => {
            const state = states.get(peerId);
            const peerIdStr = String(peerId);

            if (state?.playerId && state.playerId !== this._lastKnownPlayerIds.get(peerIdStr)) {
                console.log(`Peer ${peerId} updated with new playerId.`);
                this._peerToPlayerMap.set(peerIdStr, state.playerId);
                this._lastKnownPlayerIds.set(peerIdStr, state.playerId);
            }
        });

        removed.forEach(peerId => this.handlePeerRemoval(peerId));
    }

    private handlePeerRemoval(peerId: number): void {
        console.log(`Peer ${peerId} disconnected.`);
        const playerId = this._peerToPlayerMap.get(String(peerId));
        if (playerId) {
            const player = this._players.get(playerId);
            if (player) {
                player.dispose();
                this._players.delete(playerId);
                this._networkPlayers.delete(playerId);
            }
            this._peerToPlayerMap.delete(String(peerId));
        }
    }

    private handleAudioNodeChange(change: any, key: string): void {
        if (this.isProcessingLocalEvent) {
            return;
        }

        switch (change.action) {
            case "add":
                this.handleAudioNodeAdd(key);
                break;
            case "update":
                this.handleAudioNodeUpdate(key);
                break;
            case "delete":
                this.handleAudioNodeDelete(key, change.oldValue);
                break;
        }
    }
    private handleAudioNodeAdd(key: string): void {
        if (!this._audioNodes3D.has(key)) {
            const state = this._networkAudioNodes3D.get(key);
            if (state) {
                const position = this._networkPositions.get(key);
                if (position) {
                    state.position = position.position;
                    state.rotation = position.rotation;
                }
                this.onAudioNodeChangeObservable.notifyObservers({
                    action: 'add',
                    state: state
                });
            }
        }
    }


    private async handleAudioNodeUpdate(key: string): Promise<void> {
        const state = this._networkAudioNodes3D.get(key);
        if (state) {
            const audioNode = this._audioNodes3D.get(key);
            if (audioNode) {
                audioNode.setState({
                    ...state,
                    parameters: state.parameters
                });
            }
        }
    }

    private handleAudioNodeDelete(key: string, oldValue: any): void {
        if (this._audioNodes3D.has(key)) {
            //const audioNode = this._audioNodes3D.get(key)!;
            this.onAudioNodeChangeObservable.notifyObservers({
                action: 'delete',
                state: oldValue
            });
            this._audioNodes3D.delete(key);
            //audioNode.delete();
        }
    }

    private handlePlayerChange(change: {action: "add" | "update" | "delete", oldValue: any}, key: string): void {
        if (key === this._id) return;

        switch (change.action) {
            case "add":
                if (!this._players.has(key)) {
                    this.onPlayerChangeObservable.notifyObservers({
                        action: 'add',
                        state: this._networkPlayers.get(key)!
                    });
                }
                break;
            case "update":
                const player = this._players.get(key);
                const playerState = this._networkPlayers.get(key)!;
                if (player) {
                    player.setState(playerState);
                }
                break;
            case "delete":
                const playerToDelete = this._players.get(key);
                if (playerToDelete) {
                    playerToDelete.dispose();
                    this._players.delete(key);
                    this.onPlayerChangeObservable.notifyObservers({
                        action: 'delete',
                        state: change.oldValue
                    });
                }
                break;
        }
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