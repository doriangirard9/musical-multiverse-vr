import * as Y from 'yjs';
import {ConnectionComponent} from "./manager/ConnectionComponent.ts";
import {PlayerManager} from "../app/PlayerManager.ts";
import {PlayerComponent} from "./manager/PlayerComponent.ts";
import {AudioNodeComponent} from "./manager/AudioNode/AudioNodeComponent.ts";


/**
 * Gestionnaire de réseau pour synchroniser les nœuds audio et les joueurs dans un environnement WebXR.
 * Utilise Y.js pour la synchronisation d'état et WebRTC pour la communication P2P.
 */
export class NetworkManager {

    private readonly _doc: Y.Doc;
    private readonly _id: string;

    //@ts-ignore
    private connectionManager: ConnectionComponent;
    //@ts-ignore
    private playerManager: PlayerComponent;
    //@ts-ignore
    private audioNodeManager: AudioNodeComponent;

    private static instance: NetworkManager;


    private constructor() {
        this._doc = new Y.Doc();
        this._id = PlayerManager.getInstance().getId();

        this.connectionManager = new ConnectionComponent(this._doc, this._id);
        this.playerManager = new PlayerComponent(this._doc, this._id);
        this.audioNodeManager = new AudioNodeComponent(this._doc, this._id);

        // Initialisation des composants
        this.audioNodeManager.initialize();
        console.log("Current player id:", this._id);
    }


    public static getInstance() {
        if (!this.instance) {
            this.instance = new NetworkManager();
        }
        return this.instance;
    }

    public updatePlayers(deltaTime: number): void {
        if (this.playerManager) {
            this.playerManager.update(deltaTime);
        }
    }

}