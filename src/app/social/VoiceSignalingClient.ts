import { SERVER_NAME, VOICE_SIGNALING_SERVER } from "../../options"

export type VoiceSignalingMessage =
    | { type: "peer-list"; peers: string[] }
    | { type: "peer-joined"; playerId: string }
    | { type: "peer-left"; playerId: string }
    | { type: "offer"; sourceId: string; description: RTCSessionDescriptionInit }
    | { type: "answer"; sourceId: string; description: RTCSessionDescriptionInit }
    | { type: "ice-candidate"; sourceId: string; candidate: RTCIceCandidateInit }
    | { type: "error"; message: string }

type OutgoingVoiceSignalingMessage =
    | { type: "join"; sessionId: string; playerId: string }
    | { type: "leave" }
    | { type: "offer"; targetId: string; description: RTCSessionDescriptionInit }
    | { type: "answer"; targetId: string; description: RTCSessionDescriptionInit }
    | { type: "ice-candidate"; targetId: string; candidate: RTCIceCandidateInit }

export class VoiceSignalingClient {
    private socket?: WebSocket
    private reconnectTimer?: ReturnType<typeof setTimeout>
    private disposed = false

    constructor(
        private readonly sessionId: string,
        private readonly playerId: string,
        private readonly onMessage: (message: VoiceSignalingMessage) => void,
        private readonly onStatus: (status: "connecting" | "connected" | "disconnected") => void = () => {},
    ) {
        this.connect()
    }

    send(message: OutgoingVoiceSignalingMessage): void {
        if (this.socket?.readyState !== WebSocket.OPEN) return
        this.socket.send(JSON.stringify(message))
    }

    dispose(): void {
        this.disposed = true
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        this.send({ type: "leave" })
        this.socket?.close()
        this.socket = undefined
    }

    private connect(): void {
        if (this.disposed) return
        this.onStatus("connecting")
        const socket = this.socket = new WebSocket(this.getUrl())

        socket.onopen = () => {
            if (this.disposed) return
            this.onStatus("connected")
            this.send({ type: "join", sessionId: this.sessionId, playerId: this.playerId })
        }

        socket.onmessage = event => {
            try {
                this.onMessage(JSON.parse(String(event.data)) as VoiceSignalingMessage)
            } catch (error) {
                console.warn("[VoiceSignalingClient] Invalid signaling message", error)
            }
        }

        socket.onclose = () => {
            if (this.socket === socket) this.socket = undefined
            this.onStatus("disconnected")
            if (!this.disposed) {
                this.reconnectTimer = setTimeout(() => this.connect(), 1500)
            }
        }

        socket.onerror = () => {
            if (!this.disposed && socket.readyState !== WebSocket.CLOSED) socket.close()
        }
    }

    private getUrl(): string {
        if (VOICE_SIGNALING_SERVER) return VOICE_SIGNALING_SERVER
        const base = SERVER_NAME || window.location.origin
        const url = new URL("/voice-signaling", base)
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
        return url.toString()
    }
}
