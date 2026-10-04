import { boxBlur, type Gray } from '../src/vision/image';
import type { Vec2 } from '../src/core/types';

export interface SynthOptions {
  w: number;
  h: number;
  cx: number;
  cy: number;
  rPx: number; // outer ring radius in px (horizontal)
  aspect?: number; // vertical / horizontal scale (perspective squeeze)
  holes?: Vec2[]; // inches, y up
  holeDiaIn?: number;
  /** optional per-hole diameters (in) */
  holeSizes?: number[];
  rings?: number[]; // radii in inches
  lineIn?: number;
  bullIn?: number; // radius of the black aiming mark
  noise?: number;
  seed?: number;
  holeTone?: { onPaper: number; onBull: number };
}

/** Renders a grayscale zeroing target on a textured background. */
export function synthTarget(o: SynthOptions): Gray {
  const { w, h, cx, cy, rPx } = o;
  const aspect = o.aspect ?? 1;
  const ppi = rPx / 16;
  const rings = o.rings ?? [16, 13, 10, 7];
  const line = o.lineIn ?? 0.1;
  const bull = o.bullIn ?? 3;
  const holeR = (o.holeDiaIn ?? 0.3) / 2;
  const holes = o.holes ?? [];
  let seed = o.seed ?? 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const d = new Float32Array(w * h);
  const aa = (dist: number) => Math.max(0, Math.min(1, 0.5 - dist * ppi)); // inches -> coverage
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x - cx) / ppi);
      const v = -((y - cy) / (ppi * aspect));
      const rho = Math.hypot(u, v);
      // background: berm texture
      let val = 95 + 25 * Math.sin(x * 0.05) * Math.cos(y * 0.07) + 10 * Math.sin((x + y) * 0.21);
      const paper = Math.max(Math.abs(u), Math.abs(v)) <= 18.5;
      if (paper) {
        val = 222 - 6 * (rho / 18);
        for (const R of rings) {
          const cov = aa(Math.abs(rho - R) - line / 2);
          val = val * (1 - cov) + 30 * cov;
        }
        const bc = aa(rho - bull);
        val = val * (1 - bc) + 22 * bc;
        for (let hi = 0; hi < holes.length; hi++) {
          const hp = holes[hi];
          const hc = aa(Math.hypot(u - hp.x, v - hp.y) - (o.holeSizes?.[hi] != null ? o.holeSizes[hi] / 2 : holeR));
          if (hc > 0) {
            const inBull = Math.hypot(hp.x, hp.y) < bull;
            const tone = inBull ? (o.holeTone?.onBull ?? 190) : (o.holeTone?.onPaper ?? 40);
            val = val * (1 - hc) + tone * hc;
          }
        }
      }
      d[y * w + x] = val;
    }
  }
  const blurred = boxBlur({ w, h, d }, 1);
  const n = o.noise ?? 4;
  for (let i = 0; i < blurred.d.length; i++) blurred.d[i] = Math.max(0, Math.min(255, blurred.d[i] + gauss() * n));
  return blurred;
}
