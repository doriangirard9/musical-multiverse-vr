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
import {backgroundPixelShader} from "@babylonjs/core";

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





    private setupNetworkObservers(): void {
        // Audio nodes observer
        this._networkAudioNodes3D.observe((event) => {
            if (!this.isProcessingLocalEvent) {
                this.withNetworkProcessing(() => {
                    event.changes.keys.forEach(this.handleAudioNodeChange.bind(this));
                });
            }
        });



        // Positions observer


        // Connections observer


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