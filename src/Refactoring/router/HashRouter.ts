import { ParsedRoute, parseHash, buildHash, RouteParams } from './routes.ts';

export type RouteChangeCallback = (route: ParsedRoute, previousRoute: ParsedRoute | null) => void;

/**
 * Hash-based router for single-page navigation.
 * Listens to hashchange events and notifies subscribers.
 * 
 * Usage:
 *   const router = new HashRouter();
 *   router.onRouteChange((route, prev) => { ... });
 *   router.navigate('sessions');
 *   router.navigate('app', { session: 'abc-123' });
 */
export class HashRouter {
    private readonly listeners: Set<RouteChangeCallback> = new Set();
    private currentRoute: ParsedRoute;
    private previousRoute: ParsedRoute | null = null;
    private readonly boundHashHandler: () => void;

    constructor() {
        this.currentRoute = parseHash(window.location.hash);
        this.boundHashHandler = this.handleHashChange.bind(this);
        window.addEventListener('hashchange', this.boundHashHandler);
    }

    /**
     * Get the current parsed route
     */
    getCurrentRoute(): ParsedRoute {
        return this.currentRoute;
    }

    /**
     * Navigate to a new route
     */
    navigate(path: string, params?: RouteParams): void {
        window.location.hash = buildHash(path, params);
    }

    /**
     * Replace the current route without creating a history entry
     */
    replace(path: string, params?: RouteParams): void {
        const hash = buildHash(path, params);
        window.history.replaceState(null, '', hash);
        // Manually trigger since replaceState doesn't fire hashchange
        this.handleHashChange();
    }

    /**
     * Subscribe to route changes
     */
    onRouteChange(callback: RouteChangeCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Trigger initial route evaluation (call after setting up listeners)
     */
    init(): void {
        this.currentRoute = parseHash(window.location.hash);
        for (const listener of this.listeners) {
            listener(this.currentRoute, null);
        }
    }

    /**
     * Dispose the router and remove event listeners
     */
    dispose(): void {
        window.removeEventListener('hashchange', this.boundHashHandler);
        this.listeners.clear();
    }

    private handleHashChange(): void {
        const newRoute = parseHash(window.location.hash);
        
        // Only notify if the route actually changed
        if (
            newRoute.path !== this.currentRoute.path ||
            JSON.stringify(newRoute.params) !== JSON.stringify(this.currentRoute.params)
        ) {
            this.previousRoute = this.currentRoute;
            this.currentRoute = newRoute;

            for (const listener of this.listeners) {
                listener(this.currentRoute, this.previousRoute);
            }
        }
    }
}
