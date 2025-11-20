import { IOEventBus, IOEventPayload } from "../eventBus/IOEventBus.ts";
import { N3DConnectableInstance } from "../node3d/instance/N3DConnectableInstance.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils.ts";
import { N3DConnectionInstance } from "../node3d/instance/N3DConnectionInstance.ts";
import { SceneManager } from "../app/SceneManager.ts";
import { UIManager } from "../app/UIManager.ts";
import { VisualTube } from "../visual/VisualTube.ts";
import { InputManager } from "../xr/inputs/InputManager.ts";

export class ConnectionManager {
    private static readonly DEBUG_LOG = false;
    private currentPort: N3DConnectableInstance|null = null;

    private ioEventBus: IOEventBus = IOEventBus.getInstance()
    private network = NetworkManager.getInstance().node3d
    private scene = SceneManager.getInstance().getScene()
    private ui = UIManager.getInstance()
    private disposePreview: (() => void) | null = null;

    private constructor() {
        if (ConnectionManager.DEBUG_LOG) console.log("[IOManager] POMME IOManager initialized");
        this.onIOEvent();
    }

    
    private static instance: ConnectionManager

    public static initialize(): void {
        this.instance = new ConnectionManager()
    }

    public static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) throw new Error("ConnectionManager not initialized. Call initialize() first.")
        return ConnectionManager.instance;
    }


    private onIOEvent(): void {
        this.ioEventBus.on('IO_CONNECT', payload => this.connectHandler(payload))
    }


    /**
     * Réinitialise l'état de la connexion en cours et annule l'aperçu.
     */
    private _cancelAndResetConnection(): void {
        this.disposePreview?.()
        this.disposePreview = null
        this.currentPort = null
    }

    private connectHandler(data: IOEventPayload['IO_CONNECT']) {
        const {pickType} = data

        if (ConnectionManager.DEBUG_LOG) console.log(`[IOManager] Pick type: ${pickType} | ${data}`)
        switch (pickType) {
            case "down":
                this.currentPort = data.connectable
                
                // Preview
                const tube = new VisualTube(this.scene, NetworkManager.getInstance().visual.tubes)
                tube.setColor(this.currentPort!!.config.color.toColor4(1))
                NetworkManager.getInstance().visual.tubes.add(RandomUtils.randomID(), tube)
                const o = InputManager.getInstance().pointer_move.add((event)=>{
                    const pos = event.target
                    tube.move(this.currentPort!!.config.meshes[0].absolutePosition, pos)
                })
                this.disposePreview = () => {
                    InputManager.getInstance().pointer_move.remove(o)
                    tube.dispose()
                }
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