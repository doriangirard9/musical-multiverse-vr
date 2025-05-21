import {AudioNodeComponent} from "./AudioNodeComponent.ts";
import * as Y from "yjs";
import {PortParam} from "../../../shared/SharedTypes.ts";
import {NetworkEventBus, NetworkEventPayload} from "../../../eventBus/NetworkEventBus.ts";
import {IOEventBus} from "../../../eventBus/IOEventBus.ts";

export class TubeComponent {
    private readonly parent: AudioNodeComponent;
    private readonly networkConnections: Y.Map<PortParam>;
    private networkEventBus: NetworkEventBus = NetworkEventBus.getInstance();
    private ioEventBus: IOEventBus = IOEventBus.getInstance();

    constructor(parent: AudioNodeComponent) {
        this.parent = parent;
        this.networkConnections = parent.getNetworkConnections();
    }

    public initialize(): void {
        this.setupEventListeners();
        this.setupNetworkObservers();
        console.log(`[TubeComponent] Initialized`);
    }

    private setupEventListeners(): void {
        // Écouter les demandes de stockage de connexions
        this.networkEventBus.on('STORE_CONNECTION_TUBE', (payload: NetworkEventPayload['STORE_CONNECTION_TUBE']) => {
            if (!this.parent.isProcessingLocalEvent) {
                this.parent.withLocalProcessing(() => this.storeConnection(payload));
            }
        });
    }

    private setupNetworkObservers(): void {
        // Observer les changements dans la map Y.js
        this.networkConnections.observe((event) => {
            if (!this.parent.isProcessingLocalEvent) {
                console.log("[TubeComponent] Network connection change detected");
                this.parent.withNetworkProcessing(() => this.handleConnectionUpdates(event));
            }
        });
    }

    private storeConnection(payload: NetworkEventPayload['STORE_CONNECTION_TUBE']): void {
        // Vérifier si la connexion existe déjà avant de la stocker
        if (!this.isConnectionAlreadyStored(payload.portParam)) {
            console.log('[TubeComponent] Storing connection:', payload.connectionId);
            this.networkConnections.set(payload.connectionId, payload.portParam);
        } else {
            console.log('[TubeComponent] Connection already exists:', payload.connectionId);
        }
    }

    private handleConnectionUpdates(event: Y.YMapEvent<PortParam>): void {
        // Notifier IOManager des changements depuis le réseau
        event.changes.keys.forEach((change, key) => {
            if (change.action === "add") {
                const portParam = this.networkConnections.get(key);
                if (portParam) {
                    console.log('[TubeComponent] New connection from network:', key);
                    this.ioEventBus.emit('NETWORK_CONNECTION_ADDED', {
                        connectionId: key,
                        portParam: portParam
                    });
                }
            } else if (change.action === "delete") {
                console.log('[TubeComponent] Connection removed from network:', key);
                this.ioEventBus.emit('NETWORK_CONNECTION_REMOVED', {
                    connectionId: key
                });
            }
        });
    }

    private isConnectionAlreadyStored(portParam: PortParam): boolean {
        // Vérifier si une connexion similaire existe déjà
        const connectionPrefix = `${portParam.sourceId}-${portParam.targetId}-${portParam.portId}`;

        for (const [key, _] of this.networkConnections.entries()) {
            if (key.startsWith(connectionPrefix)) {
                return true;
            }
        }
        return false;
    }
}