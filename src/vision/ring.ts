import type { Calibration } from '../core/types';
import { boxBlur, quantile, sobel, thinEdges, type Edges, makeGray } from './image';
import type { FrameSource } from './frame';
import { fitEllipse, type EllipseFit } from './ellipse';

export interface RingOptions {
  diameterIn: number;
  /** Long side of the coarse search image. */
  searchSize?: number;
  /** Long side of the refinement crop. */
  refineSize?: number;
  /** Fraction of the ring's circumference that must be visible (0..1). */
  minCoverage?: number;
}

const SECTORS = 72;

/**
 * Finds the outer ring of the target and returns it as a calibration.
 *
 * Stage 1 (coarse, ~480 px): gradient Hough transform. Every edge pixel votes
 *   for possible centres along its gradient direction; concentric rings all
 *   vote for the same centre so the target centre stands out clearly. Around
 *   the best centres a radial histogram lists every ring, and the largest ring
 *   that is visible around enough of its circumference is the outer ring.
 * Stage 2 (refine, ~1000 px crop): edge points close to that ring are split by
 *   polarity (inner and outer edge of the printed line), each set gets a robust
 *   ellipse fit, and the two are averaged so the calibration sits on the centre
 *   of the line.
 */
export function detectRing(src: FrameSource, opts: RingOptions): Calibration | null {
  const searchSize = opts.searchSize ?? 480;
  const refineSize = opts.refineSize ?? 1000;
  const minCoverage = opts.minCoverage ?? 0.55;

  // ---- Stage 1: coarse Hough search ---------------------------------------
  const view = src.gray({ maxDim: Math.min(searchSize, Math.max(src.width, src.height)) });
  const img = boxBlur(boxBlur(view.img, 1), 1);
  const { w, h } = img;
  const grad = sobel(img);
  const thr = Math.max(12, quantile(grad.mag, 0.9));
  const edges = thinEdges(grad, w, h, thr, 25000);
  if (edges.n < 50) return null;

  const minDim = Math.min(w, h);
  const rMin = Math.round(0.1 * minDim);
  const rMax = Math.round(0.56 * Math.max(w, h));
  const acc = new Float32Array(w * h);
  for (let k = 0; k < edges.n; k++) {
    const x = edges.x[k];
    const y = edges.y[k];
    const ux = edges.ux[k];
    const uy = edges.uy[k];
    for (let s = -1; s <= 1; s += 2) {
      const sx = s * ux;
      const sy = s * uy;
      for (let r = rMin; r <= rMax; r++) {
        const cx = (x + sx * r + 0.5) | 0;
        const cy = (y + sy * r + 0.5) | 0;
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) break;
        acc[cy * w + cx] += 1;
      }
    }
  }
  const sm = boxBlur(boxBlur({ w, h, d: acc }, 2), 1).d;
  const peaks = topPeaks(sm, w, h, 8, Math.max(4, Math.round(0.03 * minDim)));
  if (!peaks.length) return null;
  // A tilted ring (ellipse) splits the vote peak into lobes around the true
  // centre, so the weighted mean of the strongest cluster is a candidate too.
  const near = peaks.filter((p) => p.v >= peaks[0].v * 0.6 && Math.hypot(p.x - peaks[0].x, p.y - peaks[0].y) < 0.15 * minDim);
  if (near.length > 1) {
    const sw = near.reduce((a, p) => a + p.v, 0);
    peaks.unshift({ x: near.reduce((a, p) => a + p.x * p.v, 0) / sw, y: near.reduce((a, p) => a + p.y * p.v, 0) / sw, v: peaks[0].v });
  }

  type Cand = { cx: number; cy: number; rx: number; ry: number; coverage: number; votes: number };
  const cands: Cand[] = [];
  for (const p of peaks.slice(0, 6)) {
    if (p.v < peaks[0].v * 0.35) break;
    const rings = ringsAround(edges, p.x, p.y, rMin, rMax);
    const valid = rings.filter((r) => r.coverage >= minCoverage && r.support >= 0.45);
    if (!valid.length) continue;
    const outer = valid.reduce((a, b) => (b.rx * b.ry > a.rx * a.ry ? b : a));
    const quality = outer.coverage * Math.min(1, outer.support) + 0.05 * Math.min(4, valid.length);
    cands.push({ cx: p.x, cy: p.y, rx: outer.rx, ry: outer.ry, coverage: outer.coverage, votes: quality });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.votes - a.votes);
  const best = cands[0];

  // to source px
  const s1 = view.scale;
  let cxS = view.offset.x + best.cx / s1;
  let cyS = view.offset.y + best.cy / s1;
  let rxS = best.rx / s1;
  let ryS = best.ry / s1;

  // ---- Stage 2: refine on a higher-resolution crop -------------------------
  const halfX = rxS * 1.12;
  const halfY = ryS * 1.12;
  const v2 = src.gray({ crop: { x: cxS - halfX, y: cyS - halfY, w: 2 * halfX, h: 2 * halfY }, maxDim: Math.min(refineSize, Math.round(2 * Math.max(halfX, halfY))) });
  const img2 = boxBlur(v2.img, 1);
  const g2 = sobel(img2);
  const toCrop = (x: number, y: number) => ({ x: (x - v2.offset.x) * v2.scale, y: (y - v2.offset.y) * v2.scale });
  const c0 = toCrop(cxS, cyS);
  const r0x = rxS * v2.scale;
  const r0y = ryS * v2.scale;
  const inBand = (x: number, y: number) => {
    const ex = (x - c0.x) / r0x;
    const ey = (y - c0.y) / r0y;
    const rn = ex * ex + ey * ey;
    return rn > 0.87 && rn < 1.15; // ~ +/-7% radius
  };
  const e2 = thinEdges(g2, img2.w, img2.h, Math.max(8, quantile(g2.mag, 0.8)), 40000, inBand);

  let final: { cx: number; cy: number; rx: number; ry: number; coverage: number; rms: number } | null = null;
  // two passes: wide band around the coarse ellipse, then a tight band around the first fit
  for (const bandFrac of [0.06, 0.025]) {
    const c = toCrop(cxS, cyS);
    const rx = rxS * v2.scale;
    const ry = ryS * v2.scale;
    const band = Math.max(2.5, bandFrac * (rx + ry) / 2);
    const sets = [0, 1].map(() => ({ xs: [] as number[], ys: [] as number[], sectors: new Uint8Array(SECTORS) }));
    for (let k = 0; k < e2.n; k++) {
      const dx = e2.x[k] - c.x;
      const dy = e2.y[k] - c.y;
      const ex = dx / rx;
      const ey = dy / ry;
      const rn = Math.sqrt(ex * ex + ey * ey);
      if (Math.abs(rn - 1) * ((rx + ry) / 2) > band) continue;
      const nx = dx / (rx * rx);
      const ny = dy / (ry * ry);
      const nl = Math.sqrt(nx * nx + ny * ny) || 1;
      const dot = (e2.ux[k] * nx + e2.uy[k] * ny) / nl;
      if (Math.abs(dot) < 0.88) continue;
      const set = sets[dot > 0 ? 0 : 1];
      set.xs.push(e2.x[k]);
      set.ys.push(e2.y[k]);
      set.sectors[sectorOf(dx, dy)] = 1;
    }
    const fits: { fit: EllipseFit; coverage: number }[] = [];
    for (const st of sets) {
      const coverage = st.sectors.reduce((a, b) => a + b, 0) / SECTORS;
      if (coverage < minCoverage * 0.8 || st.xs.length < 30) continue;
      const fit = fitEllipse(st.xs, st.ys);
      if (fit && fit.rx > 0 && fit.ry > 0) fits.push({ fit, coverage });
    }
    if (fits.length === 2 && Math.abs(meanR(fits[0].fit) - meanR(fits[1].fit)) < 0.05 * ((rx + ry) / 2)) {
      // inner and outer edge of the printed line: use the centre of the line
      const [a, b] = fits;
      final = {
        cx: (a.fit.cx + b.fit.cx) / 2,
        cy: (a.fit.cy + b.fit.cy) / 2,
        rx: (a.fit.rx + b.fit.rx) / 2,
        ry: (a.fit.ry + b.fit.ry) / 2,
        coverage: Math.max(a.coverage, b.coverage),
        rms: (a.fit.rms + b.fit.rms) / 2,
      };
    } else if (fits.length) {
      const f = fits.reduce((a, b) => (b.coverage > a.coverage ? b : a));
      final = { ...f.fit, coverage: f.coverage };
    } else break;
    cxS = v2.offset.x + final.cx / v2.scale;
    cyS = v2.offset.y + final.cy / v2.scale;
    rxS = final.rx / v2.scale;
    ryS = final.ry / v2.scale;
  }
  if (!final) {
    const c = toCrop(cxS, cyS);
    final = { cx: c.x, cy: c.y, rx: rxS * v2.scale, ry: ryS * v2.scale, coverage: best.coverage, rms: 3 };
  }

  const ratio = final.rx / final.ry;
  if (ratio < 0.7 || ratio > 1.43) return null; // too oblique to trust

  const rmsRel = final.rms / ((final.rx + final.ry) / 2);
  const confidence = Math.max(0, Math.min(1, final.coverage * (1 - Math.min(1, rmsRel * 40))));
  return {
    center: { x: v2.offset.x + final.cx / v2.scale, y: v2.offset.y + final.cy / v2.scale },
    radiusX: final.rx / v2.scale,
    radiusY: final.ry / v2.scale,
    diameterIn: opts.diameterIn,
    method: 'auto',
    confidence,
  };
}

const meanR = (f: EllipseFit) => (f.rx + f.ry) / 2;

function sectorOf(dx: number, dy: number) {
  const a = Math.atan2(dy, dx) + Math.PI;
  return Math.min(SECTORS - 1, Math.floor((a / (2 * Math.PI)) * SECTORS));
}

/** Aspect ratios (ry / rx) tried in the coarse search: 0.75 .. 1.32 in 3% steps. */
const ASPECTS = Array.from({ length: 20 }, (_, i) => 0.75 * Math.pow(1.03, i));

interface RingCand {
  rx: number;
  ry: number;
  coverage: number; // fraction of 5-degree sectors with an edge on the ring
  support: number; // aligned edge pixels per pixel of circumference
}

/**
 * Rings centred on (cx, cy). For each aspect ratio q every edge gets an
 * "elliptical radius" sqrt(dx^2 + (dy/q)^2); edges on an ellipse with that
 * aspect pile up in one histogram bin. Edges must also face along the ellipse
 * normal, which rejects straight lines and clutter.
 */
function ringsAround(edges: Edges, cx: number, cy: number, rMin: number, rMax: number): RingCand[] {
  const nb = Math.ceil(rMax * 1.1) + 3;
  const n = edges.n;
  const dx = new Float32Array(n);
  const dy = new Float32Array(n);
  const sec = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    dx[k] = edges.x[k] - cx;
    dy[k] = edges.y[k] - cy;
    sec[k] = sectorOf(dx[k], dy[k]);
  }
  type Peak = { q: number; r: number; score: number };
  const peaks: Peak[] = [];
  const hist = new Float32Array(nb);
  const rho = new Float32Array(n);
  for (const q of ASPECTS) {
    hist.fill(0);
    const q2 = q * q;
    for (let k = 0; k < n; k++) {
      rho[k] = -1;
      const dq = dy[k] / q;
      const r = Math.sqrt(dx[k] * dx[k] + dq * dq);
      if (r < rMin * 0.8 || r >= nb - 2) continue;
      // ellipse normal ~ (dx, dy / q^2)
      const nx = dx[k];
      const ny = dy[k] / q2;
      const nl = Math.sqrt(nx * nx + ny * ny) || 1;
      if (Math.abs((edges.ux[k] * nx + edges.uy[k] * ny) / nl) < 0.9) continue;
      rho[k] = r;
      hist[Math.round(r)] += 1;
    }
    for (let r = Math.max(2, rMin); r < nb - 2; r++) {
      const v = hist[r - 1] + hist[r] + hist[r + 1];
      const perim = Math.PI * r * (1 + q);
      if (v < 0.2 * perim) continue;
      const left = hist[r - 2] + hist[r - 1] + hist[r];
      const right = hist[r] + hist[r + 1] + hist[r + 2];
      if (v < left || v < right) continue;
      peaks.push({ q, r, score: v / perim });
    }
  }
  peaks.sort((a, b) => b.score - a.score);
  const out: RingCand[] = [];
  for (const p of peaks.slice(0, 40)) {
    const rx = p.r;
    const ry = p.r * p.q;
    if (out.some((o) => Math.abs(o.rx - rx) < Math.max(3, 0.03 * rx) && Math.abs(o.ry - ry) < Math.max(3, 0.03 * ry))) continue;
    const mark = new Uint8Array(SECTORS);
    let hits = 0;
    for (let k = 0; k < n; k++) {
      const ex = dx[k] / rx;
      const ey = dy[k] / ry;
      const r = Math.sqrt(ex * ex + ey * ey) * rx;
      if (Math.abs(r - rx) > 1.8) continue;
      const nx = dx[k] / (rx * rx);
      const ny = dy[k] / (ry * ry);
      const nl = Math.sqrt(nx * nx + ny * ny) || 1;
      if (Math.abs((edges.ux[k] * nx + edges.uy[k] * ny) / nl) < 0.9) continue;
      mark[sec[k]] = 1;
      hits++;
    }
    const coverage = mark.reduce((a, b) => a + b, 0) / SECTORS;
    const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    if (coverage > 0.3) out.push({ rx, ry, coverage, support: hits / perim });
  }
  return out;
}

function topPeaks(a: Float32Array, w: number, h: number, n: number, sep: number) {
  let max = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > max) max = a[i];
  if (max <= 0) return [];
  const cand: { x: number; y: number; v: number }[] = [];
  const floor = max * 0.25;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = a[i];
      if (v < floor) continue;
      if (v >= a[i - 1] && v >= a[i + 1] && v >= a[i - w] && v >= a[i + w]) cand.push({ x, y, v });
    }
  cand.sort((p, q) => q.v - p.v);
  const out: typeof cand = [];
  for (const c of cand) {
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > sep)) out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

// re-export for tests
export { makeGray };
