import * as Y from 'yjs';
import {Node3DNetwork} from "./Node3DNetwork.ts";
import { NetworkRoomSystem } from '../app/NetworkRoomSystem.ts';
import { VisualNetwork } from './VisualNetwork.ts';


/**
 * Gestionnaire de réseau pour synchroniser les nœuds audio et les joueurs dans un environnement WebXR.
 * Utilise Y.js pour la synchronisation d'état et WebRTC pour la communication P2P.
 */
export class NetworkManager {
    private static readonly DEBUG_LOG = false;

    readonly doc: Y.Doc
    readonly playerId: string

    readonly roomName: string
    readonly visual
    readonly node3d


    private constructor(readonly rooms: NetworkRoomSystem) {
        this.doc = rooms.doc;
        this.playerId = rooms.playerId;
        this.roomName = rooms.roomName;
        this.node3d = new Node3DNetwork(rooms.room)
        this.visual = new VisualNetwork(this.doc)

        if (NetworkManager.DEBUG_LOG) console.log("Current player id:", this.playerId)
    }

    /** Resolves once the objects already in the document are loaded. */
    public static async initialize(connection: NetworkRoomSystem){
        // Set first: the nodes created while loading may already ask for the instance.
        const instance = this.instance = new NetworkManager(connection);
        await instance.node3d.initialize()
        await instance.visual.initialize()
    }

    private static instance?: NetworkManager

    public static getInstance() {
        if (!this.instance) {
            throw new Error("NetworkManager not initialized. Call init() first.");
        }
        return this.instance;
    }

}
