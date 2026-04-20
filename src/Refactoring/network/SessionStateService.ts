/**
 * =============================================================================
 * Session State Service - Direct Database Persistence
 * =============================================================================
 * Saves the complete session state directly to the database when it changes.
 * 
 * Only the longest-connected user saves to avoid conflicts.
 * Uses Serialization.save() to get the state without data transformations.
 * =============================================================================
 */

import * as Y from 'yjs';
import { NetworkManager } from './NetworkManager.ts';
import { Serialization } from '../app/Serialization.ts';

export class SessionStateService {
    private static instance: SessionStateService;
    private sessionId: string | null = null;
    private isConnectedLongest: boolean = false;
    private participantCount: number = 0;
    private shouldRestoreFromDatabase: boolean = false;
    private unsubscribe: (() => void) | null = null;
    private debounceTimeout: NodeJS.Timeout | null = null;
    private readonly DEBUG_LOG = false;
    private readonly DEBOUNCE_MS = 1000; // Debounce saves to avoid excessive database writes
    private readonly API_BASE_URL = this.getApiBaseUrl();

    private constructor() {}

    public static getInstance(): SessionStateService {
        if (!SessionStateService.instance) {
            SessionStateService.instance = new SessionStateService();
        }
        return SessionStateService.instance;
    }

    /**
     * Initialize the service for a session.
     * Checks if this client is the longest-connected and sets up state tracking.
     * 
     * @param sessionId - The session ID
     */
    public async initialize(sessionId: string): Promise<void> {
        this.sessionId = sessionId;
        this.isConnectedLongest = false;
        this.participantCount = 0;
        this.shouldRestoreFromDatabase = false;

        // Determine if this user is the longest-connected
        await this.checkIfLongestConnected();

        if (!this.isConnectedLongest) {
            if (this.DEBUG_LOG) {
                console.log('[SessionStateService] Not the longest-connected user, skipping database saves');
            }
            return;
        }

        if (this.DEBUG_LOG) {
            console.log('[SessionStateService] Initialized as longest-connected user');
        }

        // Listen to Y.Doc updates
        this.setupStateTracking();
    }

    /**
     * Check if this user has been in the session the longest.
     * Queries the server to compare join times.
     * 
     * @private
     */
    private async checkIfLongestConnected(): Promise<void> {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/sessions/${this.sessionId}/users/longestConnected`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.getAccessToken()}`
                }
            });

            if (!response.ok) {
                console.warn('[SessionStateService] Could not determine longest-connected user');
                return;
            }

            const data = await response.json();
            const currentUserId = this.getAuthenticatedUserId();
            this.isConnectedLongest = currentUserId !== null && String(data.userId) === String(currentUserId);
            this.participantCount = Number(data.participantCount) || 0;
            this.shouldRestoreFromDatabase = this.isConnectedLongest && this.participantCount <= 1;

        } catch (error) {
            console.warn('[SessionStateService] Error checking longest-connected status:', error);
        }
    }

    public shouldLoadFromDatabase(): boolean {
        return this.shouldRestoreFromDatabase;
    }

    /**
     * Set up tracking for state changes using Yjs observers.
     * When state changes, schedule a debounced save to the database.
     * 
     * @private
     */
    private setupStateTracking(): void {
        const yDoc = NetworkManager.getInstance().doc;

        // Observe all changes to the Y.Doc
        const observer = () => {
            this.scheduleSave();
        };

        yDoc.on('update', observer);

        this.unsubscribe = () => {
            yDoc.off('update', observer);
        };
    }

    /**
     * Schedule a debounced save to the database.
     * If a save is already scheduled, reset the timer.
     * 
     * @private
     */
    private scheduleSave(): void {
        if (!this.isConnectedLongest || !this.sessionId) {
            return;
        }

        // Clear existing timeout
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }

        // Schedule new save
        this.debounceTimeout = setTimeout(() => {
            this.saveState();
        }, this.DEBOUNCE_MS);
    }

    /**
     * Save the current state to the database.
     * Gets all nodes using Serialization.save() and POSTs to the API.
     * 
     * @private
     */
    private async saveState(): Promise<void> {
        try {
            if (!this.sessionId) {
                console.warn('[SessionStateService] No session ID set');
                return;
            }

            // Get all nodes from the network
            const networkManager = NetworkManager.getInstance();
            const allNodes = [...networkManager.node3d.nodes.entries()]
                .map(([_, node]) => node);

            if (allNodes.length === 0) {
                if (this.DEBUG_LOG) {
                    console.log('[SessionStateService] No nodes to save');
                }
                return;
            }

            // Serialize all nodes (without adding connected nodes to avoid duplication)
            const serialized = Serialization.getInstance().save(allNodes, false);

            if (this.DEBUG_LOG) {
                console.log('[SessionStateService] Saving state with', allNodes.length, 'nodes');
            }

            // POST to API
            const response = await fetch(`${this.API_BASE_URL}/api/sessions/${this.sessionId}/snapshot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAccessToken()}`
                },
                body: JSON.stringify({ snapshotData: serialized })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const result = await response.json();

            if (this.DEBUG_LOG) {
                console.log('[SessionStateService] State saved successfully (v' + result.snapshot.version + ')');
            }

        } catch (error) {
            console.warn('[SessionStateService] Failed to save state:', error);
        }
    }

    /**
     * Load the saved state from the database and restore it.
     * 
     * @returns Promise<Node3DGraphDescription|null> The loaded state, or null
     */
    public async loadState(): Promise<any | null> {
        try {
            if (!this.sessionId) {
                console.warn('[SessionStateService] No session ID set');
                return null;
            }

            const response = await fetch(`${this.API_BASE_URL}/api/sessions/${this.sessionId}/snapshot`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.getAccessToken()}`
                }
            });

            if (response.status === 204 || response.status === 404) {
                if (this.DEBUG_LOG) {
                    console.log('[SessionStateService] No snapshot available');
                }
                return null;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (this.DEBUG_LOG) {
                console.log('[SessionStateService] Snapshot loaded (v' + result.snapshot.version + ')');
            }

            return result.snapshot.data;

        } catch (error) {
            console.error('[SessionStateService] Failed to load state:', error);
            return null;
        }
    }

    /**
     * Restore the loaded state to the scene.
     * 
     * @param snapshotData - The serialized state from the database
     */
    public async restoreState(snapshotData: any): Promise<void> {
        try {
            if (!snapshotData) {
                return;
            }

            await Serialization.getInstance().load(snapshotData);

            if (this.DEBUG_LOG) {
                console.log('[SessionStateService] State restored');
            }

        } catch (error) {
            console.warn('[SessionStateService] Error restoring state:', error);
        }
    }

    /**
     * Shut down the service and clean up observers.
     */
    public shutdown(): void {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }

        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        if (this.DEBUG_LOG) {
            console.log('[SessionStateService] Shut down');
        }
    }

    /**
     * Get the access token from localStorage.
     * 
     * @private
     */
    private getAccessToken(): string {
        return localStorage.getItem('wamjam_access_token') || '';
    }

    private getAuthenticatedUserId(): string | number | null {
        const userRaw = localStorage.getItem('wamjam_user');
        if (!userRaw) {
            return null;
        }
        try {
            const user = JSON.parse(userRaw) as { id?: string | number };
            return user.id ?? null;
        } catch {
            return null;
        }
    }

    private getApiBaseUrl(): string {
        if (typeof (window as any).WAMJAM_API_URL === 'string') {
            return (window as any).WAMJAM_API_URL;
        }
        if (window.location.port === '5173') {
            return 'http://localhost:3000';
        }
        return window.location.origin;
    }
}
