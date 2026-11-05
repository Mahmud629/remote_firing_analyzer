import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { synthTarget } from './synthetic';
import { ArrayFrameSource, RgbArrayFrameSource } from '../src/vision/frame';
import { findTarget, homographyFromRing } from '../src/vision/ringfinder';
import { fitEllipseRansac } from '../src/vision/conic';
import { toImage, toTarget, targetCentre, withoutPerspective } from '../src/core/calibration';
import type { Calibration } from '../src/core/types';

/* ---------------------------------------------------------------- geometry */

describe('calibration geometry', () => {
  it('rotated ellipse: image <-> target round trip', () => {
    const cal: Calibration = { center: { x: 400, y: 300 }, radiusX: 250, radiusY: 200, angle: 0.3, diameterIn: 32, method: 'auto', confidence: 1 };
    for (const p of [{ x: 0, y: 0 }, { x: 5, y: -3 }, { x: -12, y: 9 }]) {
      const q = toTarget(cal, toImage(cal, p));
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(1e-9);
    }
    // the ring itself maps to radius 16
    const ring = toTarget(cal, { x: 400 + 250 * Math.cos(0.3), y: 300 + 250 * Math.sin(0.3) });
    expect(Math.hypot(ring.x, ring.y)).toBeCloseTo(16, 6);
  });

  it('perspective homography: ring -> ellipse, centre -> centre, round trip', () => {
    const e = { cx: 500, cy: 400, a: 300, b: 240, angle: 0.1 };
    const centre = { x: 507, y: 391 };
    const H = homographyFromRing(e, centre, 32)!;
    expect(H).not.toBeNull();
    const cal: Calibration = { center: { x: e.cx, y: e.cy }, radiusX: e.a, radiusY: e.b, angle: e.angle, diameterIn: 32, method: 'auto', confidence: 1, H };
    const c = targetCentre(cal);
    expect(Math.hypot(c.x - centre.x, c.y - centre.y)).toBeLessThan(1e-6);
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * 2 * Math.PI;
      const p = toImage(cal, { x: 16 * Math.cos(t), y: 16 * Math.sin(t) });
      // point lies on the ellipse
      const dx = p.x - e.cx;
      const dy = p.y - e.cy;
      const u = dx * Math.cos(e.angle) + dy * Math.sin(e.angle);
      const v = -dx * Math.sin(e.angle) + dy * Math.cos(e.angle);
      expect(Math.hypot(u / e.a, v / e.b)).toBeCloseTo(1, 6);
      const back = toTarget(cal, p);
      expect(Math.hypot(back.x - 16 * Math.cos(t), back.y - 16 * Math.sin(t))).toBeLessThan(1e-6);
    }
    // target "up" appears above the centre
    const up = toImage(cal, { x: 0, y: 10 });
    expect(up.y).toBeLessThan(c.y);
    expect(Math.abs(up.x - c.x)).toBeLessThan(0.02 * (c.y - up.y));
    expect(withoutPerspective(cal).H).toBeUndefined();
  });

  it('RANSAC ellipse ignores 40% outliers', () => {
    const xs: number[] = [];
    const ys: number[] = [];
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const t = (i / 300) * 2 * Math.PI;
      if (i % 5 < 2) {
        xs.push(200 + r() * 400);
        ys.push(100 + r() * 300);
      } else {
        const u = 180 * Math.cos(t);
        const v = 120 * Math.sin(t);
        xs.push(400 + u * Math.cos(0.4) - v * Math.sin(0.4) + (r() - 0.5));
        ys.push(250 + u * Math.sin(0.4) + v * Math.cos(0.4) + (r() - 0.5));
      }
    }
    const f = fitEllipseRansac(xs, ys, { tol: 2 })!;
    expect(Math.abs(f.cx - 400)).toBeLessThan(0.5);
    expect(Math.abs(f.cy - 250)).toBeLessThan(0.5);
    expect(Math.abs(f.a - 180)).toBeLessThan(0.7);
    expect(Math.abs(f.b - 120)).toBeLessThan(0.7);
  });
});

/* ---------------------------------------------------------------- target finder */

describe('target finder', () => {
  it('finds the ring in a 720p frame (same accuracy as before)', () => {
    const img = synthTarget({ w: 1280, h: 720, cx: 655.3, cy: 362.8, rPx: 300 });
    const cal = findTarget(new ArrayFrameSource(img), { diameterIn: 32 })!;
    expect(cal).not.toBeNull();
    expect(Math.abs(cal.center.x - 655.3)).toBeLessThan(1.5);
    expect(Math.abs(cal.center.y - 362.8)).toBeLessThan(1.5);
    // the finder sits on the middle of the printed line (synthetic line 0.1 in wide)
    expect(Math.abs(cal.radiusX - 300) / 300).toBeLessThan(0.01);
  });

  it('handles a camera looking up at the target (vertical squeeze)', () => {
    const img = synthTarget({ w: 1280, h: 720, cx: 600, cy: 380, rPx: 310, aspect: 0.88 });
    const cal = findTarget(new ArrayFrameSource(img), { diameterIn: 32 })!;
    expect(cal).not.toBeNull();
    const big = Math.max(cal.radiusX, cal.radiusY);
    const small = Math.min(cal.radiusX, cal.radiusY);
    expect(Math.abs(big - 310) / 310).toBeLessThan(0.012);
    expect(Math.abs(small - 310 * 0.88) / (310 * 0.88)).toBeLessThan(0.012);
  });

  it('returns null when there is no target', () => {
    const img = synthTarget({ w: 640, h: 480, cx: -5000, cy: -5000, rPx: 100 });
    expect(findTarget(new ArrayFrameSource(img), { diameterIn: 32 })).toBeNull();
  });

  const range = '/tmp/range/range1.rgb';
  it.skipIf(!existsSync(range))('range camera frame: locks on the printed outer ring, not the board', () => {
    const src = new RgbArrayFrameSource(new Uint8Array(readFileSync(range)), 502, 394);
    const cal = findTarget(src, { diameterIn: 32 })!;
    expect(cal).not.toBeNull();
    // measured by hand on the picture: centre ~(253, 187), radii ~126 x 111
    expect(Math.abs(cal.center.x - 253)).toBeLessThan(3);
    expect(Math.abs(cal.center.y - 187)).toBeLessThan(3);
    expect(Math.abs(Math.max(cal.radiusX, cal.radiusY) - 126)).toBeLessThan(4);
    expect(Math.abs(Math.min(cal.radiusX, cal.radiusY) - 111)).toBeLessThan(4);
  });

  const truthFile = '/tmp/real/truth.json';
  it.skipIf(!existsSync(truthFile))('real close-up photos: ring found on all', { timeout: 120000 }, () => {
    const T = JSON.parse(readFileSync(truthFile, 'utf8')) as Record<string, { w: number; h: number }>;
    for (const [name, t] of Object.entries(T)) {
      const cal = findTarget(new RgbArrayFrameSource(new Uint8Array(readFileSync(`/tmp/real/${name}.rgb`)), t.w, t.h), { diameterIn: 32 });
      expect(cal, name).not.toBeNull();
      expect(cal!.confidence, name).toBeGreaterThan(0.6);
    }
  });

  const synDir = '/tmp/syntest';
  it.skipIf(!existsSync(synDir))('rendered range scenes: position error with perspective', { timeout: 600000 }, () => {
    const files = readdirSync(synDir).filter((f) => f.endsWith('.json')).sort().slice(0, 30);
    const errs: number[] = [];
    let found = 0;
    for (const f of files) {
      const m = JSON.parse(readFileSync(`${synDir}/${f}`, 'utf8'));
      const cal = findTarget(new RgbArrayFrameSource(new Uint8Array(readFileSync(`${synDir}/${f.replace('.json', '.rgb')}`)), m.w, m.h), { diameterIn: 32 });
      if (!cal) continue;
      found++;
      for (const [x, y, xi, yi] of m.holes) {
        const p = toTarget(cal, { x, y });
        errs.push(Math.hypot(p.x - xi, p.y - yi));
      }
    }
    errs.sort((a, b) => a - b);
    const med = errs[errs.length >> 1];
    console.log(`rendered scenes: ring found ${found}/${files.length}, hole position error median ${med.toFixed(3)} in, 90% ${errs[Math.floor(errs.length * 0.9)].toFixed(3)} in`);
    expect(found).toBe(files.length);
    expect(med).toBeLessThan(0.25);
  });
});

/* ---------------------------------------------------------------- live engine */

import { RingLock } from '../src/vision/tracker';
import { LiveEngine, type LiveTrackOut } from '../src/vision/live_engine';
import { changeVerifier } from '../src/vision/change_ml';

function replay(dir: string) {
  const m = JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8'));
  const lock = new RingLock();
  const engine = new LiveEngine({ holeDiameterIn: 0.3, sensitivity: 0.5 }, changeVerifier);
  let locked = false;
  let holes: LiveTrackOut[] = [];
  const countedAt = new Map<string, number>();
  for (let f = 0; f < m.frames; f++) {
    const src = new RgbArrayFrameSource(new Uint8Array(readFileSync(`${dir}/f${String(f).padStart(3, '0')}.rgb`)), m.w, m.h);
    if (!locked || f % 5 === 0) {
      const st = lock.update(findTarget(src, { diameterIn: 32 }));
      if (st.event === 'locked') engine.reset(st.calibration!);
      locked = !!lock.calibration;
    }
    if (!locked) continue;
    const r = engine.step(src);
    holes = r.holes;
    for (const id of r.newlyCounted) countedAt.set(id, f);
  }
  const counted = holes.filter((h) => h.confirmed && !h.previous);
  return { m, counted, countedAt };
}

describe('live counting (change detection + ChangeNet)', () => {
  // sequences made from the REAL range-camera frame (ml/real_seq.py): 2 px holes
  for (const name of ['r1', 'r2', 'r3']) {
    const dir = `/tmp/rseq/${name}`;
    it.skipIf(!existsSync(`${dir}/meta.json`))(`real range picture ${name}: counts every new 2 px hole, nothing else`, { timeout: 300000 }, () => {
      const { m, counted, countedAt } = replay(dir);
      const first = Math.min(...m.shots.map((s: { frame: number }) => s.frame));
      expect(counted.length).toBe(m.shots.length);
      for (const t of counted) expect(countedAt.get(t.id)!).toBeGreaterThanOrEqual(first);
      for (const s of m.shots) expect(counted.some((t) => Math.hypot(t.p.x - s.px[0], t.p.y - s.px[1]) < 3)).toBe(true);
    });
  }
  it.skipIf(!existsSync('/tmp/rseq/none/meta.json'))('real range picture, no firing: counts nothing (old hole, wrinkles, lines ignored)', { timeout: 300000 }, () => {
    expect(replay('/tmp/rseq/none').counted.length).toBe(0);
  });
  for (const name of ['n3101', 'n3102']) {
    const dir = `/tmp/seqev/${name}`;
    it.skipIf(!existsSync(`${dir}/meta.json`))(`rendered, no firing, with shadow / insect / bump (${name}): counts nothing`, { timeout: 300000 }, () => {
      expect(replay(dir).counted.length).toBe(0);
    });
  }
});

/* ---------------------------------------------------------------- photo detection on the user's real pictures */

import { detectHolesML } from '../src/vision/holes_ml';

describe('photo hole detection (HoleNet) on real pictures', () => {
  const truthFile = '/tmp/new/truth.json'; // close-up + raw CCTV frame of the range target, 2 holes each
  it.skipIf(!existsSync(truthFile))('marks exactly the real holes at the default setting (no creases, folds or sheet edge)', { timeout: 120000 }, () => {
    const T = JSON.parse(readFileSync(truthFile, 'utf8')) as Record<string, { w: number; h: number; holes: number[][] }>;
    for (const [name, t] of Object.entries(T)) {
      const src = new RgbArrayFrameSource(new Uint8Array(readFileSync(`/tmp/new/${name}.rgb`)), t.w, t.h);
      const cal = findTarget(src, { diameterIn: 32 })!;
      const res = detectHolesML(src, cal, { holeDiameterIn: 0.3, sensitivity: 0.5 });
      expect(res.holes.length, name).toBe(t.holes.length);
      for (const [x, y] of t.holes) expect(res.holes.some((h) => Math.hypot(h.p.x - x, h.p.y - y) < 4), `${name} hole ${x},${y}`).toBe(true);
    }
  });
});
