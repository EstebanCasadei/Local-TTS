// Streaming playback queue — schedules decoded AudioBuffers on the AudioContext
// clock for sample-accurate gapless playback. Chunks can arrive in any order
// and at any time: the queue indexes by position, not arrival. If the next
// chunk hasn't arrived yet, the queue enters 'buffering' and resumes when it
// does.
//
// Ported from the PoC (src/lib/playbackQueue.js) with TypeScript types and
// improvements:
// - Simplified position tracking (no separate timelineEnd bookkeeping)
// - Cleaner state management (single source of truth via onChange callback)
// - Removed the estimated duration weight-projection (we know real durations
//   from decoded buffers; estimation adds complexity for marginal value)
// - Pause uses ctx.suspend() / resume() so scheduled sources keep their exact
//   positions — no re-seek needed on resume.

import { GAP_MS } from "./audio";
import { timeStretchBuffer } from "./timeStretch";

export const PlaybackState = {
  IDLE: "idle",
  PLAYING: "playing",
  BUFFERING: "buffering",
  PAUSED: "paused",
  DONE: "done",
} as const;

export type PlaybackState = (typeof PlaybackState)[keyof typeof PlaybackState];

const SCHEDULE_LEAD = 0.02; // minimum margin to schedule in the future

export interface PlaybackSnapshot {
  state: PlaybackState;
  position: number; // seconds into the audio
  duration: number; // seconds, from known buffers
  index: number; // currently playing chunk index
  total: number;
  playing: boolean;
  chunkStartTimes: (number | undefined)[];
}

export interface PlaybackQueueOptions {
  onChange?: (snapshot: PlaybackSnapshot) => void;
  gapMs?: number;
  /** Inject a context (tests only). Production code lets the queue create its own. */
  audioContext?: AudioContext;
}

/**
 * Creates a new AudioContext for playback. The queue owns this context and
 * closes it in dispose() — this is critical on iOS Safari, which limits the
 * number of running AudioContexts (~4). Sharing/leaking contexts across
 * playback sessions eventually throws UnknownError.
 */
function createPlaybackContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

export class PlaybackQueue {
  private ctx: AudioContext;
  private gap: number;
  private onChange?: (snapshot: PlaybackSnapshot) => void;
  private gain: GainNode;
  private disposed = false;

  private rate = 1;

  /** index → decoded AudioBuffer (kept for seek) */
  private buffers = new Map<number, AudioBuffer>();
  /** `${index}:${rate}` → time-stretched buffer (see getPlaybackBuffer). */
  private stretchedCache = new Map<string, AudioBuffer>();
  /** index → buffer not yet scheduled */
  private entries = new Map<number, AudioBuffer>();
  /** index → gap in seconds after this chunk */
  private gaps = new Map<number, number>();
  /** indices that will never arrive (failed/cancelled) */
  private skipped = new Set<number>();

  /** scheduled chunks with their timeline positions */
  private scheduled: ScheduledEntry[] = [];
  private sources = new Set<AudioBufferSourceNode>();

  private total = 0;
  private pushedDuration = 0;
  private pushedCount = 0;

  private nextIndex = 0;
  private scheduledUntil = 0; // ctx time when scheduled audio ends
  private timelineEnd = 0; // audio-internal time of the end of scheduled audio
  private wantPlay = false;
  private state: PlaybackState = PlaybackState.IDLE;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private pendingLocalOffset = 0; // offset within the first chunk when re-scheduling

  /** Start time of each chunk in the audio's internal timeline. */
  private chunkStartTimes: (number | undefined)[] = [];
  /** Cached snapshot of chunkStartTimes — only rebuilt when values change. */
  private chunkStartTimesSnapshot: (number | undefined)[] = [];

  constructor(options: PlaybackQueueOptions = {}) {
    this.ctx = options.audioContext ?? createPlaybackContext();
    this.gap = (options.gapMs ?? GAP_MS) / 1000;
    this.onChange = options.onChange;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(this.ctx.destination);
  }

  /** Sets how many chunks to expect. Must be called before push(). */
  setPlan(total: number): void {
    this.total = total;
    this.chunkStartTimes = new Array(total);
    this.notify();
  }

  /**
   * Adds a chunk at its ordered position. Arrival order is irrelevant — the
   * queue indexes by position, so chunk 5 can arrive before chunk 0.
   */
  push(index: number, buffer: AudioBuffer, gapMs?: number): void {
    if (this.skipped.has(index) || index < this.nextIndex) return;
    this.buffers.set(index, buffer);
    this.entries.set(index, buffer);
    this.gaps.set(index, gapMs != null ? gapMs / 1000 : this.gap);
    this.pushedCount++;
    this.pushedDuration += buffer.duration;
    this.pump();
    this.notify();
  }

  /** Marks an index as never arriving so the queue doesn't wait for it. */
  markSkipped(index: number): void {
    this.skipped.add(index);
    this.pump();
    this.notify();
  }

  /** No more chunks will arrive — skip anything missing. */
  close(): void {
    for (let i = 0; i < this.total; i++) {
      if (!this.buffers.has(i) && i >= this.nextIndex) this.skipped.add(i);
    }
    this.pump();
    this.notify();
  }

  async play(): Promise<void> {
    this.wantPlay = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.startTicker();
    this.pump();
    this.notify();
  }

  async pause(): Promise<void> {
    this.wantPlay = false;
    // suspend() freezes the ctx clock — scheduled sources resume exactly where
    // they left off on resume(). No re-seek needed.
    if (this.ctx.state === "running") await this.ctx.suspend();
    this.state = PlaybackState.PAUSED;
    this.stopTicker();
    this.notify();
  }

  /** Seeks to a global position in seconds, re-scheduling from that point. */
  async seek(time: number): Promise<number> {
    if (!this.total || time < 0) return -1;

    let offset = 0;
    let targetIndex = -1;
    let localOffset = 0;

    for (let i = 0; i < this.total; i++) {
      if (this.skipped.has(i)) continue;
      const buffer = this.buffers.get(i);
      const gap = this.gaps.get(i) ?? this.gap;
      if (!buffer) break;

      // Store the start time for every chunk we visit. This is critical for
      // resume: chunks 0..N-1 are pushed but never pumped (wantPlay is false
      // until the resume chunk arrives), so their chunkStartTimes are never
      // set by pump(). Without this, the karaoke can't compute word timings
      // for past chunks or the active chunk.
      this.chunkStartTimes[i] = offset;

      if (time < offset + buffer.duration) {
        targetIndex = i;
        localOffset = Math.max(0, time - offset);
        break;
      }
      offset += buffer.duration + gap;
    }

    if (targetIndex === -1) return -1;

    // Set nextIndex BEFORE clearScheduled() so that clearScheduled re-adds
    // the target chunk's buffer to entries (it re-adds index >= nextIndex).
    // If we set nextIndex after clearScheduled, the target's buffer wouldn't
    // be in entries and pump() would hit a gap → no audio.
    this.nextIndex = targetIndex;
    this.clearScheduled();
    this.pendingLocalOffset = localOffset;
    this.timelineEnd = offset;
    // Invalidate any stale chunk start times for chunks beyond the new
    // playback point. Without this, buildTokens can see an old `nextStart`
    // from a previous playback/seek and inflate the current chunk's
    // duration, making the active word highlight lag behind the real audio.
    for (let i = targetIndex + 1; i < this.total; i++) {
      this.chunkStartTimes[i] = undefined;
    }

    if (this.wantPlay) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.pump();
    }

    this.notify();
    return targetIndex;
  }

  /** Seeks to a specific chunk index (e.g. clicking a word in karaoke). */
  async seekToChunk(index: number, localTime = 0): Promise<number> {
    if (index < 0 || index >= this.total) return -1;

    // Calculate the global time of this chunk's start, and set chunkStartTimes
    // for all chunks we visit. This is critical for the karaoke: without real
    // start times for past chunks, it falls back to proportional distribution
    // which places them at wrong positions — causing the highlight to jump
    // to a previous sentence after a few seconds of playback.
    let globalTime = 0;
    for (let i = 0; i < index; i++) {
      const buf = this.buffers.get(i);
      if (!buf) break;
      this.chunkStartTimes[i] = globalTime;
      globalTime += buf.duration + (this.gaps.get(i) ?? this.gap);
    }

    // Set the target chunk's start time too — the karaoke needs it to
    // compute word timings within the active chunk.
    this.chunkStartTimes[index] = globalTime;

    const targetBuffer = this.buffers.get(index);

    // Clamp localTime to the buffer duration — if it exceeds, the source
    // would have nothing to play. This can happen if the saved offsetLocal
    // was computed with a slightly different chunkStartTimes value.
    const clampedLocalTime = targetBuffer
      ? Math.min(Math.max(0, localTime), Math.max(0, targetBuffer.duration - 0.01))
      : Math.max(0, localTime);

    // Set nextIndex BEFORE clearScheduled() so that clearScheduled re-adds
    // the target chunk's buffer to entries (it re-adds index >= nextIndex).
    // Otherwise, seeking backward to an already-played chunk would find it
    // missing from entries (deleted when it originally finished playing)
    // and pump() would wait forever for a push() that's never coming — see
    // seek()'s identical fix above.
    this.nextIndex = index;
    this.clearScheduled();
    this.pendingLocalOffset = clampedLocalTime;
    this.timelineEnd = globalTime;
    this.wantPlay = true;
    // Invalidate stale chunk start times beyond the new playback point so
    // the karaoke doesn't use an out-of-date `nextStart` for the chunk being
    // entered (or any chunk after it), which would make its word timings
    // stretch way beyond the actual audio.
    for (let i = index + 1; i < this.total; i++) {
      this.chunkStartTimes[i] = undefined;
    }

    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.startTicker();
    this.pump();
    this.notify();
    return index;
  }

  setVolume(value: number): void {
    this.gain.gain.value = Math.max(0, Math.min(1, value));
  }

  get volume(): number {
    return this.gain.gain.value;
  }

  /**
   * Changes playback rate and re-seeks to the current position so scheduled
   * chunks use the new rate immediately. Works mid-playback — the user hears
   * the speed change in real-time.
   *
   * Important: position is calculated with the OLD rate (before the change),
   * because the scheduled entries were computed with that rate. Then we set
   * the new rate and seek to that position — pump() schedules with the new rate.
   */
  async setRate(rate: number): Promise<void> {
    const r = Math.max(0.5, Math.min(2, rate));
    if (r === this.rate) return;
    // Capture position with the OLD rate before changing it.
    const currentPosition = this.position;
    this.rate = r;
    if (this.wantPlay && currentPosition > 0) {
      await this.seek(currentPosition);
    }
    this.notify();
  }

  get rateValue(): number {
    return this.rate;
  }

  /** Stops playback and releases all buffers. Not resumable. */
  async stop(): Promise<void> {
    this.wantPlay = false;
    this.nextIndex = this.total;
    this.buffers.clear();
    this.entries.clear();
    this.gaps.clear();
    this.clearScheduled();
    this.chunkStartTimes = [];
    this.scheduledUntil = 0;
    this.timelineEnd = 0;
    this.state = PlaybackState.IDLE;
    this.stopTicker();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.notify();
  }

  /**
   * Stops playback AND closes the AudioContext, releasing the browser's
   * audio resources. Call this when the queue is being replaced or the
   * component unmounts — NOT on pause (the context is needed to resume).
   * On iOS Safari, failing to close contexts leaks them and eventually
   * throws UnknownError (~4 context limit). Safe to call multiple times.
   */
  async dispose(): Promise<void> {
    await this.stop();
    if (this.disposed) return;
    this.disposed = true;
    this.ctx.close().catch(() => {});
  }

  get stateValue(): PlaybackState {
    return this.state;
  }

  /** Current position in the audio's internal timeline (seconds). */
  get position(): number {
    const t = this.ctx.currentTime;
    for (const entry of this.scheduled) {
      const localStart = entry.localStart ?? 0;
      if (t >= entry.endTime) {
        // This entry has finished playing.
        continue;
      }
      if (t >= entry.startTime) {
        // Currently playing this entry.
        return entry.offset + localStart + (t - entry.startTime) * this.rate;
      }
      // Not yet reached this entry — it was just scheduled by pump() with a
      // small lead time (SCHEDULE_LEAD). Return the position where playback
      // is about to resume, not 0. Without this, a seek/rate change causes a
      // one-frame flash to position 0 (start of sentence) before the source
      // starts playing and position jumps back to the correct value.
      return entry.offset + localStart;
    }
    // Nothing scheduled — this happens right after a seek while paused, since
    // pump() (which schedules entries) only runs when wantPlay is true. Report
    // the position we seeked to instead of falling through to 0, otherwise the
    // karaoke highlight flashes to the first word until playback resumes.
    if (this.scheduled.length === 0 && this.nextIndex < this.total) {
      return this.timelineEnd + this.pendingLocalOffset;
    }

    // Nothing currently playing — return the end of the last finished entry.
    const lastDone = [...this.scheduled].reverse().find((e) => t >= e.endTime);
    return lastDone ? lastDone.offset + (lastDone.localStart ?? 0) + lastDone.playDuration : 0;
  }

  /** Total duration from all known buffers (grows as chunks arrive). */
  get duration(): number {
    return this.pushedDuration + Math.max(0, this.pushedCount - 1) * this.gap;
  }

  /** Index currently playing, or the next one being waited on. */
  get currentIndex(): number {
    const t = this.ctx.currentTime;
    for (const entry of this.scheduled) {
      if (t < entry.endTime) return entry.index;
    }
    return Math.min(this.nextIndex, Math.max(0, this.total - 1));
  }

  /** Start time of a chunk in the audio timeline, or undefined if not scheduled. */
  timeAtChunk(index: number): number | undefined {
    return this.chunkStartTimes[index];
  }

  // --- Internal scheduling ---

  /** Time-stretched (pitch-preserving) buffer for this index at the current rate, cached. */
  private getPlaybackBuffer(index: number, buffer: AudioBuffer): AudioBuffer {
    if (this.rate === 1) return buffer;
    const key = `${index}:${this.rate}`;
    let stretched = this.stretchedCache.get(key);
    if (!stretched) {
      stretched = timeStretchBuffer(this.ctx, buffer, this.rate);
      this.stretchedCache.set(key, stretched);
    }
    return stretched;
  }

  private pump(): void {
    if (!this.wantPlay) return;

    let startTime = Math.max(this.ctx.currentTime + SCHEDULE_LEAD, this.scheduledUntil);
    let timelineEnd = this.timelineEnd;
    let first = true;

    while (this.nextIndex < this.total) {
      const index = this.nextIndex;

      if (this.skipped.has(index)) {
        this.nextIndex++;
        continue;
      }

      const buffer = this.entries.get(index);
      if (!buffer) break; // next chunk hasn't arrived → buffering

      const gap = this.gaps.get(index) ?? this.gap;
      const localStart = first ? this.pendingLocalOffset : 0;
      first = false;
      const originalDuration = buffer.duration - localStart;
      const playDuration = originalDuration / this.rate;

      // Play a time-stretched buffer at playbackRate 1 instead of the
      // original buffer at playbackRate = this.rate — the latter resamples
      // the audio, changing pitch along with speed. The stretched buffer's
      // duration is already ~ original/rate, so localStart/duration map to
      // it by the same factor.
      const playbackBuffer = this.getPlaybackBuffer(index, buffer);
      const source = this.ctx.createBufferSource();
      source.buffer = playbackBuffer;
      source.connect(this.gain);
      source.start(startTime, localStart / this.rate, playDuration);

      const entry: ScheduledEntry = {
        index,
        startTime,
        endTime: startTime + playDuration,
        offset: timelineEnd,
        localStart,
        playDuration,
      };
      this.scheduled.push(entry);
      // chunkStartTimes is the start of the chunk BUFFER in the audio timeline,
      // NOT where playback resumes within the chunk. The position getter
      // already adds localStart (entry.offset + localStart), so word timing
      // must be distributed across the full chunk — otherwise seeking to
      // mid-chunk shifts all word start times to the seek position, making
      // the first word appear "active" (a flash to sentence start on speed
      // change).
      this.chunkStartTimes[index] = timelineEnd;
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        this.entries.delete(index);
      };

      startTime += playDuration + gap;
      timelineEnd += buffer.duration + gap;
      this.scheduledUntil = startTime;
      this.timelineEnd = timelineEnd;
      this.nextIndex++;
    }

    // Only clear pendingLocalOffset if we actually scheduled at least one
    // chunk. If pump() broke early (next buffer not yet available), we must
    // keep the offset so it's applied when the buffer arrives via push().
    if (!first) {
      this.pendingLocalOffset = 0;
    }
  }

  private clearScheduled(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already ended
      }
    }
    this.sources.clear();
    this.scheduled = [];
    // Do NOT reset chunkStartTimes here — already-played chunks retain their
    // start times so the karaoke can still compute correct word timing for
    // them after a seek/rate change. pump() will overwrite entries from
    // nextIndex onward. stop() resets chunkStartTimes to [] explicitly.
    this.scheduledUntil = 0;
    // Re-add all buffers to entries so pump() can re-schedule them.
    for (const [index, buffer] of this.buffers) {
      if (index >= this.nextIndex) this.entries.set(index, buffer);
    }
  }

  private startTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), 100);
  }

  private stopTicker(): void {
    if (!this.ticker) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }

  private tick(): void {
    const t = this.ctx.currentTime;
    const pending = this.nextIndex < this.total;
    const sounding = this.scheduled.length > 0 && t < this.scheduledUntil;

    if (!pending && !sounding) {
      this.state = PlaybackState.DONE;
      this.wantPlay = false;
      this.stopTicker();
    } else if (sounding) {
      this.state = PlaybackState.PLAYING;
    } else {
      this.state = PlaybackState.BUFFERING;
    }

    this.notify();
  }

  /**
   * Returns a snapshot of chunkStartTimes, creating a new array only when the
   * values have changed since the last call. This keeps the array reference
   * stable across ticks (which fire every 100ms) so that React useMemo in
   * KaraokeText doesn't recompute tokens on every tick when nothing changed.
   */
  private getChunkStartTimesSnapshot(): (number | undefined)[] {
    const current = this.chunkStartTimes;
    const cached = this.chunkStartTimesSnapshot;

    if (current.length === cached.length) {
      let changed = false;
      for (let i = 0; i < current.length; i++) {
        if (current[i] !== cached[i]) {
          changed = true;
          break;
        }
      }
      if (!changed) return cached;
    }

    this.chunkStartTimesSnapshot = [...current];
    return this.chunkStartTimesSnapshot;
  }

  private notify(): void {
    this.onChange?.({
      state: this.state,
      position: this.position,
      duration: this.duration,
      index: this.currentIndex,
      total: this.total,
      playing: this.wantPlay,
      chunkStartTimes: this.getChunkStartTimesSnapshot(),
    });
  }
}

interface ScheduledEntry {
  index: number;
  startTime: number; // ctx.currentTime when this chunk starts
  endTime: number; // ctx.currentTime when it ends
  offset: number; // audio-internal timeline position
  localStart: number; // offset within the buffer (for seek)
  playDuration: number; // duration in real-time (after rate)
}
