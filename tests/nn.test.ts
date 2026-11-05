import { describe, expect, it } from 'vitest';
import { TinyCNN, decodeF32 } from '../src/vision/nn';
import { HOLENET } from '../src/vision/models/holenet';
import { CHANGENET } from '../src/vision/models/changenet';
import { HOLENET_DARK } from '../src/vision/models/holenet_dark';

// The browser network must give exactly what the training framework gave.
describe('neural networks (TypeScript inference = training framework)', () => {
  for (const spec of [HOLENET, HOLENET_DARK, CHANGENET]) {
    it(`${spec.name}: probe outputs match`, () => {
      const net = new TinyCNN(spec);
      const x = decodeF32(spec.probe!.input);
      const n = spec.input[0] * spec.input[1] * spec.input[2];
      spec.probe!.prob.forEach((p, k) => {
        const got = net.prob(x.subarray(k * n, (k + 1) * n));
        expect(Math.abs(got - p)).toBeLessThan(1e-4);
      });
    });
  }
  it('runs fast enough for 250 candidates', () => {
    const net = new TinyCNN(HOLENET);
    const x = new Float32Array(3 * 32 * 32).map(() => Math.random() - 0.5);
    const t0 = performance.now();
    for (let i = 0; i < 250; i++) net.prob(x);
    const ms = performance.now() - t0;
    console.log(`HoleNet: 250 patches in ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(5000);
  });
});
