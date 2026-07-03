import { ApiClient } from '../../auth/ApiClient.ts';
import { HashRouter } from '../../router/HashRouter.ts';
import { ROUTES } from '../../router/routes.ts';
import { MicrophoneSystem, type MicrophoneState } from '../../app/MicrophoneSystem.ts';

/**
 * In-game HUD showing session info and a leave button.
 */
export class SessionHUD {
    private element: HTMLDivElement | null = null;
    private pollInterval: ReturnType<typeof setInterval> | null = null;
    private micObserver: { remove(): void } | null = null;

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
            <div class="wj-hud-mic" id="wj-hud-mic">
                <button class="wj-btn wj-btn-secondary wj-hud-btn" id="wj-hud-mic-mode">Mic</button>
                <button class="wj-btn wj-btn-secondary wj-hud-btn" id="wj-hud-mic-monitor">Monitor</button>
                <button class="wj-btn wj-btn-secondary wj-hud-btn" id="wj-hud-mic-talk" hidden>Talk</button>
                <span class="wj-hud-mic-level" id="wj-hud-mic-level"><span></span></span>
            </div>
            <button class="wj-btn wj-btn-secondary wj-hud-btn" id="wj-hud-leave">Leave Session</button>
        `;

        container.appendChild(el);
        this.element = el;

        const leaveBtn = el.querySelector('#wj-hud-leave');
        leaveBtn?.addEventListener('click', () => {
            this.router.navigate(ROUTES.SESSIONS);
        });

        if (MicrophoneSystem.hasInstance()) {
            const microphone = MicrophoneSystem.getInstance()
            const modeBtn = el.querySelector<HTMLButtonElement>('#wj-hud-mic-mode')
            const monitorBtn = el.querySelector<HTMLButtonElement>('#wj-hud-mic-monitor')
            const talkBtn = el.querySelector<HTMLButtonElement>('#wj-hud-mic-talk')
            const levelEl = el.querySelector<HTMLSpanElement>('#wj-hud-mic-level')

            modeBtn?.addEventListener('click', () => {
                void microphone.cycleMode()
            })
            monitorBtn?.addEventListener('click', () => {
                void microphone.toggleMonitor()
            })
            talkBtn?.addEventListener('click', () => {
                void microphone.toggleTalkLatch()
            })

            const renderMic = (state: MicrophoneState) => {
                if (modeBtn) modeBtn.textContent = `Mic: ${microphone.getModeLabel()}`
                if (monitorBtn) monitorBtn.textContent = `Monitor: ${state.monitorEnabled ? 'On' : 'Off'}`
                if (talkBtn) {
                    talkBtn.hidden = state.mode !== 'push_to_talk'
                    talkBtn.textContent = state.talkActive ? 'Talk: On' : 'Talk: Off'
                }
                if (levelEl) {
                    levelEl.style.setProperty('--wj-mic-level', `${Math.round(state.level * 100)}%`)
                    levelEl.classList.toggle('is-live', state.talkActive)
                    levelEl.title = state.error ?? 'Hold T in push-to-talk mode for desktop testing.'
                }
            }

            renderMic(microphone.getState())
            this.micObserver = microphone.onStateChanged.add(renderMic)
        }

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
        if (this.micObserver) {
            this.micObserver.remove();
            this.micObserver = null;
        }
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
