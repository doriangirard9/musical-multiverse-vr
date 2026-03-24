/**
 * =============================================================================
 * WAM Jam Party - Composant UI de Conversion Invité
 * =============================================================================
 * Ce composant permet aux utilisateurs invités de créer un compte permanent
 * ou de se connecter à un compte existant, sans interrompre la session en cours.
 * =============================================================================
 */

import { authService, User } from '../auth/AuthService';

type ModalMode = 'register' | 'login';

/**
 * Classe qui gère l'UI de conversion de compte invité
 */
export class GuestConversionUI {
    private floatingButton: HTMLElement | null = null;
    private modal: HTMLElement | null = null;
    private currentMode: ModalMode = 'register';
    private onConverted?: (user: User) => void;

    constructor(onConverted?: (user: User) => void) {
        this.onConverted = onConverted;

        // Ne crée l'UI que si l'utilisateur est un invité
        if (authService.isGuest()) {
            this.createFloatingButton();
        }
    }

    /**
     * Crée le bouton flottant "Sauvegarder mon travail"
     */
    private createFloatingButton(): void {
        this.floatingButton = document.createElement('div');
        this.floatingButton.id = 'guest-conversion-btn';
        this.floatingButton.innerHTML = `
            <style>
                #guest-conversion-btn {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 9999;
                }

                #guest-conversion-btn button {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 20px;
                    background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
                    border: none;
                    border-radius: 25px;
                    color: #fff;
                    font-size: 0.95em;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(233, 69, 96, 0.4);
                    transition: all 0.3s ease;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }

                #guest-conversion-btn button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(233, 69, 96, 0.5);
                }

                #guest-conversion-btn .icon {
                    font-size: 1.2em;
                }
            </style>
            <button>
                <span class="icon">&#128190;</span>
                <span>Sauvegarder mon travail</span>
            </button>
        `;

        document.body.appendChild(this.floatingButton);

        const button = this.floatingButton.querySelector('button');
        button?.addEventListener('click', () => this.showModal());
    }

    /**
     * Affiche le modal de conversion
     */
    private showModal(): void {
        if (this.modal) return;

        this.modal = document.createElement('div');
        this.modal.id = 'guest-conversion-modal';
        this.modal.innerHTML = `
            <style>
                #guest-conversion-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10001;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }

                .conversion-card {
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 20px;
                    padding: 35px;
                    width: 100%;
                    max-width: 420px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    animation: modalSlideIn 0.3s ease-out;
                }

                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95) translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }

                .conversion-header {
                    text-align: center;
                    margin-bottom: 20px;
                }

                .conversion-header h2 {
                    color: #fff;
                    font-size: 1.5em;
                    margin: 0 0 10px 0;
                }

                .conversion-header p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                    font-size: 0.9em;
                }

                .mode-tabs {
                    display: flex;
                    margin-bottom: 20px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    padding: 4px;
                }

                .mode-tab {
                    flex: 1;
                    padding: 10px;
                    border: none;
                    background: transparent;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 0.95em;
                    font-weight: 500;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.3s ease;
                }

                .mode-tab:hover {
                    color: rgba(255, 255, 255, 0.8);
                }

                .mode-tab.active {
                    background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
                    color: #fff;
                }

                .conversion-form {
                    display: flex;
                    flex-direction: column;
                    gap: 18px;
                }

                .conversion-form .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .conversion-form label {
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 0.85em;
                    font-weight: 500;
                }

                .conversion-form input {
                    padding: 12px 14px;
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }

                .conversion-form input:focus {
                    outline: none;
                    border-color: #e94560;
                    background: rgba(255, 255, 255, 0.15);
                }

                .conversion-form input::placeholder {
                    color: rgba(255, 255, 255, 0.4);
                }

                .conversion-buttons {
                    display: flex;
                    gap: 12px;
                    margin-top: 10px;
                }

                .conversion-buttons button {
                    flex: 1;
                    padding: 12px;
                    border-radius: 10px;
                    font-size: 1em;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .btn-save {
                    background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
                    border: none;
                    color: #fff;
                }

                .btn-save:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(233, 69, 96, 0.4);
                }

                .btn-save:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }

                .btn-cancel {
                    background: transparent;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    color: rgba(255, 255, 255, 0.8);
                }

                .btn-cancel:hover {
                    border-color: rgba(255, 255, 255, 0.5);
                    background: rgba(255, 255, 255, 0.1);
                }

                .conversion-error {
                    background: rgba(255, 0, 0, 0.2);
                    border: 1px solid rgba(255, 0, 0, 0.3);
                    color: #ff6b6b;
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                    font-size: 0.9em;
                    display: none;
                }

                .conversion-error.visible {
                    display: block;
                }

                .loading-spinner {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
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

                .email-group {
                    transition: all 0.3s ease;
                }

                .email-group.hidden {
                    display: none;
                }
            </style>

            <div class="conversion-card">
                <div class="conversion-header">
                    <h2>Sauvegarder mon travail</h2>
                    <p id="modal-subtitle">Creez un compte ou connectez-vous</p>
                </div>

                <div class="mode-tabs">
                    <button type="button" class="mode-tab active" id="tab-register">Creer un compte</button>
                    <button type="button" class="mode-tab" id="tab-login">Se connecter</button>
                </div>

                <div class="conversion-error" id="conversion-error"></div>

                <form class="conversion-form" id="conversion-form">
                    <div class="form-group">
                        <label for="conv-username">Nom d'utilisateur</label>
                        <input type="text" id="conv-username"
                               placeholder="Votre nom d'utilisateur" required>
                    </div>

                    <div class="form-group">
                        <label for="conv-password">Mot de passe</label>
                        <input type="password" id="conv-password"
                               placeholder="Votre mot de passe" required>
                    </div>

                    <div class="form-group email-group" id="email-group">
                        <label for="conv-email">Email (optionnel)</label>
                        <input type="email" id="conv-email"
                               placeholder="votre@email.com">
                    </div>

                    <div class="conversion-buttons">
                        <button type="button" class="btn-cancel" id="conv-cancel">
                            Annuler
                        </button>
                        <button type="submit" class="btn-save" id="conv-save">
                            Creer le compte
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.setupModalListeners();
    }

    /**
     * Configure les event listeners du modal
     */
    private setupModalListeners(): void {
        if (!this.modal) return;

        const form = this.modal.querySelector('#conversion-form') as HTMLFormElement;
        const cancelBtn = this.modal.querySelector('#conv-cancel') as HTMLButtonElement;
        const tabRegister = this.modal.querySelector('#tab-register') as HTMLButtonElement;
        const tabLogin = this.modal.querySelector('#tab-login') as HTMLButtonElement;
        const backdrop = this.modal;

        form.addEventListener('submit', (e) => this.handleSubmit(e));
        cancelBtn.addEventListener('click', () => this.hideModal());
        tabRegister.addEventListener('click', () => this.setMode('register'));
        tabLogin.addEventListener('click', () => this.setMode('login'));

        // Ferme le modal si on clique en dehors
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                this.hideModal();
            }
        });
    }

    /**
     * Change le mode du modal (register/login)
     */
    private setMode(mode: ModalMode): void {
        if (!this.modal) return;
        this.currentMode = mode;

        const tabRegister = this.modal.querySelector('#tab-register') as HTMLButtonElement;
        const tabLogin = this.modal.querySelector('#tab-login') as HTMLButtonElement;
        const emailGroup = this.modal.querySelector('#email-group') as HTMLElement;
        const saveBtn = this.modal.querySelector('#conv-save') as HTMLButtonElement;
        const subtitle = this.modal.querySelector('#modal-subtitle') as HTMLElement;
        const passwordInput = this.modal.querySelector('#conv-password') as HTMLInputElement;
        const errorEl = this.modal.querySelector('#conversion-error') as HTMLElement;

        // Reset error
        errorEl.classList.remove('visible');

        if (mode === 'register') {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            emailGroup.classList.remove('hidden');
            saveBtn.textContent = 'Creer le compte';
            subtitle.textContent = 'Creez un compte pour conserver votre session';
            passwordInput.placeholder = 'Au moins 6 caracteres';
        } else {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            emailGroup.classList.add('hidden');
            saveBtn.textContent = 'Se connecter';
            subtitle.textContent = 'Connectez-vous a votre compte existant';
            passwordInput.placeholder = 'Votre mot de passe';
        }
    }

    /**
     * Gere la soumission du formulaire
     */
    private async handleSubmit(e: Event): Promise<void> {
        e.preventDefault();
        if (!this.modal) return;

        if (this.currentMode === 'register') {
            await this.handleConversion();
        } else {
            await this.handleLogin();
        }
    }

    /**
     * Gere la conversion du compte (creation nouveau compte)
     */
    private async handleConversion(): Promise<void> {
        if (!this.modal) return;

        const username = (this.modal.querySelector('#conv-username') as HTMLInputElement).value.trim();
        const password = (this.modal.querySelector('#conv-password') as HTMLInputElement).value;
        const email = (this.modal.querySelector('#conv-email') as HTMLInputElement).value.trim();
        const saveBtn = this.modal.querySelector('#conv-save') as HTMLButtonElement;
        const errorEl = this.modal.querySelector('#conversion-error') as HTMLElement;

        // Validation
        if (!username || !password) {
            this.showModalError('Veuillez remplir tous les champs obligatoires');
            return;
        }

        if (password.length < 6) {
            this.showModalError('Le mot de passe doit contenir au moins 6 caracteres');
            return;
        }

        // Chargement
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="loading-spinner"></span>Creation...';
        errorEl.classList.remove('visible');

        try {
            const user = await authService.convertGuestAccount(username, password, email || undefined);

            // Succes - ferme le modal et le bouton flottant
            this.hideModal();
            this.removeFloatingButton();

            if (this.onConverted) {
                this.onConverted(user);
            }

        } catch (error) {
            this.showModalError((error as Error).message || 'Une erreur est survenue');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Creer le compte';
        }
    }

    /**
     * Gere la connexion a un compte existant
     */
    private async handleLogin(): Promise<void> {
        if (!this.modal) return;

        const username = (this.modal.querySelector('#conv-username') as HTMLInputElement).value.trim();
        const password = (this.modal.querySelector('#conv-password') as HTMLInputElement).value;
        const saveBtn = this.modal.querySelector('#conv-save') as HTMLButtonElement;
        const errorEl = this.modal.querySelector('#conversion-error') as HTMLElement;

        // Validation
        if (!username || !password) {
            this.showModalError('Veuillez remplir tous les champs');
            return;
        }

        // Chargement
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="loading-spinner"></span>Connexion...';
        errorEl.classList.remove('visible');

        try {
            const user = await authService.login(username, password);

            // Succes - ferme le modal et le bouton flottant
            this.hideModal();
            this.removeFloatingButton();

            if (this.onConverted) {
                this.onConverted(user);
            }

        } catch (error) {
            this.showModalError((error as Error).message || 'Identifiants incorrects');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Se connecter';
        }
    }

    /**
     * Affiche une erreur dans le modal
     */
    private showModalError(message: string): void {
        if (!this.modal) return;
        const errorEl = this.modal.querySelector('#conversion-error') as HTMLElement;
        errorEl.textContent = message;
        errorEl.classList.add('visible');
    }

    /**
     * Cache le modal
     */
    private hideModal(): void {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }

    /**
     * Supprime le bouton flottant
     */
    private removeFloatingButton(): void {
        if (this.floatingButton) {
            this.floatingButton.remove();
            this.floatingButton = null;
        }
    }

    /**
     * Detruit l'UI completement
     */
    public destroy(): void {
        this.hideModal();
        this.removeFloatingButton();
    }
}
