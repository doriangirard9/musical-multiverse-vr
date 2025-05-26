import { IOEventBus, IOEventPayload } from "../eventBus/IOEventBus.ts";
import { N3DConnectableInstance } from "../node3d/instance/N3DConnectableInstance.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils.ts";
import { N3DConnectionInstance } from "../node3d/instance/N3DConnectionInstance.ts";
import { SceneManager } from "../app/SceneManager.ts";
import { UIManager } from "../app/UIManager.ts";

export class ConnectionManager {
    private currentPort: N3DConnectableInstance|null = null;

    private ioEventBus: IOEventBus = IOEventBus.getInstance()
    private network = NetworkManager.getInstance().node3d
    private scene = SceneManager.getInstance().getScene()
    private ui = UIManager.getInstance()

    private constructor() {
        console.log("[IOManager] POMME IOManager initialized");
        this.onIOEvent();
    }

    
    private static instance: ConnectionManager

    public static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }


    private onIOEvent(): void {
        this.ioEventBus.on('IO_CONNECT', payload => this.commonHandler(payload))
    }


    /**
     * Réinitialise l'état de la connexion en cours et annule l'aperçu.
     */
    private _cancelAndResetConnection(): void {
        this.currentPort = null
    }

    private commonHandler(data: IOEventPayload['IO_CONNECT']) {
        const {pickType} = data

        console.log(`[IOManager] Pick type: ${pickType} | ${data}`)
        switch (pickType) {
            case "down":
                this.currentPort = data.connectable
                //this.connectionManager.startConnectionPreview(this.currentPort.nodeid, this.currentPort.meshes[0], this.currentPort.id)
                break

            case "up":
                if(this.currentPort){
                    this.connect(this.currentPort, data.connectable)
                }
                this._cancelAndResetConnection()
                break;

            case "out":
                this._cancelAndResetConnection();
                break;
        }
    }

    public connect(nodeA: N3DConnectableInstance, nodeB: N3DConnectableInstance, id?: string): void {
        const newid = id ?? RandomUtils.randomID()
        const connection = new N3DConnectionInstance( this.scene, this.network.nodes, this.network.connections, this.ui)
        connection.set(nodeA, nodeB)
        if(!connection.isConnecting)connection.dispose()
        this.network.connections.add(newid, connection)
    }
}