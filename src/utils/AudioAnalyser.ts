/**
 * Wraps a Web Audio AnalyserNode and exposes both raw spectral data (for
 * visualization) and a derived AudioSignal (RMS, peak, sub-band energies,
 * spectral centroid, spectral flux) suitable for driving visual effects.
 *
 * The internal AnalyserNode is a non-destructive tap; connecting a source to
 * the analyser via tap() does not affect the audio path.
 */
export interface AudioSignalSnapshot {
    /** RMS amplitude in [0, 1], lightly gained so quiet signals are visible. */
    strength: number
    /** Peak absolute sample over the window, in [0, 1]. Sharper than RMS for transients. */
    peak: number
    /** Normalized energy in the ~20–250 Hz band. Tracks kick / sub. */
    bass: number
    /** Normalized energy in the ~250 Hz – 2 kHz band. Tracks vocals / mid synths. */
    mid: number
    /** Normalized energy in the ~2 kHz – 8 kHz band. Tracks hats / sparkle. */
    treble: number
    /** Spectral flux in [0, 1]: positive bin-to-bin deltas vs the last frame. Robust onset indicator. */
    flux: number
    /** Normalized spectral centroid in [0, 1]. Low = bass-heavy, high = bright. */
    tone: number
}

const BASS_RANGE_HZ:   readonly [number, number] = [20, 250]
const MID_RANGE_HZ:    readonly [number, number] = [250, 2000]
const TREBLE_RANGE_HZ: readonly [number, number] = [2000, 8000]

/**
 * Calibration: raw flux normalized to [0, 1] worst-case sits around 0.005–0.02
 * for actual hits, which would never trigger a typical threshold. Multiply by
 * this gain so a strong onset lands near 1 while ambient noise stays small.
 * Independent of fftSize because both numerator and divisor scale with N.
 */
const FLUX_NORM_GAIN = 50

/**
 * Calls to {@link AudioAnalyser.snapshot} arriving within this many milliseconds
 * of the previous successful call return the cached result instead of
 * recomputing. Critical for shared analysers: spectral flux derives from a
 * one-frame delta, so the prev-spectrum buffer must only be updated once per
 * render tick. With multiple consumers (e.g. several cables fanning out from
 * the same source), the second caller would otherwise compare the spectrum
 * against itself and read flux = 0.
 */
const SNAPSHOT_CACHE_TTL_MS = 8

export class AudioAnalyser {

    public constructor(audioCtx: AudioContext, fftSize: number = 1024) {
        this.#node = audioCtx.createAnalyser()
        this.#node.fftSize = fftSize
        this.#node.smoothingTimeConstant = 0.6
        this.#timeBuf = new Uint8Array(this.#node.fftSize)
        this.#freqBuf = new Uint8Array(this.#node.frequencyBinCount)
        this.#prevFreqBuf = new Uint8Array(this.#node.frequencyBinCount)

        const nyquist = audioCtx.sampleRate / 2
        const binCount = this.#node.frequencyBinCount
        const hzToBin = (hz: number) =>
            Math.min(binCount - 1, Math.max(0, Math.round(hz / nyquist * binCount)))
        this.#bassRange   = [hzToBin(BASS_RANGE_HZ[0]),   hzToBin(BASS_RANGE_HZ[1])]
        this.#midRange    = [hzToBin(MID_RANGE_HZ[0]),    hzToBin(MID_RANGE_HZ[1])]
        this.#trebleRange = [hzToBin(TREBLE_RANGE_HZ[0]), hzToBin(TREBLE_RANGE_HZ[1])]
    }

    public get binCount(): number {
        return this.#node.frequencyBinCount
    }

    public get raw(): AnalyserNode {
        return this.#node
    }

    /** Connect a source to the internal analyser. Non-destructive tap. */
    public tap(source: AudioNode): void {
        source.connect(this.#node)
    }

    /** Disconnect a previously tapped source. */
    public untap(source: AudioNode): void {
        try { source.disconnect(this.#node) } catch { /* ignore */ }
    }

    /** Fill `out` with frequency-domain magnitudes (0..255). Length must equal binCount. */
    public readFrequency(out: Uint8Array): void {
        this.#node.getByteFrequencyData(out)
    }

    /** Fill `out` with time-domain samples (0..255, centered at 128). Length must equal fftSize. */
    public readTime(out: Uint8Array): void {
        this.#node.getByteTimeDomainData(out)
    }

    /**
     * Compute an AudioSignal snapshot. Iterates the time and frequency buffers
     * once each, derives every feature in those passes, and updates the
     * previous-frame spectrum used by spectral flux.
     *
     * Cached within {@link SNAPSHOT_CACHE_TTL_MS} so multiple downstream
     * consumers (e.g. a node and several outgoing cables) all see the same
     * derived values for a given render tick — and the previous-spectrum
     * buffer used by flux only advances once per tick.
     */
    public snapshot(): AudioSignalSnapshot {
        const now = performance.now()
        if (this.#cachedSnapshot !== null && now - this.#snapshotTime < SNAPSHOT_CACHE_TTL_MS) {
            return this.#cachedSnapshot
        }
        this.#snapshotTime = now
        this.#node.getByteTimeDomainData(this.#timeBuf)
        let sumSq = 0
        let peakAbs = 0
        for (let i = 0; i < this.#timeBuf.length; i++) {
            const v = (this.#timeBuf[i] - 128) / 128
            sumSq += v * v
            const a = v < 0 ? -v : v
            if (a > peakAbs) peakAbs = a
        }
        const rms = Math.sqrt(sumSq / this.#timeBuf.length)
        const strength = Math.min(1, rms * 3)
        const peak = Math.min(1, peakAbs)

        this.#node.getByteFrequencyData(this.#freqBuf)
        const [bassLo, bassHi]     = this.#bassRange
        const [midLo,  midHi]      = this.#midRange
        const [trebLo, trebHi]     = this.#trebleRange
        const N = this.#freqBuf.length
        let weighted = 0
        let total = 0
        let bassSum = 0, midSum = 0, trebleSum = 0
        let fluxRaw = 0
        for (let i = 0; i < N; i++) {
            const mag = this.#freqBuf[i]
            weighted += i * mag
            total += mag
            if (i >= bassLo && i < bassHi)  bassSum   += mag
            if (i >= midLo  && i < midHi)   midSum    += mag
            if (i >= trebLo && i < trebHi)  trebleSum += mag
            const d = mag - this.#prevFreqBuf[i]
            if (d > 0) fluxRaw += d
            this.#prevFreqBuf[i] = mag
        }
        const tone = total > 0 ? (weighted / total) / N : 0
        const bass   = bassSum   / (255 * Math.max(1, bassHi  - bassLo))
        const mid    = midSum    / (255 * Math.max(1, midHi   - midLo))
        const treble = trebleSum / (255 * Math.max(1, trebHi  - trebLo))
        const flux   = Math.min(1, fluxRaw / (255 * N) * FLUX_NORM_GAIN)

        this.#cachedSnapshot = { strength, peak, bass, mid, treble, flux, tone }
        return this.#cachedSnapshot
    }

    public dispose(): void {
        try { this.#node.disconnect() } catch { /* ignore */ }
    }

    #node: AnalyserNode
    #timeBuf: Uint8Array
    #freqBuf: Uint8Array
    #prevFreqBuf: Uint8Array
    #bassRange:   readonly [number, number]
    #midRange:    readonly [number, number]
    #trebleRange: readonly [number, number]
    #cachedSnapshot: AudioSignalSnapshot | null = null
    #snapshotTime = 0
}
