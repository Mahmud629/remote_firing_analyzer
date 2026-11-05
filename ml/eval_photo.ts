/**
 * End-to-end photo detection: findTarget -> candidates -> HoleNet.
 *   npx jiti ml/eval_photo.ts [--syn DIR] [--real name1,name2] [--range]
 * Prints found / missed / false marks per picture and in total at several
 * thresholds (sensitivity settings).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { RgbArrayFrameSource } from '../src/vision/frame';
import { findTarget } from '../src/vision/ringfinder';
import { detectHolesML } from '../src/vision/holes_ml';
import { pxPerInch } from '../src/core/calibration';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
type Item = { name: string; rgb: string; w: number; h: number; holes: number[][] };
const items: Item[] = [];
const real = opt('--real');
if (real) {
  const T = JSON.parse(readFileSync('/tmp/real/truth.json', 'utf8'));
  for (const n of real.split(',')) items.push({ name: n, rgb: `/tmp/real/${n}.rgb`, w: T[n].w, h: T[n].h, holes: T[n].truth.map((t: number[]) => t.slice(0, 2)) });
}
if (args.includes('--range')) items.push({ name: 'range1', rgb: '/tmp/range/range1.rgb', w: 502, h: 394, holes: [[202, 195]] });
const extra = opt('--truth');
if (extra) {
  const T = JSON.parse(readFileSync(extra, 'utf8'));
  const dir = extra.replace(/\/[^/]*$/, '');
  for (const [n, t] of Object.entries(T) as [string, { w: number; h: number; holes: number[][] }][]) items.push({ name: n, rgb: `${dir}/${n}.rgb`, w: t.w, h: t.h, holes: t.holes });
}
const syn = opt('--syn');
if (syn && existsSync(syn)) {
  for (const f of readdirSync(syn).filter((x) => x.endsWith('.json')).sort().slice(0, Number(opt('--n') ?? 40))) {
    const m = JSON.parse(readFileSync(`${syn}/${f}`, 'utf8'));
    items.push({ name: `${f.replace('.json', '')}(${m.kind},dh${m.dh.toFixed(1)})`, rgb: `${syn}/${f.replace('.json', '.rgb')}`, w: m.w, h: m.h, holes: m.holes.map((h: number[]) => h.slice(0, 2)) });
  }
}
const TH = [0.6, 0.75, 0.85, 0.9, 0.95];
const tot = TH.map(() => ({ found: 0, false: 0 }));
let holesTotal = 0;
let ms = 0;
for (const it of items) {
  const src = new RgbArrayFrameSource(new Uint8Array(readFileSync(it.rgb)), it.w, it.h);
  const t0 = performance.now();
  const cal = findTarget(src, { diameterIn: 32 });
  if (!cal) {
    console.log(`${it.name}: RING NOT FOUND`);
    holesTotal += it.holes.length;
    continue;
  }
  const res = detectHolesML(src, cal, { holeDiameterIn: 0.3, threshold: TH[0] });
  ms += performance.now() - t0;
  const tol = Math.max(3, pxPerInch(cal) * 0.3 * 0.9);
  holesTotal += it.holes.length;
  const line: string[] = [];
  TH.forEach((t, k) => {
    const dets = res.holes.filter((h) => h.confidence >= t);
    const used = new Set<number>();
    let found = 0;
    for (const [x, y] of it.holes) {
      const j = dets.findIndex((d, i) => !used.has(i) && Math.hypot(d.p.x - x, d.p.y - y) <= tol);
      if (j >= 0) (used.add(j), found++);
    }
    const fp = dets.length - used.size;
    tot[k].found += found;
    tot[k].false += fp;
    line.push(`t${t}: ${found}/${it.holes.length} +${fp}`);
  });
  console.log(`${it.name}: ${line.join(' | ')} | ${res.scored} candidates, ${res.ms.toFixed(0)} ms`);
}
console.log(`TOTAL ${items.length} pictures, ${holesTotal} holes: ` + TH.map((t, k) => `t${t}: found ${tot[k].found} (${((100 * tot[k].found) / Math.max(1, holesTotal)).toFixed(1)}%), false ${tot[k].false}`).join(' | ') + ` | ${(ms / Math.max(1, items.length)).toFixed(0)} ms/picture`);
