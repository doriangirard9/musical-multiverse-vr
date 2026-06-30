import { AuthService, ApiError } from '../../auth/AuthService.ts';
import { HashRouter } from '../../router/HashRouter.ts';
import { ROUTES } from '../../router/routes.ts';

/**
 * Registration page overlay.
 */
export class RegisterPage {
    private element: HTMLDivElement | null = null;

    constructor(
        private readonly auth: AuthService,
        private readonly router: HashRouter,
    ) {}

    show(container: HTMLElement): void {
        this.hide();

        const el = document.createElement('div');
        el.className = 'wj-page-overlay';
        el.id = 'wj-register-page';
        el.innerHTML = `
            <div class="wj-container">
                <div class="wj-card">
                    <h1 class="wj-title">Create Account</h1>
                    <p class="wj-subtitle">Join WAM Jam Party</p>

                    <div id="wj-register-error" class="wj-error"></div>

                    <div class="wj-form-group">
                        <label class="wj-label" for="wj-register-username">Username</label>
                        <input class="wj-input" type="text" id="wj-register-username"
                               placeholder="Choose a username (3-32 chars)" autocomplete="username" />
                    </div>

                    <div class="wj-form-group">
                        <label class="wj-label" for="wj-register-password">Password</label>
                        <input class="wj-input" type="password" id="wj-register-password"
                               placeholder="At least 6 characters" autocomplete="new-password" />
                    </div>

                    <div class="wj-form-group">
                        <label class="wj-label" for="wj-register-confirm">Confirm Password</label>
                        <input class="wj-input" type="password" id="wj-register-confirm"
                               placeholder="Re-enter your password" autocomplete="new-password" />
                    </div>

                    <button class="wj-btn wj-btn-primary wj-btn-block" id="wj-register-submit">
                        Create Account
                    </button>

                    <div style="text-align: center; margin-top: 16px;">
                        <span class="wj-link" id="wj-register-to-login">
                            Already have an account? Log in
                        </span>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(el);
        this.element = el;

        const submitBtn = el.querySelector('#wj-register-submit') as HTMLButtonElement;
        const loginLink = el.querySelector('#wj-register-to-login') as HTMLElement;
        const inputs = el.querySelectorAll('.wj-input') as NodeListOf<HTMLInputElement>;

        submitBtn.addEventListener('click', () => this.handleRegister(el));

        inputs.forEach(input => {
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') this.handleRegister(el);
            });
        });

        loginLink.addEventListener('click', () => {
            this.router.navigate(ROUTES.LOGIN);
        });

        setTimeout(() => (el.querySelector('#wj-register-username') as HTMLInputElement).focus(), 100);
    }

    hide(): void {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }

    private async handleRegister(el: HTMLElement): Promise<void> {
        const username = (el.querySelector('#wj-register-username') as HTMLInputElement).value.trim();
        const password = (el.querySelector('#wj-register-password') as HTMLInputElement).value;
        const confirm = (el.querySelector('#wj-register-confirm') as HTMLInputElement).value;
        const errorEl = el.querySelector('#wj-register-error') as HTMLElement;
        const submitBtn = el.querySelector('#wj-register-submit') as HTMLButtonElement;

        errorEl.classList.remove('wj-visible');

        if (!username || !password) {
            errorEl.textContent = 'All fields are required';
            errorEl.classList.add('wj-visible');
            return;
        }
        if (username.length < 3 || username.length > 32) {
            errorEl.textContent = 'Username must be 3-32 characters';
            errorEl.classList.add('wj-visible');
            return;
        }
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            errorEl.classList.add('wj-visible');
            return;
        }
        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match';
            errorEl.classList.add('wj-visible');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';

        try {
            await this.auth.register(username, password);
            this.router.navigate(ROUTES.SESSIONS);
        } catch (e) {
            const msg = e instanceof ApiError ? e.message : 'Registration failed';
            errorEl.textContent = msg;
            errorEl.classList.add('wj-visible');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
        }
    }
}
