import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { NetworkEventBus } from "../eventBus/NetworkEventBus.ts";
import { NetworkRoom } from "../network/NetworkRoom.ts";

/**
 * Système possédant la room réseau de la session.
 * Responsable de:
 * - Créer et conserver la NetworkRoom (document partagé, awareness, canal d'events)
 * - Notifier des connexions/déconnexions des joueurs sur le NetworkEventBus
 */
export class NetworkRoomSystem {
    private static readonly DEBUG_LOG = false;

    readonly room: NetworkRoom;
    private networkEventBus = NetworkEventBus.getInstance();

    /**
     * @param doc - Document Y.js partagé
     * @param playerId - Identifiant du joueur local
     * @param roomName - Nom de la salle à rejoindre
     */
    constructor(
        readonly doc: Y.Doc,
        readonly playerId: string,
        readonly roomName: string,
    ) {
        this.room = new NetworkRoom(roomName, playerId, doc);

        this.room.onPeerJoin.add(peer => {
            if (NetworkRoomSystem.DEBUG_LOG) console.log(`[NetworkRoomSystem] Player ${peer.id} connected`);
            this.networkEventBus.emit('PLAYER_ADDED', { playerId: peer.id });
        });

        this.room.onPeerLeave.add(peer => {
            if (NetworkRoomSystem.DEBUG_LOG) console.log(`[NetworkRoomSystem] Player ${peer.id} disconnected`);
            this.networkEventBus.emit('PLAYER_DELETED', { playerId: peer.id });
        });
    }

    /**
     * Récupère l'instance Awareness.
     */
    public getAwareness(): Awareness {
        return this.room.awareness;
    }

    /**
     * Récupère la liste des joueurs connectés.
     */
    public getConnectedPlayers(): string[] {
        return [...this.room.peers.keys()];
    }

    // Instance
    private static _instance?: NetworkRoomSystem;

    /** Resolves once the room is connected, or failed to connect. */
    static async initialize(...args: ConstructorParameters<typeof NetworkRoomSystem>) {
        const instance = this._instance = new NetworkRoomSystem(...args);
        if (!await instance.room.initialize()) {
            console.warn("[NetworkRoomSystem] Signaling server unreachable, the room keeps retrying in the background");
        }
    }

    static getInstance(): NetworkRoomSystem {
        if (!this._instance) throw new Error("NetworkRoomSystem not initialized. Call initialize() first.");
        return this._instance;
    }
}
