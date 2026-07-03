export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

/**
 * Cubic easing functions on t ∈ [0, 1].
 * - linear     : straight ramp
 * - easeIn     : starts slow, accelerates (t³)            — "snap forward" feel
 * - easeOut    : starts fast, decelerates (1 − (1−t)³)    — "settle" feel
 * - easeInOut  : slow at both ends, fast in the middle    — neutral natural
 */
export const EASINGS: Record<Easing, (t: number) => number> = {
    linear:    t => t,
    easeIn:    t => t * t * t,
    easeOut:   t => 1 - Math.pow(1 - t, 3),
    easeInOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
}
