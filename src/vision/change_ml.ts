import { TinyCNN } from './nn';
import { CHANGENET } from './models/changenet';

/**
 * ChangeNet: decides whether the difference between the learned target
 * (before) and the current frame (after) at a candidate spot is a new bullet
 * hole, or misalignment / light change / compression noise / a shadow edge.
 * Input: 2 x 32 x 32 luma, both minus the median of `before`, divided by 48
 * (must match ml/train_changenet.py).
 */
let net: TinyCNN | null = null;
const buf = new Float32Array(2 * 32 * 32);
const tmp = new Float32Array(32 * 32);

export function changeVerifier(before: Float32Array, after: Float32Array, size: number): number {
  net ??= new TinyCNN(CHANGENET);
  const n = size * size;
  tmp.set(before.subarray(0, n));
  tmp.sort();
  const med = tmp[n >> 1];
  for (let i = 0; i < n; i++) {
    buf[i] = (before[i] - med) / 48;
    buf[n + i] = (after[i] - med) / 48;
  }
  return net.prob(buf);
}
