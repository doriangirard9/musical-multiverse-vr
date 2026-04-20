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

export class SessionPersistenceManager {
    private static instance: SessionPersistenceManager;
    private stateService: SessionStateService | null = null;
    private sessionId: string | null = null;
    private readonly DEBUG_LOG = false;

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
}

