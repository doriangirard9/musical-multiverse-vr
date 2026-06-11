import { ApiClient } from '../../auth/ApiClient.ts';
import { HashRouter } from '../../router/HashRouter.ts';
import { ROUTES } from '../../router/routes.ts';

/**
 * In-game HUD showing session info and a leave button.
 */
export class SessionHUD {
    private element: HTMLDivElement | null = null;
    private pollInterval: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly api: ApiClient,
        private readonly router: HashRouter,
    ) {}

    show(container: HTMLElement, sessionId: string, sessionName: string, maxUsers: number, participantCount: number): void {
        this.hide();

        const el = document.createElement('div');
        el.className = 'wj-hud';
        el.id = 'wj-session-hud';
        el.innerHTML = `
            <div class="wj-hud-info">
                <strong>${this.escapeHtml(sessionName)}</strong>
                <span class="wj-participants" id="wj-hud-participants">
                    <span class="wj-participants-dot"></span>
                    ${participantCount}/${maxUsers}
                </span>
            </div>
            <button class="wj-btn wj-btn-secondary wj-hud-btn" id="wj-hud-leave">Leave Session</button>
        `;

        container.appendChild(el);
        this.element = el;

        const leaveBtn = el.querySelector('#wj-hud-leave');
        leaveBtn?.addEventListener('click', () => {
            this.router.navigate(ROUTES.SESSIONS);
        });

        // Poll participant count
        this.pollInterval = setInterval(async () => {
            try {
                const data = await this.api.request<{ participantCount: number }>('GET', `/sessions/${sessionId}/participants`);
                const partsEl = el.querySelector('#wj-hud-participants');
                if (partsEl) {
                    partsEl.innerHTML = `
                        <span class="wj-participants-dot"></span>
                        ${data.participantCount}/${maxUsers}
                    `;
                }
            } catch {
                // Ignore poll errors
            }
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

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
