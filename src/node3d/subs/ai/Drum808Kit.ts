// Synthesized 808 style drum kit for the Neural Drum Machine.
// Nine voices matching the drumGrid rows. Pure WebAudio, sample-accurate
// scheduling via the `when` argument. No samples, no Tone.js.

export class Drum808Kit {

    /** Kit bus. Wire to an AudioN3DConnectable.Output or any AudioNode. */
    readonly output: GainNode;

    constructor(private ctx: AudioContext) {
        this.output = ctx.createGain();
        this.output.gain.value = 0.8;
    }

    /**
     * Plays one voice.
     * @param row  Drum row 0-8 (see drumGrid.DRUM_CLASSES).
     * @param gain Accent level 0-1.
     * @param when Absolute AudioContext time.
     */
    play(row: number, gain: number, when: number): void {
        switch (row) {
            case 0: this.kick(gain, when); break;
            case 1: this.snare(gain, when); break;
            case 2: this.hat(gain * 0.7, when, 0.05); break;
            case 3: this.hat(gain * 0.7, when, 0.32); break;
            case 4: this.tom(gain, when, 95); break;
            case 5: this.tom(gain, when, 135); break;
            case 6: this.tom(gain, when, 190); break;
            case 7: this.clap(gain, when); break;
            case 8: this.rim(gain, when); break;
            default: break;
        }
    }

    private envelope(peak: number, when: number, decay: number): GainNode {
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(Math.max(0.001, peak), when);
        env.gain.exponentialRampToValueAtTime(0.001, when + decay);
        env.connect(this.output);
        return env;
    }

    private noiseSource(when: number, duration: number): AudioBufferSourceNode {
        if (this.noiseBuffer === null) {
            const len = this.ctx.sampleRate;
            const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            this.noiseBuffer = buf;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        src.start(when);
        src.stop(when + duration + 0.05);
        return src;
    }

    private kick(gain: number, when: number): void {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(160, when);
        osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
        osc.connect(this.envelope(gain, when, 0.4));
        osc.start(when);
        osc.stop(when + 0.45);
    }

    private snare(gain: number, when: number): void {
        const noise = this.noiseSource(when, 0.18);
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1800;
        bp.Q.value = 0.8;
        noise.connect(bp);
        bp.connect(this.envelope(gain * 0.8, when, 0.18));

        const tone = this.ctx.createOscillator();
        tone.type = "triangle";
        tone.frequency.setValueAtTime(190, when);
        tone.connect(this.envelope(gain * 0.5, when, 0.1));
        tone.start(when);
        tone.stop(when + 0.15);
    }

    private hat(gain: number, when: number, decay: number): void {
        const noise = this.noiseSource(when, decay);
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 7500;
        noise.connect(hp);
        hp.connect(this.envelope(gain * 0.6, when, decay));
    }

    private tom(gain: number, when: number, freq: number): void {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, when);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.55, when + 0.2);
        osc.connect(this.envelope(gain * 0.9, when, 0.28));
        osc.start(when);
        osc.stop(when + 0.33);
    }

    private clap(gain: number, when: number): void {
        // Three staggered noise bursts approximate the 909 clap spread.
        for (const offset of [0, 0.012, 0.026]) {
            const noise = this.noiseSource(when + offset, 0.12);
            const bp = this.ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.value = 1100;
            bp.Q.value = 1.2;
            noise.connect(bp);
            bp.connect(this.envelope(gain * 0.55, when + offset, 0.12));
        }
    }

    private rim(gain: number, when: number): void {
        const osc = this.ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(1750, when);
        osc.connect(this.envelope(gain * 0.4, when, 0.035));
        osc.start(when);
        osc.stop(when + 0.06);
    }

    /** Shared white noise source material, created on first use. */
    private noiseBuffer: AudioBuffer | null = null;
}
