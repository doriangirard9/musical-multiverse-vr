
import { DRUMKIT_CONFIG } from "./XRDrumKit/XRDrumKitConfig";
import { CollisionUtils } from "./XRDrumKit/CollisionUtils";
import XRDrumKit from "./XRDrumKit/XRDrumKit";

/**
 * Plays random drum hits on the XRDrumKit for testing purposes
 * add this code on drumkit initialization and call playRandomHit() as needed
 * 
 * Example:
 * const randomDrumPlayer = new RandomDrumPlayer(drumKit);
 * setInterval(() => {
 *     randomDrumPlayer.playRandomHit();
 * }, 1000);
 */

export class RandomDrumPlayer {
    xrDrumKit: XRDrumKit;

    constructor(xrDrumKit : XRDrumKit) {
        this.xrDrumKit = xrDrumKit;
    }

    // Pick a random MIDI key from the config
    getRandomKey() {
        const keys = Object.values(DRUMKIT_CONFIG.midi.keys);
        return keys[Math.floor(Math.random() * keys.length)];
    }

    // Compute random velocity using the velocity curve
    getRandomVelocity() {
        const { minVelocity, maxVelocity, velocityCurve } = DRUMKIT_CONFIG.physics;

        const raw = Math.random(); // 0–1
        const curved = Math.pow(raw, velocityCurve); // Apply curve

        return minVelocity + curved * (maxVelocity - minVelocity);
    }

    // Get correct duration depending on the object type (cymbal / drum / hi-hat)
    getDurationForKey(midiKey: number) {
        const { durations } = DRUMKIT_CONFIG.midi;

        const keys = DRUMKIT_CONFIG.midi.keys;

        if (midiKey === keys.crashCymbal || midiKey === keys.rideCymbal)
            return durations.cymbals;

        if (midiKey === keys.closedHiHat || midiKey === keys.openHiHat)
            return durations.hiHat;

        return durations.drums;
    }

    // Main function: schedule a random hit
    playRandomHit() {
        const midiKey = this.getRandomKey();
        const velocity = this.getRandomVelocity();
        const duration = this.getDurationForKey(midiKey);

        CollisionUtils.scheduleSound(
            this.xrDrumKit.wamInstance,
            this.xrDrumKit.audioContext,
            midiKey,
            velocity,
            duration
        );
    }
}