import type { Calibration, Vec2 } from '../core/types';
import { sameRing } from '../core/calibration';

/* -------------------------------------------------------------------------- */
/* Ring lock: turns noisy per-frame ring detections into one fixed calibration */
/* -------------------------------------------------------------------------- */

export type LockPhase = 'searching' | 'steadying' | 'locked';

export interface LockState {
  phase: LockPhase;
  progress: number; // 0..1 towards lock
  calibration: Calibration | null; // locked calibration, or the latest detection
  event?: 'locked' | 'moved';
}

export class RingLock {
  private history: Calibration[] = [];
  private locked: Calibration | null = null;
  private drift = 0;
  constructor(
    private lockFrames = 6,
    private tol = 0.015,
    private driftTol = 0.03,
    private driftFrames = 4,
  ) {}

  get calibration() {
    return this.locked;
  }

  /** Latest ring candidate while steadying (null when locked or nothing seen). */
  get latest(): Calibration | null {
    return this.locked ? null : (this.history[this.history.length - 1] ?? null);
  }

  get progress(): number {
    return this.locked ? 1 : Math.min(1, this.history.length / this.lockFrames);
  }

  reset() {
    this.history = [];
    this.locked = null;
    this.drift = 0;
  }

  /** Force a calibration (e.g. after the operator adjusts the ring by hand). */
  set(cal: Calibration) {
    this.locked = cal;
    this.history = [];
    this.drift = 0;
  }

  update(det: Calibration | null): LockState {
    if (this.locked) {
      if (det && !sameRing(det, this.locked, this.driftTol)) {
        if (++this.drift >= this.driftFrames) {
          // the camera or the target moved: steady again on the new position
          this.locked = null;
          this.history = [det];
          this.drift = 0;
          return { phase: 'steadying', progress: 1 / this.lockFrames, calibration: det, event: 'moved' };
        }
      } else if (det) {
        // keep the lock fixed: a stable calibration keeps detection conditions constant
        this.drift = 0;
      }
      return { phase: 'locked', progress: 1, calibration: this.locked };
    }
    if (!det) {
      this.history = [];
      return { phase: 'searching', progress: 0, calibration: null };
    }
    const last = this.history[this.history.length - 1];
    if (last && sameRing(det, last, this.tol)) this.history.push(det);
    else this.history = [det];
    if (this.history.length >= this.lockFrames) {
      this.locked = medianCal(this.history.slice(-this.lockFrames));
      this.history = [];
      return { phase: 'locked', progress: 1, calibration: this.locked, event: 'locked' };
    }
    return { phase: 'steadying', progress: this.history.length / this.lockFrames, calibration: det };
  }
}

function medianCal(list: Calibration[]): Calibration {
  const med = (f: (c: Calibration) => number) => {
    const v = list.map(f).sort((x, y) => x - y);
    return v[v.length >> 1];
  };
  return {
    ...list[0],
    center: { x: med((c) => c.center.x), y: med((c) => c.center.y) },
    radiusX: med((c) => c.radiusX),
    radiusY: med((c) => c.radiusY),
    confidence: med((c) => c.confidence),
  };
}

/* -------------------------------------------------------------------------- */
/* Hole tracker: a hole counts once it is seen in most of the recent frames   */
/* -------------------------------------------------------------------------- */

export interface TrackedHole {
  id: string;
  pIn: Vec2;
  confidence: number;
  merged: boolean;
  confirmed: boolean;
  /** Holes that were already on the target when the current group started. */
  previous: boolean;
  /** Learned from the clean target before firing (numerals, line artefacts). */
  printed?: boolean;
  seq?: number;
  seen: number; // bitmask of recent frames
  lastFrame: number;
  firstFrame: number;
}

export interface Detection {
  pIn: Vec2;
  confidence: number;
  merged: boolean;
}

const popcount = (v: number) => {
  let c = 0;
  for (; v; v &= v - 1) c++;
  return c;
};

export class HoleTracker {
  private tracks: TrackedHole[] = [];
  private frame = 0;
  private seq = 0;
  private nextId = 1;
  constructor(
    private matchIn = 0.35,
    private confirmHits = 4,
    private window = 6,
    /** Detections this close to a printed mark are its jitter, never a new hole. */
    private printedZoneIn = 0.6,
  ) {}

  reset() {
    this.tracks = [];
    this.seq = 0;
  }

  /** Keep the holes already on the target but stop counting them in the group. */
  startNewGroup() {
    this.tracks = this.tracks.filter((t) => t.confirmed || t.printed);
    for (const t of this.tracks) t.previous = true;
    this.seq = 0;
  }

  get all() {
    return this.tracks;
  }

  get current() {
    return this.tracks.filter((t) => t.confirmed && !t.previous).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  }

  /** Holes from earlier groups (excludes printed marks). */
  get previous() {
    return this.tracks.filter((t) => t.previous && !t.printed);
  }

  get printed() {
    return this.tracks.filter((t) => t.printed);
  }

  /**
   * Everything seen on the clean target before firing (printed numerals, ring
   * crossings, old patched holes) is stored as "previous" so it never counts.
   */
  learnBaseline(dets: Detection[]) {
    for (const d of dets) {
      const near = this.tracks.find((t) => Math.hypot(t.pIn.x - d.pIn.x, t.pIn.y - d.pIn.y) <= this.matchIn * 1.4);
      if (near) {
        near.previous = true;
        near.printed = true;
        near.confirmed = true;
        near.seq = undefined;
        continue;
      }
      this.tracks.push({ id: `h${this.nextId++}`, pIn: d.pIn, confidence: d.confidence, merged: d.merged, confirmed: true, previous: true, printed: true, seen: 1, lastFrame: this.frame, firstFrame: this.frame });
    }
  }

  /** A confirmed mark turned out to be part of the printed target. */
  markPrinted(id: string) {
    const t = this.tracks.find((x) => x.id === id);
    if (!t) return;
    t.printed = true;
    t.previous = true;
    t.confirmed = true;
    t.seq = undefined;
    this.renumber();
  }

  private renumber() {
    let n = 0;
    for (const t of this.current) t.seq = ++n;
    this.seq = n;
  }

  /** Drop a hole the operator marked as false. */
  remove(id: string) {
    this.tracks = this.tracks.filter((t) => t.id !== id);
    this.renumber();
  }

  update(input: Detection[]): TrackedHole[] {
    const f = ++this.frame;
    const printed = this.tracks.filter((t) => t.printed);
    const dets = input.filter((d) => !printed.some((t) => Math.hypot(t.pIn.x - d.pIn.x, t.pIn.y - d.pIn.y) < this.printedZoneIn));
    const mask = (1 << this.window) - 1;
    const pairs: { t: number; d: number; dist: number }[] = [];
    this.tracks.forEach((t, ti) =>
      dets.forEach((d, di) => {
        const dist = Math.hypot(t.pIn.x - d.pIn.x, t.pIn.y - d.pIn.y);
        if (dist <= this.matchIn) pairs.push({ t: ti, d: di, dist });
      }),
    );
    pairs.sort((a, b) => a.dist - b.dist);
    const usedT = new Set<number>();
    const usedD = new Set<number>();
    for (const p of pairs) {
      if (usedT.has(p.t) || usedD.has(p.d)) continue;
      usedT.add(p.t);
      usedD.add(p.d);
      const t = this.tracks[p.t];
      const d = dets[p.d];
      const a = t.confirmed ? 0.1 : 0.35;
      t.pIn = { x: t.pIn.x + (d.pIn.x - t.pIn.x) * a, y: t.pIn.y + (d.pIn.y - t.pIn.y) * a };
      t.confidence = Math.max(t.confidence * 0.9, d.confidence);
      t.merged = d.merged;
      t.seen = ((t.seen << 1) | 1) & mask;
      t.lastFrame = f;
    }
    this.tracks.forEach((t, i) => {
      if (!usedT.has(i)) t.seen = (t.seen << 1) & mask;
    });
    dets.forEach((d, i) => {
      if (usedD.has(i)) return;
      this.tracks.push({
        id: `h${this.nextId++}`,
        pIn: d.pIn,
        confidence: d.confidence,
        merged: d.merged,
        confirmed: false,
        previous: false,
        seen: 1,
        lastFrame: f,
        firstFrame: f,
      });
    });
    const confirmedNow: TrackedHole[] = [];
    for (const t of this.tracks) {
      if (!t.confirmed && popcount(t.seen) >= this.confirmHits) {
        t.confirmed = true;
        t.seq = ++this.seq;
        confirmedNow.push(t);
      }
    }
    // forget flicker; keep confirmed holes unless they vanish for a long time (e.g. a shadow)
    this.tracks = this.tracks.filter((t) => t.previous || (t.confirmed ? f - t.lastFrame < 90 : t.seen !== 0 || f - t.firstFrame < 2));
    return confirmedNow;
  }
}
