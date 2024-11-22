import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import * as B from "@babylonjs/core";
import { AudioNodeState, PlayerState } from "./types";
import { AudioNode3D } from "../audioNodes3D/AudioNode3D";
import { Player } from "../Player";
import { Awareness } from 'y-protocols/awareness';
import { AudioEventBus, AudioEventPayload } from '../AudioEvents.ts'
import {Wam3D} from "../audioNodes3D/Wam3D.ts";
import {ParamUpdate,NodeTransform} from "../audioNodes3D/types.ts";


const SIGNALING_SERVER: string = 'wss://musical-multiverse-vr.onrender.com';

export class NetworkManager {
    private readonly _doc: Y.Doc;
    private readonly _id: string;
    private awareness!: Awareness;
    private eventBus = AudioEventBus.getInstance();

    // Flags pour éviter les boucles infinies
    private isProcessingYjsEvent = false;
    private isProcessingLocalEvent = false;

    // Audio nodes
    private _networkAudioNodes3D!: Y.Map<AudioNodeState>;
    private _audioNodes3D = new Map<string, AudioNode3D>();
    public onAudioNodeChangeObservable = new B.Observable<{action: 'add' | 'delete', state: AudioNodeState}>();

    // Players
    private _networkPlayers!: Y.Map<PlayerState>;
    private _players = new Map<string, Player>();
    public onPlayerChangeObservable = new B.Observable<{action: 'add' | 'delete', state: PlayerState}>();

    private _peerToPlayerMap = new Map<string, string>();
    private _networkParamUpdates: Y.Map<ParamUpdate>;
    private _networkPositions: Y.Map<NodeTransform>;

    constructor(id: string) {
        this._doc = new Y.Doc();
        this._id = id;
        console.log("Current player id: " + this._id);

        this._networkParamUpdates = this._doc.getMap('paramUpdates');
        this._networkPositions = this._doc.getMap('positions');

        // Écoute des changements de paramètres locaux via EventBus
        this.eventBus.on('PARAM_CHANGE', (payload) => {
            if (payload.source === 'user' && !this.isProcessingYjsEvent) {
                this.isProcessingLocalEvent = true;
                this._handleParamChange(payload);
                this.isProcessingLocalEvent = false;
            }
        });

        this.eventBus.on('POSITION_CHANGE', (payload) => {
            if (payload.source === 'user' && !this.isProcessingYjsEvent) {
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

                console.log("Envoi position:", transform);

                this.isProcessingLocalEvent = true;
                this._networkPositions.set(payload.nodeId, transform);
                this.isProcessingLocalEvent = false;
            }
        });

        this.eventBus.on('CONNECT_NODES', this.handleNodeConnection.bind(this));
        this.eventBus.on('DISCONNECT_NODES', this.handleNodeDisconnection.bind(this));

        // Observer uniquement les mises à jour de paramètres
        this._networkParamUpdates.observe((event: Y.YMapEvent<any>) => {
            if (!this.isProcessingLocalEvent) {
                this.isProcessingYjsEvent = true;
                event.changes.keys.forEach((change, key) => {
                    if (change.action === "add") {
                        const paramUpdate = this._networkParamUpdates.get(key);
                        if (paramUpdate) {
                            const node = this._audioNodes3D.get(paramUpdate.nodeId);
                            if (node && node instanceof Wam3D) {
                                // Mise à jour d'un seul paramètre
                                node.updateSingleParameter(paramUpdate.paramId, paramUpdate.value);
                            }
                        }
                        // Nettoyage après utilisation
                        this._networkParamUpdates.delete(key);
                    }
                });
                this.isProcessingYjsEvent = false;
            }
        })
    }
    private handleNodeConnection(payload: AudioEventPayload['CONNECT_NODES']): void {
        if (payload.source === 'network') return;

        const sourceNode = this._audioNodes3D.get(payload.sourceId);
        const targetNode = this._audioNodes3D.get(payload.targetId);

        if (!sourceNode || !targetNode) return;

        // Mise à jour des états
        const sourceState = sourceNode.getState();
        const targetState = targetNode.getState();

        // Propagation sur le réseau
        this.isProcessingLocalEvent = true;
        this._networkAudioNodes3D.set(payload.sourceId, sourceState);
        this._networkAudioNodes3D.set(payload.targetId, targetState);
        this.isProcessingLocalEvent = false;
    }
    private handleNodeDisconnection(payload: AudioEventPayload['DISCONNECT_NODES']): void {
        if (payload.source === 'network') return;

        const sourceNode = this._audioNodes3D.get(payload.sourceId);
        const targetNode = this._audioNodes3D.get(payload.targetId);

        if (!sourceNode || !targetNode) return;

        // Mise à jour des états
        const sourceState = sourceNode.getState();
        const targetState = targetNode.getState();

        // Propagation sur le réseau
        this.isProcessingLocalEvent = true;
        this._networkAudioNodes3D.set(payload.sourceId, sourceState);
        this._networkAudioNodes3D.set(payload.targetId, targetState);
        this.isProcessingLocalEvent = false;
    }
    private handleRemoteNodeConnection(state: AudioNodeState): void {
        const node = this._audioNodes3D.get(state.id);
        if (!node) return;

        // Propager l'état avec le flag 'network' pour éviter les boucles
        this.eventBus.emit('NODE_CONNECTION_CHANGED', {
            sourceId: state.id,
            targetId: state.id, // L'ID du nœud cible sera dans inputNodes
            action: 'connected',
            source: 'network'
        });
    }
    public connect(roomName: string): void {
        const provider = new WebrtcProvider(roomName, this._doc, {
            signaling: [SIGNALING_SERVER]
        });

        this.awareness = provider.awareness;
        this.awareness.setLocalStateField('playerId', this._id);
        this.awareness.on('change', this._onAwarenessChange.bind(this));

        // Audio nodes
        this._networkAudioNodes3D = this._doc.getMap('audioNodes3D');
        this._networkAudioNodes3D.observe((event: Y.YMapEvent<any>): void => {
            if (!this.isProcessingLocalEvent) {
                this.isProcessingYjsEvent = true;
                event.changes.keys.forEach(this._onAudioNode3DChange.bind(this));
                this.isProcessingYjsEvent = false;
            }
        });

        // Players
        this._networkPlayers = this._doc.getMap('players');
        this._networkPlayers.observe((event: Y.YMapEvent<any>): void => {
            event.changes.keys.forEach(this._onPlayerChange.bind(this));
        });

        this._networkParamUpdates.observe((event: Y.YMapEvent<ParamUpdate>) => {
            if (!this.isProcessingLocalEvent) {
                this.isProcessingYjsEvent = true;
                event.changes.keys.forEach((change, key) => {
                    if (change.action === "add") {
                        const update = this._networkParamUpdates.get(key);
                        if (update) {
                            const node = this._audioNodes3D.get(update.nodeId);
                            if (node && node instanceof Wam3D) {
                                if (process.env.NODE_ENV === 'development') {
                                    console.log(`Param update received:`, update);
                                }
                                node.updateSingleParameter(update.paramId, update.value);
                            }
                            this._networkParamUpdates.delete(key);
                        }
                    }
                });
                this.isProcessingYjsEvent = false;
            }
        });

        this._networkPositions.observe((event: Y.YMapEvent<NodeTransform>) => {
            if (!this.isProcessingLocalEvent) {
                this.isProcessingYjsEvent = true;
                event.changes.keys.forEach((_, key) => {
                    const transform = this._networkPositions.get(key);
                    console.log("Réception position:", transform);

                    if (transform) {
                        const node = this._audioNodes3D.get(key);
                        if (node) {
                            node.setState({
                                ...node.getState(),
                                position: new B.Vector3(transform.position.x, transform.position.y, transform.position.z),
                                rotation: new B.Vector3(transform.rotation.x, transform.rotation.y, transform.rotation.z)
                            });
                        }
                    }
                });
                this.isProcessingYjsEvent = false;
            }
        });
    }

    private _handleParamChange(payload: AudioEventPayload['PARAM_CHANGE']): void {
        if (payload.source === 'user') {
            const { nodeId, paramId, value } = payload;
            const update: ParamUpdate = { nodeId, paramId, value };
            const key = `${nodeId}-${paramId}-${Date.now()}`;

            console.log(`Sending param update:`, update);


            this._networkParamUpdates.set(key, update);
        }
    }


    private _onAwarenessChange({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }): void {
        const states = this.awareness.getStates();

        added.concat(updated).forEach(peerId => {
            console.log(`Peer ${peerId} connected/updated.`);
            const state = states.get(peerId);
            if (state?.playerId) {
                this._peerToPlayerMap.set(String(peerId), state.playerId);
            }
        });

        removed.forEach(peerId => {
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
        });
    }

    private _onAudioNode3DChange(change: any, key: string): void {
        switch (change.action) {
            case "add":
                if (!this._audioNodes3D.has(key)) {
                    const state = this._networkAudioNodes3D.get(key);
                    if (state) {
                        // Stop! C'est ICI qu'on doit vérifier la position avant de notifier
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
                break;

            case "update":
                const state = this._networkAudioNodes3D.get(key);
                if (state) {
                    const audioNode = this._audioNodes3D.get(key);
                    if (audioNode) {
                        // Ne mettre à jour que la position/rotation
                        audioNode.setState({
                            ...state,
                            // On ne touche pas aux paramètres ici
                            parameters: audioNode.getState().parameters
                        });
                    }
                }
                break;

            case "delete":
                if (this._audioNodes3D.has(key)) {
                    const audioNode = this._audioNodes3D.get(key)!;
                    this.onAudioNodeChangeObservable.notifyObservers({
                        action: 'delete',
                        state: change.oldValue
                    });
                    this._audioNodes3D.delete(key);
                    audioNode.delete();
                }
                break;
        }
    }

    private _onPlayerChange(change: {action: "add" | "update" | "delete", oldValue: any}, key: string): void {
        if (key === this._id) return;

        switch (change.action) {
            case "add":
                if (this._players.has(key)) return;
                this.onPlayerChangeObservable.notifyObservers({
                    action: 'add',
                    state: this._networkPlayers.get(key)!
                });
                break;

            case "update":
                const playerState: PlayerState = this._networkPlayers.get(key)!;
                const player = this._players.get(key);
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

    public createNetworkAudioNode3D(audioNode3D: AudioNode3D): void {
        const state: AudioNodeState = audioNode3D.getState();
        this.addRemoteAudioNode3D(audioNode3D);

        // IMPORTANT: Sauvegarder la position AVANT de notifier les autres
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
        this._networkAudioNodes3D.set(state.id, state);
    }

    public addRemoteAudioNode3D(audioNode3D: AudioNode3D): void {
        const state: AudioNodeState = audioNode3D.getState();
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
    public getNodePosition(id: string) {
        return this._networkPositions.get(id);
    }

}