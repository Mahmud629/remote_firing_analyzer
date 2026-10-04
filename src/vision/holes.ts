import type { Calibration, Vec2 } from '../core/types';
import { pxPerInch, toTarget } from '../core/calibration';
import { binaryOpen, boxBlur, quantile, rankFilter, robustStats, type Gray } from './image';
import type { FrameSource } from './frame';

export type Polarity = 'dark' | 'light' | 'warm';

export interface HoleOptions {
  /** Restrict to some kinds of holes (default: all). */
  polarities?: Polarity[];
  /** Also look for holes about half the calibre (default true; off in live view for speed). */
  halfSizePass?: boolean;
  /** Expected hole diameter in inches (7.62 mm = 0.30 in). */
  holeDiameterIn: number;
  /** 0 (strict) .. 1 (finds faint holes, more false marks). */
  sensitivity?: number;
  /** Only search inside this fraction of the ring radius. */
  roi?: number;
  /** Cap on the processed crop size. */
  maxWork?: number;
  minConfidence?: number;
}

export interface Hole {
  p: Vec2; // source px
  pIn: Vec2; // target inches
  diameterIn: number;
  confidence: number;
  merged: boolean;
  /** Tan colour of the hole compared with its surroundings (colour sources only). */
  warmth?: number;
  /** Found by the half-size pass. */
  small?: boolean;
  /** dark/light: brightness; warm: tan backing board seen through the hole (colour) */
  polarity: Polarity;
}

export interface HoleResult {
  holes: Hole[];
  /** Hole size in processed pixels; below ~4 px detection gets unreliable. */
  holePx: number;
  lowResolution: boolean;
  /** The picture has real colour (not grayscale or night-vision infrared). */
  colourful?: boolean;
}

/**
 * Bullet-hole detector.
 *
 * 1. Crop the calibrated ring and resample so one hole is ~10 px wide.
 * 2. Morphological top-hats: closing(img) - img lights up dark spots smaller
 *    than the kernel (holes on white paper), img - opening(img) lights up
 *    bright spots (backlit holes in the black aiming mark). Large printed
 *    areas such as the aiming mark give no response, so holes right on its
 *    edge are still found.
 * 3. Robust threshold from the median/MAD of the response inside the ring.
 * 4. Binary opening removes printed ring lines and figures thinner than a hole.
 * 5. Connected components are scored on size, roundness and contrast. Blobs
 *    with the area of two or three holes are split along their long axis and
 *    flagged for the operator to confirm.
 */
/**
 * Hole detection. The calibre is only a starting size: blobs from about 0.7x to
 * 1.7x of it are accepted (small calibres, torn paper, angled shots), and the
 * reference size adapts to the typical hole actually found on the target.
 */
export function detectHoles(src: FrameSource, cal: Calibration, opts: HoleOptions): HoleResult {
  const base = detectHolesOnce(src, cal, opts);
  let holes = [...base.holes];
  // Colour logic only for pictures that really have colour; grayscale pictures
  // (night-vision CCTV, black-and-white photos) use the plain brightness detector.
  const colour = !!base.colourful;
  if (colour && opts.halfSizePass !== false) {
    // Paper often closes up behind the bullet, leaving a hole about half the
    // calibre: look again at half size (dark cores and tan backing only).
    const small = detectHolesOnce(src, cal, { ...opts, holeDiameterIn: opts.holeDiameterIn * 0.5, maxWork: Math.max(opts.maxWork ?? 1200, 1700), polarities: ['dark', 'warm'] });
    for (const h of small.holes) {
      if (holes.some((o) => Math.hypot(o.pIn.x - h.pIn.x, o.pIn.y - h.pIn.y) < opts.holeDiameterIn * 0.9)) continue;
      holes.push({ ...h, small: true });
    }
  }
  if (colour) holes = colourConsensus(holes);
  return { ...base, holes };
}

/**
 * Uses what most holes on this target look like. If the backing shows tan
 * through the holes, marks without that colour (fold creases, glare, print
 * edges) are dropped. Otherwise marks of a minority type need high confidence.
 */
function colourConsensus(holes: Hole[]): Hole[] {
  const strong = holes.filter((h) => h.confidence >= 0.6);
  const tan = strong.filter((h) => h.polarity === 'warm' && (h.warmth ?? 0) >= 20).length;
  if (tan >= 2) return holes.filter((h) => (h.warmth ?? 0) >= 12);
  const count = { dark: 0, light: 0, warm: 0 } as Record<Polarity, number>;
  for (const h of strong) count[h.polarity]++;
  const total = strong.length;
  const main = (Object.keys(count) as Polarity[]).find((k) => total >= 3 && count[k] / total >= 0.7);
  // without the tan clue, small marks are easily paint specks or crease shadows
  const kept = holes.filter((h) => !h.small || h.confidence >= 0.65);
  return main ? kept.filter((h) => h.polarity === main || h.confidence >= 0.8) : kept;
}

export function detectHolesOnce(src: FrameSource, cal: Calibration, opts: HoleOptions): HoleResult {
  const sens = clamp01(opts.sensitivity ?? 0.5);
  // Search up to the outer edge of the outer band for tan (colour) holes; brightness-only
  // marks must lie inside 0.985 of the ring, where fold creases and edge effects are rare.
  const roi = opts.roi ?? (src.channel ? 1.03 : 0.985);
  const roiLuma = 0.985;
  const minConf = opts.minConfidence ?? 0.3;
  const ppiSrc = pxPerInch(cal);
  const desiredPpi = 7.5 / opts.holeDiameterIn; // ~7-8 px per hole
  const pad = src.channel ? 1.07 : 1.03;
  const crop = {
    x: cal.center.x - cal.radiusX * pad,
    y: cal.center.y - cal.radiusY * pad,
    w: 2 * cal.radiusX * pad,
    h: 2 * cal.radiusY * pad,
  };
  // resample so a hole is ~10 px wide (enlarging small live frames up to 2x)
  const wantDim = Math.max(crop.w, crop.h) * Math.min(2, desiredPpi / ppiSrc);
  const view = src.gray({ crop, maxDim: Math.min(opts.maxWork ?? 1200, Math.round(wantDim)) });
  const s = view.scale;
  const dH = opts.holeDiameterIn * ppiSrc * s;
  if (dH < 2.5) return { holes: [], holePx: dH, lowResolution: true, colourful: false };

  const img = dH >= 9 ? boxBlur(view.img, 1) : view.img;
  const { w, h } = img;
  const auto = false; // kept for experiments with a wider size search
  // top-hat kernel: must be larger than the biggest hole we accept
  const k = odd(Math.max(3, Math.round(dH * (auto ? 2.6 : 1.9))));
  const closing = rankFilter(rankFilter(img, k, 'max'), k, 'min');
  const opening = rankFilter(rankFilter(img, k, 'min'), k, 'max');
  // colour: tan/brown backing seen through the hole (red minus green), when available
  const warmView = src.channel?.({ crop, maxDim: Math.max(view.img.w, view.img.h) }, 'warm') ?? null;
  let warmImg: Gray | null = null;
  let warm: Float32Array | null = null;
  let colourful = false;
  if (warmView && warmView.img.w === view.img.w && warmView.img.h === view.img.h) {
    warmImg = dH >= 9 ? boxBlur(warmView.img, 1) : warmView.img;
    const wOpen = rankFilter(rankFilter(warmImg, k, 'min'), k, 'max');
    // Green paper is "cold", black/white/grey print is neutral; only tan is warm.
    // Background = the local opening, but never below the target's neutral level,
    // so thick neutral bands do not light up next to green paper.
    const neutral = quantile(warmImg.d, 0.85) + 6;
    // a grayscale / infrared picture has no colour spread at all
    colourful = quantile(warmImg.d, 0.95) - quantile(warmImg.d, 0.05) >= 24;
    warm = new Float32Array(view.img.w * view.img.h);
    for (let i = 0; i < warm.length; i++) warm[i] = Math.max(0, warmImg.d[i] - Math.max(wOpen.d[i], neutral));
  }
  const dark = new Float32Array(w * h);
  const light = new Float32Array(w * h);
  for (let i = 0; i < dark.length; i++) {
    dark[i] = closing.d[i] - img.d[i];
    light[i] = img.d[i] - opening.d[i];
  }

  // ellipse mask in crop px
  const mask = new Uint8Array(w * h);
  const ecx = (cal.center.x - view.offset.x) * s;
  const ecy = (cal.center.y - view.offset.y) * s;
  const erx = cal.radiusX * s * roi;
  const ery = cal.radiusY * s * roi;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = (x - ecx) / erx;
      const ny = (y - ecy) / ery;
      if (nx * nx + ny * ny <= 1) mask[y * w + x] = 1;
    }

  const kSigma = 7 - 4 * sens; // 7 (strict) .. 3 (sensitive)
  const floor = 26 - 14 * sens;
  const area0 = Math.PI * (dH / 2) ** 2;
  const openK = Math.max(3, odd(Math.round(dH * 0.42)));
  const rings = ringProfile(w, h, ecx, ecy, erx / roi, ery / roi, mask);
  const blobs: { b: Blob; T: number; polarity: Polarity; bin: Uint8Array }[] = [];
  for (const [resp, polarity, chan] of [
    [dark, 'dark', img],
    [light, 'light', img],
    ...(warm && warmImg ? ([[warm, 'warm', warmImg]] as const) : []),
  ] as [Float32Array, Polarity, Gray][]) {
    if (opts.polarities && !opts.polarities.includes(polarity)) continue;
    const st = robustStats(resp, mask);
    const T = Math.max(floor, st.median + kSigma * Math.max(st.sigma, 1));
    // Printed rings are rotationally uniform. On their radii the threshold is
    // raised to half the ring's own strength, which trims the blurred halo so
    // the line becomes thin enough for the opening below to remove it, while a
    // hole sitting on the line keeps its full round shape.
    const thr = ringThresholds(resp, rings, T);
    const bin = new Uint8Array(w * h);
    for (let i = 0; i < bin.length; i++) {
      if (!mask[i]) continue;
      const b = rings.bin[i];
      if (resp[i] > (b >= 0 ? thr[b] : T)) bin[i] = 1;
    }
    // On ring radii anything narrower than ~60% of a hole is printed line.
    const opened = binaryOpen(bin, w, h, openK);
    const openedLine = binaryOpen(bin, w, h, Math.max(openK + 2, odd(Math.round(dH * 0.62))));
    for (let i = 0; i < opened.length; i++) {
      const b = rings.bin[i];
      if (b >= 0 && thr[b] > T) opened[i] = openedLine[i];
    }
    for (const c of components(opened, resp, w, h)) {
      // a hole is a solid disk: its core must be (almost) entirely above threshold.
      // Printed numerals (strokes with gaps) and ring-line fragments fail this.
      if (coreSolidity(bin, c, auto ? dH * 0.8 : dH, w, h) < 0.85) continue;
      if (!surroundOk(chan, c, dH, polarity)) continue;
      if (polarity !== 'warm') {
        if (roi <= roiLuma) {
          /* already limited by the mask */
        }
        const nx = (c.sx - ecx) / (erx / roi);
        const ny = (c.sy - ecy) / (ery / roi);
        if (nx * nx + ny * ny > roiLuma * roiLuma) continue;
      }
      // on a printed ring a hole must reach across the line, not just along it
      const ci = Math.round(c.sy) * w + Math.round(c.sx);
      const rb = rings.bin[ci];
      if (rb >= 0 && thr[rb] > T) {
        const [across, along] = ringExtents(c, ecx, ecy);
        // narrower than a hole across the ring and stretched along it: printed line
        const narrow = src.channel ? 0.65 : 0.8;
        if (across < narrow * dH || (across < 0.8 * dH && across < 0.72 * along)) continue;
      }
      blobs.push({ b: c, T, polarity, bin });
    }
  }

  // The threshold halo makes blobs a little larger than the printed hole size.
  // Use the typical single hole in this frame as the reference area so that
  // touching holes are counted correctly.
  // In auto mode the reference size is the typical hole actually seen.
  const roundish = blobs.filter((x) => elongation(x.b) < 1.35);
  const singles = (auto ? roundish : blobs).map((x) => x.b.area / area0).filter((r) => (auto ? r > 0.3 && r < 5 : r > 0.5 && r < 2.2)).sort((a, b) => a - b);
  const inflation =
    singles.length >= 2
      ? auto
        ? Math.min(4.5, Math.max(0.45, singles[(singles.length - 1) >> 1]))
        : Math.min(1.8, Math.max(1, singles[(singles.length - 1) >> 1]))
      : 1 + Math.min(0.6, 2.4 / dH);
  const found: Hole[] = [];
  for (const { b, T, polarity, bin } of blobs) {
    for (const hole of scoreBlob(b, area0 * inflation, dH * Math.sqrt(inflation / (1 + Math.min(0.6, 2.4 / dH))), T, polarity, auto)) {
      // each part of a split blob must itself be a solid hole-sized core
      if (hole.merged && coreSolidityAt(bin, hole.x, hole.y, dH, w, h) < 0.85) continue;
      const p = { x: view.offset.x + hole.x / s, y: view.offset.y + hole.y / s };
      found.push({
        p,
        pIn: toTarget(cal, p),
        diameterIn: hole.d / (ppiSrc * s),
        confidence: hole.conf,
        merged: hole.merged,
        polarity,
        warmth: warmImg ? warmthAt(warmImg, hole.x, hole.y, dH) : undefined,
      });
    }
  }

  // de-duplicate dark/light responses of the same hole (dark centre + torn light rim)
  found.sort((a, b) => b.confidence - a.confidence);
  const holes: Hole[] = [];
  const minSep = opts.holeDiameterIn * 0.6;
  for (const f of found) {
    if (f.confidence < minConf) continue;
    if (holes.some((o) => Math.hypot(o.pIn.x - f.pIn.x, o.pIn.y - f.pIn.y) < minSep && !(o.merged && f.merged))) continue;
    holes.push(f);
  }
  return { holes, holePx: dH, lowResolution: dH < 4, colourful };
}

interface Blob {
  area: number;
  sx: number;
  sy: number;
  sw: number;
  cxx: number;
  cyy: number;
  cxy: number;
  mean: number;
  touchesEdge: boolean;
}

function components(bin: Uint8Array, resp: Float32Array, w: number, h: number): Blob[] {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Blob[] = [];
  let next = 1;
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || label[i]) continue;
    let top = 0;
    stack[top++] = i;
    label[i] = next;
    let area = 0;
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let rs = 0;
    let ax = 0;
    let ay = 0;
    let edge = false;
    while (top) {
      const j = stack[--top];
      const x = j % w;
      const y = (j / w) | 0;
      const wt = resp[j];
      area++;
      rs += wt;
      sw += wt;
      sx += wt * x;
      sy += wt * y;
      ax += x;
      ay += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (bin[n] && !label[n]) {
            label[n] = next;
            stack[top++] = n;
          }
        }
    }
    next++;
    // shape from unweighted moments, position from the response-weighted centroid (sub-pixel)
    const mx = ax / area;
    const my = ay / area;
    out.push({
      area,
      sx: sx / sw,
      sy: sy / sw,
      sw,
      cxx: sxx / area - mx * mx,
      cyy: syy / area - my * my,
      cxy: sxy / area - mx * my,
      mean: rs / area,
      touchesEdge: edge,
    });
  }
  return out;
}

function elongation(b: Blob) {
  const tr = b.cxx + b.cyy;
  const det = b.cxx * b.cyy - b.cxy * b.cxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  return Math.sqrt(Math.max(1e-6, tr / 2 + disc) / Math.max(1e-6, tr / 2 - disc));
}

function scoreBlob(b: Blob, area0: number, dH: number, T: number, polarity: Polarity, auto = false) {
  const out: { x: number; y: number; d: number; conf: number; merged: boolean }[] = [];
  if (b.touchesEdge) return out;
  const ratio = b.area / area0;
  if (ratio < (auto ? 0.25 : 0.3) || ratio > 3.8) return out;
  // principal axes
  const tr = b.cxx + b.cyy;
  const det = b.cxx * b.cyy - b.cxy * b.cxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = Math.max(1e-6, tr / 2 + disc);
  const l2 = Math.max(1e-6, tr / 2 - disc);
  const major = 4 * Math.sqrt(l1);
  const minor = 4 * Math.sqrt(l2);
  const elong = Math.sqrt(l1 / l2);
  const fill = b.area / ((Math.PI / 4) * major * minor);
  const contrast = clamp01((b.mean / T - 1) / 1.5);
  const polarityPenalty = polarity === 'light' ? 0.9 : 1;

  const single = ratio <= 1.8 || elong < 1.45; // torn paper makes single holes look large
  if (single) {
    if (elong > 1.6 || fill < 0.6) return out; // holes are round; blurred numerals and line fragments are not
    const sizeScore = Math.exp(-(Math.log(ratio) ** 2) / (2 * 0.45 ** 2));
    const shapeScore = clamp01(1 - (elong - 1) / 0.8) * clamp01((fill - 0.5) / 0.4);
    const conf = (0.4 * sizeScore + 0.3 * shapeScore + 0.3 * contrast) * polarityPenalty;
    out.push({ x: b.sx, y: b.sy, d: Math.sqrt((4 * b.area) / Math.PI), conf, merged: false });
    return out;
  }
  // overlapping holes: split along the major axis
  if (elong > 3.6 || minor < 0.55 * dH || fill < 0.5) return out;
  const n = Math.max(2, Math.min(3, Math.round(ratio)));
  const ang = 0.5 * Math.atan2(2 * b.cxy, b.cxx - b.cyy);
  const span = Math.max(0, major - dH);
  const conf = (0.55 + 0.25 * contrast) * clamp01(1.2 - (elong - 1.3) / 3) * polarityPenalty * 0.85;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
    out.push({ x: b.sx + Math.cos(ang) * t, y: b.sy + Math.sin(ang) * t, d: dH, conf, merged: true });
  }
  return out;
}

/* ---------- printed-ring suppression ---------- */

interface RingProfile {
  /** sector * nb + radial bin per pixel (-1 outside the mask) */
  bin: Int32Array;
  nb: number;
  sectors: number;
}

/**
 * Radial bins per angular sector. Under perspective the inner printed rings
 * are not exactly concentric with the outer ellipse, so each sector gets its
 * own radial profile and a printed line stays in its own bins.
 */
function ringProfile(w: number, h: number, cx: number, cy: number, rx: number, ry: number, mask: Uint8Array): RingProfile {
  const rMean = (rx + ry) / 2;
  const nb = Math.ceil(rMean * 1.05) + 2;
  const sectors = 12;
  const bin = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const rn = Math.sqrt(nx * nx + ny * ny);
      const sec = Math.min(sectors - 1, Math.floor(((Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI)) * sectors));
      bin[i] = sec * nb + Math.min(nb - 1, Math.round(rn * rMean));
    }
  return { bin, nb, sectors };
}

/** Per-bin threshold: max(T, 70% of the strongest nearby ring median in the same sector). */
function ringThresholds(resp: Float32Array, rp: RingProfile, T: number): Float32Array {
  const LEVELS = 128;
  const MAXV = 256;
  const N = rp.nb * rp.sectors;
  const hist = new Int32Array(N * LEVELS);
  const count = new Int32Array(N);
  for (let i = 0; i < resp.length; i++) {
    const b = rp.bin[i];
    if (b < 0) continue;
    const q = Math.min(LEVELS - 1, Math.max(0, Math.floor((resp[i] / MAXV) * LEVELS)));
    hist[b * LEVELS + q]++;
    count[b]++;
  }
  const med = new Float32Array(N);
  for (let b = 0; b < N; b++) {
    if (count[b] < 6) continue;
    let acc = 0;
    const half = count[b] / 2;
    for (let q = 0; q < LEVELS; q++) {
      acc += hist[b * LEVELS + q];
      if (acc >= half) {
        med[b] = ((q + 0.5) / LEVELS) * MAXV;
        break;
      }
    }
  }
  const thr = new Float32Array(N);
  for (let sec = 0; sec < rp.sectors; sec++) {
    const o = sec * rp.nb;
    for (let r = 0; r < rp.nb; r++) {
      let m = med[o + r];
      for (let j = Math.max(0, r - 2); j <= Math.min(rp.nb - 1, r + 2); j++) if (med[o + j] > m) m = med[o + j];
      thr[o + r] = m > T ? Math.max(T, 0.7 * m) : T;
    }
  }
  return thr;
}

/** Fraction of the disk of radius ~0.38 hole diameters around the blob centre that is above threshold. */
function coreSolidity(bin: Uint8Array, b: Blob, dH: number, w: number, h: number) {
  return coreSolidityAt(bin, b.sx, b.sy, dH, w, h);
}

function coreSolidityAt(bin: Uint8Array, cx: number, cy: number, dH: number, w: number, h: number) {
  const b = { sx: cx, sy: cy };
  const r = Math.max(1.5, 0.38 * dH);
  const r2 = r * r;
  let inside = 0;
  let set = 0;
  const x0 = Math.floor(b.sx - r);
  const x1 = Math.ceil(b.sx + r);
  const y0 = Math.floor(b.sy - r);
  const y1 = Math.ceil(b.sy + r);
  for (let y = y0; y <= y1; y++) {
    if (y < 0 || y >= h) continue;
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= w) continue;
      const dx = x - b.sx;
      const dy = y - b.sy;
      if (dx * dx + dy * dy > r2) continue;
      inside++;
      set += bin[y * w + x];
    }
  }
  return inside ? set / inside : 0;
}

/** Core minus surround in the warm channel (positive = tan backing showing). */
function warmthAt(img: Gray, x: number, y: number, dH: number) {
  const rc = Math.max(1, 0.22 * dH);
  let core = 0;
  let n = 0;
  for (let yy = Math.floor(y - rc); yy <= Math.ceil(y + rc); yy++)
    for (let xx = Math.floor(x - rc); xx <= Math.ceil(x + rc); xx++) {
      if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h || (xx - x) ** 2 + (yy - y) ** 2 > rc * rc) continue;
      core += img.d[yy * img.w + xx];
      n++;
    }
  core /= n || 1;
  const r = 0.95 * dH + 1;
  const ring: number[] = [];
  for (let k = 0; k < 24; k++) ring.push(sample(img, x + Math.cos((k / 24) * 2 * Math.PI) * r, y + Math.sin((k / 24) * 2 * Math.PI) * r));
  ring.sort((a, b) => a - b);
  return core - ring[12];
}

/** Blob extent (4 sigma) across the ring (radial) and along it (tangential). */
function ringExtents(b: Blob, cx: number, cy: number): [number, number] {
  let ux = b.sx - cx;
  let uy = b.sy - cy;
  const l = Math.sqrt(ux * ux + uy * uy) || 1;
  ux /= l;
  uy /= l;
  const across = ux * ux * b.cxx + 2 * ux * uy * b.cxy + uy * uy * b.cyy;
  const along = uy * uy * b.cxx - 2 * ux * uy * b.cxy + ux * ux * b.cyy;
  return [4 * Math.sqrt(Math.max(0, across)), 4 * Math.sqrt(Math.max(0, along))];
}

/** A real hole is darker (or lighter) than almost everything around it. */
function surroundOk(img: Gray, b: Blob, dH: number, polarity: Polarity): boolean {
  const { w, h } = img;
  const cx = b.sx;
  const cy = b.sy;
  const core = sample(img, cx, cy);
  // backlit holes are often right at the edge of the aiming mark: look closer
  const r = Math.sqrt(b.area / Math.PI) + (polarity === 'dark' ? 0.45 : 0.25) * dH + 1;
  const need = b.mean * 0.45;
  let ok = 0;
  const N = 24;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) continue;
    const v = sample(img, x, y);
    if (polarity === 'dark' ? v - core > need : core - v > need) ok++;
  }
  return ok / N >= (polarity === 'dark' ? 0.6 : 0.7);
}

function sample(img: Gray, x: number, y: number) {
  const xi = Math.max(0, Math.min(img.w - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(img.h - 1, Math.round(y)));
  return img.d[yi * img.w + xi];
}

const odd = (n: number) => (n % 2 ? n : n + 1);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export type { Gray };
