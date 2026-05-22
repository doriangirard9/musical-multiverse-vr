import { ApiClient } from '../../auth/ApiClient.ts';
import { HashRouter } from '../../router/HashRouter.ts';
import { ROUTES } from '../../router/routes.ts';

interface ProjectInfo {
    id: string;
    name: string;
    description: string;
    session_count: number;
}

/**
 * Projects page — Manage user's projects and create sessions within them.
 */
export class ProjectsPage {
    private element: HTMLDivElement | null = null;
    private projects: ProjectInfo[] = [];

    constructor(
        private readonly api: ApiClient,
        private readonly router: HashRouter,
    ) {}

    show(container: HTMLElement): void {
        this.hide();

        const el = document.createElement('div');
        el.className = 'wj-page-overlay';
        el.id = 'wj-projects-page';
        el.innerHTML = `
            <div class="wj-container wj-container-wide">
                <div class="wj-toolbar">
                    <button class="wj-btn wj-btn-ghost" id="wj-nav-back">← Back</button>
                    <h1 class="wj-title" style="margin:0;">My Projects</h1>
                    <button class="wj-btn wj-btn-primary" id="wj-new-project-btn">+ New Project</button>
                </div>

                <div id="wj-projects-error" class="wj-error"></div>

                <!-- New Project Form (Hidden by default) -->
                <div id="wj-new-project-form" class="wj-card" style="display:none; margin-bottom: 24px;">
                    <h2 class="wj-section-title">Create Project</h2>
                    <div class="wj-form-group">
                        <label class="wj-label">Project Name</label>
                        <input class="wj-input" type="text" id="wj-project-name" placeholder="e.g. My Band's Album" />
                    </div>
                    <div class="wj-form-group">
                        <label class="wj-label">Description (optional)</label>
                        <input class="wj-input" type="text" id="wj-project-desc" placeholder="Brief description" />
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="wj-btn wj-btn-primary" id="wj-create-project-submit">Create</button>
                        <button class="wj-btn wj-btn-secondary" id="wj-create-project-cancel">Cancel</button>
                    </div>
                </div>

                <!-- New Session Form Modal (Hidden by default) -->
                <div id="wj-new-session-modal" class="wj-modal-backdrop" style="display:none;">
                    <div class="wj-modal">
                        <h2 class="wj-modal-title">Create Session</h2>
                        <input type="hidden" id="wj-session-project-id" />
                        <div class="wj-form-group">
                            <label class="wj-label">Session Name</label>
                            <input class="wj-input" type="text" id="wj-session-name" placeholder="e.g. Jam Session 1" />
                        </div>
                        <div class="wj-form-group">
                            <label class="wj-label">Visibility</label>
                            <select class="wj-input" id="wj-session-visibility">
                                <option value="1">Public (Visible to everyone)</option>
                                <option value="0">Private (Invite only)</option>
                            </select>
                        </div>
                        <div class="wj-form-group">
                            <label class="wj-label">Max Users</label>
                            <input class="wj-input" type="number" id="wj-session-max-users" value="32" min="1" max="100" />
                        </div>
                        <div class="wj-modal-actions">
                            <button class="wj-btn wj-btn-secondary" id="wj-create-session-cancel">Cancel</button>
                            <button class="wj-btn wj-btn-primary" id="wj-create-session-submit">Create</button>
                        </div>
                    </div>
                </div>

                <div id="wj-projects-list" class="wj-session-list">
                    <div class="wj-empty-state">Loading projects...</div>
                </div>
            </div>
        `;

        container.appendChild(el);
        this.element = el;

        this.setupEventListeners(el);
        this.loadProjects(el);
    }

    hide(): void {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }

    private setupEventListeners(el: HTMLElement): void {
        const backBtn = el.querySelector('#wj-nav-back');
        backBtn?.addEventListener('click', () => this.router.navigate(ROUTES.SESSIONS));

        // New Project toggle
        const newProjBtn = el.querySelector('#wj-new-project-btn');
        const newProjForm = el.querySelector('#wj-new-project-form') as HTMLElement;
        const cancelProjBtn = el.querySelector('#wj-create-project-cancel');
        const submitProjBtn = el.querySelector('#wj-create-project-submit');

        newProjBtn?.addEventListener('click', () => {
            newProjForm.style.display = 'block';
            (el.querySelector('#wj-project-name') as HTMLElement).focus();
        });

        cancelProjBtn?.addEventListener('click', () => {
            newProjForm.style.display = 'none';
        });

        submitProjBtn?.addEventListener('click', () => this.handleCreateProject(el));

        // New Session modal toggle
        const cancelSessionBtn = el.querySelector('#wj-create-session-cancel');
        const submitSessionBtn = el.querySelector('#wj-create-session-submit');
        const sessionModal = el.querySelector('#wj-new-session-modal') as HTMLElement;

        cancelSessionBtn?.addEventListener('click', () => {
            sessionModal.style.display = 'none';
        });

        submitSessionBtn?.addEventListener('click', () => this.handleCreateSession(el));
    }

    private async loadProjects(el: HTMLElement): Promise<void> {
        const listEl = el.querySelector('#wj-projects-list');
        const errorEl = el.querySelector('#wj-projects-error') as HTMLElement;
        if (!listEl) return;

        try {
            const data = await this.api.request<{ projects: ProjectInfo[] }>('GET', '/projects');
            this.projects = data.projects;

            if (this.projects.length === 0) {
                listEl.innerHTML = `<div class="wj-empty-state">You don't have any projects yet. Click "New Project" to start.</div>`;
                return;
            }

            listEl.innerHTML = this.projects.map(p => `
                <div class="wj-card" style="margin-bottom: 16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="margin:0; font-family:var(--font); color:var(--text-primary); font-size:16px;">${this.escapeHtml(p.name)}</h3>
                            ${p.description ? `<p style="margin:4px 0 0 0; font-family:var(--font); color:var(--text-secondary); font-size:13px;">${this.escapeHtml(p.description)}</p>` : ''}
                        </div>
                        <div style="display:flex; gap:8px;">
                            <span class="wj-badge" style="background:var(--bg-hover); color:var(--text-secondary);">${p.session_count} sessions</span>
                            <button class="wj-btn wj-btn-secondary wj-btn-new-session" data-project-id="${p.id}">+ Session</button>
                            <button class="wj-btn wj-btn-danger wj-btn-delete-proj" data-project-id="${p.id}">Delete</button>
                        </div>
                    </div>
                </div>
            `).join('');

            // Bind New Session buttons
            listEl.querySelectorAll('.wj-btn-new-session').forEach(btn => {
                btn.addEventListener('click', () => {
                    const projectId = (btn as HTMLElement).dataset.projectId;
                    if (projectId) this.showNewSessionModal(el, projectId);
                });
            });

            // Bind Delete buttons
            listEl.querySelectorAll('.wj-btn-delete-proj').forEach(btn => {
                btn.addEventListener('click', () => {
                    const projectId = (btn as HTMLElement).dataset.projectId;
                    if (projectId && confirm('Are you sure? This will delete the project and all its sessions.')) {
                        this.handleDeleteProject(el, projectId);
                    }
                });
            });

        } catch (e) {
            errorEl.textContent = 'Failed to load projects';
            errorEl.classList.add('wj-visible');
        }
    }

    private async handleCreateProject(el: HTMLElement): Promise<void> {
        const nameInput = el.querySelector('#wj-project-name') as HTMLInputElement;
        const descInput = el.querySelector('#wj-project-desc') as HTMLInputElement;
        const errorEl = el.querySelector('#wj-projects-error') as HTMLElement;

        errorEl.classList.remove('wj-visible');

        if (!nameInput.value.trim()) {
            errorEl.textContent = 'Project name is required';
            errorEl.classList.add('wj-visible');
            return;
        }

        try {
            await this.api.request('POST', '/projects', {
                name: nameInput.value.trim(),
                description: descInput.value.trim()
            });

            nameInput.value = '';
            descInput.value = '';
            (el.querySelector('#wj-new-project-form') as HTMLElement).style.display = 'none';
            await this.loadProjects(el);
        } catch (e) {
            const msg = e instanceof ApiError ? e.message : 'Failed to create project';
            errorEl.textContent = msg;
            errorEl.classList.add('wj-visible');
        }
    }

    private async handleDeleteProject(el: HTMLElement, id: string): Promise<void> {
        const errorEl = el.querySelector('#wj-projects-error') as HTMLElement;
        try {
            await this.api.request('DELETE', `/projects/${id}`);
            await this.loadProjects(el);
        } catch (e) {
            const msg = e instanceof ApiError ? e.message : 'Failed to delete project';
            errorEl.textContent = msg;
            errorEl.classList.add('wj-visible');
        }
    }

    private showNewSessionModal(el: HTMLElement, projectId: string): void {
        const modal = el.querySelector('#wj-new-session-modal') as HTMLElement;
        const projIdInput = el.querySelector('#wj-session-project-id') as HTMLInputElement;
        const nameInput = el.querySelector('#wj-session-name') as HTMLInputElement;
        
        projIdInput.value = projectId;
        nameInput.value = '';
        modal.style.display = 'flex';
        nameInput.focus();
    }

    private async handleCreateSession(el: HTMLElement): Promise<void> {
        const modal = el.querySelector('#wj-new-session-modal') as HTMLElement;
        const projIdInput = el.querySelector('#wj-session-project-id') as HTMLInputElement;
        const nameInput = el.querySelector('#wj-session-name') as HTMLInputElement;
        const visSelect = el.querySelector('#wj-session-visibility') as HTMLSelectElement;
        const maxInput = el.querySelector('#wj-session-max-users') as HTMLInputElement;
        const errorEl = el.querySelector('#wj-projects-error') as HTMLElement;

        if (!nameInput.value.trim()) {
            alert('Session name is required');
            return;
        }

        try {
            const data = await this.api.request<{ session: { id: string } }>('POST', '/sessions', {
                projectId: projIdInput.value,
                name: nameInput.value.trim(),
                isPublic: visSelect.value === '1',
                maxUsers: parseInt(maxInput.value, 10) || 32
            });

            modal.style.display = 'none';
            // Automatically navigate to the new session
            this.router.navigate(ROUTES.APP, { session: data.session.id });
        } catch (e) {
            const msg = e instanceof ApiError ? e.message : 'Failed to create session';
            errorEl.textContent = msg;
            errorEl.classList.add('wj-visible');
            modal.style.display = 'none';
        }
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
