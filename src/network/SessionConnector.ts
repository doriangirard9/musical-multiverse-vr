import * as Y from 'yjs';
import { SessionAPIClient } from './SessionAPIClient.ts';
import { Serialization } from '../app/Serialization.ts';
import { Node3DInstance } from '../node3d/instance/Node3DInstance.ts';
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
    private sessionLocked = false;

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
    async connect(): Promise<SessionConnectionInfo & { crdtData?: string; sessionLocked?: boolean }> {
        // 1. Join API call
        const joinInfo = await this.api.joinSession(this.sessionId, this.shareToken);
        this.participantId = joinInfo.participantId;
        this.isConnected = true;
        this.sessionLocked = joinInfo.sessionLocked || false;

        return {
            participantId: this.participantId,
            sessionName: joinInfo.sessionName,
            maxUsers: joinInfo.maxUsers,
            participantNumber: joinInfo.participantNumber,
            crdtData: joinInfo.crdtData,
            sessionLocked: this.sessionLocked
        };
    }

    /**
     * Hydrates the CRDT data if first participant, or waits for it if not.
     * Must be called AFTER Node3dManager is initialized.
     */
    async initCRDTState(participantNumber: number, crdtData?: string): Promise<void> {
        const sessionState = this.doc.getMap('session_state');

        console.log(`[SessionConnector] initCRDTState called. Participant #${participantNumber}. Data size: ${crdtData ? crdtData.length : 0} bytes`);

        // 2. Protocol logic based on participant number
        if (participantNumber === 1) {
            this.updateLoadingText('Initializing session...');
            console.log('[SessionConnector] We are participant #1 (Leader). Hydrating state...');
            
            // We are the first. Load CRDT data if it exists.
            if (crdtData) {
                try {
                    const parsedData = JSON.parse(crdtData);
                    console.log(`[SessionConnector] CRDT data parsed successfully. Nodes: ${parsedData.nodes?.length || 0}, Connections: ${parsedData.connections?.length || 0}`);
                    
                    // Await the load, then perform the state change in a synchronous transaction
                    await Serialization.getInstance().load(parsedData);
                    console.log('[SessionConnector] Serialization.load() completed successfully.');
                    
                    this.doc.transact(() => {
                        sessionState.set('status', 'ready');
                    });
                    console.log('[SessionConnector] session_state status set to "ready".');
                    this.showXRButton();
                } catch (e) {
                    console.error('[SessionConnector] Failed to parse/load CRDT data:', e);
                    sessionState.set('status', 'ready'); // Still mark ready so others can join
                    this.showXRButton();
                }
            } else {
                // Empty session
                sessionState.set('status', 'ready');
                this.showXRButton();
            }
        } else {
            console.log(`[SessionConnector] We are participant #${participantNumber}. Waiting for leader to set ready state...`);
            this.updateLoadingText('Please wait, synchronizing with peers...');
            
            // We are NOT the first. Wait for session_state == 'ready'.
            await this.waitForReady(sessionState);
            console.log('[SessionConnector] Ready state confirmed! Proceeding with synchronization.');
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
        // Skip auto-save for public-sandbox (state is not persisted to DB)
        if (this.sessionId === 'public-sandbox') {
            console.log('[SessionConnector] Skipping auto-save for public-sandbox session');
            return;
        }

        // Skip auto-save for locked sessions
        if (this.sessionLocked) {
            console.log('[SessionConnector] Skipping auto-save for locked session');
            return;
        }

        // Save every 30 seconds
        this.saveInterval = setInterval(async () => {
            if (!this.isConnected || !this.participantId) return;
            
            try {
                // Get all node instances from the network sync manager
                const network = NetworkManager.getInstance();
                const nodes: Node3DInstance[] = [];
                for (const [, instance] of network.node3d.nodes.entries()) {
                    nodes.push(instance);
                }
                
                if (nodes.length === 0) return; // Don't save empty state aggressively
                
                const description = Serialization.getInstance().save(nodes, false);
                const json = JSON.stringify(description);
                
                console.log(`[SessionConnector] Auto-saving ${nodes.length} nodes...`);
                await this.api.saveCRDT(this.sessionId, this.participantId, json);
                console.log('[SessionConnector] Auto-save successful.');
            } catch (e) {
                console.error('[SessionConnector] Auto-save failed:', e);
            }
        }, 10000);
    }

    /**
     * Show the XR button overlay when session is ready.
     */
    private showXRButton(): void {
        const xrButton = document.querySelector('.xr-button-overlay') as HTMLElement;
        if (xrButton) {
            xrButton.classList.add('ready');
        }
    }
}
