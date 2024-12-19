import {NetworkManager} from "./NetworkManager.ts";
import {IOManager} from "../IOManager.ts";

interface PendingConnection {
    sourceId: string;
    targetId: string;
    attempts?: number;
    maxAttempts?: number;
}

export class ConnectionQueueManager {
    private pendingConnections: PendingConnection[] = [];
    private isProcessing: boolean = false;
    private checkInterval: number = 500; // Check every 500ms
    private maxAttempts: number = 10; // Maximum number of attempts per connection

    constructor(private networkManager: NetworkManager, private ioManager: IOManager) {}

    public addConnection(sourceId: string, targetId: string): void {
        // Add to queue if not already present
        const exists = this.pendingConnections.some(
            conn => conn.sourceId === sourceId && conn.targetId === targetId
        );

        if (!exists) {
            this.pendingConnections.push({
                sourceId,
                targetId,
                attempts: 0,
                maxAttempts: this.maxAttempts
            });

            if (!this.isProcessing) {
                this.processQueue();
            }
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.pendingConnections.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            const currentConnections = [...this.pendingConnections];

            for (let i = currentConnections.length - 1; i >= 0; i--) {
                const connection = currentConnections[i];
                const sourceNode = this.networkManager.getAudioNode3D(connection.sourceId);
                const targetNode = this.networkManager.getAudioNode3D(connection.targetId);

                if (sourceNode && targetNode) {
                    // Both nodes are available, make the connection
                    await this.ioManager.connectNodes(sourceNode, targetNode);
                    // Remove from pending queue
                    this.pendingConnections = this.pendingConnections.filter(
                        conn => !(conn.sourceId === connection.sourceId && conn.targetId === connection.targetId)
                    );
                    console.log(`[ConnectionQueue] Successfully connected nodes: ${connection.sourceId} -> ${connection.targetId}`);
                } else {
                    // Increment attempt counter
                    connection.attempts = (connection.attempts || 0) + 1;

                    // Remove if max attempts reached
                    if (connection.attempts >= (connection.maxAttempts || this.maxAttempts)) {
                        this.pendingConnections = this.pendingConnections.filter(
                            conn => !(conn.sourceId === connection.sourceId && conn.targetId === connection.targetId)
                        );
                        console.warn(`[ConnectionQueue] Failed to connect nodes after ${connection.attempts} attempts: ${connection.sourceId} -> ${connection.targetId}`);
                    }
                }
            }
        } finally {
            this.isProcessing = false;
            if (this.pendingConnections.length > 0) {
                setTimeout(() => this.processQueue(), this.checkInterval);
            }
        }
    }

    public clearQueue(): void {
        this.pendingConnections = [];
        this.isProcessing = false;
    }
}