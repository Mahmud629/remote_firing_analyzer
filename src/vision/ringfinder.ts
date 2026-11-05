import type { Calibration } from '../core/types';
import type { FrameSource, GrayView } from './frame';
import { coarseRingCandidates, detectRing } from './ring';
import { type Ellipse, ellipsePoint, fitEllipseRansac, normaliseEllipse } from './conic';
import type { Gray } from './image';

/**
 * Target finder (calibration).
 *
 * Range cameras see a small target on a canvas board, against the sky, with
 * posts, wrinkles and a frame around it. The old finder took "the largest
 * ring-like edge", which on such pictures is often the board or the wrong ring.
 * This finder works in three steps:
 *
 * 1. Candidates
 *    a. Colour: the green target face is segmented (green minus max(red, blue)),
 *       small gaps such as printed lines are closed, holes are filled, and an
 *       ellipse is fitted (RANSAC) to the outline of each round green region.
 *    b. Shape: the gradient Hough search of the old finder (any target design).
 * 2. Refinement on the printed ring LINE, not on edges: rays are cast from the
 *    centre and the darkest valley of the brightness profile near the candidate
 *    is taken on each ray (the middle of the printed line). A rotated ellipse is
 *    fitted to those points with RANSAC, twice, with a narrowing search band.
 * 3. Outermost ring: from the refined ring the finder looks further out for
 *    another concentric printed ring. If there is one, the candidate was an
 *    inner ring and the outer one is used instead.
 * Every candidate is then scored on how much of the line was found, how well the
 * ellipse fits, and whether the inner rings (3/4 and 1/2 of the radius on the
 * standard target) are where they should be. The best one is returned.
 */

export interface FindOptions {
  diameterIn: number;
}

interface Refined {
  e: Ellipse;
  coverage: number;
  rms: number;
}

interface Scored extends Refined {
  inner: number;
  standard: number;
  centre: { x: number; y: number } | null;
  score: number;
  from: string;
}

const RAYS = 240;
export const DEBUG = { on: false, log: (..._a: unknown[]) => {} };

export function findTarget(src: FrameSource, opts: FindOptions): Calibration | null {
  const cands: { e: Ellipse; from: string }[] = [];
  for (const e of colourFaceCandidates(src)) cands.push({ e, from: 'colour' });
  for (const c of coarseRingCandidates(src, { diameterIn: opts.diameterIn }).slice(0, 3)) cands.push({ e: { cx: c.cx, cy: c.cy, a: c.rx, b: c.ry, angle: 0 }, from: 'hough' });
  const old = detectRing(src, { diameterIn: opts.diameterIn });
  if (old) cands.push({ e: { cx: old.center.x, cy: old.center.y, a: old.radiusX, b: old.radiusY, angle: 0 }, from: 'edge' });
  if (!cands.length) return null;

  const scored: Scored[] = [];
  if (DEBUG.on) for (const c of cands) DEBUG.log('cand', c.from, c.e.cx.toFixed(1), c.e.cy.toFixed(1), c.e.a.toFixed(1), c.e.b.toFixed(1));
  for (const c of cands) {
    const s = refineAndScore(src, c.e);
    if (s) scored.push({ ...s, from: c.from });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  if (DEBUG.on) for (const s of scored) DEBUG.log(`${s.from} c=(${s.e.cx.toFixed(1)},${s.e.cy.toFixed(1)}) a=${s.e.a.toFixed(1)} b=${s.e.b.toFixed(1)} cov=${s.coverage.toFixed(2)} rms=${s.rms.toFixed(2)} inner=${s.inner.toFixed(2)} std=${s.standard.toFixed(2)} score=${s.score.toFixed(3)}`);
  let best = scored[0];
  for (const o of scored) {
    if (o === best) continue;
    const rb = (best.e.a + best.e.b) / 2;
    const ro = (o.e.a + o.e.b) / 2;
    const ratio = ro / rb;
    const concentric = Math.hypot(o.e.cx - best.e.cx, o.e.cy - best.e.cy) < 0.1 * ro;
    const standardStep = Math.abs(ratio - 4 / 3) < 0.07 || Math.abs(ratio - 2) < 0.1;
    if (concentric && standardStep && o.coverage >= 0.3 && o.standard >= 0.35 && o.score >= 0.3) best = o;
  }
  if (best.score < 0.25) return null;
  const e = normaliseEllipse(best.e);
  const ratio = e.b / e.a;
  if (ratio < 0.5 || ratio > 2) return null;
  const cal: Calibration = {
    center: { x: e.cx, y: e.cy },
    radiusX: e.a,
    radiusY: e.b,
    angle: Math.abs(e.angle) < 1e-3 ? 0 : e.angle,
    diameterIn: opts.diameterIn,
    method: 'auto',
    confidence: Math.max(0, Math.min(1, best.score)),
  };
  if (best.centre) {
    const H = homographyFromRing(e, best.centre, opts.diameterIn, (H0) => crosshairUp(src, H0, e));
    if (H) cal.H = H;
  }
  return cal;
}

/* ------------------------------------------------------------------------ */
/* Candidates from colour                                                    */
/* ------------------------------------------------------------------------ */

function colourFaceCandidates(src: FrameSource): Ellipse[] {
  if (!src.rgb) return [];
  const maxDim = Math.min(400, Math.max(src.width, src.height));
  const v = src.rgb({ maxDim });
  if (!v) return [];
  const { w, h } = v.r;
  const n = w * h;
  const green = new Float32Array(n);
  let any = 0;
  for (let i = 0; i < n; i++) {
    const gv = v.g.d[i] - Math.max(v.r.d[i], v.b.d[i]);
    green[i] = v.g.d[i] > 20 ? gv : -255;
    if (gv > 10) any++;
  }
  if (any < 0.004 * n) return [];
  const out: Ellipse[] = [];
  for (const thr of [10, 18]) {
    let mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = green[i] > thr ? 1 : 0;
    mask = close(mask, w, h, 2);
    const comps = labelComponents(mask, w, h, Math.max(40, 0.002 * n));
    for (const c of comps.slice(0, 4)) {
      const filled = fillHoles(c.pix, c.bx0, c.by0, c.bw, c.bh);
      const xs: number[] = [];
      const ys: number[] = [];
      let area = 0;
      for (let y = 0; y < c.bh; y++)
        for (let x = 0; x < c.bw; x++) {
          const i = y * c.bw + x;
          if (!filled[i]) continue;
          area++;
          const edge = x === 0 || y === 0 || x === c.bw - 1 || y === c.bh - 1 || !filled[i - 1] || !filled[i + 1] || !filled[i - c.bw] || !filled[i + c.bw];
          if (edge) {
            xs.push(c.bx0 + x + 0.5);
            ys.push(c.by0 + y + 0.5);
          }
        }
      if (xs.length < 30) continue;
      const fit = fitEllipseRansac(xs, ys, { tol: 1.6, iterations: 250, minAspect: 0.5 });
      if (!fit) continue;
      const inlierFrac = fit.inliers.length / xs.length;
      const eArea = Math.PI * fit.a * fit.b;
      const fill = area / eArea;
      if (inlierFrac < 0.45 || fill < 0.75 || fill > 1.2 || fit.a < 12) continue;
      // to source px; the green face ends at the inside of the outer printed line
      const s = v.scale;
      out.push({ cx: v.offset.x + fit.cx / s, cy: v.offset.y + fit.cy / s, a: (fit.a / s) * 1.02, b: (fit.b / s) * 1.02, angle: fit.angle });
    }
  }
  // drop near-duplicates
  const uniq: Ellipse[] = [];
  for (const e of out) if (!uniq.some((u) => Math.hypot(u.cx - e.cx, u.cy - e.cy) < 0.05 * u.a && Math.abs(u.a - e.a) < 0.05 * u.a)) uniq.push(e);
  return uniq;
}

function close(m: Uint8Array, w: number, h: number, r: number) {
  return erode(dilate(m, w, h, r), w, h, r);
}
function dilate(m: Uint8Array, w: number, h: number, r: number) {
  const t = new Uint8Array(w * h);
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w && m[y * w + xx]) v = 1;
      }
      t[y * w + x] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h && t[yy * w + x]) v = 1;
      }
      o[y * w + x] = v;
    }
  return o;
}
function erode(m: Uint8Array, w: number, h: number, r: number) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = m[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1;
  return d;
}

interface Comp {
  area: number;
  bx0: number;
  by0: number;
  bw: number;
  bh: number;
  pix: Uint8Array; // bw*bh mask of this component
}

function labelComponents(m: Uint8Array, w: number, h: number, minArea: number): Comp[] {
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const comps: { area: number; x0: number; y0: number; x1: number; y1: number; id: number }[] = [];
  let id = 0;
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || lab[i]) continue;
    id++;
    let top = 0;
    stack[top++] = i;
    lab[i] = id;
    let area = 0;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    while (top) {
      const j = stack[--top];
      const x = j % w;
      const y = (j / w) | 0;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && m[j - 1] && !lab[j - 1]) (lab[j - 1] = id), (stack[top++] = j - 1);
      if (x < w - 1 && m[j + 1] && !lab[j + 1]) (lab[j + 1] = id), (stack[top++] = j + 1);
      if (y > 0 && m[j - w] && !lab[j - w]) (lab[j - w] = id), (stack[top++] = j - w);
      if (y < h - 1 && m[j + w] && !lab[j + w]) (lab[j + w] = id), (stack[top++] = j + w);
    }
    if (area >= minArea) comps.push({ area, x0, y0, x1, y1, id });
  }
  comps.sort((a, b) => b.area - a.area);
  return comps.map((c) => {
    const bw = c.x1 - c.x0 + 1;
    const bh = c.y1 - c.y0 + 1;
    const pix = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (lab[(c.y0 + y) * w + c.x0 + x] === c.id) pix[y * bw + x] = 1;
    return { area: c.area, bx0: c.x0, by0: c.y0, bw, bh, pix };
  });
}

/** Fill enclosed holes of a component mask (flood the outside from the border). */
function fillHoles(pix: Uint8Array, _x0: number, _y0: number, w: number, h: number) {
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number) => {
    if (!pix[i] && !outside[i]) {
      outside[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x));
  for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1));
  while (top) {
    const j = stack[--top];
    const x = j % w;
    const y = (j / w) | 0;
    if (x > 0) push(j - 1);
    if (x < w - 1) push(j + 1);
    if (y > 0) push(j - w);
    if (y < h - 1) push(j + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/* ------------------------------------------------------------------------ */
/* Refinement on the printed line + scoring                                 */
/* ------------------------------------------------------------------------ */

function refineAndScore(src: FrameSource, e0: Ellipse): Omit<Scored, 'from'> | null {
  // a view large enough to look for a ring up to 2x further out
  const R = Math.max(e0.a, e0.b);
  const pad = 2.3;
  const crop = { x: e0.cx - R * pad, y: e0.cy - R * pad, w: 2 * R * pad, h: 2 * R * pad };
  const view = src.gray({ crop, maxDim: Math.min(1100, Math.max(64, Math.round(2 * R * pad))) });
  const toV = (e: Ellipse): Ellipse => ({ cx: (e.cx - view.offset.x) * view.scale, cy: (e.cy - view.offset.y) * view.scale, a: e.a * view.scale, b: e.b * view.scale, angle: e.angle });
  const fromV = (e: Ellipse): Ellipse => ({ cx: view.offset.x + e.cx / view.scale, cy: view.offset.y + e.cy / view.scale, a: e.a / view.scale, b: e.b / view.scale, angle: e.angle });
  const img = smooth(view.img);

  let cur = refineOnLine(img, toV(e0), 0.12);
  if (!cur) return null;
  const r2 = refineOnLine(img, cur.e, 0.035);
  if (r2) cur = r2;

  // look for an outer concentric printed ring (the candidate may be an inner one)
  for (let guard = 0; guard < 3; guard++) {
    const t = outerRingScale(img, cur.e);
    if (!t) break;
    const grown = { ...cur.e, a: cur.e.a * t, b: cur.e.b * t };
    let o = refineOnLine(img, grown, 0.06);
    if (!o) break;
    const o2 = refineOnLine(img, o.e, 0.03);
    if (o2) o = o2;
    const rr = (cur.e.a + cur.e.b) / 2;
    const concentric = Math.hypot(o.e.cx - cur.e.cx, o.e.cy - cur.e.cy) < 0.12 * rr;
    const ratio = (o.e.a + o.e.b) / 2 / rr;
    const standardStep = Math.abs(ratio - 4 / 3) < 0.07 || Math.abs(ratio - 2) < 0.1;
    // a partly hidden outer ring is still the outer ring when it sits where the standard target puts it
    const enough = o.coverage >= 0.6 || (standardStep && o.coverage >= 0.3 && innerRings(img, o.e).standard >= 0.35);
    if (!concentric || !enough) break;
    cur = o;
  }

  const { inner, standard } = innerRings(img, cur.e);
  // perspective: centres of the concentric ring ellipses drift towards the image
  // of the true centre as the radius shrinks; extrapolate to radius 0
  const centres: { k: number; x: number; y: number }[] = [{ k: 1, x: cur.e.cx, y: cur.e.cy }];
  for (const k of [0.75, 0.5]) {
    const guess = { ...cur.e, a: cur.e.a * k, b: cur.e.b * k };
    // under strong perspective the inner rings are visibly off-centre: wide search, then narrow
    let f = refineOnLine(img, guess, 0.12);
    if (f) f = refineOnLine(img, f.e, 0.04) ?? f;
    if (!f || f.coverage < 0.45) continue;
    const ratio = (f.e.a + f.e.b) / (cur.e.a + cur.e.b);
    if (Math.abs(ratio - k) > 0.08) continue;
    if (f.rms > 0.02 * k * (cur.e.a + cur.e.b) / 2) continue;
    centres.push({ k: ratio, x: f.e.cx, y: f.e.cy });
  }
  let centre: { x: number; y: number } | null = null;
  if (centres.length >= 2) {
    // centre(k) = c + v k^2, least squares
    const n = centres.length;
    let sk = 0, skk = 0, sx = 0, sy = 0, skx = 0, sky = 0;
    for (const c of centres) {
      const q = c.k * c.k;
      sk += q;
      skk += q * q;
      sx += c.x;
      sy += c.y;
      skx += q * c.x;
      sky += q * c.y;
    }
    const det = n * skk - sk * sk;
    if (Math.abs(det) > 1e-9) {
      const cx = (skk * sx - sk * skx) / det;
      const cy = (skk * sy - sk * sky) / det;
      const rr = (cur.e.a + cur.e.b) / 2;
      if (Math.hypot(cx - cur.e.cx, cy - cur.e.cy) < 0.12 * rr) centre = { x: view.offset.x + cx / view.scale, y: view.offset.y + cy / view.scale };
    }
  }
  const rmsRel = cur.rms / ((cur.e.a + cur.e.b) / 2);
  const fitQ = 1 - Math.min(1, rmsRel * 25);
  // coverage counts up to 85% (posts, flags and folds may hide some of the line)
  const score = Math.min(1, cur.coverage / 0.85) * fitQ * (0.6 + 0.25 * inner + 0.15 * standard);
  return { e: fromV(cur.e), coverage: cur.coverage, rms: cur.rms / view.scale, inner, standard, score, centre };
}

function smooth(g: Gray): Gray {
  // light 3x3 binomial blur: keeps thin lines but removes JPEG speckle
  const { w, h, d } = g;
  const t = new Float32Array(w * h);
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = d[x > 0 ? i - 1 : i];
      const r = d[x < w - 1 ? i + 1 : i];
      t[i] = (l + 2 * d[i] + r) / 4;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = t[y > 0 ? i - w : i];
      const dn = t[y < h - 1 ? i + w : i];
      o[i] = (u + 2 * t[i] + dn) / 4;
    }
  return { w, h, d: o };
}

function bilinear(g: Gray, x: number, y: number): number {
  if (x < 0 || y < 0 || x > g.w - 1.001 || y > g.h - 1.001) return NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const i = y0 * g.w + x0;
  return (g.d[i] * (1 - tx) + g.d[i + 1] * tx) * (1 - ty) + (g.d[i + g.w] * (1 - tx) + g.d[i + g.w + 1] * tx) * ty;
}

interface Valley {
  k: number; // scale along the ray (1 = on the ellipse)
  depth: number;
}

/**
 * Brightness profile along the ray at parameter angle phi, from scale k0 to k1,
 * and its dark valleys (printed lines). Depth = how much darker the valley is
 * than the brighter of... the darker of its two shoulders.
 */
function rayValleys(img: Gray, e: Ellipse, phi: number, k0: number, k1: number, lineFrac: number): { valleys: Valley[]; valid: boolean } {
  const p1 = ellipsePoint(e, phi, 1);
  const rLen = Math.hypot(p1.x - e.cx, p1.y - e.cy);
  const step = 0.6 / Math.max(8, rLen); // ~0.6 px
  const n = Math.max(8, Math.ceil((k1 - k0) / step));
  const prof = new Float32Array(n);
  let validCount = 0;
  for (let i = 0; i < n; i++) {
    const k = k0 + ((k1 - k0) * i) / (n - 1);
    const p = ellipsePoint(e, phi, k);
    const v = bilinear(img, p.x, p.y);
    prof[i] = v;
    if (!Number.isNaN(v)) validCount++;
  }
  if (validCount < 0.8 * n) return { valleys: [], valid: false };
  // fill NaN with neighbours
  for (let i = 0; i < n; i++) if (Number.isNaN(prof[i])) prof[i] = i > 0 ? prof[i - 1] : 128;
  const kStep = (k1 - k0) / (n - 1);
  // shoulder window: about 2.5 printed-line widths (line ~2.7% of the radius)
  const W = Math.max(3, Math.round((lineFrac * 2.5) / kStep));
  const valleys: Valley[] = [];
  for (let i = 1; i < n - 1; i++) {
    const v = prof[i];
    if (v > prof[i - 1] || v > prof[i + 1]) continue;
    let lmax = v;
    let rmax = v;
    for (let j = Math.max(0, i - W); j < i; j++) if (prof[j] > lmax) lmax = prof[j];
    for (let j = i + 1; j <= Math.min(n - 1, i + W); j++) if (prof[j] > rmax) rmax = prof[j];
    const depth = Math.min(lmax, rmax) - v;
    if (depth < 9) continue;
    // sub-sample parabola
    const a = prof[i - 1];
    const c = prof[i + 1];
    const den = a - 2 * v + c;
    const off = den > 1e-6 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    valleys.push({ k: k0 + (i + off) * kStep, depth });
  }
  // merge valleys closer than half a window (flat-bottomed lines)
  const merged: Valley[] = [];
  for (const v of valleys) {
    const last = merged[merged.length - 1];
    if (last && v.k - last.k < 0.5 * W * kStep) {
      if (v.depth > last.depth) merged[merged.length - 1] = v;
    } else merged.push(v);
  }
  return { valleys: merged, valid: true };
}

/** Find the printed line near the ellipse (within +/- band) on every ray and refit. */
function refineOnLine(img: Gray, e: Ellipse, band: number): Refined | null {
  const xs: number[] = [];
  const ys: number[] = [];
  let validRays = 0;
  const depths: number[] = [];
  for (let r = 0; r < RAYS; r++) {
    const phi = (r / RAYS) * 2 * Math.PI;
    const { valleys, valid } = rayValleys(img, e, phi, 1 - band, 1 + band, 0.027);
    if (!valid) continue;
    validRays++;
    if (!valleys.length) continue;
    // nearest strong valley to k = 1 (deep valleys preferred when equally close)
    let best: Valley | null = null;
    let bestCost = Infinity;
    for (const v of valleys) {
      const cost = Math.abs(v.k - 1) / band - Math.min(1, v.depth / 60) * 0.35;
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
    }
    if (!best) continue;
    const p = ellipsePoint(e, phi, best.k);
    xs.push(p.x);
    ys.push(p.y);
    depths.push(best.depth);
  }
  if (validRays < RAYS * 0.4 || xs.length < 24) return null;
  const R = (e.a + e.b) / 2;
  const fit = fitEllipseRansac(xs, ys, { tol: Math.max(1.2, 0.012 * R), iterations: 300, minAspect: 0.5, prior: { x: e.cx, y: e.cy, maxDist: 0.25 * R } });
  if (!fit) return null;
  const coverage = fit.inliers.length / RAYS;
  return { e: { cx: fit.cx, cy: fit.cy, a: fit.a, b: fit.b, angle: fit.angle }, coverage, rms: fit.rms };
}

/**
 * Scale (>1) of a further concentric printed ring outside `e`, or null. A ring
 * counts when valleys line up at the same scale on most rays.
 */
function outerRingScale(img: Gray, e: Ellipse): number | null {
  const k0 = 1.1;
  const k1 = 2.15;
  const bins = new Float32Array(Math.ceil((k1 - k0) / 0.02) + 1);
  let valid = 0;
  for (let r = 0; r < RAYS; r += 2) {
    const phi = (r / RAYS) * 2 * Math.PI;
    const res = rayValleys(img, e, phi, k0, k1, 0.027);
    if (!res.valid) continue;
    valid++;
    const seen = new Set<number>();
    for (const v of res.valleys) {
      if (v.depth < 12) continue;
      const b = Math.round((v.k - k0) / 0.02);
      for (const bb of [b - 1, b, b + 1]) if (bb >= 0 && bb < bins.length && !seen.has(bb)) (seen.add(bb), (bins[bb] += 1));
    }
  }
  if (valid < RAYS / 2 * 0.6) return null;
  for (let b = 0; b < bins.length; b++) {
    const frac = bins[b] / valid;
    if (frac < 0.55) continue;
    // take the local maximum of this run of bins
    let bb = b;
    while (bb + 1 < bins.length && bins[bb + 1] >= bins[bb]) bb++;
    return k0 + bb * 0.02;
  }
  return null;
}

/**
 * Evidence for the inner printed rings. Standard target: rings at 3/4 and 1/2
 * of the outer radius. Other designs: any ring that lines up on most rays.
 */
function innerRings(img: Gray, e: Ellipse): { inner: number; standard: number } {
  const k0 = 0.12;
  const k1 = 0.95;
  const step = 0.02;
  const bins = new Float32Array(Math.ceil((k1 - k0) / step) + 1);
  let valid = 0;
  let at75 = 0;
  let at50 = 0;
  for (let r = 0; r < RAYS; r += 2) {
    const phi = (r / RAYS) * 2 * Math.PI;
    const res = rayValleys(img, e, phi, k0, k1, 0.027);
    if (!res.valid) continue;
    valid++;
    let h75 = false;
    let h50 = false;
    const seen = new Set<number>();
    for (const v of res.valleys) {
      if (v.depth < 12) continue;
      if (Math.abs(v.k - 0.75) < 0.04) h75 = true;
      if (Math.abs(v.k - 0.5) < 0.04) h50 = true;
      const b = Math.round((v.k - k0) / step);
      if (!seen.has(b)) (seen.add(b), (bins[b] += 1));
    }
    if (h75) at75++;
    if (h50) at50++;
  }
  if (!valid) return { inner: 0, standard: 0 };
  const standard = (at75 + at50) / (2 * valid);
  let top = 0;
  for (let b = 1; b < bins.length - 1; b++) top = Math.max(top, (bins[b - 1] + bins[b] + bins[b + 1]) / valid);
  return { inner: Math.max(standard, Math.min(1, top) * 0.7), standard };
}

export type { GrayView };

/**
 * Exact perspective map (target inches -> image px) from the outer ring ellipse
 * and the image of the target centre.
 *
 * K maps the unit circle onto the ellipse (affine). A Lorentz boost B maps the
 * unit circle onto itself and moves the origin to q = K^-1(centre), so K*B maps
 * the circle to the ellipse and the centre to the centre: that is the camera's
 * homography up to the target's own rotation, which is fixed so that target
 * "up" appears straight above the centre in the image.
 */
export function homographyFromRing(
  e: Ellipse,
  centre: { x: number; y: number },
  diameterIn: number,
  /** finds the target's own orientation (angles of its printed crosshair, modulo 90 deg) */
  upFinder?: (H0: number[]) => number | null,
): number[] | null {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  // K = T(cx, cy) R(angle) diag(a, b)
  const K = [c * e.a, -s * e.b, e.cx, s * e.a, c * e.b, e.cy, 0, 0, 1];
  // q = K^-1 centre
  const dx = centre.x - e.cx;
  const dy = centre.y - e.cy;
  const qx = (c * dx + s * dy) / e.a;
  const qy = (-s * dx + c * dy) / e.b;
  const q2 = qx * qx + qy * qy;
  if (q2 >= 0.25) return null;
  let B = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (q2 > 1e-12) {
    const g = 1 / Math.sqrt(1 - q2);
    const nq = Math.sqrt(q2);
    const nx = qx / nq;
    const ny = qy / nq;
    B = [1 + (g - 1) * nx * nx, (g - 1) * nx * ny, g * qx, (g - 1) * nx * ny, 1 + (g - 1) * ny * ny, g * qy, g * qx, g * qy, g];
  }
  const H0 = mul3(K, B);
  // rotation: target "up" (0, -1 in y-down unit coords) must map straight above the centre
  let bestT = 0;
  let bestErr = Infinity;
  for (let k = 0; k < 3600; k++) {
    const t = (k / 3600) * 2 * Math.PI;
    const p = apply(H0, Math.cos(t), Math.sin(t));
    if (p.y >= centre.y) continue;
    const err = Math.abs(p.x - centre.x) / (centre.y - p.y);
    if (err < bestErr) {
      bestErr = err;
      bestT = t;
    }
  }
  // printed crosshair lines give the true orientation (camera roll, tilted target);
  // pick the crosshair direction nearest to "image up"
  const alpha = upFinder?.(H0) ?? null;
  if (alpha !== null) {
    let tUp = bestT;
    let bestD = Infinity;
    for (let k = 0; k < 4; k++) {
      const t = alpha + (k * Math.PI) / 2;
      const d = Math.abs(Math.atan2(Math.sin(t - bestT), Math.cos(t - bestT)));
      if (d < bestD) {
        bestD = d;
        tUp = t;
      }
    }
    if (bestD < (25 * Math.PI) / 180) bestT = tUp;
  }
  const phi = Math.atan2(Math.cos(bestT), -Math.sin(bestT));
  const R = [Math.cos(phi), -Math.sin(phi), 0, Math.sin(phi), Math.cos(phi), 0, 0, 0, 1];
  // inches (y up) -> unit (y down)
  const r = diameterIn / 2;
  const U = [1 / r, 0, 0, 0, -1 / r, 0, 0, 0, 1];
  const H = mul3(mul3(H0, R), U);
  const n = H[8];
  return H.map((v) => v / n);
}

function mul3(a: number[], b: number[]) {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
}
function apply(H: number[], x: number, y: number) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/**
 * Orientation of the printed crosshair (thin lines through the centre), as an
 * angle modulo 90 deg in the frame of H0 (unit circle, y down). Brightness is
 * sampled along rays between the printed rings; the four crosshair arms make a
 * dark dip that repeats every 90 deg. Returns null when there is no clear dip.
 */
function crosshairUp(src: FrameSource, H0: number[], e: Ellipse): number | null {
  const R = Math.max(e.a, e.b);
  const crop = { x: e.cx - R * 1.05, y: e.cy - R * 1.05, w: 2.1 * R, h: 2.1 * R };
  const v = src.gray({ crop, maxDim: Math.min(900, Math.max(200, Math.round(2.1 * R))) });
  const img = v.img;
  const BINS = 720; // 0.5 deg
  const prof = new Float32Array(BINS);
  const radii: number[] = [];
  for (const [r0, r1] of [[0.3, 0.45], [0.55, 0.7], [0.8, 0.93]]) for (let r = r0; r <= r1; r += 0.01) radii.push(r);
  for (let b = 0; b < BINS; b++) {
    const t = (b / BINS) * 2 * Math.PI;
    let sum = 0;
    let n = 0;
    for (const r of radii) {
      const p = apply(H0, r * Math.cos(t), r * Math.sin(t));
      const x = (p.x - v.offset.x) * v.scale;
      const y = (p.y - v.offset.y) * v.scale;
      const val = bilinear(img, x, y);
      if (!Number.isNaN(val)) {
        sum += val;
        n++;
      }
    }
    prof[b] = n ? sum / n : NaN;
  }
  // fold modulo 90 deg
  const Q = BINS / 4;
  const fold = new Float32Array(Q);
  for (let b = 0; b < Q; b++) {
    let s = 0;
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const val = prof[b + k * Q];
      if (!Number.isNaN(val)) {
        s += val;
        n++;
      }
    }
    fold[b] = n >= 3 ? s / n : NaN;
  }
  const vals = Array.from(fold).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (vals.length < Q * 0.8) return null;
  const med = vals[vals.length >> 1];
  const mad = vals.map((x) => Math.abs(x - med)).sort((a, b) => a - b)[vals.length >> 1] || 0.5;
  let bi = -1;
  let bv = Infinity;
  for (let b = 0; b < Q; b++) if (fold[b] < bv) (bv = fold[b]), (bi = b);
  const depth = med - bv;
  if (depth < Math.max(2.5, 6 * mad)) return null;
  // the dip must be narrow (a line), not a broad shading
  let wide = 0;
  for (let d = -12; d <= 12; d++) if (Math.abs(d) > 4 && med - fold[(bi + d + Q) % Q] > 0.5 * depth) wide++;
  if (wide > 4) return null;
  // sub-bin parabola
  const a = fold[(bi - 1 + Q) % Q];
  const c = fold[(bi + 1) % Q];
  const den = a - 2 * bv + c;
  const off = den > 1e-6 ? (0.5 * (a - c)) / den : 0;
  return (((bi + off) / BINS) * 2 * Math.PI) % (Math.PI / 2);
}
