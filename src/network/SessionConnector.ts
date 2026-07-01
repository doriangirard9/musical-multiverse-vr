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
    private hasPendingSave = false;
    private lastSavedSnapshot: string | null = null;
    /** Session temporaire (éphémère) → aucune sauvegarde, état jamais persisté. */
    private isTemporary = false;
    private readonly handleDocUpdate = () => {
        this.hasPendingSave = true;
    };

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
        this.isTemporary = !!joinInfo.isTemporary;
        if (this.isTemporary) console.log('[SessionConnector] TEMPORARY session — no saving, state not persisted.');

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
        const startedAt = performance.now()
        const stamp = (label: string) => `${label} (${((performance.now() - startedAt) / 1000).toFixed(1)}s)`

        console.log(`[SessionConnector] initCRDTState called. Participant #${participantNumber}. Data size: ${crdtData ? crdtData.length : 0} bytes`);

        // 2. Protocol logic based on participant number
        if (participantNumber === 1) {
            this.updateLoadingText(stamp('Initializing session state...'));
            console.log('[SessionConnector] We are participant #1 (Leader). Hydrating state...');
            
            // We are the first. Load CRDT data if it exists.
            // Suppress node3d add_from_network while loading from DB to prevent
            // stale Y.js entries (from BroadcastChannel/WebRTC) creating duplicates.
            // Only node3d.nodes and connections are suppressed — avatars/tubes/curves stay active.
            if (crdtData) {
                try {
                    const parsedData = JSON.parse(crdtData);
                    console.log(`[SessionConnector] CRDT data parsed successfully. Nodes: ${parsedData.nodes?.length || 0}, Connections: ${parsedData.connections?.length || 0}`);
                    this.updateLoadingText(stamp(`Restoring ${parsedData.nodes?.length || 0} nodes and ${parsedData.connections?.length || 0} connections...`));
                    
                    // Suppress ONLY node3d sync during DB load
                    const network = NetworkManager.getInstance();
                    network.node3d.nodes.suppressNetworkAdds();
                    network.node3d.connections.suppressNetworkAdds();
                    
                    // Await the load, then perform the state change in a synchronous transaction
                    await Serialization.getInstance().load(parsedData);
                    console.log('[SessionConnector] Serialization.load() completed successfully.');
                    
                    // Re-enable network adds now that our state is authoritative
                    network.node3d.nodes.allowNetworkAdds();
                    network.node3d.connections.allowNetworkAdds();
                    
                    this.doc.transact(() => {
                        sessionState.set('status', 'ready');
                    });
                    console.log('[SessionConnector] session_state status set to "ready".');
                    this.showXRButton();
                } catch (e) {
                    console.error('[SessionConnector] Failed to parse/load CRDT data:', e);
                    const network = NetworkManager.getInstance();
                    network.node3d.nodes.allowNetworkAdds();
                    network.node3d.connections.allowNetworkAdds();
                    sessionState.set('status', 'ready'); // Still mark ready so others can join
                    this.showXRButton();
                }
            } else {
                // Empty session — mark ready
                sessionState.set('status', 'ready');
                this.showXRButton();
            }
        } else {
            console.log(`[SessionConnector] We are participant #${participantNumber}. Waiting for leader to set ready state...`);
            this.updateLoadingText(stamp('Waiting for host synchronization...'));
            
            // We are NOT the first. Wait for session_state == 'ready' with failover.
            const rejoinNeeded = await this.waitForReadyWithFailover(sessionState, crdtData === undefined);
            
            if (rejoinNeeded) {
                console.log('[SessionConnector] Leader was dead and no data received. Re-joining as potential new leader...');
                // Leave first to clean up the old participant record from the database
                await this.leave();
                console.log('[SessionConnector] Left old session. Now re-joining...');
                // Re-join to get a new participant number
                const newJoinInfo = await this.api.joinSession(this.sessionId, this.shareToken);
                console.log(`[SessionConnector] Re-joined. New participant #${newJoinInfo.participantNumber}`);
                
                // Update our participant ID with the new one
                this.participantId = newJoinInfo.participantId;
                
                // If we became participant #1 this time, load the CRDT data
                if (newJoinInfo.participantNumber === 1 && newJoinInfo.crdtData) {
                    console.log('[SessionConnector] Re-enrollment successful! Now participant #1. Loading CRDT data...');
                    await this.initCRDTState(1, newJoinInfo.crdtData);
                    return;
                } else {
                    // We didn't become #1, so wait again for the new leader
                    await this.waitForReadyWithFailover(sessionState, true);
                }
            } else {
                console.log('[SessionConnector] Ready state confirmed! Proceeding with synchronization.');
            }
            
            // Process any node3d Y.js entries that arrived during waitForReady
            // (add_from_network fires normally since default is not suppressed,
            //  but processExisting catches any edge cases)
            const network = NetworkManager.getInstance();
            await network.node3d.nodes.processExistingEntries();
            await network.node3d.connections.processExistingEntries();
            
            this.showXRButton();
        }

        // 3. Start Heartbeat
        this.startHeartbeat();

        // 4. Start auto-save — SAUF si la session est temporaire (jamais persistée).
        if (!this.isTemporary) {
            this.startAutoSave();
        }
    }

    /**
     * Leave the session and stop intervals
     */
    async leave(): Promise<void> {
        if (!this.isConnected || !this.participantId) return;

        this.isConnected = false;
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.saveInterval) clearInterval(this.saveInterval);
        this.doc.off('update', this.handleDocUpdate);

        // Best effort synchronous leave for beforeunload
        const data = new Blob([JSON.stringify({ participantId: this.participantId })], {
            type: 'application/json'
        });
        navigator.sendBeacon(`/api/sessions/${this.sessionId}/leave`, data);
    }

    private async waitForReadyWithFailover(sessionState: any, noDataReceived: boolean): Promise<boolean> {
        if (sessionState.get('status') === 'ready') return false; // Already ready, no failover needed

        return new Promise<boolean>((resolve) => {
            let failoverTriggered = false;
            const startedAt = performance.now()

            const observer = () => {
                if (sessionState.get('status') === 'ready') {
                    sessionState.unobserve(observer);
                    clearInterval(leaderCheckInterval);
                    resolve(failoverTriggered);
                }
            };
            sessionState.observe(observer);

            // Check if leader is alive every 10 seconds
            const leaderCheckInterval = setInterval(async () => {
                if (sessionState.get('status') === 'ready') {
                    clearInterval(leaderCheckInterval);
                    return;
                }
                this.updateLoadingText(`Waiting for synchronization... ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);

                // Only trigger failover if no CRDT data was received from leader
                if (!noDataReceived) {
                    console.log('[SessionConnector] Data has been received, waiting for leader normally...');
                    return;
                }

                try {
                    const response = await fetch(`/api/sessions/${this.sessionId}/leader-status`);
                    const leaderStatus = await response.json();

                    if (!leaderStatus.isAlive) {
                        console.warn('[SessionConnector] Leader is unreachable (no heartbeat in 30s). Triggering failover...');
                        sessionState.unobserve(observer);
                        clearInterval(leaderCheckInterval);
                        failoverTriggered = true;
                        resolve(true);
                    } else {
                        console.log(`[SessionConnector] Leader is alive (heartbeat ${leaderStatus.secondsSinceHeartbeat}s ago). Continuing to wait...`);
                    }
                } catch (e) {
                    console.error('[SessionConnector] Failed to check leader status:', e);
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

        this.doc.off('update', this.handleDocUpdate);
        this.doc.on('update', this.handleDocUpdate);
        this.lastSavedSnapshot = this.captureSnapshot();
        this.hasPendingSave = false;

        // Save every 30 seconds
        this.saveInterval = setInterval(async () => {
            if (!this.isConnected || !this.participantId) return;
            if (!this.hasPendingSave) return;
            
            try {
                this.hasPendingSave = false;
                const json = this.captureSnapshot();
                if (!json) return;
                if (json === this.lastSavedSnapshot) return;
                
                const nodeCount = JSON.parse(json).nodes?.length ?? 0;
                console.log(`[SessionConnector] Auto-saving ${nodeCount} nodes...`);
                await this.api.saveCRDT(this.sessionId, this.participantId, json);
                this.lastSavedSnapshot = json;
                console.log('[SessionConnector] Auto-save successful.');
            } catch (e) {
                console.error('[SessionConnector] Auto-save failed:', e);
                this.hasPendingSave = true;
            }
        }, 30000);
    }

    private captureSnapshot(): string | null {
        const network = NetworkManager.getInstance();
        const nodes: Node3DInstance[] = [];
        for (const [, instance] of network.node3d.nodes.entries()) {
            nodes.push(instance);
        }

        if (nodes.length === 0) return null;

        const description = Serialization.getInstance().save(nodes, false);
        return JSON.stringify(description);
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
