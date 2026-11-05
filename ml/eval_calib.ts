/**
 * Calibration accuracy on rendered scenes with known geometry.
 *   npx jiti ml/eval_calib.ts DIR
 * For every hole: target-inch error of toTarget(found calibration) vs truth,
 * with perspective (H) and with the plain ellipse; ring found / missed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { RgbArrayFrameSource } from '../src/vision/frame';
import { findTarget } from '../src/vision/ringfinder';
import { toTarget, withoutPerspective } from '../src/core/calibration';
const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const errsH: number[] = [], errsA: number[] = [];
let found = 0, withH = 0, wrong = 0;
const radErr: number[] = [];
for (const f of files) {
  const m = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const src = new RgbArrayFrameSource(new Uint8Array(readFileSync(`${dir}/${f.replace('.json', '.rgb')}`)), m.w, m.h);
  const cal = findTarget(src, { diameterIn: 32 });
  if (!cal) continue;
  found++;
  if (cal.H) withH++;
  const [ex, ey, ea, eb] = m.ring;
  const rTrue = (ea + eb) / 2;
  const rel = Math.abs((cal.radiusX + cal.radiusY) / 2 - rTrue) / rTrue;
  radErr.push(rel);
  if (rel > 0.1 || Math.hypot(cal.center.x - ex, cal.center.y - ey) > 0.1 * rTrue) { wrong++; continue; }
  const aff = withoutPerspective(cal);
  for (const [x, y, xi, yi] of m.holes) {
    const a = toTarget(cal, { x, y });
    const b = toTarget(aff, { x, y });
    errsH.push(Math.hypot(a.x - xi, a.y - yi));
    errsA.push(Math.hypot(b.x - xi, b.y - yi));
  }
}
const q = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))] ?? NaN;
console.log(`scenes ${files.length}: ring found ${found}, wrong ring ${wrong}, perspective model ${withH}`);
console.log(`radius error: median ${(100 * q(radErr, 0.5)).toFixed(2)}%  90% ${(100 * q(radErr, 0.9)).toFixed(2)}%`);
console.log(`hole position error (in): with perspective median ${q(errsH, 0.5).toFixed(3)} 90% ${q(errsH, 0.9).toFixed(3)} max ${q(errsH, 1).toFixed(3)} | ellipse only median ${q(errsA, 0.5).toFixed(3)} 90% ${q(errsA, 0.9).toFixed(3)} max ${q(errsA, 1).toFixed(3)}`);
