export type VoiceProximity = {
    gain: number
    muted: boolean
}

export const VOICE_FULL_VOLUME_DISTANCE_METERS = 1.75
export const VOICE_MUTE_DISTANCE_METERS = 10

const VOICE_ROLLOFF_EXPONENT = 1.6
const AUDIBLE_GAIN_THRESHOLD = 0.005

/**
 * Returns a receiver-local proximity gain. A missing distance deliberately
 * stays audible while the remote avatar is still joining the scene.
 */
export function getVoiceProximity(distanceMeters: number | undefined): VoiceProximity {
    if (!Number.isFinite(distanceMeters) || distanceMeters === undefined) {
        return { gain: 1, muted: false }
    }

    if (distanceMeters <= VOICE_FULL_VOLUME_DISTANCE_METERS) {
        return { gain: 1, muted: false }
    }
    if (distanceMeters >= VOICE_MUTE_DISTANCE_METERS) {
        return { gain: 0, muted: true }
    }

    const progress = (distanceMeters - VOICE_FULL_VOLUME_DISTANCE_METERS)
        / (VOICE_MUTE_DISTANCE_METERS - VOICE_FULL_VOLUME_DISTANCE_METERS)
    const gain = Math.pow(1 - progress, VOICE_ROLLOFF_EXPONENT)
    if (gain <= AUDIBLE_GAIN_THRESHOLD) {
        return { gain: 0, muted: true }
    }
    return { gain, muted: false }
}
