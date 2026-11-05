'use client';
import { RingLock } from '../vision/tracker';
import type { Calibration, Shot } from '../core/types';
import type { LiveStepResult } from '../vision/live_engine';
import { vision } from '../services/vision';
import { grabFrame } from '../services/camera';
import { holeDiameterIn, settings } from './settings';
import { useAnalyzer, type Frame } from './analyzer';
import { notify } from './toast';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Live pipeline for a camera or CCTV stream.
 *   1. Find the target on every frame until the ring is steady, then lock it.
 *   2. Hold fire: the target is learned (a "before" picture and how much every
 *      pixel flickers).
 *   3. Every frame is aligned to that picture and compared. Only a small new
 *      change that a neural network accepts as a bullet hole and that stays for
 *      several frames is counted. Wrinkles, ring crossings, board edges and old
 *      holes never count, because they were already there.
 *   4. When all rounds are in and nothing changes for a moment, the frame is
 *      frozen into review (auto capture), or the operator presses Capture.
 * The ring is re-checked every few frames; if the camera moved, the ring is
 * locked again and the target re-learned, and the counted holes are kept.
 */
export class LiveSession {
  private lock = new RingLock();
  private running = false;
  private frameNo = 0;
  private lastChange = 0;
  private video: HTMLVideoElement | null = null;
  private source: Frame['source'] = 'camera';
  private version = 0;
  private lockedCal: Calibration | null = null;
  private last: LiveStepResult | null = null;
  private command: NonNullable<import('../vision/protocol').LiveRequest['command']> | null = null;
  private lastMs = 0;
  private lastError: string | undefined;
  private announcedDone = false;
  private wasUnstable = false;
  private warnedSmall = false;

  start(video: HTMLVideoElement, source: Frame['source']) {
    if (this.running && this.video === video) return;
    this.video = video;
    this.source = source;
    this.running = true;
    this.lock.reset();
    this.lockedCal = null;
    this.last = null;
    this.command = { kind: 'clear' };
    this.announcedDone = false;
    this.warnedSmall = false;
    this.lastChange = performance.now();
    void this.loop();
  }

  stop() {
    this.running = false;
    this.video = null;
  }

  /** Keep holes already on the target but count only new ones. */
  nextGroup() {
    this.command = { kind: 'nextGroup' };
    this.announcedDone = false;
    this.lastChange = performance.now();
  }

  removeHole(id: string) {
    this.command = { kind: 'remove', id };
    if (this.last) this.last = { ...this.last, holes: this.last.holes.filter((h) => h.id !== id) };
    this.publish();
  }

  /** Forget the ring lock and search again (e.g. after moving the camera). */
  relock() {
    this.lock.reset();
    this.lockedCal = null;
    this.publish();
  }

  private get counted() {
    return (this.last?.holes ?? []).filter((h) => h.confirmed && !h.previous).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  }

  /** Freezes the current frame into review. Returns false when it could not. */
  async capture(): Promise<boolean> {
    const v = this.video;
    const cal = this.lockedCal;
    if (!v) return false;
    try {
      const { blob, width, height } = await grabFrame(v);
      const store = useAnalyzer.getState();
      const counted = this.counted;
      if (!cal || counted.length === 0) {
        // nothing new counted (or no ring yet): analyse the frame like a photo
        this.stop();
        await store.setFrame(blob, width, height, this.source);
        return true;
      }
      const shots: Shot[] = counted.map((t) => ({ id: t.id, p: t.p, source: 'live', confidence: t.confidence, merged: false, seq: t.seq }));
      this.stop();
      store.fromLive(blob, width, height, cal, shots, this.source);
      return true;
    } catch (err) {
      notify('error', 'Capture failed', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /** The stream dropped: keep the last picture and the counted hits instead of losing them. */
  async rescue(): Promise<boolean> {
    if (!this.video || !this.lockedCal || this.counted.length === 0) return false;
    return this.capture();
  }

  private async loop() {
    while (this.running) {
      const v = this.video;
      if (!v || v.readyState < 2 || !v.videoWidth) {
        await sleep(120);
        continue;
      }
      const st = settings();
      const locked = this.lockedCal;
      const findRing = !locked || this.frameNo % 5 === 0;
      this.frameNo++;
      // commands go with the next locked frame (they are kept until then)
      const command = locked ? this.command : null;
      if (locked) this.command = null;
      let res;
      try {
        res = await vision.run(v, {
          findRing,
          findHoles: false,
          calibration: null,
          diameterIn: st.rules.targetDiameterIn,
          holeDiameterIn: holeDiameterIn(st),
          sensitivity: st.sensitivity,
          minConfidence: st.minConfidence,
          live: true,
          liveStep: locked
            ? { calibration: locked, version: this.version, settings: { holeDiameterIn: holeDiameterIn(st), sensitivity: st.sensitivity }, step: true, command: command ?? undefined }
            : undefined,
        });
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.publish();
        await sleep(500);
        continue;
      }
      if (!this.running) break;
      this.lastMs = res.ms;
      this.lastError = res.error;
      if (res.live) this.onLive(res.live);
      if (findRing) {
        const state = this.lock.update(res.ring);
        if (state.event === 'moved') {
          this.lastChange = performance.now();
          notify('warn', 'Camera or target moved', 'Finding the ring again. Hits already counted are kept.');
        }
        if (state.event === 'locked' && state.calibration) {
          this.lockedCal = state.calibration;
          this.version++;
          notify('ok', 'Calibration done', 'Ring locked. Reading the target: hold fire.');
        }
        if (!this.lock.calibration && this.lockedCal && state.event === 'moved') this.lockedCal = null;
      }
      this.publish();
      if (this.shouldAutoCapture()) {
        await this.capture();
        break;
      }
      await sleep(15);
    }
  }

  private onLive(r: LiveStepResult) {
    const prevPhase = this.last?.phase;
    this.last = r;
    if (prevPhase === 'learning' && r.phase !== 'learning') notify('ok', 'Ready', 'Start firing. Only new holes are counted.');
    if (r.lowResolution && !this.warnedSmall) {
      this.warnedSmall = true;
      notify('warn', 'Target is small in the picture', `A hole is only ${r.holePx.toFixed(1)} px wide. Zoom the camera in so the target fills the picture.`);
    }
    if (r.relearned) notify('warn', 'Scene changed', 'Light or camera changed. Reading the target again: hold fire. Counted hits are kept.');
    if (r.withdrawn.length) notify('info', 'Mark removed', 'A change disappeared again (bird, insect or shadow), so it was not a hole.');
    if (r.phase === 'unstable' && !this.wasUnstable) this.lastChange = performance.now();
    this.wasUnstable = r.phase === 'unstable';
    if (r.newlyCounted.length || r.withdrawn.length) this.lastChange = performance.now();
    const required = settings().rules.requiredRounds;
    if (r.newlyCounted.length && this.counted.length === required && !this.announcedDone) {
      this.announcedDone = true;
      notify('ok', 'Bullet marks done', `All ${required} hits found.`);
    }
  }

  private shouldAutoCapture() {
    const st = settings();
    if (!st.autoCapture || !this.lockedCal || !this.last) return false;
    if (this.counted.length !== st.rules.requiredRounds) return false;
    if (this.last.holes.some((t) => !t.confirmed)) return false; // something still being checked
    return performance.now() - this.lastChange > 2500;
  }

  private publish() {
    const v = this.video;
    const store = useAnalyzer.getState();
    if (!v || store.mode !== 'live') return;
    const st = settings();
    const lockedCal = this.lockedCal;
    const r = this.last;
    const holes = lockedCal && r ? r.holes.map((t) => ({ id: t.id, p: t.p, seq: t.seq, confirmed: t.confirmed, previous: t.previous, merged: false })) : [];
    let captureIn: number | undefined;
    if (st.autoCapture && lockedCal && this.counted.length === st.rules.requiredRounds && !(r?.holes ?? []).some((t) => !t.confirmed)) {
      captureIn = Math.max(0, (2500 - (performance.now() - this.lastChange)) / 1000);
    }
    const ring = lockedCal ?? this.lock.latest;
    store.setLive({
      phase: lockedCal ? 'locked' : ring ? 'steadying' : 'searching',
      progress: this.lock.progress,
      calibration: ring,
      holes,
      width: v.videoWidth,
      height: v.videoHeight,
      ms: this.lastMs,
      lowResolution: !!r?.lowResolution,
      error: this.lastError,
      captureIn,
      learning: !!lockedCal && (!r || r.phase === 'learning'),
      learnProgress: r?.learnProgress,
      unstable: r?.phase === 'unstable',
    });
  }

  /** Snapshot for diagnostics (window.__rfaLive.debug() in the browser console). */
  debug() {
    return {
      calibration: this.lockedCal,
      phase: this.last?.phase,
      changed: this.last?.changed,
      shift: this.last?.shift,
      holePx: this.last?.holePx,
      counted: this.counted.map((t) => [+t.pIn.x.toFixed(2), +t.pIn.y.toFixed(2)]),
      checking: (this.last?.holes ?? []).filter((t) => !t.confirmed).map((t) => [+t.pIn.x.toFixed(2), +t.pIn.y.toFixed(2)]),
    };
  }
}

export const live = new LiveSession();
if (typeof window !== 'undefined') (window as unknown as { __rfaLive: LiveSession }).__rfaLive = live;
