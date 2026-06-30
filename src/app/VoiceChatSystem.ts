import { AbstractMesh, Color3, CreateIcoSphere, StandardMaterial, Vector3 } from "@babylonjs/core"
import type { Awareness } from "y-protocols/awareness"
import { AvatarSystem } from "./AvatarSystem"
import { AudioWorldSystem } from "./AudioDestinationSystem"
import { MicrophoneSystem } from "./MicrophoneSystem"
import { NetworkManager } from "../network/NetworkManager"
import { SceneManager } from "./SceneManager"

type VoiceSignalDescription = RTCSessionDescriptionInit

type VoiceSignalEnvelope = {
    kind: "description" | "candidate"
    sourceId: string
    targetId: string
    seq: number
    description?: VoiceSignalDescription
    candidate?: RTCIceCandidateInit
}

type AwarenessStateWithVoice = {
    playerId?: string
    voiceEnabled?: boolean
    voiceActive?: boolean
    voiceLevel?: number
    voiceSignals?: Record<string, Record<string, VoiceSignalEnvelope>>
}

type RemoteVoicePeer = {
    id: string
    connection: RTCPeerConnection
    sender: RTCRtpSender
    audioElement: HTMLAudioElement
    sourceNode?: MediaElementAudioSourceNode
    gainNode: GainNode
    pannerNode: PannerNode
    lastSignalSeq: number
    pendingCandidates: RTCIceCandidateInit[]
    connectedAt: number
    disposed: boolean
}

const UPDATE_INTERVAL_MS = 100
const VOICE_MIN_DISTANCE = 1.4
const VOICE_MAX_DISTANCE = 14
const DEBUG_VOICE_RECEPTION = true

export class VoiceChatSystem {
    private static _instance?: VoiceChatSystem

    static initialize(
        audioContext: AudioContext,
        network: NetworkManager,
        avatars: AvatarSystem,
        scenes: SceneManager,
    ): VoiceChatSystem {
        this._instance ??= new VoiceChatSystem(audioContext, avatars, scenes, network)
        return this._instance
    }

    static hasInstance(): boolean {
        return !!this._instance
    }

    static getInstance(): VoiceChatSystem {
        if (!this._instance) throw new Error("VoiceChatSystem not initialized. Call initialize() first.")
        return this._instance
    }

    private readonly awareness: Awareness
    private readonly microphone: MicrophoneSystem
    private readonly localPlayerId: string
    private readonly peers = new Map<string, RemoteVoicePeer>()
    private readonly voiceIndicators = new Map<string, AbstractMesh>()
    private readonly lastVoiceActiveState = new Map<string, boolean>()
    private readonly remoteTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly voiceIndicatorMaterial: StandardMaterial
    private nextSignalSeq = 1
    private updateAccumulator = 0
    private lastPublishedTrackId: string | null = null
    private constructor(
        private readonly audioContext: AudioContext,
        private readonly avatars: AvatarSystem,
        private readonly scenes: SceneManager,
        network: NetworkManager,
    ) {
        this.awareness = network.connection.getAwareness()
        this.microphone = MicrophoneSystem.getInstance()
        this.localPlayerId = String(this.awareness.getLocalState()?.["playerId"] ?? "")
        this.voiceIndicatorMaterial = new StandardMaterial("voice-indicator", scenes.getScene())
        this.voiceIndicatorMaterial.diffuseColor = new Color3(0.35, 0.95, 0.85)
        this.voiceIndicatorMaterial.emissiveColor = new Color3(0.15, 0.7, 0.6)
        this.voiceIndicatorMaterial.alpha = 0.24
        this.voiceIndicatorMaterial.backFaceCulling = false

        scenes.getScene().onBeforeRenderObservable.add(() => {
            this.updateAccumulator += scenes.getScene().getEngine().getDeltaTime()
            if (this.updateAccumulator < UPDATE_INTERVAL_MS) return
            this.updateAccumulator = 0
            this.updateRemoteSpatialization()
        })

        this.awareness.on("change", this.handleAwarenessChanged)
        this.microphone.onStateChanged.add(async () => {
            this.publishVoicePresence()
            await this.syncOutgoingTrack()
        })

        this.publishVoicePresence()
        this.syncPeersFromAwareness()
    }

    private readonly handleAwarenessChanged = (): void => {
        this.syncPeersFromAwareness()
    }

    private syncPeersFromAwareness(): void {
        const states = this.awareness.getStates()
        const livePlayerIds = new Set<string>()

        for (const [, state] of states) {
            const playerId = String((state as AwarenessStateWithVoice)?.playerId ?? "")
            if (!playerId || playerId === this.localPlayerId) continue

            if ((state as AwarenessStateWithVoice).voiceEnabled) {
                livePlayerIds.add(playerId)
            } else {
                this.hideVoiceIndicator(playerId)
            }
            const peer = this.ensurePeer(playerId)
            this.processIncomingSignal(playerId, state as AwarenessStateWithVoice, peer)
        }

        for (const playerId of this.peers.keys()) {
            if (!livePlayerIds.has(playerId)) {
                this.schedulePeerDispose(playerId)
            }
        }
    }

    private ensurePeer(playerId: string): RemoteVoicePeer {
        const existing = this.peers.get(playerId)
        if (existing) {
            this.cancelPeerDispose(playerId)
            return existing
        }

        const connection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        })
        const audioElement = document.createElement("audio")
        audioElement.autoplay = true
        audioElement.setAttribute("playsinline", "true")
        audioElement.muted = false
        audioElement.volume = 1
        audioElement.style.display = "none"
        document.body.appendChild(audioElement)
        audioElement.onplay = () => this.debug(peer.id, "audio-element play", this.buildPeerSnapshot(peer))
        audioElement.onpause = () => this.debug(peer.id, "audio-element pause", this.buildPeerSnapshot(peer))
        audioElement.onvolumechange = () => this.debug(peer.id, "audio-element volumechange", {
            volume: audioElement.volume,
            muted: audioElement.muted,
        })
        audioElement.onerror = () => this.debug(peer.id, "audio-element error", {
            code: audioElement.error?.code ?? null,
            message: audioElement.error?.message ?? null,
        })

        const gainNode = this.audioContext.createGain()
        const pannerNode = this.audioContext.createPanner()
        gainNode.gain.value = 1

        pannerNode.panningModel = "HRTF"
        pannerNode.distanceModel = "inverse"
        pannerNode.refDistance = VOICE_MIN_DISTANCE
        pannerNode.maxDistance = VOICE_MAX_DISTANCE
        pannerNode.rolloffFactor = 0
        pannerNode.coneInnerAngle = 360
        pannerNode.coneOuterAngle = 360

        gainNode.connect(pannerNode)
        pannerNode.connect(AudioWorldSystem.getInstance().destination)

        const transceiver = connection.addTransceiver("audio", { direction: "sendrecv" })
        const sender = transceiver.sender
        void sender.replaceTrack(this.microphone.getInputTrack())

        connection.ontrack = event => {
            const [stream] = event.streams.length > 0
                ? event.streams
                : [new MediaStream([event.track])]
            if (!stream) return

            this.debug(playerId, "ontrack received", {
                streamId: stream.id,
                streamTracks: stream.getTracks().map(track => ({
                    id: track.id,
                    kind: track.kind,
                    enabled: track.enabled,
                    muted: "muted" in track ? (track as MediaStreamTrack).muted : undefined,
                    readyState: track.readyState,
                })),
                track: {
                    id: event.track.id,
                    kind: event.track.kind,
                    enabled: event.track.enabled,
                    muted: event.track.muted,
                    readyState: event.track.readyState,
                },
            })
            event.track.onmute = () => this.debug(playerId, "remote track mute", this.buildPeerSnapshot(peer))
            event.track.onunmute = () => this.debug(playerId, "remote track unmute", this.buildPeerSnapshot(peer))
            event.track.onended = () => this.debug(playerId, "remote track ended", this.buildPeerSnapshot(peer))

            audioElement.srcObject = stream

            if (!peer.sourceNode) {
                peer.sourceNode = this.audioContext.createMediaElementSource(audioElement)
                peer.sourceNode.connect(gainNode)
            }

            void audioElement.play().catch(error => {
                console.warn("[VoiceChatSystem] Remote audio play failed", peer.id, error)
                this.debug(peer.id, "audio-element play failed", {
                    error: error instanceof Error ? error.message : String(error),
                    snapshot: this.buildPeerSnapshot(peer),
                })
            })
        }

        connection.onicecandidate = event => {
            if (!event.candidate) return
            this.sendSignal(playerId, {
                kind: "candidate",
                candidate: event.candidate.toJSON(),
            })
        }

        connection.onconnectionstatechange = () => {
            const state = connection.connectionState
            this.debug(playerId, "connectionstatechange", this.buildPeerSnapshot(peer))
            if (state === "failed" || state === "closed") {
                this.disposePeer(playerId)
            } else if (state === "disconnected") {
                this.schedulePeerDispose(playerId)
            } else if (state === "connected") {
                this.cancelPeerDispose(playerId)
            }
        }
        connection.oniceconnectionstatechange = () => {
            this.debug(playerId, "iceconnectionstatechange", this.buildPeerSnapshot(peer))
        }
        connection.onicegatheringstatechange = () => {
            this.debug(playerId, "icegatheringstatechange", this.buildPeerSnapshot(peer))
        }
        connection.onsignalingstatechange = () => {
            this.debug(playerId, "signalingstatechange", this.buildPeerSnapshot(peer))
        }

        const peer: RemoteVoicePeer = {
            id: playerId,
            connection,
            sender,
            audioElement,
            gainNode,
            pannerNode,
            lastSignalSeq: 0,
            pendingCandidates: [],
            connectedAt: performance.now(),
            disposed: false,
        }
        this.peers.set(playerId, peer)
        this.cancelPeerDispose(playerId)

        if (this.shouldInitiate(playerId)) {
            setTimeout(() => {
                if (!peer.disposed && connection.signalingState === "stable") {
                    void this.createOffer(playerId, connection)
                }
            }, 80)
        }

        return peer
    }

    private shouldInitiate(remotePlayerId: string): boolean {
        return this.localPlayerId.localeCompare(remotePlayerId) < 0
    }

    private async createOffer(_playerId: string, connection: RTCPeerConnection): Promise<void> {
        const offer = await connection.createOffer({
            offerToReceiveAudio: true,
        })
        await connection.setLocalDescription(offer)
        this.flushLocalDescription(connection)
    }

    private processIncomingSignal(playerId: string, state: AwarenessStateWithVoice, peer: RemoteVoicePeer): void {
        const incomingEntries = Object.values(state.voiceSignals?.[this.localPlayerId] ?? {})
            .filter(signal => signal.sourceId === playerId && signal.targetId === this.localPlayerId)
            .sort((a, b) => a.seq - b.seq)

        for (const incoming of incomingEntries) {
            if (incoming.seq <= peer.lastSignalSeq) continue
            peer.lastSignalSeq = incoming.seq
            if (incoming.kind === "description" && incoming.description) {
                void this.acceptSignal(peer, incoming.description)
            } else if (incoming.kind === "candidate" && incoming.candidate) {
                void this.acceptCandidate(peer, incoming.candidate)
            }
        }
    }

    private async acceptSignal(peer: RemoteVoicePeer, description: VoiceSignalDescription): Promise<void> {
        const connection = peer.connection
        try {
            if (description.type === "answer") {
                if (connection.signalingState !== "have-local-offer") return
            } else if (description.type === "offer") {
                if (connection.signalingState !== "stable") return
            }

            await connection.setRemoteDescription(new RTCSessionDescription(description))
            await this.flushPendingCandidates(peer)

            if (description.type === "offer") {
                const answer = await connection.createAnswer()
                await connection.setLocalDescription(answer)
                this.flushLocalDescription(connection)
            }
        } catch (error) {
            console.warn("[VoiceChatSystem] Failed to accept signal", peer.id, error)
        }
    }

    private async acceptCandidate(peer: RemoteVoicePeer, candidate: RTCIceCandidateInit): Promise<void> {
        const connection = peer.connection
        try {
            if (!connection.remoteDescription) {
                peer.pendingCandidates.push(candidate)
                return
            }
            await connection.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (error) {
            console.warn("[VoiceChatSystem] Failed to accept ICE candidate", peer.id, error)
        }
    }

    private async flushPendingCandidates(peer: RemoteVoicePeer): Promise<void> {
        if (!peer.connection.remoteDescription || peer.pendingCandidates.length === 0) return
        const pending = [...peer.pendingCandidates]
        peer.pendingCandidates.length = 0
        for (const candidate of pending) {
            try {
                await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
            } catch (error) {
                console.warn("[VoiceChatSystem] Failed to flush pending ICE candidate", peer.id, error)
            }
        }
    }

    private sendSignal(
        targetId: string,
        payload: { kind: "description", description: VoiceSignalDescription } | { kind: "candidate", candidate: RTCIceCandidateInit },
    ): void {
        const localState = (this.awareness.getLocalState() ?? {}) as AwarenessStateWithVoice
        const currentSignals = localState.voiceSignals ?? {}
        const targetSignals = { ...(currentSignals[targetId] ?? {}) }
        const nextSeq = this.nextSignalSeq++

        targetSignals[String(nextSeq)] = {
            sourceId: this.localPlayerId,
            targetId,
            seq: nextSeq,
            ...payload,
        }

        const orderedKeys = Object.keys(targetSignals)
            .map(Number)
            .sort((a, b) => a - b)
        while (orderedKeys.length > 24) {
            const oldest = orderedKeys.shift()
            if (oldest !== undefined) {
                delete targetSignals[String(oldest)]
            }
        }

        const nextSignals = {
            ...currentSignals,
            [targetId]: targetSignals,
        }

        this.awareness.setLocalState({
            ...localState,
            voiceSignals: nextSignals,
        })
    }

    private publishVoicePresence(): void {
        const localState = (this.awareness.getLocalState() ?? {}) as AwarenessStateWithVoice
        const state = this.microphone.getState()
        this.awareness.setLocalState({
            ...localState,
            voiceEnabled: state.mode !== "muted",
            voiceActive: state.talkActive,
            voiceLevel: this.microphone.getBroadcastLevel(),
        })
    }

    private updateRemoteSpatialization(): void {
        const states = this.awareness.getStates()

        for (const [playerId, peer] of this.peers) {
            if (peer.disposed) continue

            const avatar = this.avatars.findAvatarByPlayerId(playerId)
            const head = avatar?.getHeadPosition()
            const source = this.sanitizeVector(head ?? Vector3.Zero(), Vector3.Zero())
            const awarenessState = this.getStateByPlayerId(states, playerId)
            const voiceLevel = Math.max(0, Math.min(1, awarenessState?.voiceLevel ?? 0))
            const voiceActive = !!awarenessState?.voiceActive
            const lastVoiceActive = this.lastVoiceActiveState.get(playerId) ?? false
            if (voiceActive && !lastVoiceActive) {
                this.debug(playerId, "remote player reported speaking", {
                    voiceLevel,
                    snapshot: this.buildPeerSnapshot(peer),
                })
            }
            this.lastVoiceActiveState.set(playerId, voiceActive)

            const now = this.audioContext.currentTime

            this.safeSetTarget(peer.gainNode.gain, 1, now, 0.06)
            this.safeSetTarget(peer.pannerNode.positionX, source.x, now, 0.06)
            this.safeSetTarget(peer.pannerNode.positionY, source.y, now, 0.06)
            this.safeSetTarget(peer.pannerNode.positionZ, -source.z, now, 0.06)
            this.safeSetTarget(peer.pannerNode.orientationX, 0, now, 0.1)
            this.safeSetTarget(peer.pannerNode.orientationY, 0, now, 0.1)
            this.safeSetTarget(peer.pannerNode.orientationZ, 1, now, 0.1)
            this.updateVoiceIndicator(playerId, source, voiceActive ? voiceLevel : 0)
        }

        for (const playerId of this.voiceIndicators.keys()) {
            if (!this.peers.has(playerId)) {
                this.hideVoiceIndicator(playerId)
            }
        }
    }

    private sanitizeVector(vector: Vector3, fallback: Vector3): Vector3 {
        if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || !Number.isFinite(vector.z)) {
            return fallback.clone()
        }
        return vector.clone()
    }

    private safeSetTarget(parameter: AudioParam, value: number, time: number, smoothing: number): void {
        if (!Number.isFinite(value)) return
        parameter.cancelScheduledValues(time)
        parameter.setTargetAtTime(value, time, smoothing)
    }

    private async syncOutgoingTrack(): Promise<void> {
        const track = this.microphone.getInputTrack()
        const trackId = track?.id ?? null
        if (trackId === this.lastPublishedTrackId) return
        this.lastPublishedTrackId = trackId

        this.debug(this.localPlayerId, "local outgoing track changed", {
            trackId,
            peerCount: this.peers.size,
        })

        const updates: Promise<unknown>[] = []

        for (const peer of this.peers.values()) {
            updates.push(peer.sender.replaceTrack(track))
            if (track && peer.connection.signalingState === "stable") {
                this.debug(peer.id, "creating renegotiation offer for local track publish", this.buildPeerSnapshot(peer))
                updates.push(this.createOffer(peer.id, peer.connection))
            }
        }

        await Promise.allSettled(updates)
    }

    private flushLocalDescription(connection: RTCPeerConnection): void {
        if (!connection.localDescription) return
        const remotePlayerId = [...this.peers.values()].find(peer => peer.connection === connection)?.id
        if (!remotePlayerId) return
        this.sendSignal(remotePlayerId, {
            kind: "description",
            description: connection.localDescription.toJSON(),
        })
    }

    private getStateByPlayerId(
        states: Map<number, unknown>,
        playerId: string,
    ): AwarenessStateWithVoice | undefined {
        for (const [, state] of states) {
            const awarenessState = state as AwarenessStateWithVoice
            if (awarenessState.playerId === playerId) {
                return awarenessState
            }
        }
        return undefined
    }

    private updateVoiceIndicator(playerId: string, position: Vector3, level: number): void {
        const indicator = this.ensureVoiceIndicator(playerId)
        indicator.position.copyFrom(position).addInPlaceFromFloats(0, -0.08, 0)
        indicator.isVisible = level > 0.02
        indicator.scaling.setAll(0.32 + level * 0.52)
        indicator.visibility = Math.min(0.85, 0.18 + level * 0.6)
    }

    private ensureVoiceIndicator(playerId: string): AbstractMesh {
        const existing = this.voiceIndicators.get(playerId)
        if (existing) return existing

        const indicator = CreateIcoSphere(`voice-indicator-${playerId}`, { radius: 1, subdivisions: 1 }, this.scenes.getScene())
        indicator.material = this.voiceIndicatorMaterial
        indicator.isPickable = false
        indicator.checkCollisions = false
        indicator.isVisible = false
        this.voiceIndicators.set(playerId, indicator)
        return indicator
    }

    private hideVoiceIndicator(playerId: string): void {
        const indicator = this.voiceIndicators.get(playerId)
        if (!indicator) return
        indicator.isVisible = false
    }

    private schedulePeerDispose(playerId: string): void {
        if (this.remoteTimeouts.has(playerId)) return
        const timeout = setTimeout(() => {
            this.remoteTimeouts.delete(playerId)
            this.disposePeer(playerId)
        }, 5000)
        this.remoteTimeouts.set(playerId, timeout)
    }

    private cancelPeerDispose(playerId: string): void {
        const timeout = this.remoteTimeouts.get(playerId)
        if (!timeout) return
        clearTimeout(timeout)
        this.remoteTimeouts.delete(playerId)
    }

    private disposePeer(playerId: string): void {
        const peer = this.peers.get(playerId)
        if (!peer) return

        peer.disposed = true
        this.cancelPeerDispose(playerId)
        try { peer.audioElement.pause() } catch {}
        peer.audioElement.srcObject = null
        peer.audioElement.remove()
        try { peer.sourceNode?.disconnect() } catch {}
        try { peer.gainNode.disconnect() } catch {}
        try { peer.pannerNode.disconnect() } catch {}
        try { peer.connection.close() } catch {}
        this.voiceIndicators.get(playerId)?.dispose()
        this.voiceIndicators.delete(playerId)
        this.lastVoiceActiveState.delete(playerId)
        this.peers.delete(playerId)
    }

    private buildPeerSnapshot(peer: RemoteVoicePeer) {
        const receiver = peer.connection.getReceivers().find(it => it.track?.kind === "audio")
        const remoteStream = peer.audioElement.srcObject instanceof MediaStream ? peer.audioElement.srcObject : null
        return {
            signalingState: peer.connection.signalingState,
            iceConnectionState: peer.connection.iceConnectionState,
            iceGatheringState: peer.connection.iceGatheringState,
            connectionState: peer.connection.connectionState,
            senderTrackId: peer.sender.track?.id ?? null,
            senderTrackEnabled: peer.sender.track?.enabled ?? null,
            receiverTrackId: receiver?.track?.id ?? null,
            receiverTrackMuted: receiver?.track?.muted ?? null,
            receiverTrackReadyState: receiver?.track?.readyState ?? null,
            remoteStreamId: remoteStream?.id ?? null,
            remoteStreamTrackCount: remoteStream?.getTracks().length ?? 0,
            audioPaused: peer.audioElement.paused,
            audioMuted: peer.audioElement.muted,
            audioVolume: peer.audioElement.volume,
            audioReadyState: peer.audioElement.readyState,
            hasSourceNode: !!peer.sourceNode,
            pendingCandidates: peer.pendingCandidates.length,
        }
    }

    private debug(playerId: string, message: string, payload?: unknown): void {
        if (!DEBUG_VOICE_RECEPTION) return
        if (payload !== undefined) {
            console.log(`[VoiceChatSystem][recv ${playerId}] ${message}`, payload)
        } else {
            console.log(`[VoiceChatSystem][recv ${playerId}] ${message}`)
        }
    }
}
