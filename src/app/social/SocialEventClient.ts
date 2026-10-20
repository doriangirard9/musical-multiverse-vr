import { SERVER_NAME, SOCIAL_EVENTS_SERVER } from "../../options"

export type SocialEventKind = "ping-player" | "ping-point" | "ready"

export type SocialEvent = {
    kind: SocialEventKind
    position: { x: number; y: number; z: number }
    ttlMs?: number
}

type IncomingMessage =
    | { type: "joined" }
    | { type: "event"; sourceId: string; event: SocialEvent }
    | { type: "error"; message: string }

export class SocialEventClient {
    private socket?: WebSocket
    private reconnectTimer?: ReturnType<typeof setTimeout>
    private disposed = false
    private joined = false
    private readonly pendingEvents: SocialEvent[] = []

    constructor(
        private readonly sessionId: string,
        private readonly playerId: string,
        private readonly onEvent: (sourceId: string, event: SocialEvent) => void,
    ) {
        this.connect()
    }

    send(event: SocialEvent): void {
        if (this.socket?.readyState !== WebSocket.OPEN || !this.joined) {
            this.pendingEvents.splice(0, this.pendingEvents.length - 2)
            this.pendingEvents.push(event)
            return
        }
        this.socket.send(JSON.stringify({ type: "event", event }))
    }

    dispose(): void {
        this.disposed = true
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "leave" }))
        this.socket?.close()
        this.socket = undefined
    }

    private connect(): void {
        if (this.disposed) return
        const socket = this.socket = new WebSocket(this.getUrl())
        socket.onopen = () => {
            if (this.disposed) return
            socket.send(JSON.stringify({ type: "join", sessionId: this.sessionId, playerId: this.playerId }))
        }
        socket.onmessage = message => {
            try {
                const data = JSON.parse(String(message.data)) as IncomingMessage
                if (data.type === "joined") this.flushPendingEvents()
                else if (data.type === "event") this.onEvent(data.sourceId, data.event)
                else if (data.type === "error") console.warn("[SocialEventClient]", data.message)
            } catch (error) {
                console.warn("[SocialEventClient] Invalid event", error)
            }
        }
        socket.onclose = () => {
            if (this.socket === socket) this.socket = undefined
            this.joined = false
            if (!this.disposed) this.reconnectTimer = setTimeout(() => this.connect(), 1500)
        }
        socket.onerror = () => {
            if (!this.disposed && socket.readyState !== WebSocket.CLOSED) socket.close()
        }
    }

    private getUrl(): string {
        if (SOCIAL_EVENTS_SERVER) return SOCIAL_EVENTS_SERVER
        const url = new URL("/social-events", SERVER_NAME || window.location.origin)
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
        return url.toString()
    }

    private flushPendingEvents(): void {
        this.joined = true
        while (this.pendingEvents.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
            const event = this.pendingEvents.shift()!
            this.socket.send(JSON.stringify({ type: "event", event }))
        }
    }
}
