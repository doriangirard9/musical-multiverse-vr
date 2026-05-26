import { ApiClient, ApiError } from './ApiClient.ts';

export interface User {
    id: string;
    username: string;
    email: string | null;
}

/**
 * Authentication service.
 * Manages user login/register/logout and token lifecycle.
 * Access token is stored in memory (not localStorage for security).
 * Refresh token is stored as httpOnly cookie by the server.
 */
export class AuthService {
    private currentUser: User | null = null;
    private readonly onAuthChangeCallbacks: Set<(user: User | null) => void> = new Set();

    constructor(private readonly api: ApiClient) {}

    /**
     * Get the current authenticated user (null if guest)
     */
    getUser(): User | null {
        return this.currentUser;
    }

    /**
     * Check if the user is authenticated
     */
    isAuthenticated(): boolean {
        return this.currentUser !== null;
    }

    /**
     * Register a new account and auto-login
     */
    async register(username: string, password: string): Promise<User> {
        const data = await this.api.request<{ user: User; accessToken: string }>(
            'POST', '/auth/register', { username, password }
        );

        this.api.setAccessToken(data.accessToken);
        this.currentUser = data.user;
        this.notifyAuthChange();
        return data.user;
    }

    /**
     * Login with username and password
     */
    async login(username: string, password: string): Promise<User> {
        const data = await this.api.request<{ user: User; accessToken: string }>(
            'POST', '/auth/login', { username, password }
        );

        this.api.setAccessToken(data.accessToken);
        this.currentUser = data.user;
        this.notifyAuthChange();
        return data.user;
    }

    /**
     * Logout — clears tokens and user state
     */
    async logout(): Promise<void> {
        try {
            await this.api.request('POST', '/auth/logout');
        } catch {
            // Ignore errors during logout
        }
        this.api.setAccessToken(null);
        this.currentUser = null;
        this.notifyAuthChange();
    }

    /**
     * Try to restore a session from the refresh token cookie.
     * Call this on app startup.
     */
    async tryRestoreSession(): Promise<User | null> {
        try {
            const refreshed = await this.api.tryRefresh();
            if (refreshed) {
                const data = await this.api.request<{ user: User }>('GET', '/auth/me');
                this.currentUser = data.user;
                this.notifyAuthChange();
                return data.user;
            }
        } catch {
            // No valid session
        }
        return null;
    }

    /**
     * Subscribe to auth state changes
     */
    onAuthChange(callback: (user: User | null) => void): () => void {
        this.onAuthChangeCallbacks.add(callback);
        return () => this.onAuthChangeCallbacks.delete(callback);
    }

    private notifyAuthChange(): void {
        for (const cb of this.onAuthChangeCallbacks) {
            cb(this.currentUser);
        }
    }
}

export { ApiError };
