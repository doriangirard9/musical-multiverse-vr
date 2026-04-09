/**
 * =============================================================================
 * WAM Jam Party - Menu Utilisateur
 * =============================================================================
 * Affiche le nom de l'utilisateur et un bouton de déconnexion.
 * =============================================================================
 */

import { authService, User } from '../auth/AuthService';

/**
 * Classe qui gère le menu utilisateur (affichage nom + déconnexion)
 */
export class UserMenuUI {
    private container: HTMLElement | null = null;
    private isExpanded: boolean = false;

    constructor() {
        this.createUI();
    }

    /**
     * Crée l'interface du menu utilisateur
     */
    private createUI(): void {
        const user = authService.getUser();
        if (!user) return;

        this.container = document.createElement('div');
        this.container.id = 'user-menu';
        this.container.innerHTML = `
            <style>
                #user-menu {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 9998;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }

                .user-menu-btn {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 16px;
                    background: rgba(26, 26, 46, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 25px;
                    color: #fff;
                    font-size: 0.9em;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                }

                .user-menu-btn:hover {
                    background: rgba(26, 26, 46, 0.95);
                    border-color: rgba(255, 255, 255, 0.25);
                }

                .user-avatar {
                    width: 28px;
                    height: 28px;
                    background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    font-size: 0.85em;
                }

                .user-name {
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .user-badge {
                    font-size: 0.7em;
                    padding: 2px 6px;
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 10px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .menu-arrow {
                    font-size: 0.7em;
                    transition: transform 0.3s ease;
                }

                .menu-arrow.expanded {
                    transform: rotate(180deg);
                }

                .user-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    min-width: 180px;
                    background: rgba(26, 26, 46, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 12px;
                    padding: 8px;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-10px);
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                }

                .user-dropdown.visible {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }

                .dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    width: 100%;
                    padding: 10px 12px;
                    background: transparent;
                    border: none;
                    border-radius: 8px;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 0.9em;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-align: left;
                }

                .dropdown-item:hover {
                    background: rgba(255, 255, 255, 0.1);
                }

                .dropdown-item.logout {
                    color: #ff6b6b;
                }

                .dropdown-item.logout:hover {
                    background: rgba(255, 107, 107, 0.15);
                }

                .dropdown-divider {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.1);
                    margin: 8px 0;
                }

                .dropdown-icon {
                    font-size: 1.1em;
                    width: 20px;
                    text-align: center;
                }
            </style>

            <button class="user-menu-btn" id="user-menu-btn">
                <span class="user-avatar">${this.getInitials(user)}</span>
                <span class="user-name">${user.displayName}</span>
                ${user.isGuest ? '<span class="user-badge">Invité</span>' : ''}
                <span class="menu-arrow" id="menu-arrow">▼</span>
            </button>

            <div class="user-dropdown" id="user-dropdown">
                <div class="dropdown-item" style="cursor: default; opacity: 0.7;">
                    <span class="dropdown-icon">👤</span>
                    <span>${user.username}</span>
                </div>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item" id="back-to-sessions-btn">
                    <span class="dropdown-icon">📋</span>
                    <span>Changer de session</span>
                </button>
                <button class="dropdown-item logout" id="logout-btn">
                    <span class="dropdown-icon">🚪</span>
                    <span>Déconnexion</span>
                </button>
            </div>
        `;

        document.body.appendChild(this.container);
        this.setupEventListeners();
    }

    /**
     * Récupère les initiales de l'utilisateur
     */
    private getInitials(user: User): string {
        const name = user.displayName || user.username;
        return name.charAt(0).toUpperCase();
    }

    /**
     * Configure les event listeners
     */
    private setupEventListeners(): void {
        if (!this.container) return;

        const menuBtn = this.container.querySelector('#user-menu-btn') as HTMLButtonElement;
        const dropdown = this.container.querySelector('#user-dropdown') as HTMLElement;
        const arrow = this.container.querySelector('#menu-arrow') as HTMLElement;
        const logoutBtn = this.container.querySelector('#logout-btn') as HTMLButtonElement;
        const backToSessionsBtn = this.container.querySelector('#back-to-sessions-btn') as HTMLButtonElement;

        // Toggle dropdown
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.isExpanded = !this.isExpanded;
            dropdown.classList.toggle('visible', this.isExpanded);
            arrow.classList.toggle('expanded', this.isExpanded);
        });

        // Fermer en cliquant ailleurs
        document.addEventListener('click', () => {
            if (this.isExpanded) {
                this.isExpanded = false;
                dropdown.classList.remove('visible');
                arrow.classList.remove('expanded');
            }
        });

        // Back to sessions
        backToSessionsBtn.addEventListener('click', async () => {
            await this.leaveCurrentSession();
            window.location.reload();
        });

        // Logout
        logoutBtn.addEventListener('click', async () => {
            await this.leaveCurrentSession();
            await this.handleLogout();
        });
    }

    /**
     * Quitte la session actuelle
     */
    private async leaveCurrentSession(): Promise<void> {
        const sessionId = (window as any).WAMJAM_SESSION_ID;
        if (!sessionId) return;

        try {
            const token = authService.getAccessToken();
            await fetch(`${this.getApiBaseUrl()}/api/sessions/${sessionId}/leave`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error('Error leaving session:', error);
        }
    }

    /**
     * Récupère l'URL de base de l'API
     */
    private getApiBaseUrl(): string {
        if (window.location.port === '5173') {
            return 'http://localhost:3000';
        }
        return window.location.origin;
    }

    /**
     * Gère la déconnexion
     */
    private async handleLogout(): Promise<void> {
        try {
            await authService.logout();
            // Recharge la page pour revenir à l'écran de login
            window.location.reload();
        } catch (error) {
            console.error('Logout error:', error);
            // Force le reload même en cas d'erreur
            window.location.reload();
        }
    }

    /**
     * Détruit l'UI
     */
    public destroy(): void {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}
