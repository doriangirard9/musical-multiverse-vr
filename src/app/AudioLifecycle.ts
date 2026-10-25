import { WebXRDefaultExperience } from "@babylonjs/core";
import { MicrophoneSystem } from "./MicrophoneSystem.ts";

/** Shortest time between two automatic resumes, so a context the browser keeps suspending is not fought in a loop */
const RESUME_COOLDOWN_MS = 2000;

/**
 * Keeps the audio in step with the app going to the background and coming back.
 *
 * The app is in the background when the page is hidden, or when the XR session is hidden, as after
 * pressing the headset's home button twice: in VR the headset menu does not hide the page, it
 * changes the visibility of the XR session.
 *
 * In the background the audio keeps playing for as long as the browser lets it. If the browser
 * suspends it meanwhile, it is left suspended: restarting the audio output behind the browser's back,
 * while the app is in the background, is what makes the sound crackle. Once the app is back, the
 * context is resumed, and a microphone the system took meanwhile is taken back.
 */
export class AudioLifecycle {

    private xrSession: XRSession | null = null;
    private lastAutoResume = -Infinity;

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

    /** Is the app in the background right now: page hidden, or XR session hidden? */
    get paused(): boolean {
        return document.hidden || this.xrSession?.visibilityState === "hidden";
    }

    /** Follow the app going to the background or coming back. Going away changes nothing by itself. */
    private update(): void {
        if (this.paused) return;

        if (this.audioContext.state === "suspended") this.resume();
        if (MicrophoneSystem.hasInstance()) MicrophoneSystem.getInstance().recover();
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
