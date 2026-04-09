/**
 * =============================================================================
 * WAM Jam Party - Composant UI de Login
 * =============================================================================
 * Ce composant gère l'interface de connexion/inscription.
 * Il affiche un formulaire modal avant l'entrée dans l'application.
 * =============================================================================
 */

import { authService, User } from './AuthService';

/**
 * Classe qui gère l'UI de login
 */
export class LoginUI {
    private container: HTMLElement;
    private onSuccess: (user: User) => void;
    private isRegisterMode = false;

    constructor(onSuccess: (user: User) => void) {
        this.onSuccess = onSuccess;
        this.container = this.createContainer();
        document.body.appendChild(this.container);
        this.setupEventListeners();
    }

    /**
     * Crée le conteneur HTML du formulaire
     */
    private createContainer(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'login-container';
        container.innerHTML = `
            <style>
                #login-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }

                .login-card {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 20px;
                    padding: 40px;
                    width: 100%;
                    max-width: 400px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .login-header {
                    text-align: center;
                    margin-bottom: 30px;
                }

                .login-header h1 {
                    color: #fff;
                    font-size: 2em;
                    margin: 0 0 10px 0;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }

                .login-header p {
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0;
                }

                .login-form {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .form-group label {
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 0.9em;
                    font-weight: 500;
                }

                .form-group input {
                    padding: 14px 16px;
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }

                .form-group input:focus {
                    outline: none;
                    border-color: #e94560;
                    background: rgba(255, 255, 255, 0.15);
                }

                .form-group input::placeholder {
                    color: rgba(255, 255, 255, 0.4);
                }

                .email-group {
                    display: none;
                }

                .email-group.visible {
                    display: flex;
                }

                .submit-btn {
                    padding: 14px;
                    background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
                    border: none;
                    border-radius: 10px;
                    color: #fff;
                    font-size: 1.1em;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-top: 10px;
                }

                .submit-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(233, 69, 96, 0.4);
                }

                .submit-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }

                .guest-btn {
                    padding: 14px;
                    background: transparent;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 10px;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 1em;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-top: 5px;
                }

                .guest-btn:hover {
                    border-color: rgba(255, 255, 255, 0.5);
                    background: rgba(255, 255, 255, 0.1);
                }

                .guest-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .divider {
                    display: flex;
                    align-items: center;
                    text-align: center;
                    margin: 15px 0;
                    color: rgba(255, 255, 255, 0.4);
                }

                .divider::before,
                .divider::after {
                    content: '';
                    flex: 1;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                }

                .divider span {
                    padding: 0 15px;
                    font-size: 0.85em;
                }

                .toggle-mode {
                    text-align: center;
                    margin-top: 20px;
                }

                .toggle-mode span {
                    color: rgba(255, 255, 255, 0.6);
                }

                .toggle-mode a {
                    color: #e94560;
                    text-decoration: none;
                    font-weight: 500;
                    cursor: pointer;
                }

                .toggle-mode a:hover {
                    text-decoration: underline;
                }

                .error-message {
                    background: rgba(255, 0, 0, 0.2);
                    border: 1px solid rgba(255, 0, 0, 0.3);
                    color: #ff6b6b;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    display: none;
                }

                .error-message.visible {
                    display: block;
                }

                .success-message {
                    background: rgba(0, 255, 0, 0.2);
                    border: 1px solid rgba(0, 255, 0, 0.3);
                    color: #6bff6b;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    display: none;
                }

                .success-message.visible {
                    display: block;
                }

                .loading {
                    display: inline-block;
                    width: 20px;
                    height: 20px;
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

                /* Animation d'entrée */
                .login-card {
                    animation: slideIn 0.5s ease-out;
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            </style>

            <div class="login-card">
                <div class="login-header">
                    <h1>WAM Jam Party</h1>
                    <p id="login-subtitle">Connectez-vous pour commencer</p>
                </div>

                <div class="error-message" id="error-message"></div>
                <div class="success-message" id="success-message"></div>

                <form class="login-form" id="login-form">
                    <div class="form-group">
                        <label for="username">Nom d'utilisateur</label>
                        <input type="text" id="username" name="username"
                               placeholder="Entrez votre nom d'utilisateur"
                               autocomplete="username" required>
                    </div>

                    <div class="form-group email-group" id="email-group">
                        <label for="email">Email (optionnel)</label>
                        <input type="email" id="email" name="email"
                               placeholder="votre@email.com"
                               autocomplete="email">
                    </div>

                    <div class="form-group">
                        <label for="password">Mot de passe</label>
                        <input type="password" id="password" name="password"
                               placeholder="Entrez votre mot de passe"
                               autocomplete="current-password" required>
                    </div>

                    <button type="submit" class="submit-btn" id="submit-btn">
                        Se connecter
                    </button>

                    <div class="divider"><span>ou</span></div>

                    <button type="button" class="guest-btn" id="guest-btn">
                        Continuer en tant qu'invité
                    </button>
                </form>

                <div class="toggle-mode">
                    <span id="toggle-text">Pas encore de compte ? </span>
                    <a id="toggle-link">Créer un compte</a>
                </div>
            </div>
        `;
        return container;
    }

    /**
     * Configure les event listeners
     */
    private setupEventListeners(): void {
        const form = this.container.querySelector('#login-form') as HTMLFormElement;
        const toggleLink = this.container.querySelector('#toggle-link') as HTMLElement;
        const guestBtn = this.container.querySelector('#guest-btn') as HTMLButtonElement;

        form.addEventListener('submit', (e) => this.handleSubmit(e));
        toggleLink.addEventListener('click', () => this.toggleMode());
        guestBtn.addEventListener('click', () => this.handleGuestLogin());
    }

    /**
     * Bascule entre mode login et register
     */
    private toggleMode(): void {
        this.isRegisterMode = !this.isRegisterMode;

        const subtitle = this.container.querySelector('#login-subtitle') as HTMLElement;
        const emailGroup = this.container.querySelector('#email-group') as HTMLElement;
        const submitBtn = this.container.querySelector('#submit-btn') as HTMLElement;
        const toggleText = this.container.querySelector('#toggle-text') as HTMLElement;
        const toggleLink = this.container.querySelector('#toggle-link') as HTMLElement;
        const passwordInput = this.container.querySelector('#password') as HTMLInputElement;

        if (this.isRegisterMode) {
            subtitle.textContent = 'Créez votre compte';
            emailGroup.classList.add('visible');
            submitBtn.textContent = 'Créer un compte';
            toggleText.textContent = 'Déjà un compte ? ';
            toggleLink.textContent = 'Se connecter';
            passwordInput.autocomplete = 'new-password';
        } else {
            subtitle.textContent = 'Connectez-vous pour commencer';
            emailGroup.classList.remove('visible');
            submitBtn.textContent = 'Se connecter';
            toggleText.textContent = 'Pas encore de compte ? ';
            toggleLink.textContent = 'Créer un compte';
            passwordInput.autocomplete = 'current-password';
        }

        this.hideMessages();
    }

    /**
     * Gère la soumission du formulaire
     */
    private async handleSubmit(e: Event): Promise<void> {
        e.preventDefault();

        const username = (this.container.querySelector('#username') as HTMLInputElement).value.trim();
        const password = (this.container.querySelector('#password') as HTMLInputElement).value;
        const email = (this.container.querySelector('#email') as HTMLInputElement).value.trim();

        if (!username || !password) {
            this.showError('Veuillez remplir tous les champs obligatoires');
            return;
        }

        if (password.length < 6) {
            this.showError('Le mot de passe doit contenir au moins 6 caractères');
            return;
        }

        this.setLoading(true);
        this.hideMessages();

        try {
            let user: User;

            if (this.isRegisterMode) {
                user = await authService.register(username, password, email || undefined);
                this.showSuccess('Compte créé avec succès !');
            } else {
                user = await authService.login(username, password);
            }

            // Petit délai pour montrer le succès
            setTimeout(() => {
                this.hide();
                this.onSuccess(user);
            }, this.isRegisterMode ? 1000 : 300);

        } catch (error) {
            this.showError((error as Error).message || 'Une erreur est survenue');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Gère la connexion en tant qu'invité
     */
    private async handleGuestLogin(): Promise<void> {
        this.setLoading(true);
        this.hideMessages();

        try {
            const user = await authService.loginAsGuest();

            this.showSuccess('Bienvenue, ' + user.displayName + ' !');

            setTimeout(() => {
                this.hide();
                this.onSuccess(user);
            }, 500);

        } catch (error) {
            this.showError((error as Error).message || 'Une erreur est survenue');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Affiche un message d'erreur
     */
    private showError(message: string): void {
        const errorEl = this.container.querySelector('#error-message') as HTMLElement;
        errorEl.textContent = message;
        errorEl.classList.add('visible');
    }

    /**
     * Affiche un message de succès
     */
    private showSuccess(message: string): void {
        const successEl = this.container.querySelector('#success-message') as HTMLElement;
        successEl.textContent = message;
        successEl.classList.add('visible');
    }

    /**
     * Cache les messages
     */
    private hideMessages(): void {
        const errorEl = this.container.querySelector('#error-message') as HTMLElement;
        const successEl = this.container.querySelector('#success-message') as HTMLElement;
        errorEl.classList.remove('visible');
        successEl.classList.remove('visible');
    }

    /**
     * Active/désactive l'état de chargement
     */
    private setLoading(loading: boolean): void {
        const submitBtn = this.container.querySelector('#submit-btn') as HTMLButtonElement;
        const guestBtn = this.container.querySelector('#guest-btn') as HTMLButtonElement;
        const inputs = this.container.querySelectorAll('input');

        submitBtn.disabled = loading;
        guestBtn.disabled = loading;
        inputs.forEach(input => (input as HTMLInputElement).disabled = loading);

        if (loading) {
            const originalText = this.isRegisterMode ? 'Créer un compte' : 'Se connecter';
            submitBtn.innerHTML = `<span class="loading"></span>${originalText}...`;
        } else {
            submitBtn.textContent = this.isRegisterMode ? 'Créer un compte' : 'Se connecter';
        }
    }

    /**
     * Cache le formulaire de login
     */
    public hide(): void {
        this.container.style.opacity = '0';
        this.container.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            this.container.remove();
        }, 300);
    }

    /**
     * Affiche le formulaire de login
     */
    public show(): void {
        this.container.style.display = 'flex';
    }
}
