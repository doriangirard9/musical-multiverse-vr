import { Scene, WebXRDefaultExperience, WebXRState } from "@babylonjs/core";
import { SERVER_NAME } from "../../options.ts";

/** One thing worth knowing about, as stored by server-config/routes/diagnostics.js */
interface HangEvent {
    kind: "long-task" | "frame-gap" | "xr-visibility" | "page-visibility" | "audio-state";
    /** When it started, epoch milliseconds */
    at: number;
    durationMs?: number;
    inXR: boolean;
    detail?: Record<string, unknown>;
}

/** A main thread task at least this long is reported */
const LONG_TASK_MS = 500;

/** A pause between two rendered frames at least this long, while nothing paused the app, is reported */
const FRAME_GAP_MS = 1000;

/** How often the buffered events are sent */
const FLUSH_INTERVAL_MS = 30_000;

/** Events kept while the server cannot be reached, the oldest go first */
const MAX_BUFFERED = 200;

/** Events per request, so a request stays far below the keepalive body limit */
const BATCH_SIZE = 50;

/**
 * Reports to the server what the user experiences as the app freezing, so a hang on a headset
 * nobody can plug in still leaves a trace.
 *
 * Two symptoms are measured: a main thread task that runs too long, and a stretch with no frame
 * rendered, which also catches the browser or the XR runtime stalling while the page itself is idle.
 * A stretch where the app was paused on purpose (headset menu, page in the background) is not a
 * hang: those pauses are reported on their own, with the audio context state, so a pause followed
 * by a hang or by broken audio can be told apart.
 */
export class HangReporter {

    private buffer: HangEvent[] = [];

    /** Time of the last frame, from performance.now() */
    private lastFrame = 0;

    /** Time of the last pause or resume, so a gap containing one is not taken for a hang */
    private lastPauseChange = 0;

    private xrSession: XRSession | null = null;
    private xrEnteredAt = 0;

    constructor(
        private readonly identity: { sessionId: string; participantId: string },
        scene: Scene,
        private readonly audioContext: AudioContext,
        private readonly xr?: WebXRDefaultExperience,
    ) {
        this.watchLongTasks();
        this.watchFrames(scene);
        this.watchPauses();

        setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
        // Last chance before the page goes away or is frozen in the background
        window.addEventListener("pagehide", () => this.flush());
    }

    private get inXR(): boolean {
        return this.xr?.baseExperience.state === WebXRState.IN_XR;
    }

    /** Is the app paused on purpose right now: page hidden, or the XR session behind the headset menu? */
    private get paused(): boolean {
        if (document.hidden) return true;
        return this.xrSession !== null && this.xrSession.visibilityState !== "visible";
    }

    private record(event: Omit<HangEvent, "inXR">): void {
        this.buffer.push({ ...event, inXR: this.inXR });
        if (this.buffer.length > MAX_BUFFERED) this.buffer.splice(0, this.buffer.length - MAX_BUFFERED);

        // A hang is sent right away: the user may well answer it by killing the browser, and a
        // killed browser never gets to the next flush
        if (event.kind === "long-task" || event.kind === "frame-gap") this.flushSoon();
    }

    private flushScheduled = false;

    /** Flush once the current task is over, so a burst of events goes in one request */
    private flushSoon(): void {
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        setTimeout(() => {
            this.flushScheduled = false;
            this.flush();
        }, 0);
    }

    private watchLongTasks(): void {
        if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (entry.duration < LONG_TASK_MS) continue;
                this.record({
                    kind: "long-task",
                    at: performance.timeOrigin + entry.startTime,
                    durationMs: Math.round(entry.duration),
                    detail: { name: entry.name },
                });
            }
        }).observe({ type: "longtask", buffered: true });
    }

    private watchFrames(scene: Scene): void {
        scene.onBeforeRenderObservable.add(() => {
            const now = performance.now();
            const gap = now - this.lastFrame;
            const pausedDuringGap = this.lastPauseChange >= this.lastFrame;
            if (this.lastFrame > 0 && gap >= FRAME_GAP_MS && !pausedDuringGap && !this.paused) {
                this.record({
                    kind: "frame-gap",
                    at: performance.timeOrigin + this.lastFrame,
                    durationMs: Math.round(gap),
                    detail: this.inXR ? { msSinceXREnter: Math.round(this.lastFrame - this.xrEnteredAt) } : undefined,
                });
            }
            this.lastFrame = now;
        });
    }

    private watchPauses(): void {
        const pauseChanged = (kind: HangEvent["kind"], detail: Record<string, unknown>) => {
            this.lastPauseChange = performance.now();
            this.record({ kind, at: Date.now(), detail });
        };

        document.addEventListener("visibilitychange", () => {
            pauseChanged("page-visibility", { hidden: document.hidden });
            if (document.hidden) this.flush();
        });

        this.audioContext.addEventListener("statechange", () => {
            this.record({ kind: "audio-state", at: Date.now(), detail: { state: this.audioContext.state } });
        });

        // The headset menu does not hide the page: it changes the visibility of the XR session.
        // Starting and ending a session are not pauses: a long wait for the first XR frame is a hang.
        this.xr?.baseExperience.sessionManager.onXRSessionInit.add(session => {
            this.xrSession = session;
            this.xrEnteredAt = performance.now();
            this.record({ kind: "xr-visibility", at: Date.now(), detail: { state: "started" } });
            session.addEventListener("visibilitychange", () => {
                pauseChanged("xr-visibility", { state: session.visibilityState });
            });
            session.addEventListener("end", () => {
                if (this.xrSession === session) this.xrSession = null;
                this.record({ kind: "xr-visibility", at: Date.now(), detail: { state: "ended" } });
            });
        });
    }

    /** Send what is buffered. A failed batch is lost: a report must never get in the way of the app. */
    private flush(): void {
        if (this.buffer.length === 0) return;

        const events = this.buffer.splice(0, this.buffer.length);
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            fetch(`${SERVER_NAME}/api/diagnostics/hangs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                body: JSON.stringify({ ...this.identity, events: events.slice(i, i + BATCH_SIZE) }),
            }).catch(() => {});
        }
    }
}
