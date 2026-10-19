
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';
import { SIGNALING_SERVER } from '../options.ts';

type MessageListener = (message: unknown, peerId: string) => void

/** What the peers publish to each other on the signaling topic of the message channel. */
type Signal =
    | { kind: "announce"; from: string; to?: string }
    | { kind: "description"; from: string; to: string; description: RTCSessionDescriptionInit }
    | { kind: "candidate"; from: string; to: string; candidate: RTCIceCandidateInit }

interface MessagePeer {
    id: string
    connection: RTCPeerConnection
    channel: RTCDataChannel
    pendingCandidates: RTCIceCandidateInit[]
    polite: boolean
    initiator: boolean
    makingOffer: boolean
    ignoreOffer: boolean
}

export class NetworkRoom {

    provider

    /** Identifies this client on the message channel. */
    readonly peerId = crypto.randomUUID()

    private readonly topic: string
    private socket?: WebSocket
    private reconnectTimer?: ReturnType<typeof setTimeout>
    private disposed = false
    private readonly peers = new Map<string, MessagePeer>()
    private readonly listeners = new Set<MessageListener>()

    constructor(
        public roomId: string,
        public sharedId: string,
        doc: Y.Doc,
    ){
        this.provider = new WebrtcProvider(`${roomId}-doc`, doc, {
            signaling: [SIGNALING_SERVER],
        })

        // Messages travel on their own WebRTC connections, the y-webrtc provider stays dedicated to
        // the document. Only the signaling server is shared, on a topic of their own.
        this.topic = `${roomId}-msg`
        this.connectSignaling()
    }

    async initialize(){

        return this
    }

    /** Sends a message to every connected peer of the room. */
    broadcast(message: unknown){
        const data = JSON.stringify(message)
        for (const peer of this.peers.values()) {
            if (peer.channel.readyState === "open") peer.channel.send(data)
        }
    }

    /** Listens to the messages broadcast by the other peers. Returns the unsubscribe function. */
    onMessage(listener: MessageListener){
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    dispose(){
        this.disposed = true
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        this.socket?.close()
        this.socket = undefined
        for (const id of [...this.peers.keys()]) this.disposePeer(id)
        this.listeners.clear()
        this.provider.destroy()
    }

    /**
     * Joins the topic of the message channel on the y-webrtc signaling server. That server is a
     * plain pub/sub: every publish reaches every subscriber of the topic, sender included.
     */
    private connectSignaling(){
        if (this.disposed) return
        const url = new URL(SIGNALING_SERVER)
        if (url.protocol === "https:") url.protocol = "wss:"
        else if (url.protocol === "http:") url.protocol = "ws:"
        const socket = this.socket = new WebSocket(url)

        socket.onopen = () => {
            if (this.disposed) return
            socket.send(JSON.stringify({ type: "subscribe", topics: [this.topic] }))
            this.publish({ kind: "announce", from: this.peerId })
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
        if (signal.from === this.peerId) return
        if (signal.to !== undefined && signal.to !== this.peerId) return
        switch (signal.kind) {
            case "announce":
                // A newcomer announces to everyone, and everyone answers it directly, so each side
                // learns of the other whoever arrived first.
                if (!this.peers.has(signal.from) && signal.to === undefined) {
                    this.publish({ kind: "announce", from: this.peerId, to: signal.from })
                }
                this.ensurePeer(signal.from)
                break
            case "description":
                void this.acceptDescription(signal.from, signal.description)
                break
            case "candidate":
                void this.acceptCandidate(signal.from, signal.candidate)
                break
        }
    }

    private ensurePeer(id: string): MessagePeer {
        const existing = this.peers.get(id)
        if (existing) return existing

        const connection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        })
        // Negotiated on both sides with the same id, so neither has to wait for ondatachannel.
        const channel = connection.createDataChannel("broadcast", { negotiated: true, id: 0 })
        const peer: MessagePeer = {
            id,
            connection,
            channel,
            pendingCandidates: [],
            polite: this.peerId.localeCompare(id) > 0,
            // A deterministic initiator prevents simultaneous offers on join.
            initiator: this.peerId.localeCompare(id) < 0,
            makingOffer: false,
            ignoreOffer: false,
        }
        this.peers.set(id, peer)

        connection.onnegotiationneeded = () => {
            if (peer.initiator) void this.negotiate(peer)
        }

        connection.onicecandidate = event => {
            if (!event.candidate) return
            this.publish({ kind: "candidate", from: this.peerId, to: id, candidate: event.candidate.toJSON() })
        }

        connection.onconnectionstatechange = () => {
            if (["failed", "closed"].includes(connection.connectionState)) this.disposePeer(id)
        }

        channel.onmessage = event => {
            let message: unknown
            try {
                message = JSON.parse(String(event.data))
            } catch (error) {
                console.warn("[NetworkRoom] Invalid message from", id, error)
                return
            }
            for (const listener of this.listeners) listener(message, id)
        }

        return peer
    }

    private disposePeer(id: string){
        const peer = this.peers.get(id)
        if (!peer) return
        this.peers.delete(id)
        peer.channel.close()
        peer.connection.close()
    }

    private async negotiate(peer: MessagePeer){
        const connection = peer.connection
        if (peer.makingOffer || connection.signalingState !== "stable") return
        try {
            peer.makingOffer = true
            await connection.setLocalDescription()
            this.sendDescription(peer.id, connection.localDescription)
        } catch (error) {
            console.warn("[NetworkRoom] Failed to negotiate with", peer.id, error)
        } finally {
            peer.makingOffer = false
        }
    }

    private async acceptDescription(id: string, description: RTCSessionDescriptionInit){
        const peer = this.ensurePeer(id)
        const connection = peer.connection
        const readyForOffer = !peer.makingOffer && connection.signalingState === "stable"
        const offerCollision = description.type === "offer" && !readyForOffer

        peer.ignoreOffer = !peer.polite && offerCollision
        if (peer.ignoreOffer) return

        try {
            if (offerCollision && peer.polite) {
                await connection.setLocalDescription({ type: "rollback" })
            }
            if (description.type === "answer" && connection.signalingState !== "have-local-offer") return
            await connection.setRemoteDescription(description)
            await this.flushPendingCandidates(peer)
            if (description.type === "offer") {
                await connection.setLocalDescription()
                this.sendDescription(id, connection.localDescription)
            }
        } catch (error) {
            console.warn("[NetworkRoom] Failed to accept description from", id, error)
        }
    }

    private async acceptCandidate(id: string, candidate: RTCIceCandidateInit){
        const peer = this.ensurePeer(id)
        try {
            if (!peer.connection.remoteDescription) {
                peer.pendingCandidates.push(candidate)
                return
            }
            await peer.connection.addIceCandidate(candidate)
        } catch (error) {
            if (!peer.ignoreOffer) console.warn("[NetworkRoom] Failed to accept ICE candidate from", id, error)
        }
    }

    private async flushPendingCandidates(peer: MessagePeer){
        const pending = [...peer.pendingCandidates]
        peer.pendingCandidates.length = 0
        for (const candidate of pending) {
            try {
                await peer.connection.addIceCandidate(candidate)
            } catch (error) {
                console.warn("[NetworkRoom] Failed to flush pending ICE candidate from", peer.id, error)
            }
        }
    }

    private sendDescription(id: string, description: RTCSessionDescription | null){
        if (!description) return
        this.publish({ kind: "description", from: this.peerId, to: id, description: description.toJSON() })
    }
}
