import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import * as B from "@babylonjs/core";
import {AudioNodeState, PlayerState} from "./types.ts";
import {AudioNode3D} from "../audioNodes3D/AudioNode3D.ts";
import {Player} from "../Player.ts";
import {Awareness} from 'y-protocols/awareness';
const TICK_RATE: number = 1000 / 30;
const SIGNALING_SERVER: string = 'wss://musical-multiverse-vr.onrender.com'//'wss://musical-multiverse-vr.onrender.com';

export class NetworkManager {
    private readonly _doc: Y.Doc;
    private readonly _id: string;
    private awareness!: Awareness
    // Audio nodes
    private _networkAudioNodes3D!: Y.Map<AudioNodeState>; // Network state
    private _audioNodes3D = new Map<string, AudioNode3D>(); // local state
    public onAudioNodeChangeObservable = new B.Observable<{action: 'add' | 'delete', state: AudioNodeState}>();

    // Players
    private _networkPlayers!: Y.Map<PlayerState>; // Network state
    private _players = new Map<string, Player>();// local state
    public onPlayerChangeObservable = new B.Observable<{action: 'add' | 'delete', state: PlayerState}>();

    private _peerToPlayerMap = new Map<string, string>();
    constructor(id: string) {
        this._doc = new Y.Doc();
        this._id = id;
        console.log("Current player id: " + this._id);
    }

    public connect(roomName: string): void {
        const provider = new WebrtcProvider(roomName, this._doc, {signaling: [SIGNALING_SERVER]});

        this.awareness = provider.awareness;
        this.awareness.setLocalStateField('playerId', this._id);
        this.awareness.on('change', this._onAwarenessChange.bind(this));

        // Audio nodes
        this._networkAudioNodes3D = this._doc.getMap('audioNodes3D');
        this._networkAudioNodes3D.observe((event: Y.YMapEvent<any>): void => {
            event.changes.keys.forEach(this._onAudioNode3DChange.bind(this));
        });

        // Players
        this._networkPlayers = this._doc.getMap('players');
        this._networkPlayers.observe((event: Y.YMapEvent<any>): void => {
            event.changes.keys.forEach(this._onPlayerChange.bind(this));
        });

        setInterval(this._update.bind(this), TICK_RATE);
    }

    // Method used to handle changes in Yjs awareness.
    private _onAwarenessChange({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }) {
        // Get the current state of all peers
        const states = this.awareness.getStates();

        // Process added peers
        added.concat(updated).forEach(peerId => {
            console.log(`Peer ${peerId} connected.`);
            const state = states.get(peerId);
            if (state) {
                console.log(state)
                if (state.playerId) {
                    this._peerToPlayerMap.set(String(peerId), state.playerId);
                }
            }
            console.log(this._peerToPlayerMap)
        });

        // Handle removed peers
        removed.forEach(peerId => {
            console.log(`Peer ${peerId} disconnected.`);
            const playerId = this._peerToPlayerMap.get(String(peerId));
            if (playerId) {
                this._players.get(playerId)!.dispose();
                this._players.delete(playerId);
                this._networkPlayers.delete(playerId);
            }
            this._peerToPlayerMap.delete(String(peerId));

        });
    }
    private _onAudioNode3DChange(change: {action: "add" | "update" | "delete", oldValue: any}, key: string): void {
        switch (change.action) {
            case "add":
                if (this._audioNodes3D.has(key)) return;
                this.onAudioNodeChangeObservable.notifyObservers({action: 'add', state: this._networkAudioNodes3D.get(key)!});
                break;
            case "update":
                const state: AudioNodeState = this._networkAudioNodes3D.get(key)!;
                this._audioNodes3D.get(key)!.setState(state);
                break;
            case "delete":
                if (this._audioNodes3D.has(key)) {
                    const audioNode = this._audioNodes3D.get(key)!;
                    
                    // Notify any observers about the deletion
                    this.onAudioNodeChangeObservable.notifyObservers({action: 'delete', state: change.oldValue});
                    
                    // Remove the node from the local state
                    this._audioNodes3D.delete(key);
                    
                    // Call the delete method on the audio node to clean up resources
                    audioNode.delete();
                }
                break;
            default:
                break;
        }
    }

    private _onPlayerChange(change: {action: "add" | "update" | "delete", oldValue: any}, key: string): void {
        if (key === this._id) return;
        switch (change.action) {
            case "add":
                if (this._players.get(key)) return;
                this.onPlayerChangeObservable.notifyObservers({action: 'add', state: this._networkPlayers.get(key)!});
                break;
            case "update":
                const playerState: PlayerState = this._networkPlayers.get(key)!;
                this._players.get(key)!.setState(playerState);
                break;
            case "delete":
                const player = this._players.get(key);
                if (player) {
                    player.dispose();
                    this._players.delete(key);
                    this.onPlayerChangeObservable.notifyObservers({action: 'delete', state: change.oldValue});
                }
                break;
            default:
                break;
        }
    }

    /**
     * Add a new audio node to the network that will be synchronized with other clients
     */
    public createNetworkAudioNode3D(audioNode3D: AudioNode3D): void {
        const state: AudioNodeState = audioNode3D.getState();
        this.addRemoteAudioNode3D(audioNode3D);
        this._networkAudioNodes3D.set(state.id, state);
    }

    /**
     * Add a remote audio node locally
     */
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

    /**
     * Update the network with the latest audio node states
     */
    private _update(): void {
        this._audioNodes3D.forEach((audioNode3D: AudioNode3D): void => {
            const state: AudioNodeState = audioNode3D.getState();
            if (!this._compare(state, this._networkAudioNodes3D.get(state.id)!)) {
                this._networkAudioNodes3D.set(state.id, state);
            }
        });
    }

    private _compare(state1: AudioNodeState, state2: AudioNodeState): boolean {
        return JSON.stringify(state1) === JSON.stringify(state2);
    }
}