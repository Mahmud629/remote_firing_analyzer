/**
 * Tiny convolutional network inference in plain TypeScript.
 *
 * The hole models are small (tens of thousands of weights), so they run fast
 * enough on the CPU inside the vision Web Worker without WebGL or WASM, and the
 * app keeps working fully offline. Layers: 3x3 convolution (zero padding,
 * cross-correlation, like jax.lax.conv 'SAME') + ReLU, 2x2 max-pool,
 * dense (+ ReLU except the last). Weights come from ml/train_*.py.
 */
export interface ModelSpec {
  name: string;
  input: [number, number, number];
  layers: (
    | { type: 'conv'; cin: number; cout: number; w: string; b: string }
    | { type: 'pool' }
    | { type: 'dense'; nin: number; nout: number; relu: boolean; w: string; b: string }
  )[];
  probe?: { input: string; prob: number[] };
  trained?: string;
  final?: boolean;
}

type Layer =
  | { type: 'conv'; cin: number; cout: number; w: Float32Array; b: Float32Array }
  | { type: 'pool' }
  | { type: 'dense'; nin: number; nout: number; relu: boolean; w: Float32Array; b: Float32Array };

export function decodeF32(b64: string): Float32Array {
  let bin: string;
  if (typeof atob === 'function') bin = atob(b64);
  else bin = Buffer.from(b64, 'base64').toString('binary');
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer);
}

export class TinyCNN {
  private layers: Layer[];
  readonly c: number;
  readonly h: number;
  readonly w: number;
  private bufA: Float32Array;
  private bufB: Float32Array;

  constructor(spec: ModelSpec) {
    [this.c, this.h, this.w] = spec.input;
    this.layers = spec.layers.map((l) => (l.type === 'pool' ? l : { ...l, w: decodeF32(l.w), b: decodeF32(l.b) })) as Layer[];
    // largest activation size
    let c = this.c;
    let h = this.h;
    let w = this.w;
    let max = c * h * w;
    for (const l of this.layers) {
      if (l.type === 'conv') c = l.cout;
      else if (l.type === 'pool') {
        h >>= 1;
        w >>= 1;
      } else {
        c = l.nout;
        h = 1;
        w = 1;
      }
      max = Math.max(max, c * h * w);
    }
    this.bufA = new Float32Array(max);
    this.bufB = new Float32Array(max);
  }

  /** Logit for one input (channel-major c*h*w). */
  logit(input: Float32Array): number {
    let src = this.bufA;
    let dst = this.bufB;
    src.set(input);
    let c = this.c;
    let h = this.h;
    let w = this.w;
    for (const l of this.layers) {
      if (l.type === 'conv') {
        conv3x3Relu(src, dst, l.cin, h, w, l.cout, l.w, l.b);
        c = l.cout;
      } else if (l.type === 'pool') {
        const h2 = h >> 1;
        const w2 = w >> 1;
        for (let ch = 0; ch < c; ch++) {
          const si = ch * h * w;
          const di = ch * h2 * w2;
          for (let y = 0; y < h2; y++)
            for (let x = 0; x < w2; x++) {
              const p = si + 2 * y * w + 2 * x;
              let m = src[p];
              if (src[p + 1] > m) m = src[p + 1];
              if (src[p + w] > m) m = src[p + w];
              if (src[p + w + 1] > m) m = src[p + w + 1];
              dst[di + y * w2 + x] = m;
            }
        }
        h = h2;
        w = w2;
      } else {
        const n = l.nin;
        for (let j = 0; j < l.nout; j++) {
          let s = l.b[j];
          for (let i = 0; i < n; i++) s += src[i] * l.w[i * l.nout + j];
          dst[j] = l.relu && s < 0 ? 0 : s;
        }
        c = l.nout;
        h = 1;
        w = 1;
      }
      const t = src;
      src = dst;
      dst = t;
    }
    return src[0];
  }

  prob(input: Float32Array): number {
    return 1 / (1 + Math.exp(-this.logit(input)));
  }
}

function conv3x3Relu(src: Float32Array, dst: Float32Array, cin: number, h: number, w: number, cout: number, W: Float32Array, B: Float32Array) {
  const hw = h * w;
  for (let co = 0; co < cout; co++) {
    const o = co * hw;
    const bias = B[co];
    for (let i = 0; i < hw; i++) dst[o + i] = bias;
    for (let ci = 0; ci < cin; ci++) {
      const s = ci * hw;
      const k = (co * cin + ci) * 9;
      const k0 = W[k], k1 = W[k + 1], k2 = W[k + 2], k3 = W[k + 3], k4 = W[k + 4], k5 = W[k + 5], k6 = W[k + 6], k7 = W[k + 7], k8 = W[k + 8];
      for (let y = 0; y < h; y++) {
        const row = s + y * w;
        const up = y > 0;
        const dn = y < h - 1;
        const out = o + y * w;
        for (let x = 0; x < w; x++) {
          const l = x > 0;
          const r = x < w - 1;
          const p = row + x;
          let v = k4 * src[p];
          if (l) v += k3 * src[p - 1];
          if (r) v += k5 * src[p + 1];
          if (up) {
            v += k1 * src[p - w];
            if (l) v += k0 * src[p - w - 1];
            if (r) v += k2 * src[p - w + 1];
          }
          if (dn) {
            v += k7 * src[p + w];
            if (l) v += k6 * src[p + w - 1];
            if (r) v += k8 * src[p + w + 1];
          }
          dst[out + x] += v;
        }
      }
    }
    for (let i = 0; i < hw; i++) if (dst[o + i] < 0) dst[o + i] = 0;
  }
}
