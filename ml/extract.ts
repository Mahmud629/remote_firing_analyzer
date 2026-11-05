/**
 * Builds training patches with the SAME code the app runs (candidate finder +
 * patch sampler), so the network is trained on exactly what it will see.
 *
 *   npx jiti ml/extract.ts <list.json> <out-prefix> [--gt-cal]
 *
 * list.json: [{ rgb, w, h, holes: [[x, y], ...], ring?: [cx, cy, a, b, angleDeg] }]
 * Writes <out>.u8 (N x 3 x 48 x 48 uint8) and <out>.json (labels + info).
 * label 1 = candidate on a hole, 0 = not a hole; ambiguous ones are skipped.
 */
import { readFileSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { RgbArrayFrameSource } from '../src/vision/frame';
import { findTarget } from '../src/vision/ringfinder';
import { findCandidates, makeWorkView, rawPatch, toWork } from '../src/vision/candidates';
import type { Calibration } from '../src/core/types';

const STORE = 48;
const [listPath, outPrefix] = process.argv.slice(2);
const useGtCal = process.argv.includes('--gt-cal');
/** keep every negative (real pictures: each crease and print detail is a valuable example) */
const allNeg = process.argv.includes('--all-neg');
const list: { rgb: string; w: number; h: number; holes: number[][]; ring?: number[]; tag?: string }[] = JSON.parse(readFileSync(listPath, 'utf8'));

const fd = openSync(`${outPrefix}.u8`, 'w');
const info: number[][] = [];
let pos = 0, neg = 0, holesTotal = 0, holesHit = 0, calFail = 0;
const buf = new Float32Array(3 * STORE * STORE);
const bytes = new Uint8Array(3 * STORE * STORE);

list.forEach((item, si) => {
  const src = new RgbArrayFrameSource(new Uint8Array(readFileSync(item.rgb)), item.w, item.h);
  let cal: Calibration | null = null;
  if (useGtCal && item.ring) {
    const [cx, cy, a, b, ang] = item.ring;
    cal = { center: { x: cx, y: cy }, radiusX: a, radiusY: b, angle: (ang * Math.PI) / 180, diameterIn: 32, method: 'auto', confidence: 1 };
  } else cal = findTarget(src, { diameterIn: 32 });
  if (!cal) {
    calFail++;
    return;
  }
  const wv = makeWorkView(src, cal, 0.3);
  const cands = findCandidates(wv, { max: 400, zMin: 3 });
  const holes = item.holes.map(([x, y]) => toWork(wv, { x, y }));
  holesTotal += holes.length;
  const hit = new Set<number>();
  // keep every positive, the hardest negatives and a random sample of the rest
  const maxHardNeg = 50;
  const maxRandNeg = 30;
  let hardNeg = 0;
  const randomKeep = Math.min(1, maxRandNeg / Math.max(1, cands.length - maxHardNeg));
  let seed = si * 7919 + 17;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const c of cands) {
    let best = Infinity;
    let bi = -1;
    holes.forEach((hh, k) => {
      const d = Math.hypot(hh.x - c.x, hh.y - c.y);
      if (d < best) (best = d), (bi = k);
    });
    let label = -1;
    if (best <= 0.8 * wv.dH) label = 1;
    else if (best >= 1.3 * wv.dH) label = 0;
    if (label < 0) continue;
    if (label === 1) {
      if (hit.has(bi)) continue; // one positive per hole
      hit.add(bi);
      pos++;
    } else {
      if (allNeg) {
        /* keep */
      } else if (hardNeg < maxHardNeg) hardNeg++;
      else if (rnd() > randomKeep) continue;
      neg++;
    }
    rawPatch(wv, c.x, c.y, STORE, buf);
    for (let i = 0; i < buf.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(buf[i])));
    writeSync(fd, bytes);
    info.push([label, +c.z.toFixed(2), c.kind, +wv.dH.toFixed(2), si, +wv.dHsrc.toFixed(2)]);
  }
  holesHit += hit.size;
});
closeSync(fd);
writeFileSync(`${outPrefix}.json`, JSON.stringify({ store: STORE, info }));
console.log(`${listPath}: scenes ${list.length} (ring not found ${calFail}) | holes ${holesTotal}, reached by candidates ${holesHit} (${((100 * holesHit) / Math.max(1, holesTotal)).toFixed(1)}%) | patches pos ${pos} neg ${neg}`);
