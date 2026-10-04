import type { Vec2 } from './types';

export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export function mean(points: Vec2[]): Vec2 | null {
  if (!points.length) return null;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** Largest centre-to-centre distance and the indices of that pair. */
export function extremeSpread(points: Vec2[]): { size: number; pair: [number, number] } | null {
  if (points.length < 2) return null;
  let best = -1;
  let pair: [number, number] = [0, 1];
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const d = dist(points[i], points[j]);
      if (d > best) {
        best = d;
        pair = [i, j];
      }
    }
  return { size: best, pair };
}

export function bounds(points: Vec2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
