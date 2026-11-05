import type { Calibration, Vec2 } from './types';

/**
 * Image px -> target inches (origin ring centre, y up).
 * The ellipse is mapped back to a circle: rotate into the ellipse axes, scale
 * each axis to the ring radius, rotate back. Directions on the target are kept
 * (target "up" stays image "up") so corrections read naturally.
 */
export function toTarget(cal: Calibration, p: Vec2): Vec2 {
  if (cal.H) return applyH(invert3(cal.H), p);
  const r = cal.diameterIn / 2;
  const a = cal.angle ?? 0;
  const dx = p.x - cal.center.x;
  const dy = p.y - cal.center.y;
  if (!a) return { x: (dx / cal.radiusX) * r, y: (-dy / cal.radiusY) * r };
  const c = Math.cos(a);
  const s = Math.sin(a);
  const u = ((dx * c + dy * s) / cal.radiusX) * r;
  const v = ((-dx * s + dy * c) / cal.radiusY) * r;
  return { x: u * c - v * s, y: -(u * s + v * c) };
}

/** Target inches -> image px. */
export function toImage(cal: Calibration, p: Vec2): Vec2 {
  if (cal.H) return applyH(cal.H, p);
  const r = cal.diameterIn / 2;
  const a = cal.angle ?? 0;
  if (!a) return { x: cal.center.x + (p.x / r) * cal.radiusX, y: cal.center.y - (p.y / r) * cal.radiusY };
  const c = Math.cos(a);
  const s = Math.sin(a);
  const X = p.x;
  const Y = -p.y; // image y down
  const u = ((X * c + Y * s) / r) * cal.radiusX;
  const v = ((-X * s + Y * c) / r) * cal.radiusY;
  return { x: cal.center.x + u * c - v * s, y: cal.center.y + u * s + v * c };
}

/** Average pixels per inch (for sizing markers). */
export function pxPerInch(cal: Calibration): number {
  return (cal.radiusX + cal.radiusY) / cal.diameterIn;
}

/** True when two calibrations describe (almost) the same ring. */
export function sameRing(a: Calibration, b: Calibration, tol = 0.015): boolean {
  const r = (a.radiusX + a.radiusY) / 2;
  return (
    Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) <= tol * r &&
    Math.abs(a.radiusX - b.radiusX) <= tol * r &&
    Math.abs(a.radiusY - b.radiusY) <= tol * r &&
    Math.abs((a.angle ?? 0) - (b.angle ?? 0)) * Math.abs(a.radiusX - a.radiusY) <= tol * r
  );
}

/** Manual calibration from a centre point and a point on the ring. */
export function manualCalibration(center: Vec2, edge: Vec2, diameterIn: number): Calibration {
  const r = Math.hypot(edge.x - center.x, edge.y - center.y);
  return { center, radiusX: r, radiusY: r, diameterIn, method: 'manual', confidence: 1 };
}

/** Image position of the target centre (differs from the ellipse centre under perspective). */
export function targetCentre(cal: Calibration): Vec2 {
  return cal.H ? applyH(cal.H, { x: 0, y: 0 }) : cal.center;
}

/** The same calibration without perspective (used when the operator edits the ring by hand). */
export function withoutPerspective(cal: Calibration): Calibration {
  if (!cal.H) return cal;
  const { H: _drop, ...rest } = cal;
  void _drop;
  return rest;
}

export function applyH(H: number[], p: Vec2): Vec2 {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

const invCache = new WeakMap<number[], number[]>();
export function invert3(m: number[]): number[] {
  const hit = invCache.get(m);
  if (hit) return hit;
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
  invCache.set(m, inv);
  return inv;
}
