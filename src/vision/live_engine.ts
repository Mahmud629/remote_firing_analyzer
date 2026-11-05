import type { Calibration, Vec2 } from '../core/types';
import { toTarget } from '../core/calibration';
import type { FrameSource } from './frame';
import { type Gray, gaussBlur } from './image';
import { type Ellipse, ellipseRadius } from './conic';
import { PATCH } from './candidates';

/** Hole size in the live working image (px). ChangeNet is trained at this scale. */
export const LIVE_HOLE_PX = 5;

/**
 * Live hole counting by CHANGE DETECTION.
 *
 * A bullet hole is something that was not there before. Instead of looking for
 * hole-like spots in every frame (which finds ring crossings, wrinkles and
 * board edges and counts them without a shot being fired), the engine:
 *
 *  1. Learns the target before firing: the first frames after the ring locks
 *     are aligned and averaged (background) and the frame-to-frame variation of
 *     every pixel is measured (so flickering edges are known to be noisy).
 *  2. Aligns every new frame to the background (affine Lucas-Kanade, coarse to
 *     fine), which cancels camera shake and the target swaying in the wind, and
 *     corrects brightness changes.
 *  3. Compares at hole scale (band-pass), as a z-score against the learned
 *     per-pixel noise. A strong, small, hole-sized change is a candidate.
 *  4. Checks each candidate with ChangeNet, a small neural network that sees the
 *     before and after patches and was trained to tell a new hole from
 *     misalignment, light changes, shadows and compression noise.
 *  5. Counts a hole only when it persists over several frames. Something that
 *     disappears again (a bird, an insect, a passing shadow) is removed.
 *  6. When too much of the target changes at once (camera bumped, sudden light,
 *     heavy wind) the frame is ignored; if it lasts, the target is learned again.
 *     Nothing can be counted from such frames.
 */

export interface LiveSettings {
  holeDiameterIn: number;
  /** 0 strict .. 1 sensitive */
  sensitivity: number;
}

export interface LiveTrackOut {
  id: string;
  /** current frame, source px */
  p: Vec2;
  pIn: Vec2;
  seq?: number;
  confirmed: boolean;
  previous: boolean;
  confidence: number;
}

export interface LiveStepResult {
  phase: 'learning' | 'ready' | 'unstable';
  learnProgress: number;
  holes: LiveTrackOut[];
  /** fraction of the target that changed in this frame */
  changed: number;
  /** alignment shift of this frame against the background (source px) */
  shift: Vec2;
  /** hole size in source px */
  holePx: number;
  lowResolution: boolean;
  /** set once when the target had to be learned again */
  relearned?: boolean;
  /** holes confirmed in this frame (ids) */
  newlyCounted: string[];
  /** holes withdrawn in this frame (were transient) */
  withdrawn: string[];
}

export type ChangeVerifier = (before: Float32Array, after: Float32Array, size: number) => number;

interface Track {
  id: string;
  x: number; // background (work) px
  y: number;
  hits: number; // bit history over stable frames, newest = bit 0
  pSum: number;
  pN: number;
  first: number;
  last: number;
  confirmed: boolean;
  previous: boolean;
  seq?: number;
  confirmedAt?: number;
  /** background patch from before the hole (to detect transients) */
  before?: Float32Array;
  revert: number;
  pIn: Vec2;
}

const LEARN_FRAMES = 12;
const UNSTABLE_RELEARN = 25;

export class LiveEngine {
  static onCandidate: ((p: Vec2, z: number, prob: number, sizeRatio: number) => void) | null = null;
  static debug: ((d: { z: Float32Array; cur: Float32Array; M: Float32Array; w: number; h: number; warp: number[]; g: number; sigma0: number; V: Float32Array }) => void) | null = null;
  private cal: Calibration | null = null;
  private crop = { x: 0, y: 0, w: 1, h: 1 };
  private maxDim = 600;
  private scale = 1;
  private w = 0;
  private h = 0;
  private dH = LIVE_HOLE_PX;
  private dHsrc = 1;
  private ring: Ellipse = { cx: 0, cy: 0, a: 1, b: 1, angle: 0 };
  private roi: Uint8Array = new Uint8Array(0);
  private roiCount = 1;
  private learnSum: Float32Array | null = null;
  private learnBP: Float32Array[] = [];
  private learnN = 0;
  private M: Float32Array | null = null; // background luma
  private BPm: Float32Array | null = null; // band-pass of background
  private V: Float32Array | null = null; // per-pixel variance of band-pass
  /** (misregistration tolerance x local gradient of the background band-pass)^2 */
  private G2: Float32Array | null = null;
  private sigma0 = 2;
  private frameNo = 0;
  private stableNo = 0;
  private unstableStreak = 0;
  private tracks: Track[] = [];
  private nextId = 1;
  private seq = 0;
  private warp = [0, 0, 0, 0, 0, 0];
  /** alignment template (background pyramid + Lucas-Kanade samples), refreshed every few frames */
  private tpl: { levels: Level[] } | null = null;
  private tplAge = 0;
  /** Training data collection (ml/livesim.ts --dump): every candidate pair, nothing is confirmed. */
  collect: ((before: Float32Array, after: Float32Array, x: number, y: number, z: number) => void) | null = null;
  constructor(
    private settings: LiveSettings,
    private verify: ChangeVerifier | null = null,
  ) {}

  /** Background px -> source px (for tools and tests). */
  workToSource(x: number, y: number): Vec2 {
    return { x: this.offsetV.x + x / this.scale, y: this.offsetV.y + y / this.scale };
  }

  setSettings(s: LiveSettings) {
    this.settings = s;
  }
  setVerifier(v: ChangeVerifier | null) {
    this.verify = v;
  }

  get calibration() {
    return this.cal;
  }

  /** New ring lock: set up geometry and learn the target again. Counted holes are kept. */
  reset(cal: Calibration) {
    const kept = this.tracks.filter((t) => t.confirmed);
    this.cal = cal;
    const R = Math.max(cal.radiusX, cal.radiusY);
    const pad = 1.12;
    const ppi = (cal.radiusX + cal.radiusY) / cal.diameterIn;
    this.dHsrc = this.settings.holeDiameterIn * ppi;
    const want = Math.min(3, LIVE_HOLE_PX / Math.max(0.5, this.dHsrc));
    this.crop = { x: cal.center.x - R * pad, y: cal.center.y - R * pad, w: 2 * R * pad, h: 2 * R * pad };
    this.maxDim = Math.max(96, Math.min(760, Math.round(2 * R * pad * want)));
    this.w = 0;
    this.M = this.BPm = this.V = this.learnSum = null;
    this.learnBP = [];
    this.learnN = 0;
    this.unstableStreak = 0;
    this.warp = [0, 0, 0, 0, 0, 0];
    this.tpl = null;
    // keep counted holes; their position is re-derived from target inches
    this.tracks = kept;
    this.pendingRemap = true;
  }
  private pendingRemap = false;

  /** Keep the holes on the target but count only new ones. */
  nextGroup() {
    this.tracks = this.tracks.filter((t) => t.confirmed);
    for (const t of this.tracks) t.previous = true;
    this.seq = 0;
  }

  /** Operator removed a mark. */
  remove(id: string) {
    this.tracks = this.tracks.filter((t) => t.id !== id);
    this.renumber();
  }

  private renumber() {
    let n = 0;
    for (const t of this.tracks.filter((t) => t.confirmed && !t.previous).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) t.seq = ++n;
    this.seq = n;
  }

  get counted() {
    return this.tracks.filter((t) => t.confirmed && !t.previous);
  }

  /** Process one frame. `cal` must be the locked calibration passed to reset(). */
  step(src: FrameSource): LiveStepResult {
    const cal = this.cal;
    if (!cal) throw new Error('LiveEngine: reset() first');
    this.frameNo++;
    const view = src.gray({ crop: this.crop, maxDim: this.maxDim });
    const img = view.img;
    if (!this.w) this.setupGeometry(img, view.scale, view.offset, src.width, src.height);
    const base: Omit<LiveStepResult, 'phase' | 'learnProgress'> = {
      holes: [],
      changed: 0,
      shift: { x: 0, y: 0 },
      holePx: this.dHsrc,
      lowResolution: this.dHsrc < 1.6,
      newlyCounted: [],
      withdrawn: [],
    };

    // ---- learning -------------------------------------------------------
    if (!this.M) {
      if (!this.learnSum) {
        this.learnSum = new Float32Array(img.d);
        this.learnBP = [this.bandpass(img.d)];
        this.learnN = 1;
        this.M = null;
        return { ...base, phase: 'learning', learnProgress: 1 / LEARN_FRAMES, holes: this.output(view) };
      }
      const ref: Gray = { w: this.w, h: this.h, d: this.learnSum.map((v) => v / this.learnN) };
      const A = this.align(ref, img, [0, 0, 0, 0, 0, 0]);
      const aligned = this.warpImage(img, A);
      // pixels that fell outside the frame after alignment take the running mean (never NaN)
      for (let i = 0; i < aligned.length; i++) {
        if (Number.isNaN(aligned[i])) aligned[i] = this.learnSum[i] / this.learnN;
        this.learnSum[i] += aligned[i];
      }
      this.learnBP.push(this.bandpass(aligned));
      this.learnN++;
      if (this.learnN < LEARN_FRAMES) return { ...base, phase: 'learning', learnProgress: this.learnN / LEARN_FRAMES, holes: this.output(view) };
      this.finishLearning();
      return { ...base, phase: 'ready', learnProgress: 1, holes: this.output(view) };
    }

    // ---- align, compare ------------------------------------------------------
    const M: Gray = { w: this.w, h: this.h, d: this.M };
    this.warp = this.align(M, img, this.warp, true);
    const cur = this.warpImage(img, this.warp);
    const BPc = this.bandpass(cur);
    const BPm = this.BPm!;
    const V = this.V!;
    const G2 = this.G2!;
    // brightness/contrast change: BPc ~ g * BPm
    let num = 0;
    let den = 0;
    for (let i = 0; i < BPm.length; i += 3) {
      if (!this.roi[i] || Number.isNaN(BPc[i])) continue;
      num += BPm[i] * BPc[i];
      den += BPm[i] * BPm[i];
    }
    const g = den > 0 ? Math.max(0.5, Math.min(2, num / den)) : 1;
    const n = this.w * this.h;
    const z = new Float32Array(n);
    let changed = 0;
    const s02 = this.sigma0 * this.sigma0;
    for (let i = 0; i < n; i++) {
      if (!this.roi[i] || Number.isNaN(BPc[i])) continue;
      const d = BPc[i] - g * BPm[i];
      const v = d / Math.sqrt(V[i] + s02 + G2[i]);
      z[i] = v;
      if (v > 5 || v < -5) changed++;
    }
    const changedFrac = changed / this.roiCount;
    if (LiveEngine.debug) LiveEngine.debug({ z, cur, M: this.M, w: this.w, h: this.h, warp: this.warp.slice(), g, sigma0: this.sigma0, V });
    base.changed = changedFrac;
    base.shift = { x: this.warp[4] / this.scale, y: this.warp[5] / this.scale };

    const unstable = changedFrac > 0.012;
    if (unstable) {
      this.unstableStreak++;
      if (this.unstableStreak >= UNSTABLE_RELEARN) {
        // the scene changed for good (camera moved, light changed): learn again, keep counted holes
        const cal0 = this.cal!;
        this.reset(cal0);
        return { ...base, phase: 'learning', learnProgress: 0, relearned: true, holes: this.output(view) };
      }
      // tracks age but nothing new can be confirmed from a disturbed frame
      return { ...base, phase: 'unstable', learnProgress: 1, holes: this.output(view) };
    }
    this.unstableStreak = 0;
    this.stableNo++;

    // ---- candidates -----------------------------------------------------------
    const sens = Math.max(0, Math.min(1, this.settings.sensitivity));
    const zThr = 7 - 4 * sens; // 7 strict .. 3 sensitive (5 default); ChangeNet checks every candidate
    const rad = Math.max(2, Math.round(0.7 * this.dH));
    const area = Math.PI * (this.dH / 2) ** 2;
    const cands: { x: number; y: number; z: number; p: number }[] = [];
    const before = new Float32Array(PATCH * PATCH);
    const after = new Float32Array(PATCH * PATCH);
    for (let y = rad; y < this.h - rad; y++)
      for (let x = rad; x < this.w - rad; x++) {
        const i = y * this.w + x;
        if (!this.roi[i]) continue;
        const v = z[i];
        const a = Math.abs(v);
        if (a < zThr) continue;
        let isMax = true;
        for (let dy = -rad; dy <= rad && isMax; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if ((dx || dy) && Math.abs(z[i + dy * this.w + dx]) > a) {
              isMax = false;
              break;
            }
          }
        if (!isMax) continue;
        // a hole is a small change: the changed area around it must be hole-sized
        const R2 = Math.round(2.5 * this.dH);
        let big = 0;
        for (let dy = -R2; dy <= R2; dy++)
          for (let dx = -R2; dx <= R2; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= this.h || xx >= this.w) continue;
            const zz = z[yy * this.w + xx];
            if (Math.sign(zz) === Math.sign(v) && Math.abs(zz) >= zThr / 2) big++;
          }
        if (big > 5 * area) continue;
        let p = 1;
        if (this.verify || this.collect) {
          samplePatch(this.M, this.w, this.h, x, y, before);
          samplePatch(cur, this.w, this.h, x, y, after);
          if (this.collect) {
            this.collect(before, after, x, y, v);
            continue;
          }
          p = this.verify!(before, after, PATCH);
        }
        if (LiveEngine.onCandidate) LiveEngine.onCandidate(this.workToSource(x, y), v, p, big / area);
        cands.push({ x, y, z: v, p });
      }

    const withdrawn: string[] = [];
    // transients (checked first, so the tracking below knows about them): a counted change that goes back to how it was before
    for (const t of this.tracks) {
      if (!t.confirmed || t.previous || !t.before || t.confirmedAt === undefined || this.stableNo - t.confirmedAt > 40) continue;
      samplePatch(cur, this.w, this.h, t.x, t.y, after);
      if (patchSame(t.before, after, PATCH, this.dH, this.sigma0 * 3)) t.revert++;
      else t.revert = 0;
      if (t.revert >= 6) {
        withdrawn.push(t.id);
        this.restore(t);
        t.confirmed = false;
        t.hits = 0;
        t.pSum = t.pN = 0;
      }
    }
    // ---- tracking ---------------------------------------------------------------
    // one candidate per hole: a torn hole shows a dark core AND a bright fringe
    cands.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const sep = 1.6 * this.dH;
    const single = cands.filter((c, i) => !cands.slice(0, i).some((o) => Math.hypot(o.x - c.x, o.y - c.y) < sep));
    const pThr = 0.75 - 0.4 * sens; // 0.55 at default
    const match = 0.9 * this.dH;
    const used = new Set<Track>();
    for (const c of single) {
      if (c.p < pThr) continue;
      // right after a hole is counted, a change beside it is the same hole (torn fringe).
      // Later the counted hole is part of the background, so a change there is a new hole
      // (e.g. a second bullet through the same spot).
      // If the spot is going back to how it looked before (an insect or bird leaving), it is not new either.
      if (this.tracks.some((t) => this.blocksNewHole(t, c.x, c.y))) continue;
      let best: Track | null = null;
      let bd = match;
      for (const t of this.tracks) {
        if (used.has(t)) continue;
        const d = Math.hypot(t.x - c.x, t.y - c.y);
        if (d < bd) (bd = d), (best = t);
      }
      if (best && best.confirmed && best.confirmedAt !== undefined && this.stableNo - best.confirmedAt > 4) best = null; // counted long ago: this is new
      if (best) {
        if (best.confirmed) {
          used.add(best);
          continue; // just counted (being burnt into the background)
        }
        best.hits |= 1;
        best.pSum += c.p;
        best.pN++;
        best.last = this.stableNo;
        best.x += (c.x - best.x) * 0.3;
        best.y += (c.y - best.y) * 0.3;
        used.add(best);
      } else {
        const t: Track = { id: `L${this.nextId++}`, x: c.x, y: c.y, hits: 1, pSum: c.p, pN: 1, first: this.stableNo, last: this.stableNo, confirmed: false, previous: false, revert: 0, pIn: { x: 0, y: 0 } };
        this.tracks.push(t);
        used.add(t);
      }
    }
    const result: LiveStepResult = { ...base, phase: 'ready', learnProgress: 1, holes: [], withdrawn };
    for (const t of this.tracks) {
      if (t.confirmed) continue;
      if (popcount(t.hits & 0b1111) >= 3 && t.pSum / t.pN >= pThr) {
        if (this.tracks.some((o) => o !== t && this.blocksNewHole(o, t.x, t.y))) {
          t.hits = 0; // the change belongs to a counted mark that is reverting
          continue;
        }
        t.confirmed = true;
        t.seq = ++this.seq;
        t.confirmedAt = this.stableNo;
        t.before = new Float32Array(PATCH * PATCH);
        samplePatch(this.M, this.w, this.h, t.x, t.y, t.before);
        this.burnIn(cur, t.x, t.y);
        result.newlyCounted.push(t.id);
      }
    }
    if (result.withdrawn.length) {
      this.tracks = this.tracks.filter((t) => t.confirmed || t.hits);
      this.renumber();
    }
    // age pending tracks
    for (const t of this.tracks) if (!t.confirmed) t.hits = (t.hits << 1) & 0xff;
    this.tracks = this.tracks.filter((t) => t.confirmed || (t.hits & 0b11110) !== 0 || this.stableNo - t.first < 1);

    // slow background update where nothing changed (follows light drift)
    const alpha = 0.03;
    const Md = this.M;
    for (let i = 0; i < n; i++) {
      if (!this.roi[i] || Number.isNaN(cur[i])) continue;
      if (Math.abs(z[i]) < 3) {
        Md[i] += alpha * (cur[i] - Md[i]);
        const d = BPc[i] - g * BPm[i];
        V[i] += 0.02 * (d * d - V[i]);
      }
    }
    if (this.stableNo % 4 === 0) this.setBackgroundBP();
    result.holes = this.output(view);
    return result;
  }

  /** A counted mark near (x, y) that is just counted, or is going back to how it was before. */
  private blocksNewHole(t: Track, x: number, y: number) {
    if (!t.confirmed || Math.hypot(t.x - x, t.y - y) >= 1.3 * this.dH) return false;
    const recent = t.confirmedAt !== undefined && this.stableNo - t.confirmedAt <= 4;
    return recent || t.revert > 0;
  }

  /* ------------------------------------------------------------------ */

  private setupGeometry(img: Gray, scale: number, offset: Vec2, srcW: number, srcH: number) {
    const cal = this.cal!;
    this.w = img.w;
    this.h = img.h;
    this.scale = scale;
    this.offsetV = offset;
    this.dH = this.dHsrc * scale;
    this.ring = { cx: (cal.center.x - offset.x) * scale, cy: (cal.center.y - offset.y) * scale, a: cal.radiusX * scale, b: cal.radiusY * scale, angle: cal.angle ?? 0 };
    this.roi = new Uint8Array(img.w * img.h);
    // keep away from the edges of the video frame: sway moves picture content across
    // them, and the part of the target outside the frame is unknown
    const margin = 3 + 2.5 * this.dHsrc;
    let c = 0;
    for (let y = 0; y < img.h; y++) {
      const sy = offset.y + y / scale;
      if (sy < margin || sy > srcH - 1 - margin) continue;
      for (let x = 0; x < img.w; x++) {
        const sx = offset.x + x / scale;
        if (sx < margin || sx > srcW - 1 - margin) continue;
        if (ellipseRadius(this.ring, x, y) <= 1.05) {
          this.roi[y * img.w + x] = 1;
          c++;
        }
      }
    }
    this.roiCount = Math.max(1, c);
    if (this.pendingRemap) {
      for (const t of this.tracks) {
        const pr = this.fromTarget(t.pIn);
        t.x = pr.x;
        t.y = pr.y;
        t.before = undefined;
      }
      this.pendingRemap = false;
    }
  }
  private offsetV: Vec2 = { x: 0, y: 0 };

  private fromTarget(pIn: Vec2): Vec2 {
    const cal = this.cal!;
    const r = cal.diameterIn / 2;
    const a = cal.angle ?? 0;
    const X = pIn.x;
    const Y = -pIn.y;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const u = ((X * c + Y * s) / r) * cal.radiusX;
    const v = ((-X * s + Y * c) / r) * cal.radiusY;
    const sx = cal.center.x + u * c - v * s;
    const sy = cal.center.y + u * s + v * c;
    return { x: (sx - this.offsetV.x) * this.scale, y: (sy - this.offsetV.y) * this.scale };
  }

  private finishLearning() {
    const n = this.w * this.h;
    const M = new Float32Array(n);
    for (let i = 0; i < n; i++) M[i] = this.learnSum![i] / this.learnN;
    // NaN (outside the frame after alignment) -> neighbour value
    for (let i = 0; i < n; i++) if (Number.isNaN(M[i])) M[i] = i > 0 ? M[i - 1] : 128;
    this.M = M;
    this.setBackgroundBP();
    const V = new Float32Array(n);
    for (const bp of this.learnBP) for (let i = 0; i < n; i++) if (!Number.isNaN(bp[i])) V[i] += (bp[i] - this.BPm![i]) ** 2;
    for (let i = 0; i < n; i++) V[i] /= this.learnBP.length;
    // robust global noise floor
    const s: number[] = [];
    for (let i = 0; i < n; i += 5) if (this.roi[i]) s.push(Math.sqrt(V[i]));
    s.sort((a, b) => a - b);
    this.sigma0 = Math.max(1.2, s.length ? s[s.length >> 1] * 1.5 : 2);
    this.V = V;
    this.learnBP = [];
    this.learnSum = null;
    // previously counted holes are part of the new background now; re-anchor their 'before' patch
    for (const t of this.tracks) t.before = undefined;
  }

  /** Background band-pass and its edge term (sub-pixel sway leaves residuals on printed lines). */
  private setBackgroundBP() {
    const BP = this.bandpass(this.M!);
    this.BPm = BP;
    const w = this.w;
    const h = this.h;
    const G2 = new Float32Array(w * h);
    // tolerance: 0.3 source px of residual misalignment (JPEG, sway, rolling shutter)
    const k = Math.max(0.35, 0.3 * this.scale);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = (BP[i + 1] - BP[i - 1]) / 2;
        const gy = (BP[i + w] - BP[i - w]) / 2;
        G2[i] = k * k * (gx * gx + gy * gy);
      }
    // spread to neighbours (a residual is as wide as the edge profile)
    const g: Gray = { w, h, d: G2 };
    this.G2 = gaussBlur(g, 1).d;
  }

  private bandpass(d: Float32Array): Float32Array {
    // NaNs (outside after warping) are replaced for filtering and restored afterwards
    const n = d.length;
    const tmp = new Float32Array(n);
    let last = 128;
    for (let i = 0; i < n; i++) {
      const v = d[i];
      if (Number.isNaN(v)) tmp[i] = last;
      else tmp[i] = last = v;
    }
    const g: Gray = { w: this.w, h: this.h, d: tmp };
    const a = gaussBlur(g, Math.max(0.6, 0.3 * this.dH)).d;
    const b = gaussBlur(g, Math.max(1.5, 1.0 * this.dH)).d;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = Number.isNaN(d[i]) ? NaN : a[i] - b[i];
    return out;
  }

  /** Burn a confirmed hole into the background so it never triggers again. */
  private burnIn(cur: Float32Array, x: number, y: number) {
    const r = Math.ceil(2 * this.dH);
    const M = this.M!;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.round(x) + dx;
        const yy = Math.round(y) + dy;
        if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
        const i = yy * this.w + xx;
        if (!Number.isNaN(cur[i])) M[i] = cur[i];
      }
    this.setBackgroundBP();
  }

  private restore(t: Track) {
    if (!t.before) return;
    const M = this.M!;
    const half = (PATCH - 1) / 2;
    const r = Math.ceil(2 * this.dH);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.round(t.x) + dx;
        const yy = Math.round(t.y) + dy;
        if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
        const px = Math.round(xx - t.x + half);
        const py = Math.round(yy - t.y + half);
        if (px < 0 || py < 0 || px >= PATCH || py >= PATCH) continue;
        M[yy * this.w + xx] = t.before[py * PATCH + px];
      }
    this.setBackgroundBP();
  }

  private output(view: { scale: number; offset: Vec2 }): LiveTrackOut[] {
    const cal = this.cal!;
    const [p1, p2, p3, p4, p5, p6] = this.warp;
    const cx = this.ring.cx;
    const cy = this.ring.cy;
    const out: LiveTrackOut[] = [];
    for (const t of this.tracks) {
      // background px -> current frame px (the warp maps background coords into the frame)
      const u = t.x - cx;
      const v = t.y - cy;
      const fx = cx + (1 + p1) * u + p2 * v + p5;
      const fy = cy + p3 * u + (1 + p4) * v + p6;
      const ps = { x: view.offset.x + fx / view.scale, y: view.offset.y + fy / view.scale };
      // target inches use the background position (stable against sway)
      const pb = { x: view.offset.x + t.x / view.scale, y: view.offset.y + t.y / view.scale };
      t.pIn = toTarget(cal, pb);
      if (!t.confirmed && popcount(t.hits) < 2) continue; // do not flash single-frame blips
      out.push({ id: t.id, p: ps, pIn: t.pIn, seq: t.seq, confirmed: t.confirmed, previous: t.previous, confidence: t.pN ? t.pSum / t.pN : 1 });
    }
    return out;
  }

  /* ---------------- alignment: inverse-compositional affine Lucas-Kanade ---------------- */

  /**
   * Warp parameters p map background coords (u, v relative to the ring centre)
   * into the frame: x = cx + (1+p1) u + p2 v + p5, y = cy + p3 u + (1+p4) v + p6.
   */
  private buildTemplate(T: Gray): { levels: Level[] } {
    const nLev = this.w > 300 ? 3 : 2;
    const levels: Level[] = [];
    let g = gaussBlur(T, 1);
    for (let l = 0; l < nLev; l++) {
      if (l > 0) g = half(g);
      const s = 1 / (1 << l);
      levels.push(prepareLevel(g, this.ring.cx * s, this.ring.cy * s, Math.max(this.ring.a, this.ring.b) * s * 1.05, l === 0 ? 12000 : 8000));
    }
    return { levels };
  }

  private align(T: Gray, I: Gray, init: number[], cached = false): number[] {
    let p = init.slice();
    let tpl: { levels: Level[] };
    if (cached) {
      if (!this.tpl || this.tplAge++ >= 10) {
        this.tpl = this.buildTemplate(T);
        this.tplAge = 0;
      }
      tpl = this.tpl;
    } else tpl = this.buildTemplate(T);
    const levels = tpl.levels.length;
    const pyrI: Gray[] = [gaussBlur(I, 1)];
    for (let l = 1; l < levels; l++) pyrI.push(half(pyrI[l - 1]));
    for (let l = levels - 1; l >= 0; l--) {
      const s = 1 / (1 << l);
      // parameters in level coordinates: translation scales, linear part does not
      const q = [p[0], p[1], p[2], p[3], p[4] * s, p[5] * s];
      const res = lkIterate(tpl.levels[l], pyrI[l], q, l === 0 ? 5 : 8);
      p = [res[0], res[1], res[2], res[3], res[4] / s, res[5] / s];
    }
    // sanity: reject absurd warps
    if (p.some((v) => !Number.isFinite(v))) return init.slice();
    if (Math.abs(p[0]) > 0.08 || Math.abs(p[3]) > 0.08 || Math.abs(p[1]) > 0.08 || Math.abs(p[2]) > 0.08 || Math.hypot(p[4], p[5]) > 0.15 * this.w) return init.slice();
    return p;
  }

  /** Current frame resampled into background coordinates (NaN outside). */
  private warpImage(I: Gray, p: number[]): Float32Array {
    const out = new Float32Array(this.w * this.h);
    const cx = this.ring.cx;
    const cy = this.ring.cy;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const u = x - cx;
        const v = y - cy;
        const fx = cx + (1 + p[0]) * u + p[1] * v + p[4];
        const fy = cy + p[2] * u + (1 + p[3]) * v + p[5];
        out[y * this.w + x] = bil(I, fx, fy);
      }
    return out;
  }
}

interface Level {
  cx: number;
  cy: number;
  n: number;
  pts: Float32Array; // x, y
  sd: Float32Array; // 6 per point
  tv: Float32Array;
  Hinv: Float64Array | null;
}

/** Template side of inverse-compositional Lucas-Kanade (computed once per template). */
function prepareLevel(T: Gray, cx: number, cy: number, R: number, cap: number): Level {
  const { w, h, d } = T;
  const g2: number[] = [];
  for (let y = 2; y < h - 2; y += 2)
    for (let x = 2; x < w - 2; x += 2) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const i = y * w + x;
      const gx = (d[i + 1] - d[i - 1]) / 2;
      const gy = (d[i + w] - d[i - w]) / 2;
      g2.push(gx * gx + gy * gy);
    }
  g2.sort((a, b) => a - b);
  // strongest gradients, at most `cap` points
  const keep = Math.min(cap, Math.floor(g2.length * 0.45));
  const gThr = Math.max(4, g2[Math.max(0, g2.length - keep)] ?? 4);
  const pts: number[] = [];
  const sd: number[] = [];
  const tv: number[] = [];
  for (let y = 2; y < h - 2; y += 2)
    for (let x = 2; x < w - 2; x += 2) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const i = y * w + x;
      const gx = (d[i + 1] - d[i - 1]) / 2;
      const gy = (d[i + w] - d[i - w]) / 2;
      if (gx * gx + gy * gy < gThr) continue;
      const u = x - cx;
      const v = y - cy;
      pts.push(x, y);
      sd.push(gx * u, gx * v, gy * u, gy * v, gx, gy);
      tv.push(d[i]);
    }
  const n = tv.length;
  const H = new Float64Array(36);
  for (let k = 0; k < n; k++) {
    const o = k * 6;
    for (let a = 0; a < 6; a++) for (let b = a; b < 6; b++) H[a * 6 + b] += sd[o + a] * sd[o + b];
  }
  for (let a = 0; a < 6; a++) for (let b = 0; b < a; b++) H[a * 6 + b] = H[b * 6 + a];
  return { cx, cy, n, pts: Float32Array.from(pts), sd: Float32Array.from(sd), tv: Float32Array.from(tv), Hinv: n >= 30 ? invert6(H) : null };
}

/** Image side: Gauss-Newton iterations with the inverse-compositional update. */
function lkIterate(L: Level, I: Gray, p: number[], iters: number): number[] {
  if (!L.Hinv) return p;
  const { cx, cy, n, pts, sd, tv, Hinv } = L;
  let q = p.slice();
  const bvec = new Float64Array(6);
  for (let it = 0; it < iters; it++) {
    bvec.fill(0);
    for (let k = 0; k < n; k++) {
      const x = pts[2 * k] - cx;
      const y = pts[2 * k + 1] - cy;
      const fx = cx + (1 + q[0]) * x + q[1] * y + q[4];
      const fy = cy + q[2] * x + (1 + q[3]) * y + q[5];
      const iv = bil(I, fx, fy);
      if (Number.isNaN(iv)) continue;
      let e = iv - tv[k];
      if (e > 25) e = 25;
      else if (e < -25) e = -25; // robust: new holes, insects, glare
      const o = k * 6;
      bvec[0] += sd[o] * e;
      bvec[1] += sd[o + 1] * e;
      bvec[2] += sd[o + 2] * e;
      bvec[3] += sd[o + 3] * e;
      bvec[4] += sd[o + 4] * e;
      bvec[5] += sd[o + 5] * e;
    }
    const dp = [0, 0, 0, 0, 0, 0];
    for (let a = 0; a < 6; a++) {
      let s = 0;
      for (let b = 0; b < 6; b++) s += Hinv[a * 6 + b] * bvec[b];
      dp[a] = s;
    }
    // W(p) <- W(p) o W(dp)^-1
    const a11 = 1 + dp[0], a12 = dp[1], a21 = dp[2], a22 = 1 + dp[3];
    const det = a11 * a22 - a12 * a21;
    if (Math.abs(det) < 1e-9) break;
    const i11 = a22 / det, i12 = -a12 / det, i21 = -a21 / det, i22 = a11 / det;
    const it1 = -(i11 * dp[4] + i12 * dp[5]);
    const it2 = -(i21 * dp[4] + i22 * dp[5]);
    const P11 = 1 + q[0], P12 = q[1], P21 = q[2], P22 = 1 + q[3];
    q = [P11 * i11 + P12 * i21 - 1, P11 * i12 + P12 * i22, P21 * i11 + P22 * i21, P21 * i12 + P22 * i22 - 1, P11 * it1 + P12 * it2 + q[4], P21 * it1 + P22 * it2 + q[5]];
    if (Math.hypot(dp[4], dp[5]) < 0.01 && Math.abs(dp[0]) + Math.abs(dp[1]) + Math.abs(dp[2]) + Math.abs(dp[3]) < 1e-4) break;
  }
  return q;
}

function half(g: Gray): Gray {
  const w = g.w >> 1;
  const h = g.h >> 1;
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * g.w + 2 * x;
      d[y * w + x] = (g.d[i] + g.d[i + 1] + g.d[i + g.w] + g.d[i + g.w + 1]) / 4;
    }
  return { w, h, d };
}

function bil(g: Gray, x: number, y: number): number {
  if (x < 0 || y < 0 || x > g.w - 1.001 || y > g.h - 1.001) return NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const i = y0 * g.w + x0;
  return (g.d[i] * (1 - tx) + g.d[i + 1] * tx) * (1 - ty) + (g.d[i + g.w] * (1 - tx) + g.d[i + g.w + 1] * tx) * ty;
}

/** size x size luma patch centred at (x, y); NaN-safe (edge values). */
export function samplePatch(d: Float32Array, w: number, h: number, x: number, y: number, out: Float32Array) {
  const size = Math.round(Math.sqrt(out.length));
  const half = (size - 1) / 2;
  const g: Gray = { w, h, d };
  let last = 128;
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const xx = Math.max(0, Math.min(w - 1.001, x - half + i));
      const yy = Math.max(0, Math.min(h - 1.001, y - half + j));
      const v = bil(g, xx, yy);
      out[j * size + i] = Number.isNaN(v) ? last : (last = v);
    }
}

/** True when the hole core looks like it did before (within tol grey levels). */
function patchSame(a: Float32Array, b: Float32Array, size: number, dH: number, tol: number) {
  const c = (size - 1) / 2;
  const r = Math.max(1.5, 0.5 * dH);
  // compare the core after removing the mean offset of the surroundings
  let oa = 0, ob = 0, no = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > 2 * r && d < 3.5 * r) {
        oa += a[y * size + x];
        ob += b[y * size + x];
        no++;
      }
    }
  const off = no ? (ob - oa) / no : 0;
  let diff = 0, nc = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (Math.hypot(x - c, y - c) <= r) {
        diff += Math.abs(b[y * size + x] - off - a[y * size + x]);
        nc++;
      }
  return nc > 0 && diff / nc < tol;
}

function popcount(v: number) {
  let c = 0;
  for (; v; v &= v - 1) c++;
  return c;
}

function invert6(H: Float64Array): Float64Array | null {
  const n = 6;
  const M = new Float64Array(n * 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i * 2 * n + j] = H[i * n + j];
    M[i * 2 * n + n + i] = 1;
  }
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r * 2 * n + c]) > Math.abs(M[piv * 2 * n + c])) piv = r;
    if (Math.abs(M[piv * 2 * n + c]) < 1e-12) return null;
    if (piv !== c) for (let k = 0; k < 2 * n; k++) [M[c * 2 * n + k], M[piv * 2 * n + k]] = [M[piv * 2 * n + k], M[c * 2 * n + k]];
    const d = M[c * 2 * n + c];
    for (let k = 0; k < 2 * n; k++) M[c * 2 * n + k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r * 2 * n + c];
      if (!f) continue;
      for (let k = 0; k < 2 * n; k++) M[r * 2 * n + k] -= f * M[c * 2 * n + k];
    }
  }
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = M[i * 2 * n + n + j];
  return out;
}
