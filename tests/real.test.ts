import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { RgbArrayFrameSource } from '../src/vision/frame';
import { detectRing } from '../src/vision/ring';
import { detectHoles } from '../src/vision/holes';
import { pxPerInch } from '../src/core/calibration';

// Real target photos with hand-marked holes (see tests/fixtures/README.md).
const DIR = process.env.RFA_REAL ?? '/tmp/real';
const truthFile = `${DIR}/truth.json`;
type Truth = Record<string, { w: number; h: number; truth: [number, number, number][] }>;

describe.skipIf(!existsSync(truthFile))('real target photos', () => {
  const T: Truth = existsSync(truthFile) ? JSON.parse(readFileSync(truthFile, 'utf8')) : {};
  let tp = 0, fp = 0, fn = 0;
  for (const name of Object.keys(T)) {
    it(name, { timeout: 120000 }, () => {
      const { w, h, truth } = T[name];
      const src = new RgbArrayFrameSource(new Uint8Array(readFileSync(`${DIR}/${name}.rgb`)), w, h);
      const cal = detectRing(src, { diameterIn: 32 });
      expect(cal).not.toBeNull();
      const res = detectHoles(src, cal!, { holeDiameterIn: 0.3 });
      const tol = Math.max(14, pxPerInch(cal!) * 0.4);
      const used = new Set<number>();
      let hit = 0;
      for (const [x, y] of truth) {
        const k = res.holes.findIndex((d, i) => !used.has(i) && Math.hypot(d.p.x - x, d.p.y - y) < tol);
        if (k >= 0) (used.add(k), hit++);
      }
      const extra = res.holes.filter((_, i) => !used.has(i));
      tp += hit; fn += truth.length - hit; fp += extra.length;
      console.log(`${name}: ring c=(${cal!.center.x.toFixed(0)},${cal!.center.y.toFixed(0)}) r=${cal!.radiusX.toFixed(0)}/${cal!.radiusY.toFixed(0)} ppi=${pxPerInch(cal!).toFixed(1)} | found ${hit}/${truth.length}, false ${extra.length}`,
        extra.slice(0, 6).map((d) => `(${d.p.x.toFixed(0)},${d.p.y.toFixed(0)} ${d.polarity} ${d.confidence.toFixed(2)})`).join(' '),
        '| missed', truth.filter(([x, y]) => !res.holes.some((d) => Math.hypot(d.p.x - x, d.p.y - y) < tol)).map(([x, y]) => `(${x.toFixed(0)},${y.toFixed(0)})`).join(' '));
    });
  }
  it('summary', () => {
    console.log(`TOTAL found ${tp}/${tp + fn}, false ${fp}`);
  });
});
