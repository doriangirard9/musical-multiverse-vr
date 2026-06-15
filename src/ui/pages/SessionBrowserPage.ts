import { AuthService } from '../../auth/AuthService.ts';
import { ApiClient } from '../../auth/ApiClient.ts';
import { HashRouter } from '../../router/HashRouter.ts';
import { ROUTES } from '../../router/routes.ts';

interface SessionInfo {
    id: string;
    name: string;
    is_public: number;
    max_users: number;
    project_name: string;
    owner_username: string;
    participant_count: number;
}

/**
 * Session browser page — lists public sessions and user's own sessions.
 * Polls participant counts every 5 seconds.
 */
export class SessionBrowserPage {
    private element: HTMLDivElement | null = null;
    private pollInterval: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly auth: AuthService,
        private readonly api: ApiClient,
        private readonly router: HashRouter,
    ) {}

    show(container: HTMLElement): void {
        this.hide();

        const user = this.auth.getUser();
        const el = document.createElement('div');
        el.className = 'wj-page-overlay';
        el.id = 'wj-sessions-page';

        el.innerHTML = `
            <div class="wj-container wj-container-wide">
                <div class="wj-toolbar">
                    <h1 class="wj-title" style="text-align:left;margin:0;">🎵 WamJam Party</h1>
                    <div class="wj-toolbar-actions">
                        <button class="wj-btn wj-btn-primary wj-hud-btn" id="wj-new-temp" title="Session jouable tout de suite, jamais sauvegardée, qui disparaît quand tout le monde part">⚡ Session temporaire</button>
                        ${user ? `
                            <div class="wj-user-info">
                                <span class="wj-avatar">${user.username[0].toUpperCase()}</span>
                                <span>${user.username}</span>
                            </div>
                            <button class="wj-btn wj-btn-ghost wj-hud-btn" id="wj-nav-projects">My Projects</button>
                            <button class="wj-btn wj-btn-secondary wj-hud-btn" id="wj-logout-btn">Log Out</button>
                        ` : `
                            <button class="wj-btn wj-btn-primary wj-hud-btn" id="wj-nav-login">Log In</button>
                        `}
                    </div>
                </div>

                ${user ? `
                <div class="wj-tabs">
                    <button class="wj-tab wj-active" data-tab="public">Public Sessions</button>
                    <button class="wj-tab" data-tab="mine">My Sessions</button>
                </div>
                ` : ''}

                <div id="wj-sessions-list" class="wj-session-list">
                    <div class="wj-empty-state">Loading sessions...</div>
                </div>
            </div>
        `;

        container.appendChild(el);
        this.element = el;

        // Events
        const logoutBtn = el.querySelector('#wj-logout-btn');
        const loginBtn = el.querySelector('#wj-nav-login');
        const projectsBtn = el.querySelector('#wj-nav-projects');
        const tabs = el.querySelectorAll('.wj-tab');

        logoutBtn?.addEventListener('click', async () => {
            await this.auth.logout();
            this.router.navigate(ROUTES.LOGIN);
        });

        loginBtn?.addEventListener('click', () => this.router.navigate(ROUTES.LOGIN));
        projectsBtn?.addEventListener('click', () => this.router.navigate(ROUTES.PROJECTS));

        // Session temporaire : crée une session éphémère (jamais sauvegardée,
        // supprimée quand elle se vide) et y entre directement. Marche aussi
        // pour les invités.
        const tempBtn = el.querySelector('#wj-new-temp') as HTMLButtonElement | null;
        tempBtn?.addEventListener('click', async () => {
            tempBtn.disabled = true;
            tempBtn.textContent = '⚡ Création…';
            try {
                const res = await this.api.request<{ session: { id: string } }>('POST', '/sessions/temporary', {});
                this.router.navigate(ROUTES.APP, { session: res.session.id });
            } catch (err) {
                console.error('[SessionBrowser] Création de session temporaire échouée:', err);
                tempBtn.disabled = false;
                tempBtn.textContent = '⚡ Session temporaire';
            }
        });

        let currentTab = 'public';
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('wj-active'));
                tab.classList.add('wj-active');
                currentTab = (tab as HTMLElement).dataset.tab || 'public';
                this.loadSessions(el, currentTab);
            });
        });

        // Initial load
        this.loadSessions(el, currentTab);

        // Poll every 5 seconds
        this.pollInterval = setInterval(() => {
            this.loadSessions(el, currentTab);
        }, 5000);
    }

    hide(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }

    private async loadSessions(el: HTMLElement, tab: string): Promise<void> {
        const listEl = el.querySelector('#wj-sessions-list') as HTMLElement;
        if (!listEl) return;

        try {
            let sessions: SessionInfo[];
            if (tab === 'mine' && this.auth.isAuthenticated()) {
                const data = await this.api.request<{ sessions: SessionInfo[] }>('GET', '/sessions/mine');
                sessions = data.sessions;
            } else {
                const data = await this.api.request<{ sessions: SessionInfo[] }>('GET', '/sessions/public');
                sessions = data.sessions;
            }

            if (sessions.length === 0) {
                listEl.innerHTML = `
                    <div class="wj-empty-state">
                        ${tab === 'mine'
                            ? 'No sessions yet. Go to <span class="wj-link" id="wj-goto-projects">My Projects</span> to create one.'
                            : 'No public sessions available.'}
                    </div>
                `;
                const gotoProjects = listEl.querySelector('#wj-goto-projects');
                gotoProjects?.addEventListener('click', () => this.router.navigate(ROUTES.PROJECTS));
                return;
            }

            listEl.innerHTML = sessions.map(s => `
                <div class="wj-session-card" data-session-id="${s.id}">
                    <div class="wj-session-info">
                        <div class="wj-session-name">${this.escapeHtml(s.name)}</div>
                        <div class="wj-session-meta">
                            <span class="wj-badge ${s.is_public ? 'wj-badge-public' : 'wj-badge-private'}">
                                ${s.is_public ? '🌐 Public' : '🔒 Private'}
                            </span>
                            <span>${this.escapeHtml(s.project_name)} · ${this.escapeHtml(s.owner_username)}</span>
                        </div>
                    </div>
                    <div class="wj-participants">
                        <span class="wj-participants-dot ${s.participant_count > 0 ? '' : 'wj-empty'}"></span>
                        ${s.participant_count}/${s.max_users}
                    </div>
                    <button class="wj-btn wj-btn-primary wj-hud-btn">Join</button>
                </div>
            `).join('');

            // Click handlers for join
            listEl.querySelectorAll('.wj-session-card').forEach(card => {
                card.addEventListener('click', () => {
                    const sessionId = (card as HTMLElement).dataset.sessionId;
                    if (sessionId) {
                        this.router.navigate(ROUTES.APP, { session: sessionId });
                    }
                });
            });
        } catch (err) {
            console.error('[SessionBrowser] Failed to load sessions:', err);
        }
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
