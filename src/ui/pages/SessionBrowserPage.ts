import { AuthService } from '../../auth/AuthService.ts';
import { ApiClient } from '../../auth/ApiClient.ts';
import { HashRouter } from '../../router/HashRouter.ts';
import { ROUTES } from '../../router/routes.ts';
import { showCollaboratorsDialog, showInviteDialog, type DialogTarget } from './SessionDialogs.ts';

interface SessionInfo {
    id: string;
    name: string;
    is_public: number;
    is_locked?: number;
    max_users: number;
    project_name: string;
    owner_username: string;
    participant_count: number;
}

interface ProjectInfo {
    id: string;
    name: string;
}

interface NotificationInfo {
    id: string;
    type: string;
    status: string;
    created_at: string;
    session_id: string;
    session_name: string;
    from_username: string;
}

/**
 * Session browser page — lists public sessions and user's own sessions.
 * Polls participant counts every 5 seconds.
 */
export class SessionBrowserPage {
    private element: HTMLDivElement | null = null;
    private pollInterval: ReturnType<typeof setInterval> | null = null;
    private notifPollInterval: ReturnType<typeof setInterval> | null = null;
    /** The listed sessions by id, to suggest the name and visibility of a copy */
    private sessions = new Map<string, SessionInfo>();

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
                    <h1 class="wj-title" style="text-align:left;margin:0;">🎵 WAM Jam Party</h1>
                    <div class="wj-toolbar-actions">
                        <button class="wj-btn wj-btn-tutorial wj-hud-btn" id="wj-new-tutorial" title="A guided solo introduction using a temporary session">Guided Tutorial</button>
                        <button class="wj-btn wj-btn-primary wj-hud-btn" id="wj-new-temp" title="A session you can play right away, never saved, that disappears when everyone leaves">⚡ Temporary Session</button>
                        ${user ? `
                            <button class="wj-notif-btn" id="wj-notif-btn" title="Notifications">
                                🔔
                                <span class="wj-notif-badge wj-hidden" id="wj-notif-badge">0</span>
                            </button>
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
                    <button class="wj-tab" data-tab="invited">Invited Sessions</button>
                    <button class="wj-tab" data-tab="mine">My Sessions</button>
                </div>
                ` : ''}

                <div id="wj-sessions-list" class="wj-session-list">
                    <div class="wj-empty-state">Loading sessions...</div>
                </div>

                <!-- Modal of the actions on a session card (duplicate, invite, collaborators), filled by openActionModal -->
                <div id="wj-action-modal" class="wj-modal-backdrop" style="display:none;">
                    <div class="wj-modal" id="wj-action-content"></div>
                </div>

                <!-- Notifications Modal -->
                <div id="wj-notif-modal" class="wj-modal-backdrop" style="display:none;">
                    <div class="wj-modal">
                        <h2 class="wj-modal-title">Notifications</h2>
                        <div id="wj-notif-list" class="wj-notif-list">
                            <div class="wj-empty-state">Loading...</div>
                        </div>
                        <div class="wj-modal-actions">
                            <button class="wj-btn wj-btn-secondary" id="wj-notif-close">Close</button>
                        </div>
                    </div>
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

        // Temporary session: create an ephemeral session (never saved, deleted
        // when it empties) and enter it directly. Works for guests too.
        const tempBtn = el.querySelector('#wj-new-temp') as HTMLButtonElement | null;
        tempBtn?.addEventListener('click', async () => {
            tempBtn.disabled = true;
            tempBtn.textContent = '⚡ Creating…';
            try {
                const res = await this.api.request<{ session: { id: string } }>('POST', '/sessions/temporary', {});
                this.router.navigate(ROUTES.APP, { session: res.session.id });
            } catch (err) {
                console.error('[SessionBrowser] Failed to create temporary session:', err);
                tempBtn.disabled = false;
                tempBtn.textContent = '⚡ Temporary Session';
            }
        });

        const tutorialBtn = el.querySelector('#wj-new-tutorial') as HTMLButtonElement | null;
        tutorialBtn?.addEventListener('click', async () => {
            tutorialBtn.disabled = true;
            tutorialBtn.textContent = 'Preparing tutorial...';
            try {
                const res = await this.api.request<{ session: { id: string } }>('POST', '/sessions/temporary', {
                    name: 'Guided Tutorial',
                    maxUsers: 1,
                });
                this.router.navigate(ROUTES.APP, { session: res.session.id, tutorial: '1' });
            } catch (err) {
                console.error('[SessionBrowser] Failed to create tutorial:', err);
                tutorialBtn.disabled = false;
                tutorialBtn.textContent = 'Guided Tutorial';
            }
        });

        // Notifications button + modal
        const notifBtn = el.querySelector('#wj-notif-btn');
        const notifModal = el.querySelector('#wj-notif-modal') as HTMLElement;
        const notifClose = el.querySelector('#wj-notif-close');

        notifBtn?.addEventListener('click', () => {
            notifModal.style.display = 'flex';
            this.loadNotifications(el);
        });

        notifClose?.addEventListener('click', () => {
            notifModal.style.display = 'none';
        });

        // Close modal on backdrop click
        notifModal?.addEventListener('click', (e) => {
            if (e.target === notifModal) notifModal.style.display = 'none';
        });

        const actionModal = el.querySelector('#wj-action-modal') as HTMLElement;
        actionModal?.addEventListener('click', (e) => {
            if (e.target === actionModal) actionModal.style.display = 'none';
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

        // Poll notification count every 15 seconds (only if authenticated)
        if (user) {
            this.updateNotifBadge(el);
            this.notifPollInterval = setInterval(() => {
                this.updateNotifBadge(el);
            }, 15000);
        }
    }

    hide(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.notifPollInterval) {
            clearInterval(this.notifPollInterval);
            this.notifPollInterval = null;
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
            } else if (tab === 'invited' && this.auth.isAuthenticated()) {
                const data = await this.api.request<{ sessions: SessionInfo[] }>('GET', '/sessions/invited');
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
                            : tab === 'invited'
                            ? 'No invited sessions yet.'
                            : 'No public sessions available.'}
                    </div>
                `;
                const gotoProjects = listEl.querySelector('#wj-goto-projects');
                gotoProjects?.addEventListener('click', () => this.router.navigate(ROUTES.PROJECTS));
                return;
            }

            this.sessions = new Map(sessions.map(s => [s.id, s]));
            listEl.innerHTML = sessions.map(s => `
                <div class="wj-session-card" data-session-id="${s.id}">
                    <div class="wj-session-info">
                        <div class="wj-session-name">${this.escapeHtml(s.name)}</div>
                        <div class="wj-session-meta">
                            <span class="wj-badge ${s.is_public ? 'wj-badge-public' : 'wj-badge-private'}">
                                ${s.is_public ? '🌐 Public' : '🔒 Private'}
                            </span>
                            <span>${this.escapeHtml(s.project_name)} · ${this.escapeHtml(s.owner_username)}</span>
                            ${s.is_locked ? '<span style="color:#ff6b6b; font-weight:500;">Locked</span>' : ''}
                        </div>
                    </div>
                    <div class="wj-participants">
                        <span class="wj-participants-dot ${s.participant_count > 0 ? '' : 'wj-empty'}"></span>
                        ${s.participant_count}/${s.max_users}
                    </div>
                    ${tab === 'mine' ? `
                    <button class="wj-btn wj-btn-secondary wj-hud-btn wj-invite-btn" data-session-id="${s.id}" title="Invite a collaborator">Invite</button>
                    <button class="wj-btn wj-btn-secondary wj-hud-btn wj-collab-btn" data-session-id="${s.id}" title="Manage collaborators">Collaborators</button>
                    ` : ''}
                    <button class="wj-btn wj-btn-secondary wj-hud-btn wj-dup-btn" data-session-id="${s.id}" title="Copy this session into one of your projects">Duplicate</button>
                    <button class="wj-btn wj-btn-primary wj-hud-btn">Join</button>
                </div>
            `).join('');

            const bindCardButton = (selector: string, open: (sessionId: string) => void) => {
                listEl.querySelectorAll(selector).forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const sessionId = (btn as HTMLElement).dataset.sessionId;
                        if (sessionId) open(sessionId);
                    });
                });
            };
            bindCardButton('.wj-dup-btn', id => this.openDuplicate(el, id));
            bindCardButton('.wj-invite-btn', id => showInviteDialog(this.openActionModal(el), this.api, id));
            bindCardButton('.wj-collab-btn', id => showCollaboratorsDialog(this.openActionModal(el), this.api, id));

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

    /**
     * Open the dialog copying a session into one of the user's projects. A visitor without an
     * account has no project to copy into: the dialog offers to create one, or to log in.
     */
    private async openDuplicate(el: HTMLElement, sessionId: string): Promise<void> {
        const { content, close } = this.openActionModal(el);

        if (!this.auth.getUser()) {
            content.innerHTML = `
                <h2 class="wj-modal-title">Duplicate Session</h2>
                <p class="wj-modal-text">Copying a session saves it into one of your projects: create an account, or log in, to duplicate it.</p>
                <div class="wj-modal-actions">
                    <button class="wj-btn wj-btn-secondary" id="wj-dup-cancel">Cancel</button>
                    <button class="wj-btn wj-btn-secondary" id="wj-dup-login">Log In</button>
                    <button class="wj-btn wj-btn-primary" id="wj-dup-register">Create Account</button>
                </div>
            `;
            content.querySelector('#wj-dup-cancel')?.addEventListener('click', close);
            content.querySelector('#wj-dup-login')?.addEventListener('click', () => this.router.navigate(ROUTES.LOGIN));
            content.querySelector('#wj-dup-register')?.addEventListener('click', () => this.router.navigate(ROUTES.REGISTER));
            return;
        }

        content.innerHTML = `<h2 class="wj-modal-title">Duplicate Session</h2><div class="wj-empty-state">Loading your projects...</div>`;
        let projects: ProjectInfo[];
        try {
            projects = (await this.api.request<{ projects: ProjectInfo[] }>('GET', '/projects')).projects;
        } catch (err) {
            console.error('[SessionBrowser] Failed to load projects:', err);
            content.innerHTML = `
                <h2 class="wj-modal-title">Duplicate Session</h2>
                <div class="wj-empty-state">Failed to load your projects.</div>
                <div class="wj-modal-actions"><button class="wj-btn wj-btn-secondary" id="wj-dup-cancel">Close</button></div>
            `;
            content.querySelector('#wj-dup-cancel')?.addEventListener('click', close);
            return;
        }

        if (projects.length === 0) {
            content.innerHTML = `
                <h2 class="wj-modal-title">Duplicate Session</h2>
                <p class="wj-modal-text">You have no project to copy this session into yet.</p>
                <div class="wj-modal-actions">
                    <button class="wj-btn wj-btn-secondary" id="wj-dup-cancel">Cancel</button>
                    <button class="wj-btn wj-btn-primary" id="wj-dup-projects">Create a Project</button>
                </div>
            `;
            content.querySelector('#wj-dup-cancel')?.addEventListener('click', close);
            content.querySelector('#wj-dup-projects')?.addEventListener('click', () => this.router.navigate(ROUTES.PROJECTS));
            return;
        }

        content.innerHTML = `
            <h2 class="wj-modal-title">Duplicate Session</h2>
            <div class="wj-form-group">
                <label class="wj-label">Copy into project</label>
                <select class="wj-input" id="wj-dup-project">
                    ${projects.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('')}
                </select>
            </div>
            <div class="wj-form-group">
                <label class="wj-label">Name of the copy</label>
                <input class="wj-input" type="text" id="wj-dup-name" />
            </div>
            <div class="wj-form-group">
                <label class="wj-label">Visibility</label>
                <select class="wj-input" id="wj-dup-visibility">
                    <option value="1">Public</option>
                    <option value="0">Private (Invite only)</option>
                </select>
            </div>
            <div class="wj-error" id="wj-dup-error"></div>
            <div class="wj-modal-actions">
                <button class="wj-btn wj-btn-secondary" id="wj-dup-cancel">Cancel</button>
                <button class="wj-btn wj-btn-primary" id="wj-dup-confirm">Duplicate</button>
            </div>
        `;
        const nameInput = content.querySelector('#wj-dup-name') as HTMLInputElement;
        const source = this.sessions.get(sessionId);
        nameInput.value = `${source?.name ?? 'Session'} (copy)`;
        const visibilitySelect = content.querySelector('#wj-dup-visibility') as HTMLSelectElement;
        visibilitySelect.value = source && !source.is_public ? '0' : '1';
        const errorEl = content.querySelector('#wj-dup-error') as HTMLElement;
        const confirmBtn = content.querySelector('#wj-dup-confirm') as HTMLButtonElement;
        content.querySelector('#wj-dup-cancel')?.addEventListener('click', close);

        confirmBtn.addEventListener('click', async () => {
            const projectId = (content.querySelector('#wj-dup-project') as HTMLSelectElement).value;
            const name = nameInput.value.trim();
            if (!name) {
                errorEl.textContent = 'Please give the copy a name.';
                errorEl.classList.add('wj-visible');
                return;
            }
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Duplicating...';
            try {
                const isPublic = visibilitySelect.value === '1';
                const { session } = await this.api.request<{ session: { id: string } }>('POST', `/sessions/${sessionId}/duplicate`, { projectId, name, isPublic });
                content.innerHTML = `
                    <h2 class="wj-modal-title">Session Duplicated</h2>
                    <p class="wj-modal-text"><strong>${this.escapeHtml(name)}</strong> was added to your project.</p>
                    <div class="wj-modal-actions">
                        <button class="wj-btn wj-btn-secondary" id="wj-dup-cancel">Close</button>
                        <button class="wj-btn wj-btn-primary" id="wj-dup-open">Open Session</button>
                    </div>
                `;
                content.querySelector('#wj-dup-cancel')?.addEventListener('click', close);
                content.querySelector('#wj-dup-open')?.addEventListener('click', () => this.router.navigate(ROUTES.APP, { session: session.id }));
            } catch (err) {
                console.error('[SessionBrowser] Failed to duplicate session:', err);
                errorEl.textContent = 'Failed to duplicate the session.';
                errorEl.classList.add('wj-visible');
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Duplicate';
            }
        });
    }

    /** Show the modal of the actions on a session card, and how to close it */
    private openActionModal(el: HTMLElement): DialogTarget {
        const modal = el.querySelector('#wj-action-modal') as HTMLElement;
        const content = el.querySelector('#wj-action-content') as HTMLElement;
        modal.style.display = 'flex';
        return { content, close: () => { modal.style.display = 'none'; } };
    }

    private async updateNotifBadge(el: HTMLElement): Promise<void> {
        try {
            const data = await this.api.request<{ count: number }>('GET', '/notifications/count');
            const badge = el.querySelector('#wj-notif-badge');
            if (badge) {
                if (data.count > 0) {
                    badge.textContent = String(data.count);
                    badge.classList.remove('wj-hidden');
                } else {
                    badge.classList.add('wj-hidden');
                }
            }
        } catch {
            // Silently ignore badge fetch errors
        }
    }

    private async loadNotifications(el: HTMLElement): Promise<void> {
        const listEl = el.querySelector('#wj-notif-list') as HTMLElement;
        if (!listEl) return;

        try {
            const data = await this.api.request<{ notifications: NotificationInfo[] }>('GET', '/notifications');
            const notifications = data.notifications;

            if (notifications.length === 0) {
                listEl.innerHTML = '<div class="wj-empty-state">No pending notifications</div>';
                return;
            }

            listEl.innerHTML = notifications.map(n => `
                <div class="wj-notif-item" data-notif-id="${n.id}">
                    <div class="wj-notif-item-info">
                        <div class="wj-notif-item-title">
                            <strong>${this.escapeHtml(n.from_username)}</strong> invited you to
                            <strong>${this.escapeHtml(n.session_name)}</strong>
                        </div>
                        <div class="wj-notif-item-meta">${new Date(n.created_at).toLocaleString()}</div>
                    </div>
                    <div class="wj-notif-actions">
                        <button class="wj-btn wj-btn-primary wj-notif-accept" data-notif-id="${n.id}">Accept</button>
                        <button class="wj-btn wj-btn-secondary wj-notif-decline" data-notif-id="${n.id}">Decline</button>
                    </div>
                </div>
            `).join('');

            // Accept handlers
            listEl.querySelectorAll('.wj-notif-accept').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const notifId = (btn as HTMLElement).dataset.notifId;
                    if (!notifId) return;
                    try {
                        await this.api.request('POST', `/notifications/${notifId}/accept`);
                        this.loadNotifications(el);
                        this.updateNotifBadge(el);
                    } catch (err) {
                        console.error('[Notifications] Accept failed:', err);
                    }
                });
            });

            // Decline handlers
            listEl.querySelectorAll('.wj-notif-decline').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const notifId = (btn as HTMLElement).dataset.notifId;
                    if (!notifId) return;
                    try {
                        await this.api.request('POST', `/notifications/${notifId}/decline`);
                        this.loadNotifications(el);
                        this.updateNotifBadge(el);
                    } catch (err) {
                        console.error('[Notifications] Decline failed:', err);
                    }
                });
            });
        } catch (err) {
            console.error('[Notifications] Failed to load:', err);
            listEl.innerHTML = '<div class="wj-empty-state">Failed to load notifications</div>';
        }
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
