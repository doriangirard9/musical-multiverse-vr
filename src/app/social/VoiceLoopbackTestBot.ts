import { AbstractMesh, Color3, CreateIcoSphere, Observer, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { RemoteVoiceOutput } from "./RemoteVoiceOutput"
import { getVoiceProximity } from "./VoiceProximity"

const MIN_TEST_BOT_DISTANCE_METERS = 0.5
const MAX_TEST_BOT_DISTANCE_METERS = 16

/**
 * Development-only voice probe. Its tone crosses a local WebRTC pair before it
 * reaches the same spatial Web Audio output used by remote participants.
 */
export class VoiceLoopbackTestBot {
    private readonly sender = new RTCPeerConnection()
    private readonly receiver = new RTCPeerConnection()
    private readonly streamDestination: MediaStreamAudioDestinationNode
    private readonly oscillator: OscillatorNode
    private readonly toneGain: GainNode
    private readonly sourceAnalyser: AnalyserNode
    private readonly receiverAnalyser: AnalyserNode
    private readonly outputGain: GainNode
    private readonly panner: PannerNode
    private readonly mesh: AbstractMesh
    private readonly material: StandardMaterial
    private remoteOutput?: RemoteVoiceOutput
    private observer?: Observer<Scene>
    private diagnosticTimer?: ReturnType<typeof setInterval>
    private readonly sourceBuffer = new Float32Array(256)
    private readonly receiverBuffer = new Float32Array(256)
    private speaking = false
    private disposed = false
    private position?: Vector3

    constructor(
        private readonly audioContext: AudioContext,
        private readonly scene: Scene,
        private readonly getListenerPosition: () => Vector3,
    ) {
        this.streamDestination = audioContext.createMediaStreamDestination()
        this.oscillator = audioContext.createOscillator()
        this.toneGain = audioContext.createGain()
        this.sourceAnalyser = audioContext.createAnalyser()
        this.receiverAnalyser = audioContext.createAnalyser()
        this.outputGain = audioContext.createGain()
        this.panner = audioContext.createPanner()

        this.oscillator.type = "sine"
        this.oscillator.frequency.value = 440
        this.toneGain.gain.value = 0
        this.sourceAnalyser.fftSize = 512
        this.receiverAnalyser.fftSize = 512
        this.outputGain.gain.value = 0.9
        this.panner.panningModel = "HRTF"
        this.panner.distanceModel = "inverse"
        this.panner.rolloffFactor = 0

        this.oscillator.connect(this.toneGain)
        this.toneGain.connect(this.sourceAnalyser)
        this.sourceAnalyser.connect(this.streamDestination)
        this.receiverAnalyser.connect(this.outputGain)
        this.outputGain.connect(this.panner)
        this.panner.connect(audioContext.destination)
        this.oscillator.start()

        this.material = new StandardMaterial("voice-test-bot-material", scene)
        this.material.diffuseColor = new Color3(0.2, 0.8, 1)
        this.material.emissiveColor = new Color3(0.05, 0.35, 0.7)
        this.mesh = CreateIcoSphere("voice-test-bot", { radius: 0.28, subdivisions: 2 }, scene)
        this.mesh.material = this.material
        this.mesh.isPickable = false
    }

    async start(): Promise<void> {
        const track = this.streamDestination.stream.getAudioTracks()[0]
        if (!track) throw new Error("Voice test bot could not create an audio track.")
        await this.audioContext.resume()
        console.info("[VoiceTestBot] starting", {
            audioContextState: this.audioContext.state,
            trackId: track.id,
            trackEnabled: track.enabled,
            trackMuted: track.muted,
        })

        this.receiver.ontrack = event => {
            const stream = event.streams[0] ?? new MediaStream([event.track])
            this.remoteOutput = new RemoteVoiceOutput(this.audioContext, stream, this.receiverAnalyser)
            void this.remoteOutput.start().then(() => {
                console.info("[VoiceTestBot] media output started")
            }).catch(error => {
                console.warn("[VoiceTestBot] media output failed to start", error)
            })
            console.info("[VoiceTestBot] remote track attached", {
                trackId: event.track.id,
                enabled: event.track.enabled,
                muted: event.track.muted,
                readyState: event.track.readyState,
            })
        }
        this.sender.onconnectionstatechange = () => this.logConnectionState("sender", this.sender)
        this.receiver.onconnectionstatechange = () => this.logConnectionState("receiver", this.receiver)

        this.sender.addTrack(track, this.streamDestination.stream)
        const offer = await this.sender.createOffer()
        await this.sender.setLocalDescription(offer)
        await this.waitForIceGathering(this.sender)
        await this.receiver.setRemoteDescription(this.sender.localDescription!)
        const answer = await this.receiver.createAnswer()
        await this.receiver.setLocalDescription(answer)
        await this.waitForIceGathering(this.receiver)
        await this.sender.setRemoteDescription(this.receiver.localDescription!)

        this.position = this.getListenerPosition().add(new Vector3(0, 0, 2))
        this.observer = this.scene.onBeforeRenderObservable.add(() => this.updatePosition())
        this.diagnosticTimer = setInterval(() => void this.logDiagnostics(), 2_000)
        this.startTone()
    }

    private waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
        if (connection.iceGatheringState === "complete") return Promise.resolve()
        return new Promise(resolve => {
            const onChange = (): void => {
                if (connection.iceGatheringState !== "complete") return
                connection.removeEventListener("icegatheringstatechange", onChange)
                resolve()
            }
            connection.addEventListener("icegatheringstatechange", onChange)
        })
    }

    adjustDistance(deltaMeters: number): number | undefined {
        if (!this.position || !Number.isFinite(deltaMeters)) return undefined

        const listener = this.getListenerPosition()
        let offset = this.position.subtract(listener)
        if (offset.lengthSquared() < 0.0001) offset = Vector3.Forward()
        const distance = Math.max(
            MIN_TEST_BOT_DISTANCE_METERS,
            Math.min(MAX_TEST_BOT_DISTANCE_METERS, offset.length() + deltaMeters),
        )
        this.position = listener.add(offset.normalize().scale(distance))
        return distance
    }

    getDistance(): number | undefined {
        return this.position
            ? Vector3.Distance(this.getListenerPosition(), this.position)
            : undefined
    }

    private startTone(): void {
        this.speaking = true
        const now = this.audioContext.currentTime
        this.toneGain.gain.cancelScheduledValues(now)
        this.toneGain.gain.setTargetAtTime(0.11, now, 0.04)
        this.oscillator.frequency.setTargetAtTime(440, now, 0.03)
    }

    private updatePosition(): void {
        const listener = this.getListenerPosition()
        const position = this.position ?? listener.add(new Vector3(0, 0, 2))
        const proximity = getVoiceProximity(Vector3.Distance(listener, position))
        const now = this.audioContext.currentTime
        this.mesh.position.copyFrom(position)
        const pulse = 1 + Math.sin(now * Math.PI * 2) * 0.12
        this.mesh.scaling.setAll(this.speaking ? pulse : 0.8)
        this.remoteOutput?.setVolume(proximity.gain)
        this.outputGain.gain.setTargetAtTime(0.9 * proximity.gain, now, 0.05)
        this.panner.positionX.setTargetAtTime(position.x, now, 0.05)
        this.panner.positionY.setTargetAtTime(position.y, now, 0.05)
        this.panner.positionZ.setTargetAtTime(-position.z, now, 0.05)
    }

    private logConnectionState(label: string, connection: RTCPeerConnection): void {
        console.info(`[VoiceTestBot] ${label} connection`, {
            connectionState: connection.connectionState,
            iceConnectionState: connection.iceConnectionState,
            signalingState: connection.signalingState,
        })
    }

    private getLevel(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
        analyser.getFloatTimeDomainData(buffer)
        let energy = 0
        for (const sample of buffer) energy += sample * sample
        return Math.sqrt(energy / buffer.length)
    }

    private async logDiagnostics(): Promise<void> {
        const senderStats = await this.sender.getStats()
        const receiverStats = await this.receiver.getStats()
        let sentBytes = 0
        let receivedBytes = 0
        let sentPackets = 0
        let receivedPackets = 0
        for (const report of senderStats.values()) {
            if (report.type === "outbound-rtp" && report.kind === "audio") {
                sentBytes = Number(report.bytesSent ?? 0)
                sentPackets = Number(report.packetsSent ?? 0)
            }
        }
        for (const report of receiverStats.values()) {
            if (report.type === "inbound-rtp" && report.kind === "audio") {
                receivedBytes = Number(report.bytesReceived ?? 0)
                receivedPackets = Number(report.packetsReceived ?? 0)
            }
        }
        console.info("[VoiceTestBot] diagnostic", {
            speaking: this.speaking,
            generatedLevel: Number(this.getLevel(this.sourceAnalyser, this.sourceBuffer).toFixed(4)),
            receivedLevel: Number(this.getLevel(this.receiverAnalyser, this.receiverBuffer).toFixed(4)),
            hasRemoteSource: !!this.remoteOutput,
            mediaTime: Number((this.remoteOutput?.currentTime ?? 0).toFixed(2)),
            mediaPaused: this.remoteOutput?.paused ?? null,
            sentBytes,
            sentPackets,
            receivedBytes,
            receivedPackets,
            distanceMeters: Number((this.getDistance() ?? 0).toFixed(2)),
            proximity: getVoiceProximity(this.getDistance()),
            audioContextState: this.audioContext.state,
        })
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer)
        if (this.diagnosticTimer) clearInterval(this.diagnosticTimer)
        try { this.oscillator.stop() } catch {}
        try { this.oscillator.disconnect() } catch {}
        try { this.toneGain.disconnect() } catch {}
        try { this.sourceAnalyser.disconnect() } catch {}
        try { this.receiverAnalyser.disconnect() } catch {}
        this.remoteOutput?.dispose()
        try { this.outputGain.disconnect() } catch {}
        try { this.panner.disconnect() } catch {}
        this.sender.close()
        this.receiver.close()
        this.mesh.dispose()
        this.material.dispose()
    }
}
