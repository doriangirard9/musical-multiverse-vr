// WamTransportManager.ts
type WamLikeNode = { scheduleEvents: (evt: any) => void };

/**
 * How far behind the shared transport a node plays, so it can start its loop over on its own.
 * In beats, so it keeps its musical meaning when the tempo changes.
 */
export interface TransportOffset {
  /** How many beats behind the transport the node is */
  beats: number;
  /**
   * The length of the node's loop, in beats. A node behind by more than the transport has played
   * is taken that many beats further, to the same place in its loop, rather than before the start.
   */
  wrapBeats: number;
}

/**
 * A manager than handle the wam transport events.
 * The start/stop/tempo/time signature states of the app.
 */
export class WamTransportManager {
  private static _instance: WamTransportManager | null = null;

  static getInstance(audioCtx: AudioContext): WamTransportManager {
    if (!this._instance) this._instance = new WamTransportManager(audioCtx);
    return this._instance;
  }

  private constructor(private audioCtx: AudioContext) {}

  private nodes = new Set<WamLikeNode>();
  private offsets = new Map<WamLikeNode, TransportOffset>();
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
    this._sendTo(node, this.playing, this.audioCtx.currentTime);
  }

  unregister(node: WamLikeNode) {
    this.nodes.delete(node);
    this.offsets.delete(node);
  }

  /** Make a node play behind the shared transport, see {@link TransportOffset}. The node is told at once. */
  setNodeOffset(node: WamLikeNode, offset: TransportOffset) {
    if (offset.beats === 0) this.offsets.delete(node);
    else this.offsets.set(node, offset);
    if (this.nodes.has(node)) this._sendTo(node, this.playing, this.audioCtx.currentTime);
  }

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

  get isPlaying() { return this.playing; }

  toggle() { this.playing ? this.stop() : this.start(); }

  setTempo(bpm: number) {
    const tempo = Math.max(1, bpm);
    if (tempo === this.tempo) return;
    const now = this.audioCtx.currentTime;
    // Preserve the musical position: the elapsed seconds are counted at the old tempo, the same
    // beat falls tempo_old/tempo_new as many seconds in at the new one.
    this.pauseOffset = this._elapsedAt(now) * this.tempo / tempo;
    this.tempo = tempo;
    if (this.playing) this.startTime = now;
    this._broadcast(this.playing);
    this._emit();
  }

  setTimeSignature(numerator: number, denominator: number) {
    const num = Math.max(1, Math.floor(numerator));
    const den = Math.max(1, Math.floor(denominator));
    if (num === this.num && den === this.den) return;
    const now = this.audioCtx.currentTime;
    const elapsed = this._elapsedAt(now);
    this.num = num;
    this.den = den;
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

  /**
   * Real elapsed seconds from origin (includes pauses).
   * @param offset Where a node playing behind the transport stands, see {@link TransportOffset}.
   */
  getElapsedSeconds(offset?: TransportOffset): number { return this._shifted(this._elapsedAt(this.audioCtx.currentTime), offset); }

  /** Elapsed beats from origin, the unit of {@link TransportOffset}. */
  getElapsedBeats(): number { return this.getElapsedSeconds() / this._secPerBeat(); }

  /** Seconds per beat at the current tempo and time signature. */
  getSecondsPerBeat(): number { return this._secPerBeat(); }

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

  /** The elapsed seconds of a node playing behind the transport by `offset`. */
  private _shifted(elapsed: number, offset?: TransportOffset): number {
    if (!offset) return elapsed;
    const spb = this._secPerBeat();
    const shifted = elapsed - offset.beats * spb;
    const wrap = offset.wrapBeats * spb;
    if (shifted >= 0 || wrap <= 0) return Math.max(0, shifted);
    return ((shifted % wrap) + wrap) % wrap;
  }

  private _sendTo(node: WamLikeNode, playing: boolean, now: number) {
    const elapsed = this._shifted(this._elapsedAt(now), this.offsets.get(node));
    const { currentBar, currentBarStarted } = this._positionFor(elapsed, now);
    node.scheduleEvents({
      type: "wam-transport",
      data: {
        playing,
        timeSigDenominator: this.den,
        timeSigNumerator: this.num,
        currentBar,
        currentBarStarted,
        tempo: this.tempo,
      },
    });
  }

  /** Broadcast using one shared timestamp so all nodes align, each at its own offset. */
  private _broadcast(playing: boolean) {
    const now = this.audioCtx.currentTime;
    for (const node of this.nodes) this._sendTo(node, playing, now);
  }
}
