import * as Y from 'yjs';
import {Node3DNetwork} from "./Node3DNetwork.ts";
import { PeerToPeerManager } from './PeerToPeerManager.ts';
import { VisualNetwork } from './VisualNetwork.ts';


/**
 * Gestionnaire de réseau pour synchroniser les nœuds audio et les joueurs dans un environnement WebXR.
 * Utilise Y.js pour la synchronisation d'état et WebRTC pour la communication P2P.
 */
export class NetworkManager {
    private static readonly DEBUG_LOG = false;

    readonly doc: Y.Doc
    private readonly playerId: string

    readonly connection
    readonly visual
    readonly node3d


    private constructor(playerId: string, roomName: string, doc: Y.Doc) {
        this.doc = doc;
        this.playerId = playerId;
        this.connection = new PeerToPeerManager(this.doc, this.playerId, roomName)
        this.node3d = new Node3DNetwork(this.doc)
        this.visual = new VisualNetwork(this.doc)

        if (NetworkManager.DEBUG_LOG) console.log("Current player id:", this.playerId)
    }

    public static initialize(playerId: string, roomName: string, doc: Y.Doc){
        this.instance = new NetworkManager(playerId, roomName, doc);
    }

    private static instance?: NetworkManager

    public static getInstance() {
        if (!this.instance) {
            throw new Error("NetworkManager not initialized. Call init() first.");
        }
        return this.instance;
    }

}