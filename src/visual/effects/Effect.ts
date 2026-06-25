/**
 * Live audio descriptor handed to effects each tick. Every numeric field lands
 * in [0, 1] for an "average" source, so effects can use uniform thresholds.
 *
 * Optional fields are populated by {@link AudioAnalyser.snapshot}; effects
 * fed a static signal (e.g. `{ strength: 1, tone: 0 }`) should fall back
 * to `strength` when a richer feature is absent.
 */
export interface AudioSignal {
    /** RMS amplitude. The "loudness" channel. */
    strength: number
    /** Spectral centroid: low = bass-heavy, high = bright. The "color" channel. */
    tone: number
    /** Peak absolute sample. Tracks transients more sharply than RMS. */
    peak?: number
    /** Sub-band energy: ~20–250 Hz. Kick / sub. */
    bass?: number
    /** Sub-band energy: ~250 Hz – 2 kHz. Vocals / mid synths. */
    mid?: number
    /** Sub-band energy: ~2 kHz – 8 kHz. Hats / sparkle. */
    treble?: number
    /** Spectral flux: positive bin-to-bin energy increase. Onset / "new note" indicator. */
    flux?: number
    /**
     * True while a pointer is currently aimed at the target mesh.
     * Effects that disrupt interaction (scale tremor, expanding waves) should
     * suspend themselves so the user can hit the element accurately.
     * Glow/wave-tint effects are non-disruptive and ignore this.
     */
    pointed?: boolean
}

/**
 * Feature channels effects can pick from. `'strength'` is the safe default
 * (always populated, including under the static fallback signal).
 */
export type AudioFeature = 'strength' | 'peak' | 'bass' | 'mid' | 'treble' | 'flux' | 'tone'

/**
 * Read one feature from a signal, falling back to `strength` when the feature
 * is absent (static signals, providers that don't supply spectral data).
 */
export function readFeature(signal: AudioSignal, feature: AudioFeature): number {
    const v = signal[feature]
    if (typeof v === 'number') return v
    return signal.strength
}

export interface Effect {
    update(signal: AudioSignal): void
    stop(): void
    dispose(): void
}
