import type { Calibration } from '../core/types';
import { toTarget } from '../core/calibration';
import type { FrameSource } from './frame';
import { findCandidates, makeWorkView, normalisePatch, PATCH, rawPatch, toSource } from './candidates';
import { TinyCNN } from './nn';
import { HOLENET } from './models/holenet';
import { HOLENET_DARK } from './models/holenet_dark';
import type { Hole, HoleResult, Polarity } from './holes';

/**
 * Photo hole detector (machine learning).
 *
 * 1. findCandidates: every small round spot in the ring (high recall).
 * 2. HoleNet, a small convolutional network trained on rendered range scenes
 *    and real target photos, scores each 32 x 32 colour patch: bullet hole, or
 *    printed line crossing / wrinkle / crease / dirt / board edge.
 * 3. Patches the network is unsure about are scored again mirrored (test-time
 *    augmentation) and the two scores are averaged.
 *
 * Sensitivity moves the score threshold: 0 = strict, 1 = finds faint holes.
 */
let net: TinyCNN | null = null;
let netDark: TinyCNN | null = null;
/** Main HoleNet: on the green face and light areas a hole is dark or tan; glints and dust are not holes. */
export function holeNet(): TinyCNN {
  net ??= new TinyCNN(HOLENET);
  return net;
}
/** HoleNet for spots inside dark print (black aiming disc, ring lines): there a hole can show light. */
export function holeNetDark(): TinyCNN {
  netDark ??= new TinyCNN(HOLENET_DARK);
  return netDark;
}

export interface MlHoleOptions {
  holeDiameterIn: number;
  sensitivity?: number;
  /** override the score threshold (0..1) */
  threshold?: number;
  maxCandidates?: number;
  /** search inside this fraction of the ring radius */
  roi?: number;
}

const KIND: Polarity[] = ['dark', 'light', 'warm'];

/** Crosshair x printed-ring crossings of the standard target (inches). */
const CROSSINGS: [number, number][] = [8, 12, 16].flatMap((r) => [
  [r, 0],
  [-r, 0],
  [0, r],
  [0, -r],
] as [number, number][]);

export function thresholdFor(sensitivity = 0.5) {
  // Real holes score ~1.0; creases, folds and print details stay below ~0.9.
  // 0.5 -> 0.9 (default); 0 -> 0.97 (strict); 1 -> 0.75 (finds faint holes, more checking)
  const s = Math.max(0, Math.min(1, sensitivity));
  return s <= 0.5 ? 0.97 - 0.14 * s : 0.9 - 0.3 * (s - 0.5);
}

export function detectHolesML(src: FrameSource, cal: Calibration, opts: MlHoleOptions): HoleResult & { scored: number; ms: number } {
  const t0 = performance.now();
  const wv = makeWorkView(src, cal, opts.holeDiameterIn);
  const lowResolution = wv.dHsrc < 2.5;
  const cands = findCandidates(wv, { max: opts.maxCandidates ?? 250, roi: opts.roi ?? 1.05 });
  // Tiny holes (far camera): wrinkle ends and fold crossings look the same as holes in a
  // single picture, so ask the network for more certainty. Live view (before/after) is
  // the reliable mode for such cameras.
  const thr = opts.threshold ?? Math.min(0.97, thresholdFor(opts.sensitivity) + (wv.dHsrc < 3 ? 0.05 : 0));
  const model = holeNet();
  const patch = new Float32Array(3 * PATCH * PATCH);
  const flip = new Float32Array(3 * PATCH * PATCH);
  const ppi = (cal.radiusX + cal.radiusY) / cal.diameterIn;
  const holes: Hole[] = [];
  for (const c of cands) {
    rawPatch(wv, c.x, c.y, PATCH, patch);
    normalisePatch(patch, PATCH);
    // inside dark print (black disc, ring line) the hole shows the lighter backing:
    // the second network, which knows such holes, also gets a say
    const dark = surroundLuma(wv, c.x, c.y) < 70;
    let p = dark ? Math.max(model.prob(patch), holeNetDark().prob(patch)) : model.prob(patch);
    if (p > 0.2 && p < 0.9) {
      // mirrored copy: the network should agree with itself
      for (let ch = 0; ch < 3; ch++)
        for (let y = 0; y < PATCH; y++)
          for (let x = 0; x < PATCH; x++) flip[ch * PATCH * PATCH + y * PATCH + x] = patch[ch * PATCH * PATCH + y * PATCH + (PATCH - 1 - x)];
      p = (p + (dark ? Math.max(model.prob(flip), holeNetDark().prob(flip)) : model.prob(flip))) / 2;
    }
    if (p < thr) continue;
    const ps = toSource(wv, c);
    // Where the printed crosshair crosses a printed ring (12 known points) a small dark
    // blob is printed on the target: only a near-certain score counts there.
    const pin = toTarget(cal, ps);
    if (p < 0.97 && CROSSINGS.some(([x, y]) => Math.hypot(pin.x - x, pin.y - y) < 0.6)) continue;
    holes.push({
      p: ps,
      pIn: toTarget(cal, ps),
      diameterIn: wv.dH / wv.scale / ppi,
      confidence: p,
      merged: false,
      polarity: KIND[c.kind] ?? 'dark',
    });
  }
  // one mark per hole: a torn hole (dark core, light fringe, tan backing) can give
  // several accepted candidates around the same hole
  holes.sort((a, b) => b.confidence - a.confidence);
  const sep = 1.1 * wv.dH / wv.scale; // source px
  const kept: Hole[] = [];
  for (const h of holes) if (!kept.some((k) => Math.hypot(k.p.x - h.p.x, k.p.y - h.p.y) < sep)) kept.push(h);
  return { holes: kept, holePx: wv.dHsrc, lowResolution, colourful: wv.colour, scored: cands.length, ms: performance.now() - t0 };
}

/** Mean brightness of the ring 1.5..3 hole diameters around (x, y) in the work view. */
function surroundLuma(wv: ReturnType<typeof makeWorkView>, x: number, y: number) {
  const r0 = 1.5 * wv.dH;
  const r1 = 3 * wv.dH;
  let s = 0;
  let n = 0;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * 2 * Math.PI;
    for (const r of [r0, (r0 + r1) / 2, r1]) {
      const xi = Math.round(x + Math.cos(a) * r);
      const yi = Math.round(y + Math.sin(a) * r);
      if (xi < 0 || yi < 0 || xi >= wv.w || yi >= wv.h) continue;
      s += wv.luma.d[yi * wv.w + xi];
      n++;
    }
  }
  return n ? s / n : 255;
}
