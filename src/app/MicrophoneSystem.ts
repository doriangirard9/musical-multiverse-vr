import { Observable } from "@babylonjs/core"
import { KeyboardInputs } from "../xr/inputs/KeyboardInputs"

export type MicrophoneMode = "muted" | "push_to_talk" | "open_mic"
export type MicrophoneStatus = "idle" | "requesting" | "ready" | "error"

export interface MicrophoneState {
    mode: MicrophoneMode
    status: MicrophoneStatus
    monitorEnabled: boolean
    monitorLevel: number
    talkActive: boolean
    level: number
    error: string | null
}

export class MicrophoneSystem {
    private static _instance?: MicrophoneSystem

    static initialize(audioContext: AudioContext): MicrophoneSystem {
        this._instance ??= new MicrophoneSystem(audioContext)
        return this._instance
    }

    static hasInstance(): boolean {
        return !!this._instance
    }

    static getInstance(): MicrophoneSystem {
        if (!this._instance) throw new Error("MicrophoneSystem not initialized. Call initialize() first.")
        return this._instance
    }

    readonly onStateChanged = new Observable<MicrophoneState>()

    private mode: MicrophoneMode = "muted"
    private status: MicrophoneStatus = "idle"
    private monitorEnabled = false
    private monitorLevel = 0.16
    private talkLatch = false
    private keyboardTalk = false
    private level = 0
    private error: string | null = null

    private stream?: MediaStream
    private sourceNode?: MediaStreamAudioSourceNode
    private inputGain: GainNode
    private gateGain: GainNode
    private monitorGain: GainNode
    private mediaDestination: MediaStreamAudioDestinationNode
    private analyser: AnalyserNode
    private capturePromise: Promise<boolean> | null = null
    private readonly meterBuffer = new Float32Array(512)

    private constructor(private readonly audioContext: AudioContext) {
        this.inputGain = audioContext.createGain()
        this.gateGain = audioContext.createGain()
        this.monitorGain = audioContext.createGain()
        this.mediaDestination = audioContext.createMediaStreamDestination()
        this.analyser = audioContext.createAnalyser()

        this.inputGain.gain.value = 1
        this.gateGain.gain.value = 0
        this.monitorGain.gain.value = 0
        this.analyser.fftSize = 1024
        this.analyser.smoothingTimeConstant = 0.7

        this.inputGain.connect(this.gateGain)
        this.gateGain.connect(this.monitorGain)
        this.gateGain.connect(this.mediaDestination)
        this.monitorGain.connect(audioContext.destination)
        this.inputGain.connect(this.analyser)

        setInterval(() => this.updateLevelMeter(), 100)
        this.bindKeyboardPushToTalk()
        this.emitState()
    }

    getState(): MicrophoneState {
        return {
            mode: this.mode,
            status: this.status,
            monitorEnabled: this.monitorEnabled,
            monitorLevel: this.monitorLevel,
            talkActive: this.isTalkActive(),
            level: this.level,
            error: this.error,
        }
    }

    getModeLabel(): string {
        if (this.mode === "open_mic") return "Open mic"
        if (this.mode === "push_to_talk") return "Push to talk"
        return "Muted"
    }

    getStream(): MediaStream | undefined {
        return this.stream
    }

    getBroadcastTrack(): MediaStreamTrack | null {
        return this.mediaDestination.stream.getAudioTracks()[0] ?? null
    }

    getBroadcastStream(): MediaStream {
        return this.mediaDestination.stream
    }

    getBroadcastLevel(): number {
        return this.isTalkActive() ? this.level : 0
    }

    getInputStream(): MediaStream | undefined {
        return this.stream
    }

    getInputTrack(): MediaStreamTrack | null {
        return this.stream?.getAudioTracks()[0] ?? null
    }

    async cycleMode(): Promise<boolean> {
        const next: MicrophoneMode =
            this.mode === "muted"
                ? "push_to_talk"
                : this.mode === "push_to_talk"
                    ? "open_mic"
                    : "muted"
        return this.setMode(next)
    }

    async setMode(mode: MicrophoneMode): Promise<boolean> {
        if (mode !== "muted") {
            const ready = await this.ensureReady()
            if (!ready) return false
        }

        this.mode = mode
        if (mode !== "push_to_talk") {
            this.talkLatch = false
        }
        this.updateGate()
        this.updateInputTrackEnabled()
        this.emitState()
        return true
    }

    async toggleMonitor(): Promise<boolean> {
        return this.setMonitorEnabled(!this.monitorEnabled)
    }

    async setMonitorEnabled(enabled: boolean): Promise<boolean> {
        if (enabled) {
            const ready = await this.ensureReady()
            if (!ready) return false
        }

        this.monitorEnabled = enabled
        this.updateMonitor()
        this.emitState()
        return true
    }

    async toggleTalkLatch(): Promise<boolean> {
        if (this.mode !== "push_to_talk") {
            return this.setMode("push_to_talk")
        }

        const ready = await this.ensureReady()
        if (!ready) return false

        this.talkLatch = !this.talkLatch
        this.updateGate()
        this.emitState()
        return true
    }

    async ensureReady(): Promise<boolean> {
        if (this.status === "ready") return true
        if (this.capturePromise) return this.capturePromise
        if (!navigator.mediaDevices?.getUserMedia) {
            this.status = "error"
            this.error = "Microphone access is not supported on this browser."
            this.emitState()
            return false
        }

        this.status = "requesting"
        this.error = null
        this.emitState()

        this.capturePromise = navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                autoGainControl: true,
                noiseSuppression: true,
                echoCancellation: true,
            },
        }).then(stream => {
            this.stream = stream
            this.sourceNode = this.audioContext.createMediaStreamSource(stream)
            this.sourceNode.connect(this.inputGain)
            this.status = "ready"
            this.error = null
            this.updateGate()
            this.updateMonitor()
            this.updateInputTrackEnabled()
            this.emitState()
            return true
        }).catch(error => {
            this.status = "error"
            this.error = error instanceof Error ? error.message : "Microphone access failed."
            this.emitState()
            return false
        }).finally(() => {
            this.capturePromise = null
        })

        return this.capturePromise
    }

    private bindKeyboardPushToTalk(): void {
        const keyboard = KeyboardInputs.getInstance()
        keyboard.onDown("t", () => {
            this.keyboardTalk = true
            this.updateGate()
            this.emitState()
        })
        keyboard.onUp("t", () => {
            this.keyboardTalk = false
            this.updateGate()
            this.emitState()
        })
    }

    private isTalkActive(): boolean {
        if (this.mode === "open_mic") return this.status === "ready"
        if (this.mode === "push_to_talk") return (this.keyboardTalk || this.talkLatch) && this.status === "ready"
        return false
    }

    private updateGate(): void {
        const now = this.audioContext.currentTime
        const target = this.isTalkActive() ? 1 : 0
        this.gateGain.gain.cancelScheduledValues(now)
        this.gateGain.gain.setTargetAtTime(target, now, 0.02)
        this.updateInputTrackEnabled()
    }

    private updateMonitor(): void {
        const now = this.audioContext.currentTime
        const target = this.monitorEnabled && this.status === "ready" ? this.monitorLevel : 0
        this.monitorGain.gain.cancelScheduledValues(now)
        this.monitorGain.gain.setTargetAtTime(target, now, 0.03)
    }

    private updateLevelMeter(): void {
        if (this.status !== "ready") {
            if (this.level !== 0) {
                this.level = 0
                this.emitState()
            }
            return
        }

        this.analyser.getFloatTimeDomainData(this.meterBuffer)
        let energy = 0
        for (const sample of this.meterBuffer) {
            energy += sample * sample
        }
        const rms = Math.sqrt(energy / this.meterBuffer.length)
        const level = Math.min(1, rms * 4.5)
        if (Math.abs(level - this.level) > 0.02) {
            this.level = level
            this.emitState()
        }
    }

    private emitState(): void {
        this.onStateChanged.notifyObservers(this.getState())
    }

    private updateInputTrackEnabled(): void {
        const track = this.getInputTrack()
        if (!track) return
        track.enabled = this.isTalkActive()
    }
}
