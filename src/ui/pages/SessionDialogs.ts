import { ApiClient, ApiError } from '../../auth/ApiClient.ts';

/**
 * Dialogs acting on one of the user's sessions, shared by the pages that list them: the projects
 * page and the session browser. Each fills a modal the page owns and shows.
 */

export interface CollaboratorInfo {
    id: string;
    username: string;
    granted_at: string;
}

/** A shown modal: the element to fill, and how to close it */
export interface DialogTarget {
    content: HTMLElement;
    close: () => void;
}

/** Invite a user, by username, to a session. The outcome is shown in the dialog. */
export function showInviteDialog({ content, close }: DialogTarget, api: ApiClient, sessionId: string): void {
    content.innerHTML = `
        <h2 class="wj-modal-title">Invite Collaborator</h2>
        <div class="wj-form-group">
            <label class="wj-label" for="wj-invite-username">Username</label>
            <input class="wj-input" type="text" id="wj-invite-username" placeholder="Enter username" />
        </div>
        <div class="wj-error" id="wj-invite-error"></div>
        <div class="wj-modal-actions">
            <button class="wj-btn wj-btn-secondary" id="wj-invite-cancel">Cancel</button>
            <button class="wj-btn wj-btn-primary" id="wj-invite-submit">Invite</button>
        </div>
    `;
    const usernameInput = content.querySelector('#wj-invite-username') as HTMLInputElement;
    const errorEl = content.querySelector('#wj-invite-error') as HTMLElement;
    usernameInput.focus();
    content.querySelector('#wj-invite-cancel')?.addEventListener('click', close);
    content.querySelector('#wj-invite-submit')?.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) {
            usernameInput.focus();
            return;
        }
        try {
            await api.request('POST', `/sessions/${sessionId}/invite`, { username });
            content.innerHTML = `
                <h2 class="wj-modal-title">Invite Collaborator</h2>
                <p class="wj-modal-text">Invitation sent to <strong>${escapeHtml(username)}</strong>.</p>
                <div class="wj-modal-actions"><button class="wj-btn wj-btn-secondary" id="wj-invite-close">Close</button></div>
            `;
            content.querySelector('#wj-invite-close')?.addEventListener('click', close);
        } catch (e) {
            errorEl.textContent = e instanceof ApiError ? e.message : 'Failed to send invitation';
            errorEl.classList.add('wj-visible');
        }
    });
}

/** List the collaborators of a session, with a way to remove each */
export async function showCollaboratorsDialog(target: DialogTarget, api: ApiClient, sessionId: string): Promise<void> {
    const { content, close } = target;
    content.innerHTML = `
        <h2 class="wj-modal-title">Collaborators</h2>
        <div id="wj-collaborators-list"><div class="wj-empty-state">Loading...</div></div>
        <div class="wj-modal-actions"><button class="wj-btn wj-btn-secondary" id="wj-collaborators-close">Close</button></div>
    `;
    content.querySelector('#wj-collaborators-close')?.addEventListener('click', close);
    const list = content.querySelector('#wj-collaborators-list') as HTMLElement;

    try {
        const data = await api.request<{ collaborators: CollaboratorInfo[] }>('GET', `/sessions/${sessionId}/collaborators`);
        if (data.collaborators.length === 0) {
            list.innerHTML = '<div class="wj-empty-state">No collaborators yet.</div>';
            return;
        }
        list.innerHTML = data.collaborators.map(collaborator => `
            <div class="wj-collab-item" data-user-id="${escapeHtml(collaborator.id)}">
                <div>
                    <div class="wj-collab-name">${escapeHtml(collaborator.username)}</div>
                    <div class="wj-collab-date">Added ${new Date(collaborator.granted_at).toLocaleString()}</div>
                </div>
                <button class="wj-collab-remove" data-user-id="${escapeHtml(collaborator.id)}">Remove</button>
            </div>
        `).join('');
        list.querySelectorAll('.wj-collab-remove').forEach(button => {
            button.addEventListener('click', async () => {
                const userId = (button as HTMLElement).dataset.userId;
                if (!userId || !confirm('Remove this collaborator?')) return;
                try {
                    await api.request('DELETE', `/sessions/${sessionId}/collaborators`, { userId });
                    await showCollaboratorsDialog(target, api, sessionId);
                } catch (e) {
                    alert(e instanceof ApiError ? e.message : 'Failed to remove collaborator');
                }
            });
        });
    } catch (e) {
        list.innerHTML = `<div class="wj-empty-state">${escapeHtml(e instanceof ApiError ? e.message : 'Failed to load collaborators')}</div>`;
    }
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
