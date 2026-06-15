import { IOEventBus, IOEventPayload } from "../eventBus/IOEventBus.ts";
import { N3DConnectableInstance } from "../node3d/instance/N3DConnectableInstance.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils.ts";
import { N3DConnectionInstance } from "../node3d/instance/N3DConnectionInstance.ts";
import { SceneManager } from "./SceneManager.ts";
import { VisualTube } from "../visual/VisualTube.ts";
import { MenuSystem } from "./MenuSystem.ts";
import { AbstractPointerInput } from "../xr/inputs/AbstractPointerInput.ts";

/**
 * Manager responsible of connecting two connectable nodes together.
 * It listen to IO events, show a preview of the connection while the user is selecting the target,
 * and create the connection on the network when the user release the pointer.
 */
export class ConnectionManager {
    private static readonly DEBUG_LOG = false;
    private currentPort: N3DConnectableInstance|null = null;

    private ioEventBus: IOEventBus = IOEventBus.getInstance()
    private network = NetworkManager.getInstance().node3d
    private scene = SceneManager.getInstance().getScene()
    private menus = MenuSystem.getInstance()
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
        AbstractPointerInput.PickPredicate = null
    }

    private connectHandler(data: IOEventPayload['IO_CONNECT']) {
        const {pickType,pointer} = data

        if (ConnectionManager.DEBUG_LOG) console.log(`[IOManager] Pick type: ${pickType} | ${data}`)
        switch (pickType) {
            case "down":
                this.currentPort = data.connectable
                
                // Restrict picking to connection ports only during drag
                AbstractPointerInput.PickPredicate = (mesh) => !!mesh.metadata?.isConnectablePort

                // Preview
                const tube = new VisualTube(this.scene, NetworkManager.getInstance().visual.tubes, (mesh)=>{
                    mesh.isPickable = false
                })
                tube.setColor(this.currentPort!!.config.color.toColor4(1))
                NetworkManager.getInstance().visual.tubes.add(RandomUtils.randomID(), tube)
                const o = pointer.onMove.add((event)=>{
                    const pos = event.hit ? event.target : event.origin.add(event.forward)
                    tube.move(this.currentPort!!.config.meshes[0].absolutePosition, pos)
                })
                this.disposePreview = () => {
                    pointer.onMove.remove(o)
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
        const connection = new N3DConnectionInstance( this.scene, this.network.nodes, this.network.connections, this.menus)
        connection.set(nodeA, nodeB)
        if(!connection.isConnecting) {
            connection.dispose()
            return
        }
        this.network.connections.add(newid, connection)
    }
}