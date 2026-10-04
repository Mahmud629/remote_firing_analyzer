/**
 * Robust axis-aligned ellipse fit: A x^2 + C y^2 + D x + E y = 1.
 * Axis-aligned is enough for a target filmed slightly from the side or from
 * below/above; it gives separate horizontal and vertical pixel scales.
 */
export interface EllipseFit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rms: number; // px
  used: number;
}

export function fitEllipse(xs: ArrayLike<number>, ys: ArrayLike<number>, iterations = 3): EllipseFit | null {
  let idx = Array.from({ length: xs.length }, (_, i) => i);
  let fit: EllipseFit | null = null;
  for (let it = 0; it < iterations; it++) {
    if (idx.length < 12) return fit;
    const f = solve(xs, ys, idx);
    if (!f) return fit;
    fit = f;
    const r = (f.rx + f.ry) / 2;
    const res = idx.map((i) => Math.abs(Math.hypot((xs[i] - f.cx) / f.rx, (ys[i] - f.cy) / f.ry) - 1) * r);
    const rms = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length);
    fit.rms = rms;
    fit.used = idx.length;
    const cut = Math.max(1, 2.5 * rms);
    const next = idx.filter((_, k) => res[k] <= cut);
    if (next.length === idx.length) break;
    idx = next;
  }
  return fit;
}

function solve(xs: ArrayLike<number>, ys: ArrayLike<number>, idx: number[]): EllipseFit | null {
  // normalise for numerical stability
  let mx = 0;
  let my = 0;
  for (const i of idx) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= idx.length;
  my /= idx.length;
  let s = 0;
  for (const i of idx) s += Math.hypot(xs[i] - mx, ys[i] - my);
  s = s / idx.length || 1;
  const M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (const i of idx) {
    const x = (xs[i] - mx) / s;
    const y = (ys[i] - my) / s;
    const v = [x * x, y * y, x, y];
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) M[a][b] += v[a] * v[b];
      M[a][4] += v[a];
    }
  }
  const p = gauss(M);
  if (!p) return null;
  const [A, C, D, E] = p;
  if (A <= 0 || C <= 0) return null;
  const F = 1 + (D * D) / (4 * A) + (E * E) / (4 * C);
  if (F <= 0) return null;
  return {
    cx: mx + (-D / (2 * A)) * s,
    cy: my + (-E / (2 * C)) * s,
    rx: Math.sqrt(F / A) * s,
    ry: Math.sqrt(F / C) * s,
    rms: 0,
    used: idx.length,
  };
}

function gauss(M: Float64Array[]): number[] | null {
  const n = M.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
