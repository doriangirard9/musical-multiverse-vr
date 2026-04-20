/**
 * =============================================================================
 * Session Persistence Integration
 * =============================================================================
 * Module d'intégration pour connecter le SessionStateExporter au cycle de vie de l'application.
 * 
 * Responsabilités:
 * - Initialiser l'exporter au démarrage de la session
 * - Charger les snapshots existants
 * - Nettoyer les ressources à l'arrêt
 * =============================================================================
 */

import { SessionStateExporter } from './SessionStateExporter.ts';
import { NetworkManager } from './NetworkManager.ts';

export class SessionPersistenceManager {
    private static instance: SessionPersistenceManager;
    private exporter: SessionStateExporter | null = null;
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

        if (this.DEBUG_LOG) {
            console.log(`[SessionPersistenceManager] Initializing for session: ${sessionId}`);
        }

        // Créer l'exporter (débounce par défaut 1 seconde)
        this.exporter = new SessionStateExporter(sessionId, 1000);

        // Tenter de charger le snapshot existant
        const snapshotData = await this.exporter.loadSnapshot();

        if (snapshotData) {
            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] Loaded existing snapshot, restoring state...');
            }
            await this.restoreSnapshotToYDoc(snapshotData);
        } else {
            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] No existing snapshot, starting fresh');
            }
        }

        // Démarrer l'export automatique
        this.exporter.start();

        if (this.DEBUG_LOG) {
            console.log('[SessionPersistenceManager] Session persistence initialized');
        }
    }

    /**
     * Restaure les données du snapshot dans le Y.Doc.
     * Cette fonction peuple le Y.Doc avec l'état sauvegardé.
     * 
     * @private
     */
    private async restoreSnapshotToYDoc(snapshotData: any): Promise<void> {
        try {
            const networkManager = NetworkManager.getInstance();
            const yDoc = networkManager.doc;

            // Restaurer chaque type Yjs depuis le snapshot
            for (const [key, value] of Object.entries(snapshotData)) {
                const yType = yDoc.getMap(key);
                
                if (value && typeof value === 'object') {
                    for (const [k, v] of Object.entries(value as any)) {
                        yType.set(k, v);
                    }
                }
            }

            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] Snapshot restored to Y.Doc');
            }

        } catch (error) {
            console.warn('[SessionPersistenceManager] Error restoring snapshot:', error);
            // Ne pas arrêter si la restauration échoue - continuer avec un état vide
        }
    }

    /**
     * Arrête la persistence (à l'arrêt de l'app).
     */
    public shutdown(): void {
        if (this.exporter) {
            this.exporter.stop();
            this.exporter = null;

            if (this.DEBUG_LOG) {
                console.log('[SessionPersistenceManager] Session persistence shut down');
            }
        }
    }

    /**
     * Retourne l'exporter actif pour accès direct (ex: UI history).
     */
    public getExporter(): SessionStateExporter | null {
        return this.exporter;
    }

    /**
     * Retourne l'ID de la session active.
     */
    public getSessionId(): string | null {
        return this.sessionId;
    }
}
