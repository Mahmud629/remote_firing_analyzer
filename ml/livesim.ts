/**
 * Replays a rendered live sequence through the same code the app runs:
 * ring lock (findTarget) -> LiveEngine (learn, align, compare, verify, track).
 *
 *   npx jiti ml/livesim.ts DIR [DIR...] [--net] [--dump OUT]
 * Prints per sequence: counted vs fired, false counts, counts before the first
 * shot, and the frame each shot was counted.
 */
import { readFileSync, existsSync, openSync, writeSync, closeSync, writeFileSync } from 'node:fs';
import { RgbArrayFrameSource } from '../src/vision/frame';
import { findTarget } from '../src/vision/ringfinder';
import { RingLock } from '../src/vision/tracker';
import { LiveEngine } from '../src/vision/live_engine';
import { toTarget } from '../src/core/calibration';

const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--') && existsSync(`${a}/meta.json`));
const useNet = process.argv.includes('--net');
const dumpOut = process.argv.includes('--dump') ? process.argv[process.argv.indexOf('--dump') + 1] : null;
const dumpFd = dumpOut ? openSync(`${dumpOut}.u8`, 'w') : null;
const dumpInfo: number[][] = [];
let verifier: ((a: Float32Array, b: Float32Array, s: number) => number) | null = null;
if (useNet) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { changeVerifier } = await import('../src/vision/change_ml');
  verifier = changeVerifier;
}
let tot = { fired: 0, counted: 0, matched: 0, falseCounts: 0, early: 0, seqs: 0, perfect: 0 };
for (const dir of dirs) {
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8'));
  const { w, h, frames } = meta;
  const lock = new RingLock();
  const engine = new LiveEngine({ holeDiameterIn: 0.3, sensitivity: dumpOut ? 0.9 : 0.5 }, verifier);
  let curFrame = 0;
  if (dumpFd !== null) {
    const shotsAll = meta.shots as { frame: number; px: number[] }[];
    const ins = meta.events?.insect as number[] | undefined;
    const bytes = new Uint8Array(2 * 32 * 32);
    engine.collect = (before, after, x, y, z) => {
      const s = engine.workToSource(x, y);
      const dhSrc = meta.dh as number;
      let label = 0;
      let nearest = Infinity;
      for (const sh of shotsAll) {
        if (sh.frame > curFrame) continue;
        nearest = Math.min(nearest, Math.hypot(sh.px[0] - s.x, sh.px[1] - s.y));
      }
      if (nearest <= 0.9 * dhSrc + 1) label = 1;
      else if (nearest < 2.5 * dhSrc + 1) return; // ambiguous
      if (ins && curFrame >= ins[0] - 1 && curFrame <= ins[1] + 1) return; // insect frames: not a label we can trust
      for (let i = 0; i < 1024; i++) {
        bytes[i] = Math.max(0, Math.min(255, Math.round(before[i])));
        bytes[1024 + i] = Math.max(0, Math.min(255, Math.round(after[i])));
      }
      writeSync(dumpFd, bytes);
      dumpInfo.push([label, +z.toFixed(2), dirs.indexOf(dir), curFrame, +dhSrc.toFixed(2)]);
    };
  }
  let locked = false;
  const log: string[] = [];
  const countedAt = new Map<string, number>();
  let ms = 0;
  let lastHoles: import('../src/vision/live_engine').LiveTrackOut[] | null = null;
  for (let f = 0; f < frames; f++) {
    const src = new RgbArrayFrameSource(new Uint8Array(readFileSync(`${dir}/f${String(f).padStart(3, '0')}.rgb`)), w, h);
    if (!locked || f % 5 === 0) {
      const st = lock.update(findTarget(src, { diameterIn: 32 }));
      if (st.event === 'locked' || st.event === 'moved') {
        if (st.event === 'locked') engine.reset(st.calibration!);
        log.push(`f${f}:${st.event}`);
      }
      locked = !!lock.calibration;
      if (st.event === 'moved') locked = false;
    }
    if (!locked) continue;
    const t0 = performance.now();
    curFrame = f;
    const r = engine.step(src);
    lastHoles = r.holes;
    ms += performance.now() - t0;
    for (const id of r.newlyCounted) countedAt.set(id, f);
    if (r.relearned) log.push(`f${f}:relearn`);
    if (r.withdrawn.length) log.push(`f${f}:withdrawn${r.withdrawn.length}`);
    if (r.phase === 'unstable') log.push(`f${f}:unstable(${(r.changed * 100).toFixed(1)}%)`);
  }
  const cal = lock.calibration;
  const counted = (lastHoles ?? []).filter((h) => h.confirmed && !h.previous);
  const shots = meta.shots as { frame: number; x: number; y: number; px: number[] }[];
  const firstShot = shots.length ? Math.min(...shots.map((s) => s.frame)) : Infinity;
  const usedShot = new Set<number>();
  let matched = 0, falseC = 0, early = 0;
  const rows: string[] = [];
  for (const t of counted) {
    const f = countedAt.get(t.id) ?? -1;
    if (f < firstShot) early++;
    let best = -1, bd = meta.real ? 4 : 0.7; // px for real-picture sequences, else inches
    shots.forEach((s, k) => {
      const d = meta.real ? Math.hypot(s.px[0] - t.p.x, s.px[1] - t.p.y) : Math.hypot(s.x - t.pIn.x, s.y - t.pIn.y);
      if (!usedShot.has(k) && s.frame <= f && d < bd) (bd = d), (best = k);
    });
    if (best >= 0) {
      usedShot.add(best);
      matched++;
      rows.push(`#${t.seq}@f${f}=shot${best}(f${shots[best].frame},err ${bd.toFixed(2)}${meta.real ? 'px' : 'in'})`);
    } else {
      falseC++;
      rows.push(`#${t.seq}@f${f}=FALSE(${t.pIn.x.toFixed(1)},${t.pIn.y.toFixed(1)}in @px ${t.p.x.toFixed(0)},${t.p.y.toFixed(0)})`);
    }
  }
  const missed = shots.filter((_, k) => !usedShot.has(k)).map((s) => (meta.real ? `(px ${s.px[0].toFixed(0)},${s.px[1].toFixed(0)})@f${s.frame}` : `(${s.x.toFixed(1)},${s.y.toFixed(1)})@f${s.frame}`));
  const ok = matched === shots.length && falseC === 0;
  tot = { fired: tot.fired + shots.length, counted: tot.counted + counted.length, matched: tot.matched + matched, falseCounts: tot.falseCounts + falseC, early: tot.early + early, seqs: tot.seqs + 1, perfect: tot.perfect + (ok ? 1 : 0) };
  console.log(`${ok ? 'OK ' : 'BAD'} ${dir.split('/').pop()} ${meta.kind} dh=${meta.dh.toFixed(1)}px ${w}x${h} | fired ${shots.length} counted ${counted.length} matched ${matched} false ${falseC} early ${early} | ${(ms / frames).toFixed(0)}ms/frame | ring ${cal ? 'ok' : 'NONE'} | ${rows.join(' ')}${missed.length ? ' | missed ' + missed.join(' ') : ''}`);
  if (process.argv.includes('-v')) console.log('   ', log.join(' '));
  void toTarget;
}
if (dumpFd !== null) {
  closeSync(dumpFd);
  writeFileSync(`${dumpOut}.json`, JSON.stringify({ info: dumpInfo }));
  console.log(`dump: ${dumpInfo.length} pairs, positive ${dumpInfo.filter((r) => r[0] === 1).length}`);
}
console.log(`TOTAL sequences ${tot.seqs}, perfect ${tot.perfect} | fired ${tot.fired}, counted ${tot.counted}, matched ${tot.matched}, false ${tot.falseCounts}, before-first-shot ${tot.early}`);
void openSync; void writeSync; void closeSync; void writeFileSync;
