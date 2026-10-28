
import { Observable } from '@babylonjs/core';
import { Awareness } from 'y-protocols/awareness';
import { RTCPeer } from './WebRTCConnection.ts';

/** The awareness state a player publishes, playerId included. */
export type PeerState = { [field: string]: unknown }

/** Another player of a NetworkRoom, reachable while its connection is established. */
export class NetworkPeer {

    /** The playerId of the other player. */
    readonly id: string

    /**
     * The awareness client of this player. Undefined until its awareness state arrives, which can
     * come after the connection opens.
     */
    clientId?: number

    /** The messages this player sent, already parsed. */
    readonly onMessage = new Observable<unknown>()

    /** This player changed its awareness state. */
    readonly onStateChange = new Observable<PeerState>()

    constructor(
        private readonly rtc: RTCPeer,
        readonly awareness: Awareness,
    ){
        this.id = rtc.id
        rtc.channel.onmessage = event => {
            let message: unknown
            try {
                message = JSON.parse(String(event.data))
            } catch (error) {
                console.warn("[NetworkPeer] Invalid message from", this.id, error)
                return
            }
            this.onMessage.notifyObservers(message)
        }
    }

    /** The awareness state this player publishes, if known yet. */
    get state(): PeerState | undefined {
        if (this.clientId === undefined) return undefined
        return this.awareness.getStates().get(this.clientId)
    }

    /** Sends a message to this player only. Lost if the channel is no longer open. */
    send(message: unknown){
        if (this.rtc.channel.readyState === "open") this.rtc.channel.send(JSON.stringify(message))
    }

    /** Called by the room once the connection is gone. */
    dispose(){
        this.rtc.channel.onmessage = null
        this.onMessage.clear()
        this.onStateChange.clear()
    }
}
