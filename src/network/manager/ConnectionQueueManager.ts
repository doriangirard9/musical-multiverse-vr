import {NetworkManager} from "../NetworkManager.ts";
import {IOManager} from "../../IOManager.ts";

interface PendingConnection {
    sourceId: string;
    targetId: string;
    isSrcMidi: boolean;
    attempts?: number;
    maxAttempts?: number;
}
export class ConnectionQueueManager {
    private pendingConnections: PendingConnection[] = [];
    private isProcessing: boolean = false;
    private checkInterval: number = 1000;
    private maxAttempts: number = 15;

    constructor(private networkManager: NetworkManager, private ioManager: IOManager) {}


    public addConnection(sourceId: string, targetId: string, isSrcMidi: boolean): void {
        console.log(`[ConnectionQueue] Adding connection request: ${sourceId} -> ${targetId} (MIDI: ${isSrcMidi})`);

        const exists = this.pendingConnections.some(
            conn => conn.sourceId === sourceId && conn.targetId === targetId
        );

        if (!exists) {
            this.pendingConnections.push({
                sourceId,
                targetId,
                isSrcMidi,
                attempts: 0,
                maxAttempts: this.maxAttempts
            });

            console.log('[ConnectionQueue] Connection added to queue. Current queue size:', this.pendingConnections.length);

            if (!this.isProcessing) {
                this.processQueue();
            }
        } else {
            console.log('[ConnectionQueue] Connection request already in queue');
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.pendingConnections.length === 0) {
            return;
        }

        this.isProcessing = true;
        console.log('[ConnectionQueue] Processing queue...');

        try {
            const currentConnections = [...this.pendingConnections];

            for (let i = currentConnections.length - 1; i >= 0; i--) {
                const connection = currentConnections[i];
                const sourceNode = this.networkManager.getAudioNode3D(connection.sourceId);
                const targetNode = this.networkManager.getAudioNode3D(connection.targetId);

                console.log(`[ConnectionQueue] Checking connection ${connection.sourceId} -> ${connection.targetId}`);

                if (sourceNode && targetNode) {
                    try {
                        if (connection.isSrcMidi) {
                            this.ioManager.connectNodesMidi(sourceNode, targetNode);
                        } else {
                            this.ioManager.connectNodes(sourceNode, targetNode);
                        }

                        this.pendingConnections = this.pendingConnections.filter(
                            conn => !(conn.sourceId === connection.sourceId && conn.targetId === connection.targetId)
                        );
                        console.log(`[ConnectionQueue] Successfully connected nodes: ${connection.sourceId} -> ${connection.targetId}`);
                    } catch (error) {
                        console.error('[ConnectionQueue] Error connecting nodes:', error);
                        connection.attempts = (connection.attempts || 0) + 1;
                    }
                } else {
                    connection.attempts = (connection.attempts || 0) + 1;
                    console.log(`[ConnectionQueue] Connection attempt ${connection.attempts}/${this.maxAttempts}`);

                    if (connection.attempts >= this.maxAttempts) {
                        this.pendingConnections = this.pendingConnections.filter(
                            conn => !(conn.sourceId === connection.sourceId && conn.targetId === connection.targetId)
                        );
                        console.warn(`[ConnectionQueue] Failed to connect nodes after ${connection.attempts} attempts`);
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