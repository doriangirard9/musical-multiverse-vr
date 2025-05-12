import * as Y from 'yjs';
import {PlayerState} from "../types.ts";
import {NetworkEventBus} from "../../eventBus/NetworkEventBus.ts";
import {Player} from "../../app/Player.ts";

/**
 * Composant gérant les joueurs et leurs états.
 * Responsable de :
 * - La synchronisation des états des joueurs via Y.js
 * - La gestion des joueurs locaux et distants
 */
export class PlayerComponent {
    private readonly doc: Y.Doc;
    private readonly localPlayerId: string;
    private networkEventBus: NetworkEventBus;

    private networkPlayers: Y.Map<PlayerState>;
    private players = new Map<string, Player>();


    constructor(doc: Y.Doc, localPlayerId: string) {
        this.doc = doc;
        this.localPlayerId = localPlayerId;
        this.networkEventBus = NetworkEventBus.getInstance();

        this.networkPlayers = doc.getMap('players');

        this.setupEventListeners();

        console.log(`[PlayerComponent] Initialized with local player ID: ${localPlayerId}`);
    }

    /**
     * Configure les écouteurs d'événements.
     */
    private setupEventListeners(): void {
        this.networkEventBus.on('PLAYER_ADDED', this.handlePlayerAdded.bind(this));
        this.networkEventBus.on('PLAYER_DELETED', this.handlePlayerDeleted.bind(this));
        this.networkEventBus.on('PLAYER_STATE_UPDATED', this.handlePlayerStateUpdated.bind(this));
        this.networkPlayers.observe(this.handleNetworkPlayersChange.bind(this));
    }

    /**
     * Gère la mise à jour de l'état d'un joueur local.
     */
    private handlePlayerStateUpdated(payload: { playerState: PlayerState }): void {
        if (payload.playerState.id === this.localPlayerId) {
            this.networkPlayers.set(this.localPlayerId, payload.playerState);
        }
    }

    /**
     * Gère l'ajout d'un nouveau joueur.
     */
    private handlePlayerAdded(payload: { playerId: string }): void {
        console.log(`[PlayerComponent] Player added: ${payload.playerId}`);
        if (!this.players.has(payload.playerId) && payload.playerId !== this.localPlayerId) {
            const player = new Player(payload.playerId);
            this.players.set(payload.playerId, player);

            const state = this.networkPlayers.get(payload.playerId);
            if (state) {
                player.setState(state);
            }
        }
    }

    /**
     * Gère la suppression d'un joueur.
     */
    private handlePlayerDeleted(payload: { playerId: string }): void {
        console.log(`[PlayerComponent] Player deleted: ${payload.playerId}`);
        const player = this.players.get(payload.playerId);
        if (player) {
            player.dispose();
            this.players.delete(payload.playerId);

            if (this.networkPlayers.has(payload.playerId)) {
                this.networkPlayers.delete(payload.playerId);
            }
        }
    }

    /**
     * Gère les changements dans la map Y.js des joueurs.
     */
    private handleNetworkPlayersChange(event: Y.YMapEvent<PlayerState>): void {
        event.changes.keys.forEach((change, key) => {
            if (key === this.localPlayerId) return;

            switch (change.action) {
                case "add":
                case "update":
                    const playerState = this.networkPlayers.get(key);
                    if (playerState) {
                        let player = this.players.get(key);

                        if (!player) {
                            player = new Player(key);
                            this.players.set(key, player);
                        }

                        player.setState(playerState);
                    }
                    break;

                case "delete":
                    const playerToDelete = this.players.get(key);
                    if (playerToDelete) {
                        playerToDelete.dispose();
                        this.players.delete(key);
                    }
                    break;
            }
        });
    }

    /**
     * Applique l'interpolation pour les mouvements des joueurs distants
     * @param deltaTime Temps écoulé depuis la dernière frame
     */
    public update(deltaTime: number): void {
        this.players.forEach((player, id) => {
            if (id === this.localPlayerId) return;
            player.interpolateMovement(deltaTime);
        });
    }

}