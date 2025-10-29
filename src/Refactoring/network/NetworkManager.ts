import * as Y from 'yjs';
import {PlayerManager} from "../app/PlayerManager.ts";
import {PlayerNetwork} from "./PlayerNetwork.ts";
import {Node3DNetwork} from "./Node3DNetwork.ts";
import { ConnectionManager } from './ConnectionManager.ts';
import { VisualNetwork } from './VisualNetwork.ts';


/**
 * Gestionnaire de réseau pour synchroniser les nœuds audio et les joueurs dans un environnement WebXR.
 * Utilise Y.js pour la synchronisation d'état et WebRTC pour la communication P2P.
 */
export class NetworkManager {

    readonly doc: Y.Doc
    private readonly playerId: string

    readonly connection
    readonly visual
    readonly player
    readonly node3d


    private constructor() {
        this.doc = new Y.Doc()
        
        this.playerId = PlayerManager.getInstance().getId()
        
        this.connection = new ConnectionManager(this.doc,this.playerId)
        this.player = new PlayerNetwork(this.doc, this.playerId)
        this.node3d = new Node3DNetwork(this.doc)
        this.visual = new VisualNetwork(this.doc)

        console.log("Current player id:", this.playerId)
    }

    public static initialize(){
        this.instance = new NetworkManager();
    }

    private static instance?: NetworkManager

    public static getInstance() {
        if (!this.instance) {
            throw new Error("NetworkManager not initialized. Call init() first.");
        }
        return this.instance;
    }

    public updatePlayers(deltaTime: number): void {
        if (this.player) {
            this.player.update(deltaTime);
        }
    }

}