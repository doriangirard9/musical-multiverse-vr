/**
 * HTTP API client with automatic JWT token refresh.
 * All API calls go through this client which handles auth headers and token expiry.
 */

import { SERVER_NAME } from "../options";

const API_BASE_URL = SERVER_NAME + '/api';

export class ApiClient {
    private accessToken: string | null = null;
    private refreshPromise: Promise<boolean> | null = null;

    /**
     * Set the access token (called after login/register/refresh)
     */
    setAccessToken(token: string | null): void {
        this.accessToken = token;
    }

    /**
     * Get the current access token
     */
    getAccessToken(): string | null {
        return this.accessToken;
    }

    /**
     * Make an authenticated API request. Automatically retries with refreshed token on 401.
     */
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const response = await this.rawFetch(method, path, body);

        // If 401 and we have a token, try to refresh
        if (response.status === 401 && this.accessToken) {
            const refreshed = await this.tryRefresh();
            if (refreshed) {
                const retryResponse = await this.rawFetch(method, path, body);
                if (!retryResponse.ok) {
                    const error = await this.readJsonOrFallback(retryResponse, { error: 'Request failed' });
                    throw new ApiError(retryResponse.status, error.error || 'Request failed');
                }
                return this.readJsonOrThrow<T>(retryResponse, method, path);
            }
            // Refresh failed — clear token
            this.accessToken = null;
            throw new ApiError(401, 'Session expired');
        }

        if (!response.ok) {
            const error = await this.readJsonOrFallback(response, { error: 'Request failed' });
            throw new ApiError(response.status, error.error || 'Request failed');
        }

        return this.readJsonOrThrow<T>(response, method, path);
    }

    /**
     * Try to refresh the access token using the httpOnly refresh cookie
     */
    async tryRefresh(): Promise<boolean> {
        // Deduplicate concurrent refresh attempts
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshPromise = (async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                });

                if (response.ok) {
                    const data = await response.json();
                    this.accessToken = data.accessToken;
                    return true;
                }
                return false;
            } catch {
                return false;
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    private async rawFetch(method: string, path: string, body?: unknown): Promise<Response> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        return fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            credentials: 'include',
            body: body ? JSON.stringify(body) : undefined,
        });
    }

    private async readJsonOrThrow<T>(response: Response, method: string, path: string): Promise<T> {
        if (response.status === 204) {
            return undefined as T;
        }

        const text = await response.text();
        if (!text.trim()) {
            return undefined as T;
        }

        try {
            return JSON.parse(text) as T;
        } catch (error) {
            throw new ApiError(
                502,
                `Invalid JSON response for ${method} ${path}: ${error instanceof Error ? error.message : 'parse failed'}`
            );
        }
    }

    private async readJsonOrFallback<T>(response: Response, fallback: T): Promise<T> {
        const text = await response.text();
        if (!text.trim()) return fallback;
        try {
            return JSON.parse(text) as T;
        } catch {
            return fallback;
        }
    }
}

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}
