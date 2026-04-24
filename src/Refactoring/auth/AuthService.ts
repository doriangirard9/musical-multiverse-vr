/**
 * =============================================================================
 * WAM Jam Party - Service d'Authentification Frontend
 * =============================================================================
 * Ce service gère l'authentification côté client :
 * - Stockage des tokens en localStorage
 * - Appels API d'authentification
 * - Rafraîchissement automatique des tokens
 * =============================================================================
 */

// URL de base de l'API
// En développement : http://localhost:3000
// En production : même domaine que l'app (ou configurer via window.WAMJAM_API_URL)
function getApiBaseUrl(): string {
    // Permet de configurer l'URL via une variable globale
    if (typeof (window as any).WAMJAM_API_URL === 'string') {
        return (window as any).WAMJAM_API_URL;
    }
    // En dev avec Vite, le serveur API est sur le port 3000
    if (window.location.port === '5173') {
        return 'http://localhost:3000';
    }
    // En production, l'API est sur le même domaine
    return window.location.origin;
}

const API_BASE_URL = getApiBaseUrl();

// Clés de stockage localStorage
const STORAGE_KEYS = {
    ACCESS_TOKEN: 'wamjam_access_token',
    REFRESH_TOKEN: 'wamjam_refresh_token',
    USER: 'wamjam_user'
};

/**
 * Interface utilisateur
 */
export interface User {
    id: string;
    username: string;
    displayName: string;
    email: string | null;
}

/**
 * Interface pour les réponses d'authentification
 */
interface AuthResponse {
    message: string;
    user: User;
    accessToken: string;
    refreshToken: string;
}

/**
 * Interface pour les erreurs API
 */
interface ApiError {
    error: string;
    message: string;
}

/**
 * Service d'authentification singleton
 */
class AuthService {
    private static instance: AuthService;
    private refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    private constructor() {
        // Tente de rafraîchir le token au démarrage si l'utilisateur est connecté
        this.setupAutoRefresh();
    }

    public static getInstance(): AuthService {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }

    /**
     * Vérifie si l'utilisateur est connecté
     */
    public isAuthenticated(): boolean {
        const token = this.getAccessToken();
        const user = this.getUser();
        return !!(token && user);
    }

    /**
     * Récupère l'utilisateur courant
     */
    public getUser(): User | null {
        const userJson = localStorage.getItem(STORAGE_KEYS.USER);
        if (!userJson) return null;
        try {
            return JSON.parse(userJson);
        } catch {
            return null;
        }
    }

    /**
     * Récupère le token d'accès
     */
    public getAccessToken(): string | null {
        return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    }

    /**
     * Récupère le token de rafraîchissement
     */
    private getRefreshToken(): string | null {
        return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    }

    /**
     * Sauvegarde les données d'authentification
     */
    private saveAuthData(data: AuthResponse): void {
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
        this.setupAutoRefresh();
    }

    /**
     * Efface les données d'authentification
     */
    private clearAuthData(): void {
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = null;
        }
    }

    /**
     * Configure le rafraîchissement automatique du token
     * Le token est rafraîchi 1 minute avant son expiration
     */
    private setupAutoRefresh(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }

        const token = this.getAccessToken();
        if (!token) return;

        try {
            // Décode le payload du JWT (partie centrale)
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiresAt = payload.exp * 1000; // Convertit en ms
            const now = Date.now();
            const timeUntilRefresh = expiresAt - now - 60000; // 1 minute avant expiration

            if (timeUntilRefresh > 0) {
                this.refreshTimeout = setTimeout(() => {
                    this.refreshAccessToken();
                }, timeUntilRefresh);
            } else {
                // Token déjà expiré ou proche de l'expiration
                this.refreshAccessToken();
            }
        } catch (e) {
            console.error('Error decoding token:', e);
        }
    }

    /**
     * Inscription d'un nouvel utilisateur
     */
    public async register(username: string, password: string, email?: string): Promise<User> {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error((data as ApiError).message || 'Registration failed');
        }

        this.saveAuthData(data as AuthResponse);
        return (data as AuthResponse).user;
    }

    /**
     * Connexion d'un utilisateur existant
     */
    public async login(username: string, password: string): Promise<User> {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error((data as ApiError).message || 'Login failed');
        }

        this.saveAuthData(data as AuthResponse);
        return (data as AuthResponse).user;
    }

    /**
     * Déconnexion
     */
    public async logout(): Promise<void> {
        const refreshToken = this.getRefreshToken();

        if (refreshToken) {
            try {
                await fetch(`${API_BASE_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                });
            } catch (e) {
                // Ignore les erreurs de logout côté serveur
            }
        }

        this.clearAuthData();
    }

    /**
     * Rafraîchit le token d'accès
     */
    public async refreshAccessToken(): Promise<boolean> {
        const refreshToken = this.getRefreshToken();

        if (!refreshToken) {
            this.clearAuthData();
            return false;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            if (!response.ok) {
                this.clearAuthData();
                return false;
            }

            const data = await response.json();
            localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
            localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
            this.setupAutoRefresh();
            return true;
        } catch (e) {
            this.clearAuthData();
            return false;
        }
    }

    /**
     * Fait une requête authentifiée à l'API
     */
    public async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
        const token = this.getAccessToken();

        if (!token) {
            throw new Error('Not authenticated');
        }

        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${token}`);

        const response = await fetch(url.startsWith('http') ? url : `${API_BASE_URL}${url}`, {
            ...options,
            headers
        });

        // Si le token est expiré, essaie de le rafraîchir
        if (response.status === 401) {
            const refreshed = await this.refreshAccessToken();
            if (refreshed) {
                // Réessaie la requête avec le nouveau token
                headers.set('Authorization', `Bearer ${this.getAccessToken()}`);
                return fetch(url.startsWith('http') ? url : `${API_BASE_URL}${url}`, {
                    ...options,
                    headers
                });
            }
        }

        return response;
    }
}

// Export du singleton
export const authService = AuthService.getInstance();
export default authService;
