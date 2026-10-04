/**
 * Low-level image operations on single-channel float images.
 * Everything is O(pixels) and allocation-light so it can run per video frame
 * inside a Web Worker. No DOM APIs are used here, which keeps it unit-testable.
 */
export interface Gray {
  w: number;
  h: number;
  d: Float32Array; // 0..255
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function makeGray(w: number, h: number, fill = 0): Gray {
  const d = new Float32Array(w * h);
  if (fill) d.fill(fill);
  return { w, h, d };
}

export function grayFromRGBA(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const d = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return { w, h, d };
}

/** Summed-area table with a zero row/column, size (w+1)*(h+1). */
function integral(src: Gray): Float64Array {
  const { w, h, d } = src;
  const W = w + 1;
  const I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += d[y * w + x];
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
    }
  }
  return I;
}

/** Resample `crop` of `src` to nw x nh (area averaging when shrinking, bilinear when enlarging). */
export function resample(src: Gray, crop: Rect, nw: number, nh: number): Gray {
  const out = makeGray(nw, nh);
  const fx = crop.w / nw;
  const fy = crop.h / nh;
  if (fx >= 1 && fy >= 1) {
    const I = integral(src);
    const W = src.w + 1;
    for (let j = 0; j < nh; j++) {
      const y0 = Math.max(0, Math.min(src.h - 1, Math.round(crop.y + j * fy)));
      const y1 = Math.max(y0 + 1, Math.min(src.h, Math.round(crop.y + (j + 1) * fy)));
      for (let i = 0; i < nw; i++) {
        const x0 = Math.max(0, Math.min(src.w - 1, Math.round(crop.x + i * fx)));
        const x1 = Math.max(x0 + 1, Math.min(src.w, Math.round(crop.x + (i + 1) * fx)));
        const s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
        out.d[j * nw + i] = s / ((x1 - x0) * (y1 - y0));
      }
    }
    return out;
  }
  for (let j = 0; j < nh; j++) {
    const sy = Math.min(src.h - 1.001, Math.max(0, crop.y + (j + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy);
    const ty = sy - y0;
    for (let i = 0; i < nw; i++) {
      const sx = Math.min(src.w - 1.001, Math.max(0, crop.x + (i + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx);
      const tx = sx - x0;
      const a = src.d[y0 * src.w + x0];
      const b = src.d[y0 * src.w + x0 + 1];
      const c = src.d[(y0 + 1) * src.w + x0];
      const e = src.d[(y0 + 1) * src.w + x0 + 1];
      out.d[j * nw + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    }
  }
  return out;
}

/** Separable box blur with clamped edges. */
export function boxBlur(src: Gray, r: number): Gray {
  if (r < 1) return src;
  const { w, h } = src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src.d[o + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / n;
      s += src.d[o + Math.min(w - 1, x + r + 1)] - src.d[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return { w, h, d: out };
}

export interface Gradient {
  gx: Float32Array;
  gy: Float32Array;
  mag: Float32Array;
}

export function sobel(src: Gray): Gradient {
  const { w, h, d } = src;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = d[i - w - 1];
      const b = d[i - w];
      const c = d[i - w + 1];
      const l = d[i - 1];
      const r = d[i + 1];
      const e = d[i + w - 1];
      const f = d[i + w];
      const g = d[i + w + 1];
      const sx = c + 2 * r + g - a - 2 * l - e;
      const sy = e + 2 * f + g - a - 2 * b - c;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.sqrt(sx * sx + sy * sy);
    }
  }
  return { gx, gy, mag };
}

/**
 * Grayscale erosion (min) or dilation (max) with a k x k square, k odd.
 * van Herk / Gil-Werman: three comparisons per pixel whatever the kernel size.
 * The vertical pass walks whole rows at a time so memory access stays linear.
 */
export function rankFilter(src: Gray, k: number, op: 'min' | 'max'): Gray {
  const r = Math.max(0, (k - 1) >> 1);
  if (r === 0) return src;
  const { w, h } = src;
  // max(x) == -min(-x): implement max only, negate for min
  let d = src.d;
  if (op === 'min') {
    d = new Float32Array(src.d.length);
    for (let i = 0; i < d.length; i++) d[i] = -src.d[i];
  }
  const out = vhgwMax(d, w, h, r);
  if (op === 'min') for (let i = 0; i < out.length; i++) out[i] = -out[i];
  return { w, h, d: out };
}

function vhgwMax(d: Float32Array, w: number, h: number, r: number): Float32Array {
  const k = 2 * r + 1;
  const NEG = -1e30;
  const tmp = new Float32Array(w * h);
  const n = w + 2 * r;
  const a = new Float32Array(n);
  const g = new Float32Array(n);
  const hh = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    a.fill(NEG, 0, r);
    a.set(d.subarray(o, o + w), r);
    a.fill(NEG, r + w);
    for (let b = 0; b < n; b += k) {
      const e = Math.min(n, b + k);
      let m = a[b];
      g[b] = m;
      for (let i = b + 1; i < e; i++) {
        const v = a[i];
        if (v > m) m = v;
        g[i] = m;
      }
      m = a[e - 1];
      hh[e - 1] = m;
      for (let i = e - 2; i >= b; i--) {
        const v = a[i];
        if (v > m) m = v;
        hh[i] = m;
      }
    }
    const r2 = 2 * r;
    for (let x = 0; x < w; x++) {
      const p = hh[x];
      const q = g[x + r2];
      tmp[o + x] = p > q ? p : q;
    }
  }
  // vertical pass on padded rows Y = 0..H-1 (source row Y - r)
  const H = h + 2 * r;
  const G = new Float32Array(H * w);
  const B = new Float32Array(H * w);
  const negRow = new Float32Array(w).fill(NEG);
  const srcRow = (Y: number) => {
    const sy = Y - r;
    return sy < 0 || sy >= h ? negRow : tmp.subarray(sy * w, sy * w + w);
  };
  for (let b = 0; b < H; b += k) {
    const e = Math.min(H, b + k);
    G.set(srcRow(b), b * w);
    for (let Y = b + 1; Y < e; Y++) {
      const row = srcRow(Y);
      const cur = Y * w;
      const prev = cur - w;
      for (let x = 0; x < w; x++) {
        const p = G[prev + x];
        const v = row[x];
        G[cur + x] = p > v ? p : v;
      }
    }
    B.set(srcRow(e - 1), (e - 1) * w);
    for (let Y = e - 2; Y >= b; Y--) {
      const row = srcRow(Y);
      const cur = Y * w;
      const next = cur + w;
      for (let x = 0; x < w; x++) {
        const p = B[next + x];
        const v = row[x];
        B[cur + x] = p > v ? p : v;
      }
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const hb = y * w;
    const gb = (y + 2 * r) * w;
    for (let x = 0; x < w; x++) {
      const p = B[hb + x];
      const q = G[gb + x];
      out[hb + x] = p > q ? p : q;
    }
  }
  return out;
}

/** Median and robust sigma (1.4826 * MAD) from a sample of the masked values. */
export function robustStats(a: Float32Array, mask?: Uint8Array, maxSamples = 20000): { median: number; sigma: number } {
  const step = Math.max(1, Math.floor(a.length / maxSamples));
  const s: number[] = [];
  for (let i = 0; i < a.length; i += step) if (!mask || mask[i]) s.push(a[i]);
  if (!s.length) return { median: 0, sigma: 0 };
  s.sort((x, y) => x - y);
  const median = s[s.length >> 1];
  const dev = s.map((v) => Math.abs(v - median)).sort((x, y) => x - y);
  return { median, sigma: dev[dev.length >> 1] * 1.4826 };
}

/** Value at quantile q (0..1) of a sample of the array (optionally masked). */
export function quantile(a: Float32Array, q: number, mask?: Uint8Array, maxSamples = 40000): number {
  const step = Math.max(1, Math.floor(a.length / maxSamples));
  const s: number[] = [];
  for (let i = 0; i < a.length; i += step) if (!mask || mask[i]) s.push(a[i]);
  if (!s.length) return 0;
  s.sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

/** Binary opening with a k x k square (removes structures thinner than k). */
export function binaryOpen(mask: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const r = (k - 1) >> 1;
  if (r <= 0) return mask;
  return binaryDilate(binaryErode(mask, w, h, r), w, h, r);
}

/** Erosion: keep pixels whose (2r+1)^2 square is all ones. Run-length based. */
function binaryErode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const hz = new Uint8Array(w * h);
  const run = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    // left run length ending at x, then right run length starting at x
    let c = 0;
    for (let x = 0; x < w; x++) {
      c = m[o + x] ? c + 1 : 0;
      run[x] = c;
    }
    c = 0;
    for (let x = w - 1; x >= 0; x--) {
      c = m[o + x] ? c + 1 : 0;
      if (run[x] > r && c > r) hz[o + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  const up = new Int32Array(w);
  const downRuns = new Int32Array(w * h);
  // bottom-up run lengths
  for (let y = h - 1; y >= 0; y--) {
    const o = y * w;
    for (let x = 0; x < w; x++) downRuns[o + x] = hz[o + x] ? (y < h - 1 ? downRuns[o + w + x] : 0) + 1 : 0;
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      up[x] = hz[o + x] ? up[x] + 1 : 0;
      if (up[x] > r && downRuns[o + x] > r) out[o + x] = 1;
    }
  }
  return out;
}

/** Dilation: set pixels with a one within the (2r+1)^2 square. */
function binaryDilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const hz = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let last = -1e9;
    for (let x = 0; x < w; x++) {
      if (m[o + x]) last = x;
      if (x - last <= r) hz[o + x] = 1;
    }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (m[o + x]) last = x;
      if (last - x <= r) hz[o + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  const lastY = new Int32Array(w).fill(-1e9);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      if (hz[o + x]) lastY[x] = y;
      if (y - lastY[x] <= r) out[o + x] = 1;
    }
  }
  lastY.fill(1e9);
  for (let y = h - 1; y >= 0; y--) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      if (hz[o + x]) lastY[x] = y;
      if (lastY[x] - y <= r) out[o + x] = 1;
    }
  }
  return out;
}

/** Non-maximum-suppressed edge points (thin edges) above `threshold`. */
export interface Edges {
  n: number;
  x: Float32Array;
  y: Float32Array;
  ux: Float32Array; // unit gradient (points from dark to bright)
  uy: Float32Array;
  m: Float32Array;
}

export function thinEdges(grad: Gradient, w: number, h: number, threshold: number, cap = 30000, region?: (x: number, y: number) => boolean): Edges {
  const { gx, gy, mag } = grad;
  const keep: number[] = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < threshold) continue;
      if (region && !region(x, y)) continue;
      const ax = gx[i] / m;
      const ay = gy[i] / m;
      const dx = Math.round(ax);
      const dy = Math.round(ay);
      if (m >= mag[i + dy * w + dx] && m > mag[i - dy * w - dx]) keep.push(i);
    }
  }
  let list = keep;
  if (list.length > cap) {
    // keep the strongest edges: raise the threshold instead of sorting everything
    const t2 = quantileOf(list.map((i) => mag[i]), 1 - cap / list.length);
    list = keep.filter((i) => mag[i] >= t2).slice(0, cap);
  }
  const n = list.length;
  const e: Edges = {
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    ux: new Float32Array(n),
    uy: new Float32Array(n),
    m: new Float32Array(n),
  };
  for (let k = 0; k < n; k++) {
    const i = list[k];
    const m = mag[i];
    e.x[k] = i % w;
    e.y[k] = (i / w) | 0;
    e.ux[k] = gx[i] / m;
    e.uy[k] = gy[i] / m;
    e.m[k] = m;
  }
  return e;
}

function quantileOf(v: number[], q: number) {
  const step = Math.max(1, Math.floor(v.length / 20000));
  const s: number[] = [];
  for (let i = 0; i < v.length; i += step) s.push(v[i]);
  s.sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}
