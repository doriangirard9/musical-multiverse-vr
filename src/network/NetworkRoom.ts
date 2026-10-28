
import { Observable } from '@babylonjs/core';
import { WebrtcProvider } from 'y-webrtc';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { SIGNALING_SERVER } from '../options.ts';
import { NetworkPeer } from './NetworkPeer.ts';
import { WebRTCConnection } from './WebRTCConnection.ts';

type AwarenessChanges = { added: number[]; updated: number[]; removed: number[] }

export class NetworkRoom {

    readonly provider: WebrtcProvider
    readonly awareness: Awareness

    private readonly connected = new Map<string, NetworkPeer>()

    /** The other players of the room, by playerId, whose connection is established. */
    readonly peers: ReadonlyMap<string, NetworkPeer> = this.connected

    readonly onPeerJoin = new Observable<NetworkPeer>()
    readonly onPeerLeave = new Observable<NetworkPeer>()
    readonly onMessage = new Observable<{ message: unknown, peer: NetworkPeer }>()

    private readonly webrtc: WebRTCConnection
    /** The playerId announced by each awareness client, to know who leaves on a removal. */
    private readonly clients = new Map<number, string>()

    constructor(
        public roomId: string,
        readonly playerId: string,
        readonly doc: Y.Doc,
    ){
        this.provider = new WebrtcProvider(`${roomId}-doc`, doc, {
            signaling: [SIGNALING_SERVER],
        })

        // Messages travel on their own WebRTC connections, the y-webrtc provider stays dedicated to
        // the document. Only the signaling server is shared, on a topic of their own.
        this.webrtc = new WebRTCConnection(SIGNALING_SERVER, `${roomId}-msg`, playerId)
        this.webrtc.onConnected.add(rtc => {
            const peer = new NetworkPeer(rtc, this.awareness)
            peer.clientId = this.clientOf(peer.id)
            this.connected.set(peer.id, peer)
            peer.onMessage.add(message => this.onMessage.notifyObservers({ message, peer }))
            this.onPeerJoin.notifyObservers(peer)
        })
        this.webrtc.onDisconnected.add(rtc => {
            const peer = this.connected.get(rtc.id)
            if (!peer) return
            this.connected.delete(peer.id)
            peer.dispose()
            this.onPeerLeave.notifyObservers(peer)
        })

        // y-protocols renews the local state every 15 s and drops the clients silent for 30 s, so
        // presence needs no heartbeat of its own. The renewal only fires "update", not "change".
        this.awareness = this.provider.awareness
        this.awareness.setLocalStateField('playerId', playerId)
        this.awareness.on('update', this.onAwarenessUpdate)
        this.awareness.on('change', this.onAwarenessChange)
    }

    /**
     * Resolves once the room is reached or failed to be: true when the signaling server answered,
     * false when it could not be reached. It never rejects, and the room keeps retrying after a
     * failure.
     */
    async initialize(){
        return this.webrtc.initialize()
    }

    /** Sends a message to every connected peer of the room. */
    broadcast(message: unknown){
        for (const peer of this.connected.values()) peer.send(message)
    }

    dispose(){
        // Cleared first, so tearing the connections down does not report everyone as leaving.
        this.onPeerJoin.clear()
        this.onPeerLeave.clear()
        this.onMessage.clear()
        this.awareness.off('update', this.onAwarenessUpdate)
        this.awareness.off('change', this.onAwarenessChange)
        this.webrtc.dispose()
        this.provider.destroy()
    }

    private readonly onAwarenessUpdate = ({ added, updated, removed }: AwarenessChanges) => {
        const states = this.awareness.getStates()
        for (const clientId of [...added, ...updated]) {
            if (clientId === this.awareness.clientID) continue
            const playerId = states.get(clientId)?.playerId as string | undefined
            if (!playerId) continue
            // A client announcing another playerId counts as one player leaving and another arriving.
            const previous = this.clients.get(clientId)
            if (previous !== undefined && previous !== playerId) this.webrtc.disconnect(previous)
            this.clients.set(clientId, playerId)
            // The connection may have opened before the awareness state arrived.
            const peer = this.connected.get(playerId)
            if (peer) peer.clientId = clientId
            // Also reconnects, at the next renewal, a player still present whose connection failed.
            this.webrtc.connect(playerId)
        }
        for (const clientId of removed) {
            const playerId = this.clients.get(clientId)
            if (playerId === undefined) continue
            this.clients.delete(clientId)
            this.webrtc.disconnect(playerId)
        }
    }

    /** Only fires when a state really changed, unlike the periodic renewals seen by "update". */
    private readonly onAwarenessChange = ({ added, updated }: AwarenessChanges) => {
        for (const clientId of [...added, ...updated]) {
            const playerId = this.clients.get(clientId)
            if (playerId === undefined) continue
            const peer = this.connected.get(playerId)
            const state = peer?.state
            if (peer && state) peer.onStateChange.notifyObservers(state)
        }
    }

    private clientOf(playerId: string): number | undefined {
        for (const [clientId, id] of this.clients) if (id === playerId) return clientId
        return undefined
    }
}
