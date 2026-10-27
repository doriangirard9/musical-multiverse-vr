import { SERVER_NAME } from "../options.ts";

/** Round trips measured to estimate the offset of the server's clock */
const SAMPLES = 6;

/**
 * The server's clock, as seen from this device.
 *
 * The clocks of two devices can disagree by half a second or more, enough to put participants
 * playing together a beat apart (see TransportSync). Every device measures how far its own clock is
 * from the server's, and reads the time through it: they then all share the server's time, to within
 * a few milliseconds whatever their own clock says.
 *
 * The offset is measured as NTP does: the server's time is taken to be the middle of the round trip,
 * and of several round trips the shortest is kept, as the one least delayed on either way. Until the
 * offset is known, the device's own clock is used.
 */
export class ServerClock {

    private static offset = 0;
    private static measuring?: Promise<void>;

    /** The server's time now, in ms since the epoch */
    static now(): number {
        return Date.now() + this.offset;
    }

    /** Measure the offset of the server's clock. Measured once: later calls wait for that one. */
    static synchronize(): Promise<void> {
        this.measuring ??= this.measure();
        return this.measuring;
    }

    /**
     * Measure the offset again, as after the device slept: waking up, the system may set its clock
     * again, and the offset measured before no longer holds.
     */
    static resynchronize(): Promise<void> {
        this.measuring = this.measure();
        return this.measuring;
    }

    private static async measure(): Promise<void> {
        let best: { roundTrip: number; offset: number } | undefined;
        for (let i = 0; i < SAMPLES; i++) {
            try {
                const sent = Date.now();
                const response = await fetch(`${SERVER_NAME}/api/time`, { cache: "no-store" });
                const { now } = await response.json() as { now: number };
                const received = Date.now();
                const roundTrip = received - sent;
                if (typeof now !== "number") continue;
                if (!best || roundTrip < best.roundTrip) best = { roundTrip, offset: now - (sent + received) / 2 };
            } catch (e) {
                console.warn("[ServerClock] Measure failed:", e);
            }
        }
        if (!best) return;
        this.offset = best.offset;
        console.log(`[ServerClock] offset ${best.offset.toFixed(0)}ms (round trip ${best.roundTrip}ms)`);
    }
}
