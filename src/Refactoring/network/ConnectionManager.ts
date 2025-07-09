import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { Awareness } from 'y-protocols/awareness';
import { NetworkEventBus } from "../eventBus/NetworkEventBus.ts";

// Serveur de signalisation pour WebRTC
const SIGNALING_SERVER = `ws://${window.location.hostname}:3001`; // 'wss://musical-multiverse-vr.onrender.com';

/**
 * Composant gérant les connexions WebRTC et l'awareness des pairs.
 * Responsable de:
 * - Établir et maintenir les connexions WebRTC entre les pairs
 * - Gérer l'awareness (présence et état des participants)
 * - Notifier des connexions/déconnexions des joueurs
 */
export class ConnectionManager {
    private doc: Y.Doc;
    private localPlayerId: string;
    private awareness!: Awareness;
    private provider?: WebrtcProvider;
    private networkEventBus: NetworkEventBus;

    // Suivi des pairs et des joueurs
    private peerToPlayerMap = new Map<string, string>();
    private lastKnownPlayerIds = new Map<string, string>();

    // Maintenance de la connexion
    //@ts-ignore
    private keepAliveInterval: NodeJS.Timeout | undefined;
    private readonly KEEP_ALIVE_INTERVAL = 15000; // 15 secondes

    /**
     * @param doc - Document Y.js partagé
     * @param localPlayerId - Identifiant du joueur local
     */
    constructor(doc: Y.Doc, localPlayerId: string) {
        this.doc = doc;
        this.localPlayerId = localPlayerId;
        this.networkEventBus = NetworkEventBus.getInstance();

        console.log(`[ConnectionComponent] Initialized with player ID: ${this.localPlayerId}`);
        this.connect()
    }

    /**
     * Établit une connexion WebRTC avec la salle spécifiée.
     * @param roomName - Nom de la salle à rejoindre
     */
    private connect(): void {

        // Création du provider WebRTC
        this.provider = new WebrtcProvider(SIGNALING_SERVER, this.doc, {
            signaling: [SIGNALING_SERVER]
        });

        // Configuration de l'awareness
        this.setupAwareness();

        console.log(`[ConnectionComponent] Connected to room: ${SIGNALING_SERVER}`);
    }

    /**
     * Configure l'awareness pour détecter les pairs connectés/déconnectés.
     */
    private setupAwareness(): void {
        if (!this.provider) {
            console.error('[ConnectionComponent] Provider not initialized');
            return;
        }

        this.awareness = this.provider.awareness;

        // Définir l'état local du joueur
        this.awareness.setLocalStateField('playerId', this.localPlayerId);
        this.awareness.setLocalStateField('lastActive', Date.now());

        // Écouter les changements d'awareness
        this.awareness.on('change', this.handleAwarenessChange.bind(this));

        // Heartbeat pour maintenir les connexions actives
        this.keepAliveInterval = setInterval(() => {
            this.awareness.setLocalStateField('lastActive', Date.now());
        }, this.KEEP_ALIVE_INTERVAL);
    }

    /**
     * Gère les changements d'awareness (connexions/déconnexions/mises à jour des pairs).
     */
    private handleAwarenessChange({ added, updated, removed }: {
        added: number[],
        updated: number[],
        removed: number[]
    }): void {
        const states = this.awareness.getStates();

        // Traitement des nouvelles connexions
        added.forEach(peerId => {
            const state = states.get(peerId);
            if (state?.playerId) {
                const playerId = state.playerId;
                console.log(`[ConnectionComponent] Peer ${peerId} connected with player ID: ${playerId}`);

                this.peerToPlayerMap.set(String(peerId), playerId);
                this.lastKnownPlayerIds.set(String(peerId), playerId);

                // Notifier de l'ajout d'un joueur
                this.networkEventBus.emit('PLAYER_ADDED', { playerId });
            }
        });

        // Traitement des mises à jour
        updated.forEach(peerId => {
            const state = states.get(peerId);
            const peerIdStr = String(peerId);

            if (state?.playerId && state.playerId !== this.lastKnownPlayerIds.get(peerIdStr)) {
                const oldPlayerId = this.lastKnownPlayerIds.get(peerIdStr);
                const newPlayerId = state.playerId;

                console.log(`[ConnectionComponent] Peer ${peerId} updated player ID: ${oldPlayerId} -> ${newPlayerId}`);

                // Si l'ID a changé, considérer comme une déconnexion suivie d'une connexion
                if (oldPlayerId) {
                    this.networkEventBus.emit('PLAYER_DELETED', { playerId: oldPlayerId });
                }

                this.peerToPlayerMap.set(peerIdStr, newPlayerId);
                this.lastKnownPlayerIds.set(peerIdStr, newPlayerId);

                this.networkEventBus.emit('PLAYER_ADDED', { playerId: newPlayerId });
            }
        });

        removed.forEach(peerId => {
            const peerIdStr = String(peerId);
            const playerId = this.peerToPlayerMap.get(peerIdStr);

            if (playerId) {
                console.log(`[ConnectionComponent] Peer ${peerId} disconnected with player ID: ${playerId}`);

                this.networkEventBus.emit('PLAYER_DELETED', { playerId });

                this.peerToPlayerMap.delete(peerIdStr);
            }
        });
    }

    /**
     * Récupère l'instance Awareness.
     */
    public getAwareness(): Awareness {
        return this.awareness;
    }

    /**
     * Récupère la liste des joueurs connectés.
     */
    public getConnectedPlayers(): string[] {
        return Array.from(this.peerToPlayerMap.values());
    }

}