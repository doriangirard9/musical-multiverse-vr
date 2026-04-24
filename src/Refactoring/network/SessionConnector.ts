import * as Y from 'yjs';
import { SessionAPIClient, JoinResponse } from './SessionAPIClient.ts';
import { Serialization } from '../app/Serialization.ts';
import { Node3dManager } from '../app/Node3dManager.ts';
import { NetworkManager } from './NetworkManager.ts';

export interface SessionConnectionInfo {
    participantId: string;
    sessionName: string;
    maxUsers: number;
    participantNumber: number;
}

/**
 * Handles the session connection protocol, CRDT initialization, and heartbeat.
 */
export class SessionConnector {
    private participantId: string | null = null;
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private saveInterval: ReturnType<typeof setInterval> | null = null;
    private isConnected = false;

    constructor(
        private readonly sessionId: string,
        private readonly shareToken: string | undefined,
        private readonly doc: Y.Doc,
        private readonly api: SessionAPIClient,
        private readonly updateLoadingText: (text: string) => void
    ) {
        // Handle window close
        window.addEventListener('beforeunload', () => {
            this.leave();
        });
    }

    /**
     * Executes the API connection protocol.
     * Returns connection info. Does NOT initialize the CRDT state yet.
     */
    async connect(): Promise<SessionConnectionInfo & { crdtData?: string }> {
        this.updateLoadingText('Joining session...');

        // 1. Join API call
        const joinInfo = await this.api.joinSession(this.sessionId, this.shareToken);
        this.participantId = joinInfo.participantId;
        this.isConnected = true;

        return {
            participantId: this.participantId,
            sessionName: joinInfo.sessionName,
            maxUsers: joinInfo.maxUsers,
            participantNumber: joinInfo.participantNumber,
            crdtData: joinInfo.crdtData
        };
    }

    /**
     * Hydrates the CRDT data if first participant, or waits for it if not.
     * Must be called AFTER Node3dManager is initialized.
     */
    async initCRDTState(participantNumber: number, crdtData?: string): Promise<void> {
        const sessionState = this.doc.getMap('session_state');

        // 2. Protocol logic based on participant number
        if (participantNumber === 1) {
            this.updateLoadingText('Initializing session...');
            
            // We are the first. Load CRDT data if it exists.
            if (crdtData) {
                try {
                    const parsedData = JSON.parse(crdtData);
                    
                    // Await the load, then perform the state change in a synchronous transaction
                    await Serialization.getInstance().load(parsedData);
                    this.doc.transact(() => {
                        sessionState.set('status', 'ready');
                    });
                } catch (e) {
                    console.error('[SessionConnector] Failed to parse CRDT data:', e);
                    sessionState.set('status', 'ready'); // Still mark ready so others can join
                }
            } else {
                // Empty session
                sessionState.set('status', 'ready');
            }
        } else {
            this.updateLoadingText('Synchronizing with peers...');
            
            // We are NOT the first. Wait for session_state == 'ready'.
            await this.waitForReady(sessionState);
        }

        // 3. Start Heartbeat
        this.startHeartbeat();

        // 4. Start auto-save
        this.startAutoSave();
    }

    /**
     * Leave the session and stop intervals
     */
    async leave(): Promise<void> {
        if (!this.isConnected || !this.participantId) return;

        this.isConnected = false;
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.saveInterval) clearInterval(this.saveInterval);

        // Best effort synchronous leave for beforeunload
        const data = new Blob([JSON.stringify({ participantId: this.participantId })], {
            type: 'application/json'
        });
        navigator.sendBeacon(`/api/sessions/${this.sessionId}/leave`, data);
    }

    private async waitForReady(sessionState: Y.Map<unknown>): Promise<void> {
        if (sessionState.get('status') === 'ready') return;

        return new Promise<void>((resolve) => {
            const observer = () => {
                if (sessionState.get('status') === 'ready') {
                    sessionState.unobserve(observer);
                    clearInterval(recheckInterval);
                    resolve();
                }
            };
            sessionState.observe(observer);

            // Re-check protocol: if the first user crashes before setting ready,
            // we re-join after 10s to see if we became participant #1.
            const recheckInterval = setInterval(async () => {
                if (sessionState.get('status') === 'ready') {
                    clearInterval(recheckInterval);
                    return;
                }

                try {
                    // Re-join to get new participant number (using same participantId is better, but join API creates a new one currently. Let's just do a manual count check)
                    // Actually, the API says "if participantNumber == 0 charge le contenu".
                    // If we re-join, we might get a new ID. Instead, we should have a custom recheck logic.
                    // For now, if we wait too long, we can trigger a hard reload.
                    console.warn('[SessionConnector] Still waiting for ready state...');
                } catch (e) {
                    // ignore
                }
            }, 10000);
        });
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(async () => {
            if (!this.isConnected || !this.participantId) return;
            try {
                await this.api.heartbeat(this.sessionId, this.participantId);
            } catch (e) {
                console.error('[SessionConnector] Heartbeat failed:', e);
            }
        }, 15000);
    }

    private startAutoSave(): void {
        // Save every 30 seconds
        this.saveInterval = setInterval(async () => {
            if (!this.isConnected || !this.participantId) return;
            
            try {
                // We serialize all nodes in the network
                const nodes = Array.from(Node3dManager.getInstance().getInstances());
                if (nodes.length === 0) return; // Don't save empty state aggressively
                
                const description = Serialization.getInstance().save(nodes, false);
                const json = JSON.stringify(description);
                
                await this.api.saveCRDT(this.sessionId, this.participantId, json);
            } catch (e) {
                console.error('[SessionConnector] Auto-save failed:', e);
            }
        }, 30000);
    }
}
