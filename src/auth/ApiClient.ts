/**
 * HTTP API client with automatic JWT token refresh.
 * All API calls go through this client which handles auth headers and token expiry.
 */

const API_BASE_URL = '/api';

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
                    const error = await retryResponse.json().catch(() => ({ error: 'Request failed' }));
                    throw new ApiError(retryResponse.status, error.error || 'Request failed');
                }
                return retryResponse.json();
            }
            // Refresh failed — clear token
            this.accessToken = null;
            throw new ApiError(401, 'Session expired');
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new ApiError(response.status, error.error || 'Request failed');
        }

        return response.json();
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
