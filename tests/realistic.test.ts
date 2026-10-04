import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ArrayFrameSource } from '../src/vision/frame';
import { detectRing } from '../src/vision/ring';
import { detectHoles } from '../src/vision/holes';

// Rendered by tests/fixtures/make_target.py (perspective, uneven light, torn holes, ring numerals, JPEG)
const TRUTH = [[1.1, 2.3], [-2.0, 0.9], [0.6, -1.7], [2.6, -0.6], [-0.9, -2.9]];
function load(path: string, w: number, h: number) {
  const b = readFileSync(path);
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = b[i];
  return new ArrayFrameSource({ w, h, d });
}
const cases: [string, string, number, number, number][] = [['still photo 3000x2250', '/tmp/e2e/target.gray', 3000, 2250, 5]];
describe.skipIf(!existsSync('/tmp/e2e/target.gray'))('rendered photos', () => {
  for (const [name, path, w, h, n] of cases) {
    it(name, () => {
      const src = load(path, w, h);
      const cal = detectRing(src, { diameterIn: 32 })!;
      const res = detectHoles(src, cal, { holeDiameterIn: 0.3, minConfidence: 0.35 });
      console.log(name, 'ring', cal.radiusX.toFixed(1), cal.radiusY.toFixed(1), cal.confidence.toFixed(2), 'holes', JSON.stringify(res.holes.map((h) => [+h.pIn.x.toFixed(2), +h.pIn.y.toFixed(2), +h.confidence.toFixed(2)])));
      expect(res.holes.length).toBe(n);
      for (const [x, y] of TRUTH) expect(res.holes.some((h) => Math.hypot(h.pIn.x - x, h.pIn.y - y) < 0.35)).toBe(true);
    });
  }

  it('live 720p: marks learned on the clean target are excluded', () => {
    const clean = load('/tmp/e2e/live05.gray', 1280, 720);
    const fired = load('/tmp/e2e/live60.gray', 1280, 720);
    const cal = detectRing(clean, { diameterIn: 32 })!;
    const baseline = detectHoles(clean, cal, { holeDiameterIn: 0.3, sensitivity: 0.75, minConfidence: 0.15 }).holes;
    const res = detectHoles(fired, cal, { holeDiameterIn: 0.3, minConfidence: 0.35 });
    const fresh = res.holes.filter((h) => !baseline.some((b) => Math.hypot(b.pIn.x - h.pIn.x, b.pIn.y - h.pIn.y) < 0.5));
    console.log('baseline', baseline.length, 'fresh', JSON.stringify(fresh.map((h) => [+h.pIn.x.toFixed(2), +h.pIn.y.toFixed(2)])));
    expect(fresh.length).toBe(5);
    for (const [x, y] of TRUTH) expect(fresh.some((h) => Math.hypot(h.pIn.x - x, h.pIn.y - y) < 0.35)).toBe(true);
  });
});
