/**
 * =============================================================================
 * Session State Exporter - Frontend Session Persistence
 * =============================================================================
 * Composant responsable de l'export périodique du state Yjs vers le serveur.
 * 
 * Fonctionnalités:
 * - Export débounced (configurable, par défaut 1s)
 * - Non-bloquant (utilise fetch async)
 * - Gestion des erreurs gracieuse
 * - Support du mode hors ligne (queue local)
 * =============================================================================
 */

import { NetworkEventBus } from '../eventBus/NetworkEventBus.ts';
import { NetworkManager } from '../network/NetworkManager.ts';

export class SessionStateExporter {
    private networkEventBus: NetworkEventBus;
    private sessionId: string;
    private debounceInterval: number; // ms
    private debounceTimeout: NodeJS.Timeout | null = null;
    private lastSavedVersion: number = -1;
    private isSaving: boolean = false;
    private saveQueue: any[] = [];
    private readonly DEBUG_LOG = false;

    /**
     * @param sessionId - ID de la session
     * @param debounceInterval - Intervalle de débounce en ms (défaut: 1000ms)
     */
    constructor(sessionId: string, debounceInterval: number = 1000) {
        this.sessionId = sessionId;
        this.debounceInterval = debounceInterval;
        this.networkEventBus = NetworkEventBus.getInstance();

        if (this.DEBUG_LOG) {
            console.log(`[SessionStateExporter] Initialized for session ${sessionId}, debounce: ${debounceInterval}ms`);
        }
    }

    /**
     * Démarre l'export automatique de l'état de la session.
     * Écoute les changements du Y.Doc et les export de manière débounced.
     */
    public start(): void {
        const networkManager = NetworkManager.getInstance();
        const yDoc = networkManager.doc;

        // Écouter les changements du document Yjs
        yDoc.on('update', () => {
            this.scheduleExport();
        });

        if (this.DEBUG_LOG) {
            console.log('[SessionStateExporter] Export monitoring started');
        }
    }

    /**
     * Planifie un export en utilisant le débounce.
     * Si un export est déjà planifié, le timer est réinitialisé.
     * 
     * @private
     */
    private scheduleExport(): void {
        // Annuler le timer précédent
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }

        // Planifier un nouvel export après le délai de débounce
        this.debounceTimeout = setTimeout(() => {
            this.exportSnapshot();
        }, this.debounceInterval);
    }

    /**
     * Exporte l'état courant de la session au serveur.
     * Cette méthode est appelée de manière débounced.
     * 
     * @private
     */
    private async exportSnapshot(): Promise<void> {
        // Éviter les exports concurrents
        if (this.isSaving) {
            this.scheduleExport(); // Replanifier pour plus tard
            return;
        }

        try {
            this.isSaving = true;

            const networkManager = NetworkManager.getInstance();
            const yDoc = networkManager.doc;

            // Sérialiser l'état du Y.Doc
            const snapshotData = this.serializeYDoc(yDoc);

            if (this.DEBUG_LOG) {
                console.log(`[SessionStateExporter] Exporting snapshot (size: ${JSON.stringify(snapshotData).length} bytes)`);
            }

            // Envoyer au serveur
            const response = await fetch(`/api/sessions/${this.sessionId}/snapshot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAccessToken()}`
                },
                body: JSON.stringify({ snapshotData })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            const result = await response.json();

            if (this.DEBUG_LOG) {
                console.log(`[SessionStateExporter] Snapshot saved successfully (v${result.snapshot.version})`);
            }

            this.lastSavedVersion = result.snapshot.version;

        } catch (error) {
            console.warn('[SessionStateExporter] Export failed:', error);
            // Ne pas propager l'erreur - continuer silencieusement
            // (l'utilisateur ne doit pas être affecté)
        } finally {
            this.isSaving = false;
        }
    }

    /**
     * Sérialise le contenu du Y.Doc en un objet JavaScript.
     * Extrait les données structurées des types Yjs.
     * 
     * @private
     */
    private serializeYDoc(yDoc: any): object {
        const snapshot: any = {};

        // Parcourir les types du root
        yDoc.share.forEach((value: any, key: string) => {
            snapshot[key] = this.serializeYValue(value);
        });

        return snapshot;
    }

    /**
     * Sérialise récursivement une valeur Yjs.
     * 
     * @private
     */
    private serializeYValue(value: any): any {
        // Yjs Map
        if (value.toJSON) {
            return value.toJSON();
        }

        // Yjs Array
        if (value._array) {
            return value._array.map((item: any) => this.serializeYValue(item));
        }

        // Objet JavaScript
        if (typeof value === 'object' && value !== null) {
            const result: any = Array.isArray(value) ? [] : {};
            for (const key in value) {
                result[key] = this.serializeYValue(value[key]);
            }
            return result;
        }

        return value;
    }

    /**
     * Charge un snapshot de session existant (ex: après rechargement).
     * Utilisé pour restaurer l'état dans le Y.Doc.
     * 
     * @returns Promise<object|null> Les données du snapshot, ou null
     */
    public async loadSnapshot(): Promise<any | null> {
        try {
            const response = await fetch(`/api/sessions/${this.sessionId}/snapshot`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.getAccessToken()}`
                }
            });

            if (response.status === 404) {
                if (this.DEBUG_LOG) {
                    console.log('[SessionStateExporter] No snapshot available yet');
                }
                return null;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (this.DEBUG_LOG) {
                console.log(`[SessionStateExporter] Snapshot loaded (v${result.snapshot.version})`);
            }

            return result.snapshot.data;

        } catch (error) {
            console.error('[SessionStateExporter] Failed to load snapshot:', error);
            return null;
        }
    }

    /**
     * Charge un snapshot spécifique de l'historique par numéro de version.
     * 
     * @param version - Numéro de version
     * @returns Promise<object|null> Les données du snapshot
     */
    public async loadSnapshotVersion(version: number): Promise<any | null> {
        try {
            const response = await fetch(`/api/sessions/${this.sessionId}/snapshots/history/${version}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.getAccessToken()}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            return result.snapshot.data;

        } catch (error) {
            console.error('[SessionStateExporter] Failed to load snapshot version:', error);
            return null;
        }
    }

    /**
     * Liste l'historique des snapshots de la session.
     * 
     * @param limit - Nombre de snapshots à retourner
     * @param offset - Offset pour la pagination
     * @returns Promise<array> Liste des snapshots
     */
    public async listSnapshotHistory(limit: number = 20, offset: number = 0): Promise<any[]> {
        try {
            const response = await fetch(
                `/api/sessions/${this.sessionId}/snapshots/history?limit=${limit}&offset=${offset}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.getAccessToken()}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            return result.history || [];

        } catch (error) {
            console.error('[SessionStateExporter] Failed to list snapshot history:', error);
            return [];
        }
    }

    /**
     * Arrête l'export automatique.
     */
    public stop(): void {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }

        if (this.DEBUG_LOG) {
            console.log('[SessionStateExporter] Export monitoring stopped');
        }
    }

    /**
     * Retourne le dernier numéro de version sauvegardé.
     */
    public getLastSavedVersion(): number {
        return this.lastSavedVersion;
    }

    /**
     * Obtient le token d'accès JWT du localStorage.
     * 
     * @private
     */
    private getAccessToken(): string {
        return localStorage.getItem('accessToken') || '';
    }
}
