import { WebXRDefaultExperience } from "@babylonjs/core";
import { MicrophoneSystem } from "./MicrophoneSystem.ts";
import { AudioWorldSystem } from "./node3d/AudioDestinationSystem.ts";

/** Shortest time between two automatic resumes, so a context the browser keeps suspending is not fought in a loop */
const RESUME_COOLDOWN_MS = 2000;

/** Length of the fade before the sound is cut and after it comes back, in seconds: long enough not to click */
const FADE_SECONDS = 0.03;

/**
 * Keeps the audio in step with the app going to the background and coming back.
 *
 * In the headset, the app is in the background as soon as the headset's menu shows over it: the XR
 * session is then no longer "visible". The sound is faded out and the audio context suspended, and
 * both are brought back once the session is visible again. The transport follows the audio clock, so
 * everything picks up where it stopped.
 *
 * Out of the headset (desktop), the sound is not cut: the page going to the background lets the
 * audio play for as long as the browser does. If the browser suspends it meanwhile, it is left
 * suspended until the page is back. Once the app is back, the context is resumed, and a microphone
 * the system took meanwhile is taken back.
 */
export class AudioLifecycle {

    private xrSession: XRSession | null = null;
    private lastAutoResume = -Infinity;

    /** Whether the sound was cut because the headset's menu shows over the app */
    private muted = false;
    private suspendTimer?: ReturnType<typeof setTimeout>;

    constructor(
        private readonly audioContext: AudioContext,
        xr?: WebXRDefaultExperience,
    ) {
        document.addEventListener("visibilitychange", () => this.update());

        xr?.baseExperience.sessionManager.onXRSessionInit.add(session => {
            this.xrSession = session;
            session.addEventListener("visibilitychange", () => this.update());
            session.addEventListener("end", () => {
                if (this.xrSession === session) this.xrSession = null;
                this.update();
            });
            this.update();
        });

        audioContext.addEventListener("statechange", () => this.onStateChange());
    }

    /** Is the app in the background right now: page hidden, XR session hidden, or sound cut for the headset's menu? */
    get paused(): boolean {
        return document.hidden || this.xrSession?.visibilityState === "hidden" || this.muted;
    }

    /**
     * Is the app in the background in the headset: a running XR session that is not fully visible,
     * or whose page is hidden, as when another tab is opened over it, the session then being reported
     * visible again while the app is not.
     */
    private get inHeadsetBackground(): boolean {
        return this.xrSession !== null && (this.xrSession.visibilityState !== "visible" || document.hidden);
    }

    /** Follow the app going to the background or coming back */
    private update(): void {
        if (this.inHeadsetBackground) {
            this.mute();
            return;
        }
        if (this.muted) this.unmute();
        if (this.paused) return;

        if (this.audioContext.state === "suspended") this.resume();
        if (MicrophoneSystem.hasInstance()) MicrophoneSystem.getInstance().recover();
    }

    /** Fade the sound out, then suspend the context */
    private mute(): void {
        if (this.muted) return;
        this.muted = true;
        this.fadeTo(0);
        clearTimeout(this.suspendTimer);
        this.suspendTimer = setTimeout(() => {
            if (this.muted) this.audioContext.suspend().catch(e => console.warn("[AudioLifecycle] Suspend failed:", e));
        }, FADE_SECONDS * 1000 + 20);
    }

    /** Resume the context, then fade the sound back in */
    private unmute(): void {
        this.muted = false;
        clearTimeout(this.suspendTimer);
        this.audioContext.resume()
            .then(() => { if (!this.muted) this.fadeTo(1); })
            .catch(e => console.warn("[AudioLifecycle] Resume failed:", e));
    }

    /** Glide the volume of the audio world to a level. Sounds that do not go through it are cut without a fade. */
    private fadeTo(level: number): void {
        const gain = AudioWorldSystem._instance?.destination?.gain;
        if (!gain) return;
        const now = this.audioContext.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(level, now + FADE_SECONDS);
    }

    /**
     * The context got suspended. In the background it waits for the app to come back. While the
     * app is in use the browser took the audio away, so it is taken back, but not over and over.
     */
    private onStateChange(): void {
        if (this.audioContext.state !== "suspended" || this.paused) return;

        const now = performance.now();
        if (now - this.lastAutoResume < RESUME_COOLDOWN_MS) return;
        this.lastAutoResume = now;
        this.resume();
    }

    private resume(): void {
        this.audioContext.resume().catch(e => console.warn("[AudioLifecycle] Resume failed:", e));
    }
}
