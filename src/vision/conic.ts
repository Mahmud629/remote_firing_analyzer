/**
 * General (rotated) ellipse fitting.
 *
 * A camera that looks up at a raised target, or from slightly to one side, sees
 * the round ring as a rotated ellipse. The fit is algebraic
 * (a x^2 + b xy + c y^2 + d x + e y = 1 in normalised coordinates), wrapped in
 * RANSAC so that wrinkles, posts and printed figures cannot pull the ring.
 */
export interface Ellipse {
  cx: number;
  cy: number;
  /** semi-axis along `angle` */
  a: number;
  /** semi-axis perpendicular to `angle` */
  b: number;
  /** radians, normalised to (-pi/4, pi/4] */
  angle: number;
}

export interface EllipseFitResult extends Ellipse {
  rms: number;
  inliers: number[];
}

/** Point on the ellipse at parameter t (radians), scaled by k (k = 1 on the curve). */
export function ellipsePoint(e: Ellipse, t: number, k = 1) {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  const u = Math.cos(t) * e.a * k;
  const v = Math.sin(t) * e.b * k;
  return { x: e.cx + u * c - v * s, y: e.cy + u * s + v * c };
}

/** Normalised radius: 1 on the ellipse, <1 inside. */
export function ellipseRadius(e: Ellipse, x: number, y: number) {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  const dx = x - e.cx;
  const dy = y - e.cy;
  const u = dx * c + dy * s;
  const v = -dx * s + dy * c;
  return Math.sqrt((u / e.a) ** 2 + (v / e.b) ** 2);
}

/** Approximate distance (px) of a point from the ellipse, measured along the ray from the centre. */
export function ellipseDistance(e: Ellipse, x: number, y: number) {
  const r = ellipseRadius(e, x, y);
  const d = Math.hypot(x - e.cx, y - e.cy);
  return r > 1e-9 ? Math.abs(d - d / r) : Math.min(e.a, e.b);
}

/** Normalise so that `angle` is in (-pi/4, pi/4] (swaps the axes when needed). */
export function normaliseEllipse(e: Ellipse): Ellipse {
  let { a, b, angle } = e;
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  if (angle > Math.PI / 4) {
    angle -= Math.PI / 2;
    [a, b] = [b, a];
  } else if (angle <= -Math.PI / 4) {
    angle += Math.PI / 2;
    [a, b] = [b, a];
  }
  return { cx: e.cx, cy: e.cy, a, b, angle };
}

/** Least-squares conic through the given points (indices into xs/ys). */
function solveConic(xs: ArrayLike<number>, ys: ArrayLike<number>, idx: ArrayLike<number>): Ellipse | null {
  const n = idx.length;
  if (n < 5) return null;
  let mx = 0;
  let my = 0;
  for (let k = 0; k < n; k++) {
    mx += xs[idx[k]];
    my += ys[idx[k]];
  }
  mx /= n;
  my /= n;
  let sc = 0;
  for (let k = 0; k < n; k++) sc += Math.hypot(xs[idx[k]] - mx, ys[idx[k]] - my);
  sc = sc / n || 1;
  const M = Array.from({ length: 5 }, () => new Float64Array(6));
  for (let k = 0; k < n; k++) {
    const x = (xs[idx[k]] - mx) / sc;
    const y = (ys[idx[k]] - my) / sc;
    const v = [x * x, x * y, y * y, x, y];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) M[i][j] += v[i] * v[j];
      M[i][5] += v[i];
    }
  }
  const p = gauss(M);
  if (!p) return null;
  return conicToEllipse(p[0], p[1], p[2], p[3], p[4], mx, my, sc);
}

/** a x^2 + b xy + c y^2 + d x + e y - 1 = 0 (normalised coordinates) -> ellipse in source px. */
function conicToEllipse(a: number, b: number, c: number, d: number, e: number, mx: number, my: number, sc: number): Ellipse | null {
  const det = 4 * a * c - b * b;
  if (!(det > 1e-12)) return null;
  const x0 = (b * e - 2 * c * d) / det;
  const y0 = (b * d - 2 * a * e) / det;
  const F0 = a * x0 * x0 + b * x0 * y0 + c * y0 * y0 + d * x0 + e * y0 - 1;
  const K = -F0;
  // eigen-decomposition of [[a, b/2], [b/2, c]]
  const tr = a + c;
  const disc = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + (b / 2) ** 2));
  const l1 = tr / 2 - disc; // smaller eigenvalue -> major axis
  const l2 = tr / 2 + disc;
  if (!(l1 > 0) || !(K > 0)) return null;
  const major = Math.sqrt(K / l1);
  const minor = Math.sqrt(K / l2);
  // eigenvector of l1
  let vx = b / 2;
  let vy = l1 - a;
  if (Math.abs(vx) + Math.abs(vy) < 1e-12) {
    vx = 1;
    vy = 0;
  }
  const angle = Math.atan2(vy, vx);
  return normaliseEllipse({ cx: mx + x0 * sc, cy: my + y0 * sc, a: major * sc, b: minor * sc, angle });
}

function gauss(M: Float64Array[]): number[] | null {
  const n = M.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Small deterministic PRNG so detections are repeatable frame to frame. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface RansacOptions {
  /** inlier distance in px */
  tol: number;
  iterations?: number;
  /** minimum aspect ratio b/a accepted (default 0.45) */
  minAspect?: number;
  /** optional prior: candidate centres further than this from (px,py) are rejected */
  prior?: { x: number; y: number; maxDist: number };
}

/**
 * RANSAC ellipse: random 5-point conics, keep the one with most inliers,
 * then least-squares refits with trimming.
 */
export function fitEllipseRansac(xs: ArrayLike<number>, ys: ArrayLike<number>, opts: RansacOptions): EllipseFitResult | null {
  const n = xs.length;
  if (n < 8) return null;
  const iters = opts.iterations ?? 300;
  const minAspect = opts.minAspect ?? 0.45;
  const rnd = lcg(n * 7919 + Math.round(xs[0] * 13 + ys[n - 1] * 7));
  let best: Ellipse | null = null;
  let bestCount = 0;
  const pick = new Int32Array(5);
  const ok = (e: Ellipse | null): e is Ellipse =>
    !!e && e.b / e.a >= minAspect && e.a / e.b >= minAspect && (!opts.prior || Math.hypot(e.cx - opts.prior.x, e.cy - opts.prior.y) <= opts.prior.maxDist);
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < 5; k++) {
      let j: number;
      let tries = 0;
      do {
        j = Math.floor(rnd() * n);
      } while (++tries < 20 && Array.prototype.slice.call(pick, 0, k).includes(j));
      pick[k] = j;
    }
    const e = solveConic(xs, ys, pick);
    if (!ok(e)) continue;
    let count = 0;
    for (let i = 0; i < n; i++) if (ellipseDistance(e, xs[i], ys[i]) <= opts.tol) count++;
    if (count > bestCount) {
      bestCount = count;
      best = e;
    }
  }
  if (!best) {
    // fall back to plain least squares on everything
    const all = Array.from({ length: n }, (_, i) => i);
    best = solveConic(xs, ys, all);
    if (!ok(best)) return null;
  }
  let cur: Ellipse = best;
  let inl: number[] = [];
  let rms = 0;
  let tol = opts.tol;
  for (let round = 0; round < 4; round++) {
    inl = [];
    for (let i = 0; i < n; i++) if (ellipseDistance(cur, xs[i], ys[i]) <= tol) inl.push(i);
    if (inl.length < 6) break;
    const f = solveConic(xs, ys, inl);
    if (!ok(f)) break;
    cur = f;
    let s = 0;
    for (const i of inl) s += ellipseDistance(cur, xs[i], ys[i]) ** 2;
    rms = Math.sqrt(s / inl.length);
    tol = Math.max(opts.tol * 0.5, Math.min(opts.tol, 2.5 * rms));
  }
  inl = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = ellipseDistance(cur, xs[i], ys[i]);
    if (d <= tol) {
      inl.push(i);
      s += d * d;
    }
  }
  rms = inl.length ? Math.sqrt(s / inl.length) : Infinity;
  return { ...cur, rms, inliers: inl };
}
