'use client';
import { HoleTracker, RingLock } from '../vision/tracker';
import { pxPerInch, toImage } from '../core/calibration';
import type { Calibration, Shot, Vec2 } from '../core/types';
import { vision } from '../services/vision';
import { grabFrame } from '../services/camera';
import { holeDiameterIn, settings } from './settings';
import { useAnalyzer, type Frame } from './analyzer';
import { notify } from './toast';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Live pipeline for a camera or CCTV stream.
 *   1. Search every frame for the outer ring until it is steady -> lock calibration.
 *   2. With the ring locked, look for holes on every frame; a hole counts once it
 *      is seen on most recent frames (shadows and flicker are ignored).
 *   3. When all rounds are found and nothing changes for a moment, freeze the
 *      frame into review (auto capture), or the operator presses Capture.
 * The ring is re-checked every few frames; if the camera moves it re-locks.
 */
export class LiveSession {
  private lock = new RingLock();
  private tracker = new HoleTracker();
  private running = false;
  private frameNo = 0;
  private lastChange = 0;
  /** Frames left to read the clean target after the ring locks. */
  private learning = 0;
  private static LEARN_FRAMES = 8;
  private video: HTMLVideoElement | null = null;
  /** Picture of the target before firing; a real hole is a change from it. */
  private reference: { bitmap: ImageBitmap; cal: Calibration } | null = null;
  private source: Frame['source'] = 'camera';

  start(video: HTMLVideoElement, source: Frame['source']) {
    if (this.running && this.video === video) return;
    this.video = video;
    this.source = source;
    this.running = true;
    this.lock.reset();
    this.learning = 0;
    this.dropReference();
    this.tracker = new HoleTracker(Math.max(0.35, holeDiameterIn() * 1.2));
    this.lastChange = performance.now();
    void this.loop();
  }

  stop() {
    this.running = false;
    this.video = null;
    this.dropReference();
  }

  private dropReference() {
    this.reference?.bitmap.close();
    this.reference = null;
  }

  private async takeReference(v: HTMLVideoElement, cal: Calibration) {
    try {
      const bitmap = await createImageBitmap(v);
      this.dropReference();
      this.reference = { bitmap, cal };
    } catch {
      this.reference = null;
    }
  }

  /**
   * True when the patch around p differs from the reference picture: the core
   * changed clearly more than its surroundings (which absorb noise and light).
   */
  private changedSinceReference(pIn: Vec2): boolean {
    const v = this.video;
    const ref = this.reference;
    const cal = this.lock.calibration;
    if (!v || !ref || !cal) return true;
    const p = toImage(cal, pIn);
    const q = toImage(ref.cal, pIn);
    const r = Math.max(2.5, (pxPerInch(cal) * holeDiameterIn()) / 2);
    const half = Math.ceil(r * 3.2);
    const size = half * 2 + 1;
    const grab = (src: CanvasImageSource, c: Vec2) => {
      const cv = new OffscreenCanvas(size, size);
      const g = cv.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(src, Math.round(c.x) - half, Math.round(c.y) - half, size, size, 0, 0, size, size);
      const d = g.getImageData(0, 0, size, size).data;
      const out = new Float32Array(size * size);
      for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      return out;
    };
    try {
      const now = grab(v, p);
      const before = grab(ref.bitmap, q);
      let core = 0, nc = 0, ring = 0, nr = 0;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const d = Math.hypot(x - half, y - half);
          const diff = Math.abs(now[y * size + x] - before[y * size + x]);
          if (d <= r * 0.8) (core += diff), nc++;
          else if (d >= r * 2 && d <= r * 3.1) (ring += diff), nr++;
        }
      core /= nc || 1;
      ring /= nr || 1;
      return core > Math.max(14, ring * 3);
    } catch {
      return true; // cannot read pixels (e.g. CORS): fall back to the tracker alone
    }
  }

  /** Keep holes already on the target but count only new ones. */
  nextGroup() {
    this.tracker.startNewGroup();
    this.lastChange = performance.now();
    this.publish();
  }

  removeHole(id: string) {
    this.tracker.remove(id);
    this.publish();
  }

  /** Forget the ring lock and search again (e.g. after moving the camera). */
  relock() {
    this.lock.reset();
    this.learning = 0;
    this.publish();
  }

  /** Freezes the current frame into review. Returns false when it could not. */
  async capture(): Promise<boolean> {
    const v = this.video;
    const cal = this.lock.calibration;
    if (!v) return false;
    try {
      const { blob, width, height } = await grabFrame(v);
      const store = useAnalyzer.getState();
      if (!cal || this.tracker.current.length === 0) {
        // nothing new counted (or no ring yet): analyse the frame like a photo
        this.stop();
        await store.setFrame(blob, width, height, this.source);
        return true;
      }
      const shots: Shot[] = this.tracker.current.map((t) => ({
        id: t.id,
        p: toImage(cal, t.pIn),
        source: 'live',
        confidence: t.confidence,
        merged: t.merged,
        seq: t.seq,
      }));
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
    if (!this.video || !this.lock.calibration || this.tracker.current.length === 0) return false;
    return this.capture();
  }

  private lastMs = 0;
  private lastLowRes = false;
  private lastError: string | undefined;

  private async loop() {
    while (this.running) {
      const v = this.video;
      if (!v || v.readyState < 2 || !v.videoWidth) {
        await sleep(120);
        continue;
      }
      const st = settings();
      const locked = this.lock.calibration;
      const findRing = !locked || this.frameNo % 5 === 0;
      this.frameNo++;
      let res;
      try {
        res = await vision.run(v, {
          findRing,
          findHoles: !!locked,
          calibration: locked,
          diameterIn: st.rules.targetDiameterIn,
          holeDiameterIn: holeDiameterIn(st),
          sensitivity: st.sensitivity,
          minConfidence: st.minConfidence,
          learn: this.learning > 0 && !!locked,
          live: true,
        });
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.publish();
        await sleep(500);
        continue;
      }
      if (!this.running) break;
      this.lastMs = res.ms;
      this.lastLowRes = !!res.lowResolution;
      this.lastError = res.error;
      if (findRing) {
        const state = this.lock.update(res.ring);
        if (state.event === 'moved') {
          this.lastChange = performance.now();
          this.dropReference();
          notify('warn', 'Camera moved', 'Finding the ring again.');
        }
        if (state.event === 'locked') {
          notify('ok', 'Calibration done', 'Ring locked. Reading the target, hold fire.');
          if (this.tracker.all.length === 0) this.learning = LiveSession.LEARN_FRAMES;
          else void this.takeReference(v, state.calibration!); // re-locked after a move
        }
      }
      const cal = this.lock.calibration;
      if (cal && res.holes && locked && this.learning > 0) {
        this.tracker.learnBaseline(res.holes.map((h) => ({ pIn: h.pIn, confidence: h.confidence, merged: h.merged })));
        this.learning--;
        if (this.learning === 0) {
          await this.takeReference(v, cal);
          notify('ok', 'Ready', 'Start firing. Only new holes are counted.');
        }
        this.lastChange = performance.now();
      } else if (cal && res.holes) {
        // holes were found with the calibration current at request time; keep them in target inches
        // pIn was measured against the calibration sent with the request
        const newly = this.tracker.update(res.holes.map((h) => ({ pIn: h.pIn, confidence: h.confidence, merged: h.merged })));
        for (const t of newly) if (!this.changedSinceReference(t.pIn)) this.tracker.markPrinted(t.id);
        if (newly.length) this.lastChange = performance.now();
        const counted = this.tracker.current.length;
        if (newly.some((t) => t.confirmed && !t.previous) && counted === st.rules.requiredRounds) notify('ok', 'Bullet marks done', `All ${counted} hits found.`);
      }
      this.publish();
      if (this.shouldAutoCapture()) {
        await this.capture();
        break;
      }
      await sleep(30);
    }
  }

  private shouldAutoCapture() {
    const st = settings();
    if (!st.autoCapture || !this.lock.calibration) return false;
    if (this.tracker.current.length !== st.rules.requiredRounds) return false;
    if (this.tracker.all.some((t) => !t.confirmed)) return false; // something still being checked
    return performance.now() - this.lastChange > 2500;
  }

  private publish() {
    const v = this.video;
    const store = useAnalyzer.getState();
    if (!v || store.mode !== 'live') return;
    const lockedCal = this.lock.calibration;
    const st = settings();
    const holes = lockedCal
      ? this.tracker.all.filter((t) => !t.printed).map((t) => ({
          id: t.id,
          p: toImage(lockedCal, t.pIn),
          seq: t.seq,
          confirmed: t.confirmed,
          previous: t.previous,
          merged: t.merged,
        }))
      : [];
    let captureIn: number | undefined;
    if (st.autoCapture && lockedCal && this.tracker.current.length === st.rules.requiredRounds && !this.tracker.all.some((t) => !t.confirmed)) {
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
      lowResolution: this.lastLowRes,
      error: this.lastError,
      captureIn,
      learning: this.learning > 0,
    });
  }

  /** Snapshot for diagnostics (window.__rfaLive.debug() in the browser console). */
  debug() {
    const f = (t: { pIn: { x: number; y: number } }) => [+t.pIn.x.toFixed(2), +t.pIn.y.toFixed(2)];
    return {
      calibration: this.lock.calibration,
      printed: this.tracker.printed.map(f),
      counted: this.tracker.current.map(f),
      checking: this.tracker.all.filter((t) => !t.confirmed).map(f),
      learning: this.learning,
    };
  }
}

export const live = new LiveSession();
if (typeof window !== 'undefined') (window as unknown as { __rfaLive: LiveSession }).__rfaLive = live;
