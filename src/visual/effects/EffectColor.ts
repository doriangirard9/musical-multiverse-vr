import { Color3 } from "@babylonjs/core"
import { AudioFeature, AudioSignal, readFeature } from "./Effect"

/**
 * Strategy for turning an {@link AudioSignal} into an RGB color.
 *
 * - 'hue':      single feature → HSV hue interpolated in [hueLow, hueHigh].
 *               Predictable single-dimensional mapping; good for tinting
 *               sustained elements where one channel is enough.
 * - 'spectrum': R, G, B channels come directly from bass, mid, treble
 *               energies. A pure kick reads warm red, a vocal reads green,
 *               a cymbal reads cool blue, a full mix tends toward white.
 *               The color literally *is* the spectrum at that instant.
 * - 'palette':  discrete pick from a 12-color musical wheel keyed off a
 *               feature value. Looks like "notes on a scale": colors jump
 *               between named buckets rather than gliding continuously.
 */
export type AudioColorMode = 'hue' | 'spectrum' | 'palette'

/**
 * Color generation parameters shared by every audio-driven visual that picks
 * a per-event or per-frame color. Effect-level params interfaces extend this
 * so authors can swap color strategies without per-effect plumbing.
 */
export interface AudioColorParams {
    /** Color generation strategy. Default 'hue'. */
    colorMode?: AudioColorMode

    // -- 'hue' mode ----------------------------------------------------------
    /** Feature mapped onto HSV hue. Default 'tone'. */
    hueSource?: AudioFeature
    /** Hue (0–360) at hueSource = 0. Default 30. */
    hueLow?: number
    /** Hue at hueSource = 1. Default 220. */
    hueHigh?: number

    // -- 'spectrum' mode -----------------------------------------------------
    /** Common gain applied to all three spectrum channels. Default 3. */
    spectrumGain?: number
    /** Extra multiplier for the bass (R) channel. Default 1. */
    spectrumBassGain?: number
    /** Extra multiplier for the mid (G) channel. Default 1.5. */
    spectrumMidGain?: number
    /** Extra multiplier for the treble (B) channel. Default 2. Compensates for the natural spectral roll-off. */
    spectrumTrebleGain?: number
    /** Constant added to each channel before gain, so silence isn't pure black. Default 0.04. */
    spectrumFloor?: number

    // -- 'palette' mode ------------------------------------------------------
    /** Discrete color array. Defaults to a 12-color chromatic wheel. */
    palette?: Color3[]
    /** Feature whose value indexes into the palette. Default 'tone'. */
    paletteSource?: AudioFeature

    // -- Common --------------------------------------------------------------
    /** Multiplier applied to the final RGB. >1 punches through ambient brightness. Default 1. */
    brightness?: number
}

/**
 * 12-color chromatic wheel — evenly spaced hues at 30° intervals, fully
 * saturated, full value. Maps cleanly onto a 12-tone musical scale: the
 * tone feature → hue index. Looks "musical" because color steps are
 * discrete and named, rather than a continuous gradient.
 */
export const DEFAULT_CHROMATIC_PALETTE: ReadonlyArray<Color3> = Object.freeze([
    Color3.FromHSV(  0, 1, 1),
    Color3.FromHSV( 30, 1, 1),
    Color3.FromHSV( 60, 1, 1),
    Color3.FromHSV( 90, 1, 1),
    Color3.FromHSV(120, 1, 1),
    Color3.FromHSV(150, 1, 1),
    Color3.FromHSV(180, 1, 1),
    Color3.FromHSV(210, 1, 1),
    Color3.FromHSV(240, 1, 1),
    Color3.FromHSV(270, 1, 1),
    Color3.FromHSV(300, 1, 1),
    Color3.FromHSV(330, 1, 1),
])

/**
 * Compute an RGB color from a signal under the configured color mode.
 * Allocates one Color3; safe per frame or per event.
 *
 * @remarks
 * Returns black ({@link Color3.Black}) only if mode is 'palette' and the
 * palette is empty; otherwise always returns a meaningful color, falling
 * back to `strength` when a needed feature is absent on the signal.
 */
export function audioColor(signal: AudioSignal, params: AudioColorParams): Color3 {
    const brightness = params.brightness ?? 1
    const mode = params.colorMode ?? 'hue'

    if (mode === 'spectrum') {
        const gain   = params.spectrumGain        ?? 3
        const gR     = params.spectrumBassGain    ?? 1
        const gG     = params.spectrumMidGain     ?? 1.5
        const gB     = params.spectrumTrebleGain  ?? 2
        const floor  = params.spectrumFloor       ?? 0.04
        const bass   = signal.bass   ?? signal.strength
        const mid    = signal.mid    ?? signal.strength
        const treble = signal.treble ?? 0
        const r = Math.min(1, floor + bass   * gain * gR)
        const g = Math.min(1, floor + mid    * gain * gG)
        const b = Math.min(1, floor + treble * gain * gB)
        return new Color3(r * brightness, g * brightness, b * brightness)
    }

    if (mode === 'palette') {
        const palette = params.palette ?? DEFAULT_CHROMATIC_PALETTE
        if (palette.length === 0) return Color3.Black()
        const source = params.paletteSource ?? 'tone'
        const v = Math.max(0, Math.min(0.9999, readFeature(signal, source)))
        const idx = Math.floor(v * palette.length)
        return palette[idx].scale(brightness)
    }

    // 'hue' mode (default).
    const hueSource = params.hueSource ?? 'tone'
    const hueLow    = params.hueLow    ?? 30
    const hueHigh   = params.hueHigh   ?? 220
    const v = Math.max(0, Math.min(1, readFeature(signal, hueSource)))
    const hue = hueLow + (hueHigh - hueLow) * v
    return Color3.FromHSV(((hue % 360) + 360) % 360, 1, 1).scale(brightness)
}
