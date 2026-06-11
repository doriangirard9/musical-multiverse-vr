export class BaseEventBus<T extends object> {
    private static readonly DEBUG_LOG = false;
    protected listeners: Map<keyof T, Function[]> = new Map();
    protected debugMode: boolean = process.env.NODE_ENV === 'development';

    protected constructor() {
        if (BaseEventBus.DEBUG_LOG && this.debugMode) {
            console.log(`[EventBus] Initialized: ${this.constructor.name}`);
        }
    }

    public emit<K extends keyof T>(event: K, payload: T[K]): void {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach((callback) => {
            try {
                callback(payload);
            } catch (error) {
                console.error(`[EventBus] Error in callback for ${String(event)}:`, error);
            }
        });
    }

    public on<K extends keyof T>(event: K, callback: (payload: T[K]) => void): () => void {
        const callbacks = this.listeners.get(event) || [];
        this.listeners.set(event, [...callbacks, callback as Function]);

        return () => this.off(event, callback);
    }

    public off<K extends keyof T>(event: K, callback: (payload: T[K]) => void): void {
        const callbacks = this.listeners.get(event) || [];
        this.listeners.set(event, callbacks.filter((cb) => cb !== callback));
    }

    public getAllEventTypes(): (keyof T)[] {
        return Array.from(this.listeners.keys()) as (keyof T)[];
    }
}