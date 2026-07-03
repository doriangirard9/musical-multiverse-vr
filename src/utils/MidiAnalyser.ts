/**
 * Lightweight MIDI activity tap. Records noteOn / noteOff events and exposes
 * a snapshot whose fields mirror {@link AudioSignalSnapshot} so visual
 * effects can drive themselves from MIDI cables the same way they drive from
 * audio cables.
 *
 * The tap itself is passive — it only collects events fed to it via
 * {@link MidiAnalyser.capture}. The wiring (typically monkey-patching the
 * target WamNode's `scheduleEvents`) lives in the consumer (e.g. the cable).
 */
export interface MidiSignalSnapshot {
    /** Decaying pulse since the last noteOn (≈1 at the moment of the event, fades to 0 within ~250 ms). */
    onset: number
    /** Pitch of the most recent noteOn, normalized to [0, 1] across the MIDI range. */
    pitch: number
    /** Velocity of the most recent noteOn, normalized to [0, 1]. */
    velocity: number
    /** Held-note density: currently-held notes saturated at 8 simultaneous voices. */
    activity: number
}

/** Number of simultaneous held notes that saturates `activity` to 1. */
const ACTIVITY_SATURATION = 8

export class MidiAnalyser {

    public constructor() {
        this.#held = new Set()
        this.#lastNote = 0
        this.#lastVelocity = 0
        this.#freshNoteOn = false
    }

    /**
     * Feed an event into the analyser. Non-MIDI events and malformed payloads
     * are ignored silently — the tap is best-effort and never throws.
     *
     * Accepts either a single WamEvent or an array (WAM's `scheduleEvents`
     * accepts both shapes; we want to handle whatever flows through).
     */
    public capture(event: unknown): void {
        if (Array.isArray(event)) {
            for (const e of event) this.capture(e)
            return
        }
        if (event === null || typeof event !== 'object') return
        const e = event as { type?: string, data?: { bytes?: ArrayLike<number> } }
        if (e.type !== 'wam-midi') return
        const bytes = e.data?.bytes
        if (bytes === undefined || bytes.length < 2) return

        const status = bytes[0] & 0xF0
        const note = bytes[1] & 0x7F
        const velocity = bytes.length >= 3 ? bytes[2] & 0x7F : 0

        // noteOn with velocity 0 is the standard "running status" off message.
        const isNoteOn  = status === 0x90 && velocity > 0
        const isNoteOff = status === 0x80 || (status === 0x90 && velocity === 0)

        if (isNoteOn === true) {
            this.#held.add(note)
            this.#lastNote = note
            this.#lastVelocity = velocity
            this.#freshNoteOn = true
        } else if (isNoteOff === true) {
            this.#held.delete(note)
        }
    }

    /**
     * Compute the current MIDI snapshot. `onset` is a one-frame pulse:
     * 1 on the first snapshot after a noteOn, 0 thereafter until the next
     * noteOn. This guarantees exactly one cable note sprite per MIDI event,
     * regardless of how the consuming effect's threshold and refractory are
     * tuned. Allocates one small object; safe to call per frame.
     */
    public snapshot(): MidiSignalSnapshot {
        const onset = this.#freshNoteOn === true ? 1 : 0
        this.#freshNoteOn = false
        return {
            onset,
            pitch: this.#lastNote / 127,
            velocity: this.#lastVelocity / 127,
            activity: Math.min(1, this.#held.size / ACTIVITY_SATURATION),
        }
    }

    public dispose(): void {
        this.#held.clear()
        this.#freshNoteOn = false
    }

    #held: Set<number>
    #lastNote: number
    #lastVelocity: number
    #freshNoteOn: boolean
}
