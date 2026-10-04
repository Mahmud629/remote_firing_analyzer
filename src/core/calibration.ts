import type { Calibration, Vec2 } from './types';

/** Image px -> target inches (origin ring centre, y up). */
export function toTarget(cal: Calibration, p: Vec2): Vec2 {
  const r = cal.diameterIn / 2;
  return {
    x: ((p.x - cal.center.x) / cal.radiusX) * r,
    y: (-(p.y - cal.center.y) / cal.radiusY) * r,
  };
}

/** Target inches -> image px. */
export function toImage(cal: Calibration, p: Vec2): Vec2 {
  const r = cal.diameterIn / 2;
  return {
    x: cal.center.x + (p.x / r) * cal.radiusX,
    y: cal.center.y - (p.y / r) * cal.radiusY,
  };
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
    Math.abs(a.radiusY - b.radiusY) <= tol * r
  );
}

/** Manual calibration from a centre point and a point on the ring. */
export function manualCalibration(center: Vec2, edge: Vec2, diameterIn: number): Calibration {
  const r = Math.hypot(edge.x - center.x, edge.y - center.y);
  return { center, radiusX: r, radiusY: r, diameterIn, method: 'manual', confidence: 1 };
}
