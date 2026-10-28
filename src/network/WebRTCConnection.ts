
import { Observable } from '@babylonjs/core';

/** How long initialize() waits for the signaling server before reporting a failure. */
const CONNECT_TIMEOUT = 10_000

/** What the peers publish to each other on the signaling topic. */
type Signal =
    | { kind: "announce"; from: string; to?: string }
    | { kind: "description"; from: string; to: string; description: RTCSessionDescriptionInit }
    | { kind: "candidate"; from: string; to: string; candidate: RTCIceCandidateInit }

/** A connection to another peer whose data channel is open. */
export interface RTCPeer {
    /** The id the other peer gave itself, its playerId in a NetworkRoom. */
    readonly id: string
    readonly connection: RTCPeerConnection
    readonly channel: RTCDataChannel
}

/** A connection being negotiated, not yet usable. */
interface PendingConnection {
    id: string
    connection: RTCPeerConnection
    channel: RTCDataChannel
    pendingCandidates: RTCIceCandidateInit[]
    initiator: boolean
    makingOffer: boolean
}

/**
 * Creates WebRTC connections to other peers, each carrying one data channel. Offers, answers and
 * ICE candidates go through a topic of a y-webrtc signaling server. Which peers to connect to is
 * up to the caller: this class only establishes the connections and reports them open or closed.
 */
export class WebRTCConnection {

    private readonly established = new Map<string, RTCPeer>()

    /** The established connections, by peer id. */
    readonly peers: ReadonlyMap<string, RTCPeer> = this.established

    /** A connection opened its data channel. */
    readonly onConnected = new Observable<RTCPeer>()
    /** An established connection closed, failed, or was disconnected. */
    readonly onDisconnected = new Observable<RTCPeer>()

    private socket?: WebSocket
    private reconnectTimer?: ReturnType<typeof setTimeout>
    private disposed = false
    private readonly pending = new Map<string, PendingConnection>()

    private settleConnected!: (connected: boolean) => void
    private readonly connected = new Promise<boolean>(resolve => this.settleConnected = resolve)
    private connectTimer?: ReturnType<typeof setTimeout>

    constructor(
        readonly signalingServer: string,
        readonly topic: string,
        readonly localId: string,
    ){
        this.connectTimer = setTimeout(() => this.settle(false), CONNECT_TIMEOUT)
        this.connectSignaling()
    }

    /**
     * Resolves once the signaling server is reached or failed to be. It never rejects, and the
     * connection keeps retrying after a failure.
     */
    async initialize(){
        return this.connected
    }

    /**
     * Starts a connection to a peer, unless one exists or is being negotiated. Calling it again for
     * a peer whose connection failed starts a new one.
     */
    connect(id: string){
        this.open(id)
    }

    /** Closes the connection to a peer, established or not. */
    disconnect(id: string){
        const pending = this.pending.get(id)
        const peer = this.established.get(id)
        // Removed before closing, so the close handlers find nothing left to disconnect.
        this.pending.delete(id)
        this.established.delete(id)
        const closing = pending ?? peer
        if (!closing) return
        closing.channel.close()
        closing.connection.close()
        if (peer) this.onDisconnected.notifyObservers(peer)
    }

    dispose(){
        this.disposed = true
        // Cleared first, so tearing the connections down does not report every peer as leaving.
        this.onConnected.clear()
        this.onDisconnected.clear()
        this.settle(false)
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        this.socket?.close()
        this.socket = undefined
        for (const id of [...this.pending.keys(), ...this.established.keys()]) this.disconnect(id)
    }

    private settle(connected: boolean){
        if (this.connectTimer) clearTimeout(this.connectTimer)
        this.connectTimer = undefined
        this.settleConnected(connected)
    }

    /**
     * Joins the topic on the y-webrtc signaling server. That server is a plain pub/sub: every
     * publish reaches every subscriber of the topic, sender included.
     */
    private connectSignaling(){
        if (this.disposed) return
        const url = new URL(this.signalingServer)
        if (url.protocol === "https:") url.protocol = "wss:"
        else if (url.protocol === "http:") url.protocol = "ws:"
        const socket = this.socket = new WebSocket(url)

        socket.onopen = () => {
            if (this.disposed) return
            socket.send(JSON.stringify({ type: "subscribe", topics: [this.topic] }))
            this.publish({ kind: "announce", from: this.localId })
            this.settle(true)
        }

        socket.onmessage = event => {
            let message: { type?: string; topic?: string; data?: Signal }
            try {
                message = JSON.parse(String(event.data))
            } catch {
                return
            }
            if (message.type === "ping") socket.send(JSON.stringify({ type: "pong" }))
            else if (message.type === "publish" && message.topic === this.topic && message.data) this.onSignal(message.data)
        }

        socket.onclose = () => {
            if (this.socket === socket) this.socket = undefined
            this.settle(false)
            if (!this.disposed) this.reconnectTimer = setTimeout(() => this.connectSignaling(), 1500)
        }

        socket.onerror = () => {
            if (socket.readyState !== WebSocket.CLOSED) socket.close()
        }
    }

    private publish(signal: Signal){
        if (this.socket?.readyState !== WebSocket.OPEN) return
        this.socket.send(JSON.stringify({ type: "publish", topic: this.topic, data: signal }))
    }

    private onSignal(signal: Signal){
        if (signal.from === this.localId) return
        if (signal.to !== undefined && signal.to !== this.localId) return
        switch (signal.kind) {
            case "announce":
                // An announce addressed to us is only sent by a side starting a new connection. From
                // a peer we consider established, it means that side lost it and started over.
                if (signal.to !== undefined && this.established.has(signal.from)) this.disconnect(signal.from)
                this.open(signal.from)
                break
            case "description":
                void this.acceptDescription(signal.from, signal.description)
                break
            case "candidate":
                void this.acceptCandidate(signal.from, signal.candidate)
                break
        }
    }

    /** Same as connect, and returns the connection being negotiated, if any. */
    private open(id: string): PendingConnection | undefined {
        if (this.disposed) return undefined
        const existing = this.pending.get(id)
        if (existing || this.established.has(id)) return existing

        // STUN lets each side learn its public address, without which only peers on the same
        // local network could reach each other. The signaling server cannot do it.
        const connection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        })
        // Negotiated on both sides with the same id, so neither has to wait for ondatachannel.
        // Unordered: a lost message is still retransmitted, but no longer holds back the ones after it.
        const channel = connection.createDataChannel("broadcast", { negotiated: true, id: 0, ordered: false })
        const pending: PendingConnection = {
            id,
            connection,
            channel,
            pendingCandidates: [],
            // A deterministic initiator means only one side ever makes an offer.
            initiator: this.localId.localeCompare(id) < 0,
            makingOffer: false,
        }
        this.pending.set(id, pending)

        // Handlers of a connection already replaced must not touch the one replacing it.
        const isCurrent = () => (this.pending.get(id) ?? this.established.get(id))?.connection === connection

        connection.onnegotiationneeded = () => {
            if (pending.initiator) void this.negotiate(pending)
        }

        connection.onicecandidate = event => {
            if (!event.candidate) return
            this.publish({ kind: "candidate", from: this.localId, to: id, candidate: event.candidate.toJSON() })
        }

        connection.onconnectionstatechange = () => {
            if (["failed", "closed"].includes(connection.connectionState) && isCurrent()) this.disconnect(id)
        }

        channel.onopen = () => {
            if (this.pending.get(id) !== pending) return
            this.pending.delete(id)
            const peer: RTCPeer = { id, connection, channel }
            this.established.set(id, peer)
            this.onConnected.notifyObservers(peer)
        }

        channel.onclose = () => {
            if (isCurrent()) this.disconnect(id)
        }

        // Tells the other side, which may still hold a connection to us that we no longer have.
        this.publish({ kind: "announce", from: this.localId, to: id })
        return pending
    }

    private async negotiate(pending: PendingConnection){
        const connection = pending.connection
        if (pending.makingOffer || connection.signalingState !== "stable") return
        try {
            pending.makingOffer = true
            await connection.setLocalDescription()
            this.sendDescription(pending.id, connection.localDescription)
        } catch (error) {
            console.warn("[WebRTCConnection] Failed to negotiate with", pending.id, error)
        } finally {
            pending.makingOffer = false
        }
    }

    private async acceptDescription(id: string, description: RTCSessionDescriptionInit){
        // An offer from an established peer means that side started over.
        if (description.type === "offer" && this.established.has(id)) this.disconnect(id)
        // Undefined for an answer to an established peer: there is no renegotiation.
        const pending = this.open(id)
        if (!pending) return
        const connection = pending.connection

        try {
            if (description.type === "answer" && connection.signalingState !== "have-local-offer") return
            await connection.setRemoteDescription(description)
            await this.flushPendingCandidates(pending)
            if (description.type === "offer") {
                await connection.setLocalDescription()
                this.sendDescription(id, connection.localDescription)
            }
        } catch (error) {
            console.warn("[WebRTCConnection] Failed to accept description from", id, error)
        }
    }

    private async acceptCandidate(id: string, candidate: RTCIceCandidateInit){
        // Candidates can still arrive once the channel is open.
        const pending = this.established.has(id) ? undefined : this.open(id)
        if (pending && !pending.connection.remoteDescription) {
            pending.pendingCandidates.push(candidate)
            return
        }
        const connection = pending?.connection ?? this.established.get(id)?.connection
        if (!connection) return
        try {
            await connection.addIceCandidate(candidate)
        } catch (error) {
            console.warn("[WebRTCConnection] Failed to accept ICE candidate from", id, error)
        }
    }

    private async flushPendingCandidates(pending: PendingConnection){
        const candidates = [...pending.pendingCandidates]
        pending.pendingCandidates.length = 0
        for (const candidate of candidates) {
            try {
                await pending.connection.addIceCandidate(candidate)
            } catch (error) {
                console.warn("[WebRTCConnection] Failed to flush pending ICE candidate from", pending.id, error)
            }
        }
    }

    private sendDescription(id: string, description: RTCSessionDescription | null){
        if (!description) return
        this.publish({ kind: "description", from: this.localId, to: id, description: description.toJSON() })
    }
}
