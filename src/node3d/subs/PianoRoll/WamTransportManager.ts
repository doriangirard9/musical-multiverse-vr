// WamTransportManager.ts
type WamLikeNode = { scheduleEvents: (evt: any) => void };

export class WamTransportManager {
  private static _instance: WamTransportManager | null = null;

  static getInstance(audioCtx: AudioContext): WamTransportManager {
    if (!this._instance) this._instance = new WamTransportManager(audioCtx);
    return this._instance;
  }

  private constructor(private audioCtx: AudioContext) {}

  private nodes = new Set<WamLikeNode>();
  private listeners = new Set<() => void>();

  private tempo = 120;   // BPM
  private num = 4;       // numerator (beats per bar)
  private den = 4;       // denominator (note that gets the beat)

  private playing = false;
  private startTime = 0;   // context time when last started
  private pauseOffset = 0; // accumulated elapsed while paused, in seconds

  // ---------- Public API ----------

  register(node: WamLikeNode) {
    this.nodes.add(node);
    const now = this.audioCtx.currentTime;
    const elapsed = this._elapsedAt(now);
    const { currentBar, currentBarStarted } = this._positionFor(elapsed, now);
    node.scheduleEvents({
      type: "wam-transport",
      data: {
        playing: this.playing,
        timeSigDenominator: this.den,
        timeSigNumerator: this.num,
        currentBar,
        currentBarStarted,
        tempo: this.tempo,
      },
    });
  }

  unregister(node: WamLikeNode) { this.nodes.delete(node); }

  onChange(cb: () => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private _emit() { for (const cb of this.listeners) cb(); }

  getPlaying(): boolean { return this.playing; }
  getTempo(): number { return this.tempo; }
  getTimeSignature(): { numerator: number; denominator: number } { return { numerator: this.num, denominator: this.den }; }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.startTime = this.audioCtx.currentTime;
    this._broadcast(true);
    this._emit();
  }

  stop() {
    if (!this.playing) return;
    const now = this.audioCtx.currentTime;
    this.pauseOffset += Math.max(0, now - this.startTime);
    this.playing = false;
    this._broadcast(false);
    this._emit();
  }

  toggle() { this.playing ? this.stop() : this.start(); }

  setTempo(bpm: number) {
    const now = this.audioCtx.currentTime;
    const elapsed = this._elapsedAt(now);
    this.tempo = Math.max(1, bpm);
    // preserve musical position
    this.pauseOffset = elapsed;
    if (this.playing) this.startTime = now;
    this._broadcast(this.playing);
    this._emit();
  }

  setTimeSignature(numerator: number, denominator: number) {
    const now = this.audioCtx.currentTime;
    const elapsed = this._elapsedAt(now);
    this.num = Math.max(1, Math.floor(numerator));
    this.den = Math.max(1, Math.floor(denominator));
    // preserve musical position
    this.pauseOffset = elapsed;
    if (this.playing) this.startTime = now;
    this._broadcast(this.playing);
    this._emit();
  }

  /** Seek to absolute elapsed seconds from bar 0 beat 0. */
  seekToSeconds(elapsedSeconds: number) {
    const now = this.audioCtx.currentTime;
    this.pauseOffset = Math.max(0, elapsedSeconds);
    if (this.playing) this.startTime = now; // keep continuity
    this._broadcast(this.playing);
    this._emit();
  }

  /** Seek to musical position; beat may be fractional. */
  seekToBarBeat(bar: number, beat: number = 0) {
    const seconds = Math.max(0, bar) * this._secPerBar() + Math.max(0, beat) * this._secPerBeat();
    this.seekToSeconds(seconds);
  }

  /** Nudge by delta seconds (positive/negative). */
  nudgeSeconds(delta: number) { this.seekToSeconds(this.getElapsedSeconds() + delta); }

  /** Optional: start on the next bar boundary for perfect downbeat sync. */
  startQuantizedToNextBar() {
    if (this.playing) return;
    const now = this.audioCtx.currentTime;
    const elapsed = this._elapsedAt(now);
    const spBar = this._secPerBar();
    const toNext = (spBar - (elapsed % spBar)) % spBar; // 0 if already on boundary
    this.pauseOffset = elapsed + toNext;
    this.start();
  }

  /** Real elapsed seconds from origin (includes pauses). */
  getElapsedSeconds(): number { return this._elapsedAt(this.audioCtx.currentTime); }

  // ---------- Internals ----------

  private _elapsedAt(now: number): number {
    return (this.playing ? (now - this.startTime) : 0) + this.pauseOffset;
  }

  /** Seconds per beat, respecting denominator. */
  private _secPerBeat(): number {
    // quarter note = 60/tempo; scale by (4/den) so den=8 -> eighth = quarter/2
    return (60 / this.tempo) * (4 / this.den);
  }

  /** Seconds per bar given tempo & time signature. */
  private _secPerBar(): number { return this._secPerBeat() * this.num; }

  /** Map elapsed seconds to WAM transport fields using a single captured 'now'. */
  private _positionFor(elapsedSeconds: number, now: number) {
    const spBar = this._secPerBar();
    const timeSinceBarStart = elapsedSeconds % spBar;
    const currentBar = Math.floor(elapsedSeconds / spBar);
    const currentBarStarted = now - timeSinceBarStart; // identical for all nodes this tick
    return { currentBar, currentBarStarted };
  }

  /** Broadcast using one shared timestamp so all nodes align. */
  private _broadcast(playing: boolean) {
    const now = this.audioCtx.currentTime;
    const elapsed = this._elapsedAt(now);
    const { currentBar, currentBarStarted } = this._positionFor(elapsed, now);
    const data = {
      playing,
      timeSigDenominator: this.den,
      timeSigNumerator: this.num,
      currentBar,
      currentBarStarted,
      tempo: this.tempo,
    };
    for (const node of this.nodes) node.scheduleEvents({ type: "wam-transport", data });
  }
}
