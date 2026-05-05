/**
 * Route definitions for the hash-based router.
 * Routes use the fragment part of the URL: #route?param=value
 */

export interface RouteParams {
    [key: string]: string;
}

export interface ParsedRoute {
    readonly path: string;
    readonly params: RouteParams;
}

export const ROUTES = {
    LOGIN: 'login',
    REGISTER: 'register',
    SESSIONS: 'sessions',
    PROJECTS: 'projects',
    APP: 'app',
} as const;

export type RouteName = typeof ROUTES[keyof typeof ROUTES];

/**
 * Parse a hash string like "#app?session=abc&share=xyz" into { path, params }
 */
export function parseHash(hash: string): ParsedRoute {
    const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
    const [path, queryString] = cleaned.split('?');
    const params: RouteParams = {};

    if (queryString) {
        const searchParams = new URLSearchParams(queryString);
        searchParams.forEach((value, key) => {
            params[key] = value;
        });
    }

    return { path: path || '', params };
}

/**
 * Build a hash string from a path and params
 */
export function buildHash(path: string, params?: RouteParams): string {
    let hash = `#${path}`;
    if (params && Object.keys(params).length > 0) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            searchParams.set(key, value);
        }
        hash += `?${searchParams.toString()}`;
    }
    return hash;
}
