import {IOEventBus, IOEventPayload} from "../../eventBus/IOEventBus.ts";
import { PortParam } from "../../shared/SharedTypes.ts";
import {AudioNodeComponent} from "./AudioNode/AudioNodeComponent.ts";

interface PendingConnection {
    connectionId: string;
    portParam: PortParam;
    attempts: number;
    maxAttempts: number;
}

/**
 * Gère une file d'attente de connexions entre des nœuds audio
 * qui ne sont pas encore disponibles, et tente de les connecter
 * périodiquement jusqu'à ce que les deux nœuds soient disponibles.
 */
export class ConnectionQueueManager {
    private pendingConnections: PendingConnection[] = [];
    private isProcessing: boolean = false;
    private checkInterval: number = 1000;
    private maxAttempts: number = 15;
    private intervalId: number | null = null;
    private ioEventBus = IOEventBus.getInstance();

    constructor(private parent: AudioNodeComponent) {
        console.log("[ConnectionQueueManager] Created");
    }

    public initialize(): void {
        this.ioEventBus.on('NETWORK_CONNECTION_ADDED', this.handleNetworkConnectionAdded.bind(this));
        this.intervalId = setInterval(() => this.processQueue(), this.checkInterval) as unknown as number;

        console.log(`[ConnectionQueueManager] Initialized with interval: ${this.checkInterval}ms`);
    }

    /**
     * Gère les événements de connexion réseau,
     * en mettant en file d'attente ceux dont les nœuds ne sont pas encore disponibles
     */
    private handleNetworkConnectionAdded(payload: IOEventPayload['NETWORK_CONNECTION_ADDED']): void {
        const {connectionId, portParam} = payload;

        const sourceNode = this.parent.getNodeById(portParam.sourceId);
        const targetNode = this.parent.getNodeById(portParam.targetId);

        // Si les deux nœuds existent, pas besoin de mettre en file d'attente
        if (sourceNode && targetNode) {
            return;
        }

        this.addConnection(connectionId, portParam);
    }

    /**
     * Ajoute une connexion à la file d'attente
     */
    public addConnection(connectionId: string, portParam: PortParam): void {
        console.log(`[ConnectionQueueManager] Adding connection request: ${connectionId} (${portParam.sourceId} -> ${portParam.targetId})`);

        const exists = this.pendingConnections.some(
            conn => conn.connectionId === connectionId
        );

        if (!exists) {
            this.pendingConnections.push({
                connectionId,
                portParam,
                attempts: 0,
                maxAttempts: this.maxAttempts
            });

            console.log('[ConnectionQueueManager] Connection added to queue. Current queue size:', this.pendingConnections.length);

            if (!this.isProcessing) {
                this.processQueue();
            }
        } else {
            console.log('[ConnectionQueueManager] Connection request already in queue');
        }
    }

    /**
     * Traite la file d'attente des connexions en attente
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.pendingConnections.length === 0) {
            return;
        }

        this.isProcessing = true;
        console.log('[ConnectionQueueManager] Processing queue...');

        try {
            const currentConnections = [...this.pendingConnections];

            for (let i = currentConnections.length - 1; i >= 0; i--) {
                const connection = currentConnections[i];
                const sourceNode = this.parent.getNodeById(connection.portParam.sourceId);
                const targetNode = this.parent.getNodeById(connection.portParam.targetId);

                console.log(`[ConnectionQueueManager] Checking connection ${connection.portParam.sourceId} -> ${connection.portParam.targetId}`);

                if (sourceNode && targetNode) {
                    try {
                        this.ioEventBus.emit('NETWORK_CONNECTION_ADDED', {
                            connectionId: connection.connectionId,
                            portParam: connection.portParam
                        });

                        this.pendingConnections = this.pendingConnections.filter(
                            conn => conn.connectionId !== connection.connectionId
                        );
                        console.log(`[ConnectionQueueManager] Successfully connected nodes: ${connection.portParam.sourceId} -> ${connection.portParam.targetId}`);
                    } catch (error) {
                        console.error('[ConnectionQueueManager] Error connecting nodes:', error);
                        connection.attempts++;
                    }
                } else {
                    connection.attempts++;
                    console.log(`[ConnectionQueueManager] Connection attempt ${connection.attempts}/${connection.maxAttempts}`);
                }

                if (connection.attempts >= connection.maxAttempts) {
                    this.pendingConnections = this.pendingConnections.filter(
                        conn => conn.connectionId !== connection.connectionId
                    );
                    console.warn(`[ConnectionQueueManager] Failed to connect nodes after ${connection.attempts} attempts: ${connection.portParam.sourceId} -> ${connection.portParam.targetId}`);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Vide la file d'attente
     */
    public clearQueue(): void {
        this.pendingConnections = [];
        this.isProcessing = false;
        console.log('[ConnectionQueueManager] Queue cleared');
    }

    /**
     * Libère les ressources
     */
    public dispose(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.clearQueue();
        console.log('[ConnectionQueueManager] Disposed');
    }
}