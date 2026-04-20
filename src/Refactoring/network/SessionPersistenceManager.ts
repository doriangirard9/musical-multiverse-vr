/**
 * =============================================================================
 * Session Persistence Integration
 * =============================================================================
 * Module d'intégration pour connecter le SessionStateService au cycle de vie de l'application.
 * 
 * Responsabilités:
 * - Initialiser le service au démarrage de la session
 * - Charger les snapshots existants
 * - Nettoyer les ressources à l'arrêt
 * =============================================================================
 */

import { SessionStateService } from './SessionStateService.ts';
import { NetworkManager } from './NetworkManager.ts';

export class SessionPersistenceManager {
    private static instance: SessionPersistenceManager;
    private stateService: SessionStateService | null = null;
    private sessionId: string | null = null;
    private readonly DEBUG_LOG = false;
    private readonly PEER_SYNC_GRACE_MS = 5000;
    private readonly PEER_SYNC_POLL_MS = 100;

    private constructor() {}

    public static getInstance(): SessionPersistenceManager {
        if (!SessionPersistenceManager.instance) {
            SessionPersistenceManager.instance = new SessionPersistenceManager();
        }
        return SessionPersistenceManager.instance;
    }

    /**
     * Initialise la persistence pour une session donnée.
     * Appelé après que NetworkManager soit initialisé.
     * 
     * @param sessionId - ID de la session active
     */
    public async initialize(sessionId: string): Promise<void> {
        this.sessionId = sessionId;
        this.stateService = SessionStateService.getInstance();

        if (this.DEBUG_LOG) {
            console.log(`[SessionPersistenceManager] Initializing for session: ${sessionId}`);
        }

        // Initialize the state service (determines if this user saves to DB)
        await this.stateService.initialize(sessionId);

        // Only the first active participant should restore from DB.
        // Other participants must receive state via Yjs synchronization.
        if (!this.stateService.shouldLoadFromDatabase()) {
            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] Skipping DB restore; waiting for Yjs sync');
            }
            return;
        }

        // Even for the elected loader, never restore if there is any sync signal from network.
        // This prevents DB restore from duplicating nodes that arrived from peers.
        if (await this.hasRemoteSyncSignalsDuringGrace()) {
            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] Remote sync detected; skipping DB restore');
            }
            return;
        }

        // Load any existing snapshot
        const snapshotData = await this.stateService.loadState();

        if (snapshotData) {
            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] Loaded existing snapshot, restoring state...');
            }
            await this.stateService.restoreState(snapshotData);
        } else {
            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] No existing snapshot, starting fresh');
            }
        }

        if (this.DEBUG_LOG) {
            console.log('[SessionPersistenceManager] Session persistence initialized');
        }
    }

    /**
     * Arrête la persistence (à l'arrêt de l'app).
     */
    public shutdown(): void {
        if (this.stateService) {
            this.stateService.shutdown();
            this.stateService = null;

            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] Session persistence shut down');
            }
        }
    }

    /**
     * Retourne le service actif pour accès direct.
     */
    public getStateService(): SessionStateService | null {
        return this.stateService;
    }

    /**
     * Retourne l'ID de la session active.
     */
    public getSessionId(): string | null {
        return this.sessionId;
    }

    private async hasRemoteSyncSignalsDuringGrace(): Promise<boolean> {
        const networkManager = NetworkManager.getInstance();
        if (this.hasExistingNetworkState() || this.hasConnectedPeers()) {
            return true;
        }

        let sawDocUpdate = false;
        const onDocUpdate = () => {
            sawDocUpdate = true;
        };
        networkManager.doc.on('update', onDocUpdate);

        const deadline = Date.now() + this.PEER_SYNC_GRACE_MS;
        try {
            while (Date.now() < deadline) {
                await new Promise<void>(resolve => setTimeout(resolve, this.PEER_SYNC_POLL_MS));
                if (sawDocUpdate || this.hasExistingNetworkState() || this.hasConnectedPeers()) {
                    return true;
                }
            }
        } finally {
            networkManager.doc.off('update', onDocUpdate);
        }

        return false;
    }

    private hasExistingNetworkState(): boolean {
        try {
            return NetworkManager.getInstance().node3d.nodes.size > 0;
        } catch {
            return false;
        }
    }

    private hasConnectedPeers(): boolean {
        try {
            return NetworkManager.getInstance().connection.getConnectedPlayers().length > 0;
        } catch {
            return false;
        }
    }
}

