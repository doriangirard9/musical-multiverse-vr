/**
 * =============================================================================
 * WAM Jam Party - Session Browser UI
 * =============================================================================
 * Affiche la liste des sessions publiques et permet de rejoindre ou créer
 * une session.
 * =============================================================================
 */

import { authService } from '../auth/AuthService';

export interface SessionInfo {
    id: string;
    name: string;
    description?: string;
    projectId: string;
    projectName: string;
    maxParticipants: number;
    activeParticipants: number;
    createdByUsername: string;
    createdAt: number;
}

// URL de base de l'API
function getApiBaseUrl(): string {
    if (typeof (window as any).WAMJAM_API_URL === 'string') {
        return (window as any).WAMJAM_API_URL;
    }
    if (window.location.port === '5173') {
        return 'http://localhost:3000';
    }
    return window.location.origin;
}

const API_BASE_URL = getApiBaseUrl();

/**
 * UI pour parcourir et rejoindre des sessions
 */
export class SessionBrowserUI {
    private container: HTMLElement;
    private sessions: SessionInfo[] = [];
    private onSessionSelected: (sessionId: string) => void;
    private refreshInterval: ReturnType<typeof setInterval> | null = null;

    constructor(onSessionSelected: (sessionId: string) => void) {
        this.onSessionSelected = onSessionSelected;
        this.container = document.createElement('div');
        this.container.id = 'session-browser';
        this.render();
        document.body.appendChild(this.container);
        this.loadSessions();

        // Rafraîchit la liste toutes les 10 secondes
        this.refreshInterval = setInterval(() => this.loadSessions(), 10000);
    }

    /**
     * Charge la liste des sessions publiques
     */
    private async loadSessions(): Promise<void> {
        try {
            const response = await fetch(`${API_BASE_URL}/api/sessions/public`);
            const data = await response.json();

            if (response.ok) {
                this.sessions = data.sessions;
                this.renderSessionList();
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }

    /**
     * Crée une nouvelle session
     */
    private async createSession(name?: string): Promise<void> {
        const createBtn = this.container.querySelector('#create-session-btn') as HTMLButtonElement;
        createBtn.disabled = true;
        createBtn.innerHTML = '<span class="spinner"></span>Creation...';

        try {
            const token = authService.getAccessToken();
            const response = await fetch(`${API_BASE_URL}/api/sessions/quick-create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, maxParticipants: 32 })
            });

            const data = await response.json();

            if (response.ok) {
                this.hide();
                this.onSessionSelected(data.session.id);
            } else {
                this.showError(data.message || 'Failed to create session');
                createBtn.disabled = false;
                createBtn.textContent = 'Creer une session';
            }
        } catch (error) {
            console.error('Error creating session:', error);
            this.showError('Network error');
            createBtn.disabled = false;
            createBtn.textContent = 'Creer une session';
        }
    }

    /**
     * Rejoint une session existante
     */
    private async joinSession(sessionId: string): Promise<void> {
        const joinBtn = this.container.querySelector(`[data-session-id="${sessionId}"]`) as HTMLButtonElement;
        if (joinBtn) {
            joinBtn.disabled = true;
            joinBtn.textContent = 'Connexion...';
        }

        try {
            const token = authService.getAccessToken();
            const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/join`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                this.hide();
                this.onSessionSelected(sessionId);
            } else {
                this.showError(data.message || 'Failed to join session');
                if (joinBtn) {
                    joinBtn.disabled = false;
                    joinBtn.textContent = 'Rejoindre';
                }
            }
        } catch (error) {
            console.error('Error joining session:', error);
            this.showError('Network error');
            if (joinBtn) {
                joinBtn.disabled = false;
                joinBtn.textContent = 'Rejoindre';
            }
        }
    }

    /**
     * Affiche une erreur
     */
    private showError(message: string): void {
        const errorEl = this.container.querySelector('#session-error') as HTMLElement;
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('visible');
            setTimeout(() => errorEl.classList.remove('visible'), 3000);
        }
    }

    /**
     * Rendu principal
     */
    private render(): void {
        const user = authService.getUser();

        this.container.innerHTML = `
            <style>
                #session-browser {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 40px 20px;
                    z-index: 10000;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    overflow-y: auto;
                }

                .browser-header {
                    text-align: center;
                    margin-bottom: 30px;
                }

                .browser-header h1 {
                    color: #fff;
                    font-size: 2em;
                    margin: 0 0 10px 0;
                    background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .browser-header p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .welcome-user {
                    color: rgba(255, 255, 255, 0.8);
                    margin-bottom: 5px;
                }

                .browser-content {
                    width: 100%;
                    max-width: 800px;
                }

                .create-section {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 15px;
                    padding: 25px;
                    margin-bottom: 30px;
                    display: flex;
                    gap: 15px;
                    align-items: center;
                }

                .create-section input {
                    flex: 1;
                    padding: 12px 16px;
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    font-size: 1em;
                }

                .create-section input:focus {
                    outline: none;
                    border-color: #e94560;
                }

                .create-section input::placeholder {
                    color: rgba(255, 255, 255, 0.4);
                }

                #create-session-btn {
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
                    border: none;
                    border-radius: 10px;
                    color: #fff;
                    font-size: 1em;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    white-space: nowrap;
                }

                #create-session-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(233, 69, 96, 0.4);
                }

                #create-session-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }

                .sessions-section h2 {
                    color: #fff;
                    font-size: 1.2em;
                    margin: 0 0 15px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .sessions-section h2 .count {
                    background: rgba(255, 255, 255, 0.15);
                    padding: 2px 10px;
                    border-radius: 15px;
                    font-size: 0.8em;
                    color: rgba(255, 255, 255, 0.7);
                }

                .session-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .session-card {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 18px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    transition: all 0.3s ease;
                }

                .session-card:hover {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(255, 255, 255, 0.2);
                }

                .session-info {
                    flex: 1;
                }

                .session-name {
                    color: #fff;
                    font-size: 1.1em;
                    font-weight: 600;
                    margin: 0 0 5px 0;
                }

                .session-meta {
                    display: flex;
                    gap: 15px;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 0.85em;
                }

                .session-meta span {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }

                .participants-count {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-right: 15px;
                }

                .participants-badge {
                    background: rgba(233, 69, 96, 0.2);
                    color: #ff6b6b;
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 0.9em;
                    font-weight: 600;
                }

                .participants-badge.full {
                    background: rgba(255, 0, 0, 0.2);
                    color: #ff4444;
                }

                .join-btn {
                    padding: 10px 20px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 0.9em;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .join-btn:hover {
                    background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
                    border-color: transparent;
                }

                .join-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .empty-state {
                    text-align: center;
                    padding: 40px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .empty-state .icon {
                    font-size: 3em;
                    margin-bottom: 15px;
                }

                #session-error {
                    background: rgba(255, 0, 0, 0.2);
                    border: 1px solid rgba(255, 0, 0, 0.3);
                    color: #ff6b6b;
                    padding: 12px;
                    border-radius: 10px;
                    text-align: center;
                    margin-bottom: 20px;
                    display: none;
                }

                #session-error.visible {
                    display: block;
                }

                .spinner {
                    display: inline-block;
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    border-top-color: #fff;
                    animation: spin 0.8s linear infinite;
                    margin-right: 8px;
                    vertical-align: middle;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .refresh-hint {
                    text-align: center;
                    color: rgba(255, 255, 255, 0.4);
                    font-size: 0.8em;
                    margin-top: 20px;
                }

                .logout-btn {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 10px 16px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 0.9em;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .logout-btn:hover {
                    background: rgba(255, 107, 107, 0.2);
                    border-color: rgba(255, 107, 107, 0.4);
                    color: #ff6b6b;
                }

                .guest-badge {
                    background: rgba(255, 255, 255, 0.15);
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 0.8em;
                    color: rgba(255, 255, 255, 0.6);
                    margin-left: 5px;
                }
            </style>

            <button class="logout-btn" id="logout-btn">
                <span>&#128682;</span>
                Deconnexion
            </button>

            <div class="browser-header">
                <p class="welcome-user">Bienvenue, ${user?.displayName || 'Utilisateur'} !</p>
                <h1>WAM Jam Party</h1>
                <p>Rejoignez une session ou creez la votre</p>
            </div>

            <div class="browser-content">
                <div id="session-error"></div>

                <div class="create-section">
                    <input type="text" id="session-name-input"
                           placeholder="Nom de votre session (optionnel)">
                    <button id="create-session-btn">Creer une session</button>
                </div>

                <div class="sessions-section">
                    <h2>
                        Sessions publiques
                        <span class="count" id="session-count">0</span>
                    </h2>
                    <div class="session-list" id="session-list">
                        <div class="empty-state">
                            <div class="icon">&#127925;</div>
                            <p>Chargement des sessions...</p>
                        </div>
                    </div>
                </div>

                <p class="refresh-hint">La liste se rafraichit automatiquement</p>
            </div>
        `;

        this.setupEventListeners();
    }

    /**
     * Met à jour la liste des sessions
     */
    private renderSessionList(): void {
        const listEl = this.container.querySelector('#session-list') as HTMLElement;
        const countEl = this.container.querySelector('#session-count') as HTMLElement;

        countEl.textContent = String(this.sessions.length);

        if (this.sessions.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="icon">&#127925;</div>
                    <p>Aucune session publique disponible.<br>Soyez le premier a en creer une !</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = this.sessions.map(session => {
            const isFull = session.activeParticipants >= session.maxParticipants;
            return `
                <div class="session-card">
                    <div class="session-info">
                        <h3 class="session-name">${this.escapeHtml(session.name)}</h3>
                        <div class="session-meta">
                            <span>&#128100; ${this.escapeHtml(session.createdByUsername)}</span>
                            <span>&#128197; ${this.formatDate(session.createdAt)}</span>
                        </div>
                    </div>
                    <div class="participants-count">
                        <span class="participants-badge ${isFull ? 'full' : ''}">
                            ${session.activeParticipants}/${session.maxParticipants}
                        </span>
                    </div>
                    <button class="join-btn"
                            data-session-id="${session.id}"
                            ${isFull ? 'disabled' : ''}>
                        ${isFull ? 'Complet' : 'Rejoindre'}
                    </button>
                </div>
            `;
        }).join('');

        // Ajoute les listeners pour les boutons rejoindre
        this.container.querySelectorAll('.join-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                const sessionId = (btn as HTMLElement).dataset.sessionId;
                if (sessionId) this.joinSession(sessionId);
            });
        });
    }

    /**
     * Configure les event listeners
     */
    private setupEventListeners(): void {
        const createBtn = this.container.querySelector('#create-session-btn') as HTMLButtonElement;
        const nameInput = this.container.querySelector('#session-name-input') as HTMLInputElement;
        const logoutBtn = this.container.querySelector('#logout-btn') as HTMLButtonElement;

        createBtn.addEventListener('click', () => {
            const name = nameInput.value.trim() || undefined;
            this.createSession(name);
        });

        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const name = nameInput.value.trim() || undefined;
                this.createSession(name);
            }
        });

        logoutBtn.addEventListener('click', async () => {
            try {
                await authService.logout();
                window.location.reload();
            } catch (error) {
                console.error('Logout error:', error);
                window.location.reload();
            }
        });
    }

    /**
     * Echappe le HTML
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Formate une date
     */
    private formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Cache l'UI
     */
    public hide(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        this.container.remove();
    }
}
