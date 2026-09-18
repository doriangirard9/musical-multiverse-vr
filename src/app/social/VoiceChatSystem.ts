import { AbstractMesh, Color3, CreateIcoSphere, Observer, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import type { Awareness } from "y-protocols/awareness"
import { AvatarSystem } from "./AvatarSystem"
import { MicrophoneSystem } from "../MicrophoneSystem"
import { NetworkManager } from "../../network/NetworkManager"
import { SceneManager } from "../SceneManager"
import { VoiceSignalingClient, type VoiceSignalingMessage } from "./VoiceSignalingClient"
import { VoiceLoopbackTestBot } from "./VoiceLoopbackTestBot"
import { RemoteVoiceOutput } from "./RemoteVoiceOutput"
import { getVoiceProximity, VOICE_FULL_VOLUME_DISTANCE_METERS, VOICE_MUTE_DISTANCE_METERS } from "./VoiceProximity"

type AwarenessStateWithVoice = {
    playerId?: string
    voiceEnabled?: boolean
    voiceActive?: boolean
    voiceLevel?: number
}

type RemoteVoicePeer = {
    id: string
    connection: RTCPeerConnection
    sender: RTCRtpSender
    output?: RemoteVoiceOutput
    analyserNode: AnalyserNode
    analyserBuffer: Float32Array<ArrayBuffer>
    gainNode: GainNode
    pannerNode: PannerNode
    pendingCandidates: RTCIceCandidateInit[]
    polite: boolean
    initiator: boolean
    makingOffer: boolean
    ignoreOffer: boolean
    disposed: boolean
    lastReceivedLevel: number
    lastDiagnosticAt: number
}

const UPDATE_INTERVAL_MS = 100
const VOICE_MAX_BITRATE = 24_000
const RECEIVER_LEVEL_SCALE = 5
const DIAGNOSTIC_INTERVAL_MS = 2_000

export class VoiceChatSystem {
    private static _instance?: VoiceChatSystem

    static initialize(
        audioContext: AudioContext,
        network: NetworkManager,
        avatars: AvatarSystem,
        scenes: SceneManager,
    ): VoiceChatSystem {
        this._instance?.dispose()
        this._instance = new VoiceChatSystem(audioContext, avatars, scenes, network)
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
    private readonly signaling: VoiceSignalingClient
    private readonly peers = new Map<string, RemoteVoicePeer>()
    private readonly voiceIndicators = new Map<string, AbstractMesh>()
    private readonly lastVoiceActiveState = new Map<string, boolean>()
    private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly voiceIndicatorMaterial: StandardMaterial
    private testBot?: VoiceLoopbackTestBot
    private readonly awarenessChangeHandler = () => this.updateRemoteSpatialization()
    private updateObserver?: Observer<Scene>
    private updateAccumulator = 0
    private lastOutgoingTrackId: string | null = null
    private readonly debugEnabled =
        new URLSearchParams(window.location.search).has("debugVoice")
        || window.localStorage.getItem("wj-debug-voice") === "1"
    private readonly desktopTestKeyHandler = (event: KeyboardEvent): void => {
        if (!this.testBot || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

        const distanceDelta = event.code === "KeyO" ? 1 : event.code === "KeyP" ? -1 : 0
        if (distanceDelta === 0) return
        event.preventDefault()
        event.stopImmediatePropagation()
        const distance = this.testBot.adjustDistance(distanceDelta)
        this.debug(this.localPlayerId, "voice test bot distance changed", { distanceMeters: distance })
    }

    private constructor(
        private readonly audioContext: AudioContext,
        private readonly avatars: AvatarSystem,
        private readonly scenes: SceneManager,
        network: NetworkManager,
    ) {
        this.awareness = network.connection.getAwareness()
        this.microphone = MicrophoneSystem.getInstance()
        this.localPlayerId = String(this.awareness.getLocalState()?.["playerId"] ?? network.playerId)
        this.voiceIndicatorMaterial = new StandardMaterial("voice-indicator", scenes.getScene())
        this.voiceIndicatorMaterial.diffuseColor = new Color3(0.35, 0.95, 0.85)
        this.voiceIndicatorMaterial.emissiveColor = new Color3(0.15, 0.7, 0.6)
        this.voiceIndicatorMaterial.alpha = 0.24
        this.voiceIndicatorMaterial.backFaceCulling = false

        this.signaling = new VoiceSignalingClient(
            network.roomName,
            this.localPlayerId,
            message => this.handleSignal(message),
            status => this.debug(this.localPlayerId, `signaling ${status}`),
        )

        this.updateObserver = scenes.getScene().onBeforeRenderObservable.add(() => {
            this.updateAccumulator += scenes.getScene().getEngine().getDeltaTime()
            if (this.updateAccumulator < UPDATE_INTERVAL_MS) return
            this.updateAccumulator = 0
            this.publishVoicePresence()
            this.updateRemoteSpatialization()
        })

        this.awareness.on("change", this.awarenessChangeHandler)
        window.addEventListener("keydown", this.desktopTestKeyHandler)
        this.microphone.onStateChanged.add(() => {
            this.publishVoicePresence()
            void this.syncOutgoingTrack()
        })

        this.publishVoicePresence()
        this.debug(this.localPlayerId, "voice system ready", {
            audioContextState: audioContext.state,
            roomName: network.roomName,
            broadcastTrackId: this.microphone.getBroadcastTrack()?.id ?? null,
        })
        if (new URLSearchParams(window.location.search).has("voiceTest")) {
            void this.startTestBot()
        }
    }

    private handleSignal(message: VoiceSignalingMessage): void {
        switch (message.type) {
            case "peer-list":
                for (const playerId of message.peers) this.ensurePeer(playerId)
                break
            case "peer-joined":
                this.ensurePeer(message.playerId)
                break
            case "peer-left":
                this.disposePeer(message.playerId)
                break
            case "offer":
            case "answer":
                void this.acceptDescription(message.sourceId, message.description)
                break
            case "ice-candidate":
                void this.acceptCandidate(message.sourceId, message.candidate)
                break
            case "error":
                console.warn("[VoiceChatSystem] Signaling error:", message.message)
                break
        }
    }

    private ensurePeer(playerId: string): RemoteVoicePeer {
        const existing = this.peers.get(playerId)
        if (existing) return existing
        if (!playerId || playerId === this.localPlayerId) {
            throw new Error("Cannot create a voice peer for the local player.")
        }

        const connection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        })
        const gainNode = this.audioContext.createGain()
        const pannerNode = this.audioContext.createPanner()
        const analyserNode = this.audioContext.createAnalyser()
        gainNode.gain.value = 0
        analyserNode.fftSize = 256
        analyserNode.smoothingTimeConstant = 0.7

        pannerNode.panningModel = "HRTF"
        pannerNode.distanceModel = "inverse"
        pannerNode.refDistance = VOICE_FULL_VOLUME_DISTANCE_METERS
        pannerNode.maxDistance = VOICE_MUTE_DISTANCE_METERS
        pannerNode.rolloffFactor = 0
        pannerNode.coneInnerAngle = 360
        pannerNode.coneOuterAngle = 360

        analyserNode.connect(gainNode)
        // Voice deliberately bypasses the musical world bus and its optional
        // filters. It remains a spatial Web Audio source, but never needs a WAM
        // Speaker node in the scene to be audible.
        pannerNode.connect(this.audioContext.destination)
        gainNode.connect(pannerNode)

        const broadcastTrack = this.microphone.getBroadcastTrack()
        // The media destination track exists before permission is granted and
        // remains stable afterwards. Adding it before the offer guarantees that
        // the negotiated m-line is actually allowed to send audio on every peer.
        const sender = broadcastTrack
            ? connection.addTrack(broadcastTrack, this.microphone.getBroadcastStream())
            : connection.addTransceiver("audio", { direction: "sendrecv" }).sender
        const peer: RemoteVoicePeer = {
            id: playerId,
            connection,
            sender,
            analyserNode,
            analyserBuffer: new Float32Array(analyserNode.fftSize),
            gainNode,
            pannerNode,
            pendingCandidates: [],
            polite: this.localPlayerId.localeCompare(playerId) > 0,
            // A deterministic initiator prevents simultaneous offers on join.
            initiator: this.localPlayerId.localeCompare(playerId) < 0,
            makingOffer: false,
            ignoreOffer: false,
            disposed: false,
            lastReceivedLevel: 0,
            lastDiagnosticAt: 0,
        }
        this.peers.set(playerId, peer)
        void this.applySenderBitrate(sender)

        connection.onnegotiationneeded = () => {
            if (peer.initiator) void this.negotiate(peer)
        }

        connection.onicecandidate = event => {
            if (!event.candidate) return
            this.signaling.send({
                type: "ice-candidate",
                targetId: playerId,
                candidate: event.candidate.toJSON(),
            })
        }

        connection.ontrack = event => {
            const [stream] = event.streams.length > 0
                ? event.streams
                : [new MediaStream([event.track])]
            if (!stream || peer.output) return

            peer.output = new RemoteVoiceOutput(this.audioContext, stream, peer.analyserNode)
            void peer.output.start().then(() => {
                this.debug(playerId, "remote audio output started", this.buildPeerSnapshot(peer))
            }).catch(error => {
                console.warn("[VoiceChatSystem] Remote audio output failed to start", playerId, error)
            })
            this.debug(playerId, "remote audio track connected", this.buildPeerSnapshot(peer))
        }

        connection.onconnectionstatechange = () => {
            this.debug(playerId, "connectionstatechange", this.buildPeerSnapshot(peer))
            if (connection.connectionState === "connected") {
                this.clearDisconnectTimer(playerId)
            } else if (connection.connectionState === "disconnected") {
                this.schedulePeerDispose(playerId)
            } else if (["failed", "closed"].includes(connection.connectionState)) {
                this.disposePeer(playerId)
            }
        }
        connection.oniceconnectionstatechange = () => this.debug(playerId, "iceconnectionstatechange", this.buildPeerSnapshot(peer))
        connection.onsignalingstatechange = () => this.debug(playerId, "signalingstatechange", this.buildPeerSnapshot(peer))

        this.debug(playerId, "peer created", this.buildPeerSnapshot(peer))
        return peer
    }

    private async negotiate(peer: RemoteVoicePeer): Promise<void> {
        const connection = peer.connection
        if (peer.disposed || peer.makingOffer || connection.signalingState !== "stable") return

        try {
            peer.makingOffer = true
            await connection.setLocalDescription()
            this.sendDescription(peer.id, connection.localDescription)
            this.debug(peer.id, "sent local offer", this.buildPeerSnapshot(peer))
        } catch (error) {
            console.warn("[VoiceChatSystem] Failed to negotiate voice peer", peer.id, error)
        } finally {
            peer.makingOffer = false
        }
    }

    private async acceptDescription(playerId: string, description: RTCSessionDescriptionInit): Promise<void> {
        const peer = this.ensurePeer(playerId)
        const connection = peer.connection
        const readyForOffer = !peer.makingOffer && connection.signalingState === "stable"
        const offerCollision = description.type === "offer" && !readyForOffer

        peer.ignoreOffer = !peer.polite && offerCollision
        if (peer.ignoreOffer) {
            this.debug(playerId, "ignored colliding offer")
            return
        }

        try {
            if (offerCollision && peer.polite) {
                await connection.setLocalDescription({ type: "rollback" })
            }
            if (description.type === "answer" && connection.signalingState !== "have-local-offer") {
                this.debug(playerId, "ignored unexpected answer", this.buildPeerSnapshot(peer))
                return
            }
            await connection.setRemoteDescription(description)
            await this.flushPendingCandidates(peer)
            if (description.type === "offer") {
                await connection.setLocalDescription()
                this.sendDescription(playerId, connection.localDescription)
                this.debug(playerId, "sent local answer", this.buildPeerSnapshot(peer))
            }
        } catch (error) {
            console.warn("[VoiceChatSystem] Failed to accept voice description", playerId, error)
        }
    }

    private async acceptCandidate(playerId: string, candidate: RTCIceCandidateInit): Promise<void> {
        const peer = this.ensurePeer(playerId)
        try {
            if (!peer.connection.remoteDescription) {
                peer.pendingCandidates.push(candidate)
                return
            }
            await peer.connection.addIceCandidate(candidate)
        } catch (error) {
            if (!peer.ignoreOffer) {
                console.warn("[VoiceChatSystem] Failed to accept ICE candidate", playerId, error)
            }
        }
    }

    private async flushPendingCandidates(peer: RemoteVoicePeer): Promise<void> {
        if (!peer.connection.remoteDescription || peer.pendingCandidates.length === 0) return
        const pending = [...peer.pendingCandidates]
        peer.pendingCandidates.length = 0
        for (const candidate of pending) {
            try {
                await peer.connection.addIceCandidate(candidate)
            } catch (error) {
                console.warn("[VoiceChatSystem] Failed to flush pending ICE candidate", peer.id, error)
            }
        }
    }

    private sendDescription(playerId: string, description: RTCSessionDescription | null): void {
        if (!description) return
        this.signaling.send({
            type: description.type === "offer" ? "offer" : "answer",
            targetId: playerId,
            description: description.toJSON(),
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
            const source = avatar ? this.sanitizeVector(avatar.getHeadPosition(), Vector3.Zero()) : undefined
            const awarenessState = this.getStateByPlayerId(states, playerId)
            const voiceLevel = Math.max(0, Math.min(1, awarenessState?.voiceLevel ?? 0))
            const voiceActive = !!awarenessState?.voiceActive
            const lastVoiceActive = this.lastVoiceActiveState.get(playerId) ?? false
            if (voiceActive !== lastVoiceActive) {
                this.debug(playerId, voiceActive ? "remote voice active" : "remote voice inactive", {
                    voiceLevel,
                    snapshot: this.buildPeerSnapshot(peer),
                })
            }
            this.lastVoiceActiveState.set(playerId, voiceActive)

            const receivedLevel = this.readReceivedLevel(peer)
            const now = this.audioContext.currentTime
            const position = source ?? this.getLocalHeadPosition()
            const distanceMeters = source
                ? Vector3.Distance(this.getLocalHeadPosition(), source)
                : undefined
            const proximity = getVoiceProximity(distanceMeters)
            // Chromium's media-element fallback bypasses Web Audio in some
            // WebXR runtimes, so apply the same proximity curve directly.
            peer.output?.setVolume(proximity.gain)
            this.safeSetTarget(peer.gainNode.gain, proximity.gain, now, 0.06)
            this.safeSetTarget(peer.pannerNode.positionX, position.x, now, 0.06)
            this.safeSetTarget(peer.pannerNode.positionY, position.y, now, 0.06)
            this.safeSetTarget(peer.pannerNode.positionZ, -position.z, now, 0.06)
            this.safeSetTarget(peer.pannerNode.orientationX, 0, now, 0.1)
            this.safeSetTarget(peer.pannerNode.orientationY, 0, now, 0.1)
            this.safeSetTarget(peer.pannerNode.orientationZ, 1, now, 0.1)
            this.updateVoiceIndicator(playerId, position, Math.max(voiceActive ? voiceLevel : 0, receivedLevel))
            if (this.debugEnabled && now * 1000 - peer.lastDiagnosticAt > DIAGNOSTIC_INTERVAL_MS) {
                peer.lastDiagnosticAt = now * 1000
                this.debug(playerId, "receiver diagnostic", {
                    awarenessLevel: voiceLevel,
                    receivedLevel,
                    distanceMeters,
                    proximityGain: proximity.gain,
                    proximityMuted: proximity.muted,
                    hasAvatar: !!avatar,
                    audioContextState: this.audioContext.state,
                    snapshot: this.buildPeerSnapshot(peer),
                })
                void this.debugTransportStats(peer)
            }
        }
    }

    private getLocalHeadPosition(): Vector3 {
        const head = this.avatars.avatar?.getHeadPosition()
            ?? this.scenes.getScene().activeCamera?.globalPosition
            ?? Vector3.Zero()
        return this.sanitizeVector(head, Vector3.Zero())
    }

    private readReceivedLevel(peer: RemoteVoicePeer): number {
        if (!peer.output) return 0
        peer.analyserNode.getFloatTimeDomainData(peer.analyserBuffer)
        let energy = 0
        for (const sample of peer.analyserBuffer) energy += sample * sample
        peer.lastReceivedLevel = Math.min(1, Math.sqrt(energy / peer.analyserBuffer.length) * RECEIVER_LEVEL_SCALE)
        return peer.lastReceivedLevel
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

    private async applySenderBitrate(sender: RTCRtpSender): Promise<void> {
        if (!sender.getParameters || !sender.setParameters) return
        const params = sender.getParameters()
        params.encodings = params.encodings?.length ? params.encodings : [{}]
        params.encodings[0].maxBitrate = VOICE_MAX_BITRATE
        try {
            await sender.setParameters(params)
        } catch (error) {
            this.debug(this.localPlayerId, "sender bitrate cap unsupported", error)
        }
    }

    private async syncOutgoingTrack(): Promise<void> {
        const track = this.microphone.getBroadcastTrack()
        const trackId = track?.id ?? null
        if (trackId === this.lastOutgoingTrackId) return
        this.lastOutgoingTrackId = trackId

        await Promise.allSettled([...this.peers.values()].map(async peer => {
            await peer.sender.replaceTrack(track)
            await this.applySenderBitrate(peer.sender)
            this.debug(peer.id, "outgoing capture track updated", this.buildPeerSnapshot(peer))
        }))
    }

    private async debugTransportStats(peer: RemoteVoicePeer): Promise<void> {
        try {
            const stats = await peer.connection.getStats()
            let outbound: RTCOutboundRtpStreamStats | undefined
            let inbound: RTCInboundRtpStreamStats | undefined
            for (const report of stats.values()) {
                if (report.type === "outbound-rtp" && report.kind === "audio") {
                    outbound = report as RTCOutboundRtpStreamStats
                }
                if (report.type === "inbound-rtp" && report.kind === "audio") {
                    inbound = report as RTCInboundRtpStreamStats
                }
            }
            this.debug(peer.id, "transport stats", {
                sentBytes: outbound?.bytesSent ?? 0,
                sentPackets: outbound?.packetsSent ?? 0,
                receivedBytes: inbound?.bytesReceived ?? 0,
                receivedPackets: inbound?.packetsReceived ?? 0,
                lostPackets: inbound?.packetsLost ?? 0,
                jitter: inbound?.jitter ?? 0,
            })
        } catch (error) {
            this.debug(peer.id, "unable to read transport stats", error)
        }
    }

    private getStateByPlayerId(states: Map<number, unknown>, playerId: string): AwarenessStateWithVoice | undefined {
        for (const [, state] of states) {
            const awarenessState = state as AwarenessStateWithVoice
            if (awarenessState.playerId === playerId) return awarenessState
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

    private disposePeer(playerId: string): void {
        const peer = this.peers.get(playerId)
        if (!peer) return

        this.clearDisconnectTimer(playerId)
        peer.disposed = true
        peer.output?.dispose()
        try { peer.analyserNode.disconnect() } catch {}
        try { peer.gainNode.disconnect() } catch {}
        try { peer.pannerNode.disconnect() } catch {}
        try { peer.connection.close() } catch {}
        this.voiceIndicators.get(playerId)?.dispose()
        this.voiceIndicators.delete(playerId)
        this.lastVoiceActiveState.delete(playerId)
        this.peers.delete(playerId)
    }

    private schedulePeerDispose(playerId: string): void {
        if (this.disconnectTimers.has(playerId)) return
        this.disconnectTimers.set(playerId, setTimeout(() => {
            this.disconnectTimers.delete(playerId)
            const peer = this.peers.get(playerId)
            if (peer?.connection.connectionState === "disconnected") {
                this.disposePeer(playerId)
            }
        }, 5000))
    }

    private clearDisconnectTimer(playerId: string): void {
        const timer = this.disconnectTimers.get(playerId)
        if (!timer) return
        clearTimeout(timer)
        this.disconnectTimers.delete(playerId)
    }

    private buildPeerSnapshot(peer: RemoteVoicePeer) {
        const receiver = peer.connection.getReceivers().find(it => it.track?.kind === "audio")
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
            hasAudioOutput: !!peer.output,
            receivedLevel: peer.lastReceivedLevel,
            pendingCandidates: peer.pendingCandidates.length,
            polite: peer.polite,
        }
    }

    private debug(playerId: string, message: string, payload?: unknown): void {
        if (!this.debugEnabled) return
        if (payload !== undefined) {
            console.log(`[VoiceChatSystem][${playerId}] ${message}`, payload)
        } else {
            console.log(`[VoiceChatSystem][${playerId}] ${message}`)
        }
    }

    isTestBotRunning(): boolean {
        return !!this.testBot
    }

    async toggleTestBot(): Promise<void> {
        if (this.testBot) {
            this.testBot.dispose()
            this.testBot = undefined
            return
        }
        await this.startTestBot()
    }

    adjustTestBotDistance(deltaMeters: number): number | undefined {
        return this.testBot?.adjustDistance(deltaMeters)
    }

    getTestBotDistance(): number | undefined {
        return this.testBot?.getDistance()
    }

    private async startTestBot(): Promise<void> {
        if (this.testBot) return
        const bot = new VoiceLoopbackTestBot(
            this.audioContext,
            this.scenes.getScene(),
            () => this.getLocalHeadPosition(),
        )
        try {
            await bot.start()
            this.testBot = bot
            this.debug(this.localPlayerId, "voice loopback test bot started")
        } catch (error) {
            bot.dispose()
            console.warn("[VoiceChatSystem] Voice test bot failed to start", error)
        }
    }

    dispose(): void {
        if (this.updateObserver) {
            this.scenes.getScene().onBeforeRenderObservable.remove(this.updateObserver)
            this.updateObserver = undefined
        }
        this.awareness.off("change", this.awarenessChangeHandler)
        window.removeEventListener("keydown", this.desktopTestKeyHandler)
        this.signaling.dispose()
        this.testBot?.dispose()
        this.testBot = undefined
        for (const playerId of [...this.peers.keys()]) this.disposePeer(playerId)
        for (const timer of this.disconnectTimers.values()) clearTimeout(timer)
        this.disconnectTimers.clear()
        this.voiceIndicatorMaterial.dispose()
        if (VoiceChatSystem._instance === this) VoiceChatSystem._instance = undefined
    }
}
