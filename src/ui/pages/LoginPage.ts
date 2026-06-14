import { AuthService, ApiError } from '../../auth/AuthService.ts';
import { HashRouter } from '../../router/HashRouter.ts';
import { ROUTES } from '../../router/routes.ts';

/**
 * Login page overlay.
 * Renders a form for username + password login.
 */
export class LoginPage {
    private element: HTMLDivElement | null = null;

    constructor(
        private readonly auth: AuthService,
        private readonly router: HashRouter,
    ) {}

    show(container: HTMLElement): void {
        this.hide();

        const el = document.createElement('div');
        el.className = 'wj-page-overlay';
        el.id = 'wj-login-page';
        el.innerHTML = `
            <div class="wj-container">
                <div class="wj-card">
                    <h1 class="wj-title">🎵 WAM Jam Party</h1>
                    <p class="wj-subtitle">Collaborative music creation in VR</p>

                    <div id="wj-login-error" class="wj-error"></div>

                    <div class="wj-form-group">
                        <label class="wj-label" for="wj-login-username">Username</label>
                        <input class="wj-input" type="text" id="wj-login-username"
                               placeholder="Enter your username" autocomplete="username" />
                    </div>

                    <div class="wj-form-group">
                        <label class="wj-label" for="wj-login-password">Password</label>
                        <input class="wj-input" type="password" id="wj-login-password"
                               placeholder="Enter your password" autocomplete="current-password" />
                    </div>

                    <button class="wj-btn wj-btn-primary wj-btn-block" id="wj-login-submit">
                        Log In
                    </button>

                    <div class="wj-divider">or</div>

                    <button class="wj-btn wj-btn-secondary wj-btn-block" id="wj-login-guest">
                        Continue as Guest
                    </button>

                    <div style="text-align: center; margin-top: 16px;">
                        <span class="wj-link" id="wj-login-to-register">
                            Don't have an account? Sign up
                        </span>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(el);
        this.element = el;

        // Event listeners
        const submitBtn = el.querySelector('#wj-login-submit') as HTMLButtonElement;
        const guestBtn = el.querySelector('#wj-login-guest') as HTMLButtonElement;
        const registerLink = el.querySelector('#wj-login-to-register') as HTMLElement;
        const usernameInput = el.querySelector('#wj-login-username') as HTMLInputElement;
        const passwordInput = el.querySelector('#wj-login-password') as HTMLInputElement;

        submitBtn.addEventListener('click', () => this.handleLogin(el));

        // Enter key submits the form
        const handleEnter = (e: KeyboardEvent) => {
            if (e.key === 'Enter') this.handleLogin(el);
        };
        usernameInput.addEventListener('keydown', handleEnter);
        passwordInput.addEventListener('keydown', handleEnter);

        guestBtn.addEventListener('click', () => {
            this.router.navigate(ROUTES.SESSIONS);
        });

        registerLink.addEventListener('click', () => {
            this.router.navigate(ROUTES.REGISTER);
        });

        // Focus username input
        setTimeout(() => usernameInput.focus(), 100);
    }

    hide(): void {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }

    private async handleLogin(el: HTMLElement): Promise<void> {
        const username = (el.querySelector('#wj-login-username') as HTMLInputElement).value.trim();
        const password = (el.querySelector('#wj-login-password') as HTMLInputElement).value;
        const errorEl = el.querySelector('#wj-login-error') as HTMLElement;
        const submitBtn = el.querySelector('#wj-login-submit') as HTMLButtonElement;

        errorEl.classList.remove('wj-visible');

        if (!username || !password) {
            errorEl.textContent = 'Please enter username and password';
            errorEl.classList.add('wj-visible');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';

        try {
            await this.auth.login(username, password);
            this.router.navigate(ROUTES.SESSIONS);
        } catch (e) {
            const msg = e instanceof ApiError ? e.message : 'Login failed';
            errorEl.textContent = msg;
            errorEl.classList.add('wj-visible');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log In';
        }
    }
}
