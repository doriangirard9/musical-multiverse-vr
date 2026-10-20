/**
 * Uses a media element to keep received WebRTC audio audible on Chromium
 * WebXR runtimes where direct MediaStream Web Audio sources are silent.
 */
export class RemoteVoiceOutput {
    private readonly element: HTMLAudioElement
    private readonly source: MediaElementAudioSourceNode
    private volume = 1

    constructor(
        private readonly audioContext: AudioContext,
        stream: MediaStream,
        destination: AudioNode,
    ) {
        this.element = document.createElement("audio")
        this.element.autoplay = true
        this.element.setAttribute("playsinline", "")
        this.element.setAttribute("aria-hidden", "true")
        this.element.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none"
        this.element.srcObject = stream
        document.body.appendChild(this.element)
        this.source = audioContext.createMediaElementSource(this.element)
        this.source.connect(destination)
    }

    async start(): Promise<void> {
        await this.audioContext.resume()
        await this.element.play()
    }

    get currentTime(): number {
        return this.element.currentTime
    }

    get paused(): boolean {
        return this.element.paused
    }

    setVolume(volume: number): void {
        if (!Number.isFinite(volume)) return
        const nextVolume = Math.max(0, Math.min(1, volume))
        if (Math.abs(this.volume - nextVolume) < 0.005) return

        this.volume = nextVolume
        // In the Quest fallback path the element renders directly. Muting here
        // guarantees that an out-of-range speaker is silent for this listener.
        this.element.muted = nextVolume === 0
        this.element.volume = nextVolume
    }

    dispose(): void {
        try { this.source.disconnect() } catch {}
        this.element.pause()
        this.element.srcObject = null
        this.element.remove()
    }
}
