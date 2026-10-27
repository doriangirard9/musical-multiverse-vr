import * as Y from 'yjs';
import { WamTransportManager } from "../app/node3d/WamTransportManager.ts";
import { TransportNetwork } from "./TransportNetwork.ts";
import { ServerClock } from "./ServerClock.ts";

/**
 * Lets a participant play and pause together with the others, instead of on their own.
 *
 * Each participant chooses: in Local mode (the default) play and pause only concern themselves; in
 * Sync mode they follow, and drive, the play and pause of everyone else in Sync. The choice is
 * personal and not saved.
 *
 * Those in Sync share one position, through the "transportSync" map of the shared document: whether
 * the group plays, where it was in beats, and the time at which it was there. Whoever receives it
 * works out where the group is now, so the delay of the network does not put anyone behind: a late
 * message only skips its first milliseconds. The time is the server's ({@link ServerClock}), not the
 * device's: the clocks of two devices were measured half a second apart, which put them a beat apart.
 *
 * The map is not saved with the session, unlike the tempo (see {@link TransportNetwork}): the next
 * session starts stopped.
 */
export class TransportSync {

    /** Keys of the shared map */
    static readonly PLAYING = "playing";
    static readonly BEATS = "beats";
    static readonly AT = "at";
    /** Time the group has played, in ms, up to AT: the stopwatch of the session */
    static readonly PLAYED = "played";

    private static _instance?: TransportSync;

    /** The one of this participant, once the app has created it */
    static get instance(): TransportSync | undefined { return this._instance; }

    readonly map: Y.Map<number | boolean>;

    private _enabled = false;

    /** Set while the group's position is being applied, so applying it is not published back */
    private applying = false;

    private readonly listeners = new Set<(enabled: boolean) => void>();

    constructor(
        private readonly doc: Y.Doc,
        private readonly transport: WamTransportManager,
        network: TransportNetwork,
        audioContext: AudioContext,
    ) {
        this.map = doc.getMap<number | boolean>("transportSync");
        TransportSync._instance = this;
        void ServerClock.synchronize();

        this.map.observe(event => {
            if (event.transaction.origin !== this && this._enabled) this.applyShared();
        });

        // The transport follows the audio clock, which stops while the audio is suspended, as when the
        // headset is taken off: back from it, this participant is behind the group by as long. It
        // catches up with where the group is now, once the clock of the device is measured again.
        audioContext.addEventListener("statechange", () => {
            if (audioContext.state !== "running" || !this._enabled) return;
            void ServerClock.resynchronize().then(() => {
                if (this._enabled) this.applyShared();
            });
        });

        // Play, pause, a jump or a new tempo by this participant while in Sync: the group follows.
        // A tempo that came from the others is not one: everyone in Sync receives it already.
        transport.onChange(() => {
            if (this._enabled && !this.applying && !network.applying) this.publish();
        });
    }

    /** Whether this participant plays and pauses together with the others in Sync */
    get enabled(): boolean { return this._enabled; }

    /**
     * Switch between Local and Sync. Going to Sync takes the group's state, playing or paused and
     * where; with no group yet, this participant's own state becomes it.
     */
    setEnabled(enabled: boolean): void {
        if (enabled === this._enabled) return;
        this._enabled = enabled;
        if (enabled) {
            if (this.map.has(TransportSync.AT)) this.applyShared();
            else this.publish();
        }
        for (const listener of this.listeners) listener(enabled);
    }

    /** Listen to the switches between Local and Sync. Returns the unsubscribe function. */
    onModeChange(listener: (enabled: boolean) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    /**
     * How long the group in Sync has played, in ms: it runs while the group plays and stops while it
     * pauses. The map is not saved, so it starts again from 0 once everyone has left.
     */
    getPlayedMs(): number {
        return this.playedAt(ServerClock.now());
    }

    /** The time played by the group at a given server time, from the last published position */
    private playedAt(now: number): number {
        const played = this.map.get(TransportSync.PLAYED);
        const at = this.map.get(TransportSync.AT);
        const base = typeof played === "number" ? played : 0;
        if (this.map.get(TransportSync.PLAYING) !== true || typeof at !== "number") return base;
        return base + Math.max(0, now - at);
    }

    /** Write where this participant is now as the group's position */
    private publish(): void {
        const now = ServerClock.now();
        const played = this.playedAt(now);
        this.doc.transact(() => {
            this.map.set(TransportSync.PLAYING, this.transport.isPlaying);
            this.map.set(TransportSync.BEATS, this.transport.getElapsedBeats());
            this.map.set(TransportSync.AT, now);
            this.map.set(TransportSync.PLAYED, played);
        }, this);
    }

    /** Move the local transport to where the group is now */
    private applyShared(): void {
        const playing = this.map.get(TransportSync.PLAYING) === true;
        const beats = this.map.get(TransportSync.BEATS);
        const at = this.map.get(TransportSync.AT);
        if (typeof beats !== "number" || typeof at !== "number") return;

        const secondsPerBeat = this.transport.getSecondsPerBeat();
        const elapsed = playing ? Math.max(0, (ServerClock.now() - at) / 1000) : 0;
        const seconds = beats * secondsPerBeat + elapsed;

        this.applying = true;
        try {
            if (!playing && this.transport.isPlaying) this.transport.stop();
            this.transport.seekToSeconds(seconds);
            if (playing && !this.transport.isPlaying) this.transport.start();
        } finally {
            this.applying = false;
        }
    }
}
