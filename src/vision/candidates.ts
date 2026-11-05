import type { Calibration, Vec2 } from '../core/types';
import type { FrameSource } from './frame';
import { type Gray, gaussBlur } from './image';
import { type Ellipse, ellipseRadius } from './conic';

/**
 * Stage 1 of hole detection: high-recall candidates.
 *
 * The picture around the ring is resampled so that one bullet hole is about
 * HOLE_PX wide (the scale the neural network was trained at). Candidates are
 * local maxima of the determinant-of-Hessian blob response: it is strong for
 * small round spots and almost zero along printed lines and edges, so ring
 * lines, crosshairs and the board edge do not flood the list. Line crossings,
 * wrinkle ends and dirt still come through; the network sorts them out.
 */
export const HOLE_PX = 6;
export const PATCH = 32;

export interface WorkView {
  w: number;
  h: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  luma: Gray;
  /** work px per source px; source = offset + p / scale */
  scale: number;
  offset: Vec2;
  /** expected hole diameter in work px */
  dH: number;
  /** outer ring in work px */
  ring: Ellipse;
  colour: boolean;
  /** hole diameter in source px (before resampling) */
  dHsrc: number;
}

export interface Candidate {
  x: number;
  y: number;
  /** blob strength (robust z-score of the Hessian response) */
  z: number;
  /** 0 dark, 1 light, 2 warm (tan) */
  kind: number;
}

export function calEllipse(cal: Calibration): Ellipse {
  return { cx: cal.center.x, cy: cal.center.y, a: cal.radiusX, b: cal.radiusY, angle: cal.angle ?? 0 };
}

export function makeWorkView(src: FrameSource, cal: Calibration, holeDiameterIn: number, opts: { pad?: number; maxDim?: number; holePx?: number } = {}): WorkView {
  const pad = opts.pad ?? 1.14;
  const holePx = opts.holePx ?? HOLE_PX;
  const R = Math.max(cal.radiusX, cal.radiusY);
  const ppi = (cal.radiusX + cal.radiusY) / cal.diameterIn;
  const dHsrc = holeDiameterIn * ppi;
  const want = Math.min(3, holePx / Math.max(0.5, dHsrc)); // never enlarge more than 3x
  const crop = { x: cal.center.x - R * pad, y: cal.center.y - R * pad, w: 2 * R * pad, h: 2 * R * pad };
  const maxDim = Math.max(64, Math.min(opts.maxDim ?? 1100, Math.round(2 * R * pad * want)));
  let r: Float32Array, g: Float32Array, b: Float32Array, luma: Gray, scale: number, offset: Vec2, colour = false;
  const rgb = src.rgb?.({ crop, maxDim }) ?? null;
  if (rgb) {
    r = rgb.r.d;
    g = rgb.g.d;
    b = rgb.b.d;
    scale = rgb.scale;
    offset = rgb.offset;
    const n = r.length;
    const l = new Float32Array(n);
    let spread = 0;
    for (let i = 0; i < n; i++) {
      l[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
      if (i % 7 === 0) spread += Math.abs(r[i] - g[i]) + Math.abs(g[i] - b[i]);
    }
    luma = { w: rgb.r.w, h: rgb.r.h, d: l };
    colour = spread / (n / 7) > 6;
  } else {
    const v = src.gray({ crop, maxDim });
    luma = v.img;
    r = g = b = v.img.d;
    scale = v.scale;
    offset = v.offset;
  }
  const ring: Ellipse = { cx: (cal.center.x - offset.x) * scale, cy: (cal.center.y - offset.y) * scale, a: cal.radiusX * scale, b: cal.radiusY * scale, angle: cal.angle ?? 0 };
  return { w: luma.w, h: luma.h, r, g, b, luma, scale, offset, dH: dHsrc * scale, ring, colour, dHsrc };
}

export function toSource(wv: WorkView, p: Vec2): Vec2 {
  return { x: wv.offset.x + p.x / wv.scale, y: wv.offset.y + p.y / wv.scale };
}
export function toWork(wv: WorkView, p: Vec2): Vec2 {
  return { x: (p.x - wv.offset.x) * wv.scale, y: (p.y - wv.offset.y) * wv.scale };
}

/** Determinant-of-Hessian response (scale-normalised) and the trace sign. */
function hessian(img: Gray, sigma: number) {
  const L = gaussBlur(img, sigma);
  const { w, h, d } = L;
  const det = new Float32Array(w * h);
  const tr = new Float32Array(w * h);
  const s4 = sigma ** 4;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const c = d[i];
      const xx = d[i - 1] - 2 * c + d[i + 1];
      const yy = d[i - w] - 2 * c + d[i + w];
      const xy = (d[i - w - 1] + d[i + w + 1] - d[i - w + 1] - d[i + w - 1]) / 4;
      det[i] = (xx * yy - xy * xy) * s4;
      tr[i] = (xx + yy) * sigma * sigma;
    }
  return { det, tr };
}

export function findCandidates(wv: WorkView, opts: { max?: number; zMin?: number; roi?: number } = {}): Candidate[] {
  const max = opts.max ?? 400;
  const zMin = opts.zMin ?? 3;
  const roi = opts.roi ?? 1.06;
  const { w, h } = wv;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ellipseRadius(wv.ring, x, y) <= roi) mask[y * w + x] = 1;
  const maps: { img: Gray; kind: number[]; sign: number[] }[] = [{ img: wv.luma, kind: [0, 1], sign: [1, -1] }];
  if (wv.colour) {
    const n = w * h;
    const warm = new Float32Array(n);
    for (let i = 0; i < n; i++) warm[i] = wv.r[i] - wv.g[i];
    maps.push({ img: { w, h, d: warm }, kind: [2], sign: [-1] });
  }
  const all: Candidate[] = [];
  for (const sig of [0.3 * wv.dH, 0.5 * wv.dH]) {
    const s = Math.max(0.7, sig);
    for (const m of maps) {
      const { det, tr } = hessian(m.img, s);
      // robust scale of the positive determinant inside the ring
      const sample: number[] = [];
      for (let i = 0; i < det.length; i += 3) if (mask[i] && det[i] > 0) sample.push(det[i]);
      sample.sort((a, b) => a - b);
      const med = sample.length ? sample[sample.length >> 1] : 1;
      const q90 = sample.length ? sample[Math.floor(sample.length * 0.9)] : 1;
      const scale = Math.max(1e-3, med, (q90 - med) / 4);
      const rad = Math.max(2, Math.round(0.5 * wv.dH));
      for (let y = rad; y < h - rad; y++)
        for (let x = rad; x < w - rad; x++) {
          const i = y * w + x;
          if (!mask[i]) continue;
          const v = det[i];
          if (v <= 0) continue;
          const z = v / scale;
          if (z < zMin) continue;
          // polarity from the trace: positive trace = dark centre (luma) ; for warm we want bright centre
          const t = tr[i];
          let kind = -1;
          for (let k = 0; k < m.kind.length; k++) if (Math.sign(t) === m.sign[k]) kind = m.kind[k];
          if (kind < 0) continue;
          let isMax = true;
          for (let dy = -rad; dy <= rad && isMax; dy++)
            for (let dx = -rad; dx <= rad; dx++) {
              if (!dx && !dy) continue;
              if (det[i + dy * w + dx] > v) {
                isMax = false;
                break;
              }
            }
          if (isMax) all.push({ x, y, z, kind });
        }
    }
  }
  all.sort((a, b) => b.z - a.z);
  const out: Candidate[] = [];
  const sep2 = (0.6 * wv.dH) ** 2;
  for (const c of all) {
    if (out.some((o) => (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < sep2)) continue;
    out.push(c);
    if (out.length >= max) break;
  }
  // sub-pixel refinement: centre of mass of the blob response around the peak
  return out;
}

function bil(d: Float32Array, w: number, h: number, x: number, y: number) {
  const xc = Math.max(0, Math.min(w - 1.001, x));
  const yc = Math.max(0, Math.min(h - 1.001, y));
  const x0 = Math.floor(xc);
  const y0 = Math.floor(yc);
  const tx = xc - x0;
  const ty = yc - y0;
  const i = y0 * w + x0;
  return (d[i] * (1 - tx) + d[i + 1] * tx) * (1 - ty) + (d[i + w] * (1 - tx) + d[i + w + 1] * tx) * ty;
}

/** Raw RGB patch (size x size, channel-major, 0..255) centred on (x, y) in work px. */
export function rawPatch(wv: WorkView, x: number, y: number, size: number, out?: Float32Array): Float32Array {
  const o = out ?? new Float32Array(3 * size * size);
  const half = (size - 1) / 2;
  const planes = [wv.r, wv.g, wv.b];
  for (let c = 0; c < 3; c++) {
    const d = planes[c];
    const base = c * size * size;
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) o[base + j * size + i] = bil(d, wv.w, wv.h, x - half + i, y - half + j);
  }
  return o;
}

/** Network input: per-channel median removed, scaled. Must match ml/train_holenet.py. */
export function normalisePatch(p: Float32Array, size: number): Float32Array {
  const n = size * size;
  const tmp = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    const base = c * n;
    tmp.set(p.subarray(base, base + n));
    tmp.sort();
    const med = tmp[n >> 1];
    for (let k = 0; k < n; k++) p[base + k] = (p[base + k] - med) / 48;
  }
  return p;
}
