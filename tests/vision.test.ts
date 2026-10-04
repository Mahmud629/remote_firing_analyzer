import { describe, expect, it } from 'vitest';
import { synthTarget } from './synthetic';
import { ArrayFrameSource, RgbArrayFrameSource } from '../src/vision/frame';
import { detectRing } from '../src/vision/ring';
import { detectHoles } from '../src/vision/holes';
import { HoleTracker, RingLock } from '../src/vision/tracker';
import { toTarget } from '../src/core/calibration';

const HOLES = [
  { x: 1.2, y: 0.8 },   // inside the black aiming mark (light hole)
  { x: -2.6, y: 1.9 },
  { x: 0.4, y: -3.1 },
  { x: 3.05, y: -2.2 },
  { x: -7.0, y: 0.0 },  // on the 7 in ring line
];

describe('ring detection (auto calibration)', () => {
  it('finds the 32 in ring in a 720p frame', () => {
    const img = synthTarget({ w: 1280, h: 720, cx: 655.3, cy: 362.8, rPx: 300 });
    const t0 = performance.now();
    const cal = detectRing(new ArrayFrameSource(img), { diameterIn: 32 });
    const ms = performance.now() - t0;
    expect(cal).not.toBeNull();
    console.log('ring', cal, ms.toFixed(0) + 'ms');
    expect(Math.abs(cal!.center.x - 655.3)).toBeLessThan(1.5);
    expect(Math.abs(cal!.center.y - 362.8)).toBeLessThan(1.5);
    expect(Math.abs(cal!.radiusX - 300) / 300).toBeLessThan(0.008);
    expect(Math.abs(cal!.radiusY - 300) / 300).toBeLessThan(0.008);
  });

  it('handles a camera looking up at the target (vertical squeeze)', () => {
    const img = synthTarget({ w: 1280, h: 720, cx: 600, cy: 380, rPx: 310, aspect: 0.88 });
    const cal = detectRing(new ArrayFrameSource(img), { diameterIn: 32 })!;
    expect(cal).not.toBeNull();
    expect(Math.abs(cal.radiusX - 310) / 310).toBeLessThan(0.01);
    expect(Math.abs(cal.radiusY - 310 * 0.88) / (310 * 0.88)).toBeLessThan(0.01);
  });

  it('works on a large still photo', () => {
    const img = synthTarget({ w: 3000, h: 2250, cx: 1490, cy: 1130, rPx: 1000, noise: 6 });
    const cal = detectRing(new ArrayFrameSource(img), { diameterIn: 32 })!;
    expect(cal).not.toBeNull();
    expect(Math.abs(cal.radiusX - 1000) / 1000).toBeLessThan(0.006);
  });

  it('returns null when there is no target', () => {
    const img = synthTarget({ w: 640, h: 480, cx: -5000, cy: -5000, rPx: 100 });
    expect(detectRing(new ArrayFrameSource(img), { diameterIn: 32 })).toBeNull();
  });
});

describe('hole detection', () => {
  it('finds every hole including one in the aiming mark and one on a ring line', () => {
    const img = synthTarget({ w: 1920, h: 1080, cx: 960, cy: 540, rPx: 480, holes: HOLES });
    const src = new ArrayFrameSource(img);
    const cal = detectRing(src, { diameterIn: 32 })!;
    const t0 = performance.now();
    const res = detectHoles(src, cal, { holeDiameterIn: 0.3 });
    console.log('holes', res.holes.map((h) => [h.pIn.x.toFixed(2), h.pIn.y.toFixed(2), h.confidence.toFixed(2), h.polarity]), (performance.now() - t0).toFixed(0) + 'ms');
    expect(res.holes.length).toBe(HOLES.length);
    for (const want of HOLES) {
      const got = res.holes.find((h) => Math.hypot(h.pIn.x - want.x, h.pIn.y - want.y) < 0.15);
      expect(got, `hole at ${want.x},${want.y}`).toBeTruthy();
    }
  });

  it('splits two touching holes', () => {
    const holes = [{ x: 2, y: 5 }, { x: 2.22, y: 5.05 }, { x: -4, y: -6 }];
    const img = synthTarget({ w: 1600, h: 1200, cx: 800, cy: 600, rPx: 520, holes });
    const src = new ArrayFrameSource(img);
    const cal = detectRing(src, { diameterIn: 32 })!;
    const res = detectHoles(src, cal, { holeDiameterIn: 0.3 });
    console.log('touching', res.holes.map((h) => [h.pIn.x.toFixed(2), h.pIn.y.toFixed(2), h.merged]));
    expect(res.holes.length).toBe(3);
    expect(res.holes.filter((h) => h.merged).length).toBe(2);
  });

  it('gives no false holes on a clean target', () => {
    const img = synthTarget({ w: 1280, h: 960, cx: 640, cy: 480, rPx: 420, noise: 6 });
    const src = new ArrayFrameSource(img);
    const cal = detectRing(src, { diameterIn: 32 })!;
    expect(detectHoles(src, cal, { holeDiameterIn: 0.3 }).holes.length).toBe(0);
  });

  it('positions are accurate to a few hundredths of an inch', () => {
    const img = synthTarget({ w: 1920, h: 1080, cx: 951, cy: 548, rPx: 500, holes: HOLES, aspect: 0.93 });
    const src = new ArrayFrameSource(img);
    const cal = detectRing(src, { diameterIn: 32 })!;
    const res = detectHoles(src, cal, { holeDiameterIn: 0.3 });
    let worst = 0;
    for (const want of HOLES) {
      const got = res.holes.reduce((a, b) => (Math.hypot(b.pIn.x - want.x, b.pIn.y - want.y) < Math.hypot(a.pIn.x - want.x, a.pIn.y - want.y) ? b : a));
      worst = Math.max(worst, Math.hypot(got.pIn.x - want.x, got.pIn.y - want.y));
    }
    console.log('worst position error (in)', worst.toFixed(3));
    expect(worst).toBeLessThan(0.08);
  });
});

describe('live tracking', () => {
  it('locks the ring after a steady run and counts holes once they persist', () => {
    const lock = new RingLock();
    const tracker = new HoleTracker();
    const frames = Array.from({ length: 12 }, (_, i) => i).map((i) =>
      synthTarget({ w: 960, h: 540, cx: 480 + (i % 2) * 0.4, cy: 270, rPx: 240, holes: i >= 2 ? HOLES.slice(0, 2) : [], seed: 11 + i }),
    );
    let state;
    let n = 0;
    for (const f of frames) {
      const src = new ArrayFrameSource(f);
      state = lock.update(detectRing(src, { diameterIn: 32 }));
      if (state.phase === 'locked') {
        const res = detectHoles(src, state.calibration!, { holeDiameterIn: 0.3 });
        tracker.update(res.holes.map((h) => ({ pIn: h.pIn, confidence: h.confidence, merged: h.merged })));
      }
      n++;
    }
    expect(state!.phase).toBe('locked');
    expect(tracker.current.length).toBe(2);
    tracker.startNewGroup();
    expect(tracker.current.length).toBe(0);
    expect(tracker.previous.length).toBe(2);
    expect(n).toBe(12);
  });

  it('maps image points to target inches with y up', () => {
    const cal = { center: { x: 100, y: 100 }, radiusX: 160, radiusY: 160, diameterIn: 32, method: 'auto' as const, confidence: 1 };
    expect(toTarget(cal, { x: 110, y: 90 })).toEqual({ x: 1, y: 1 });
  });
});

describe('harder conditions', () => {
  it('copes with uneven light, weak contrast and noise', () => {
    const holes = [{ x: -1.5, y: 2.2 }, { x: 2.4, y: 1.1 }, { x: 0.3, y: -2.5 }, { x: 4.6, y: -0.4 }, { x: -3.3, y: -1.7 }];
    const img = synthTarget({ w: 1920, h: 1080, cx: 1010, cy: 520, rPx: 450, holes, noise: 9, aspect: 0.93, holeTone: { onPaper: 110, onBull: 120 } });
    // lighting falls off towards the left edge
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) img.d[y * img.w + x] *= 0.6 + 0.4 * (x / img.w);
    const src = new ArrayFrameSource(img);
    const t0 = performance.now();
    const cal = detectRing(src, { diameterIn: 32 })!;
    const t1 = performance.now();
    const res = detectHoles(src, cal, { holeDiameterIn: 0.3 });
    const t2 = performance.now();
    console.log(`timing ring ${(t1 - t0).toFixed(0)}ms holes ${(t2 - t1).toFixed(0)}ms`, res.holes.map((h) => [h.pIn.x.toFixed(2), h.pIn.y.toFixed(2), h.confidence.toFixed(2)]));
    expect(cal).not.toBeNull();
    expect(Math.abs(cal.radiusX - 450) / 450).toBeLessThan(0.01);
    expect(res.holes.length).toBe(5);
  });
});

describe('hole size not fixed by calibre', () => {
  it('finds small (5.56 mm) and large torn holes when set for 7.62 mm', () => {
    const holes = [{ x: -3, y: 2 }, { x: 2.5, y: 1.5 }, { x: 0.5, y: -5 }, { x: -5, y: -4 }, { x: 5.5, y: -1.5 }];
    const sizes = [0.21, 0.22, 0.45, 0.5, 0.3];
    const img = synthTarget({ w: 1920, h: 1080, cx: 960, cy: 540, rPx: 480, holes, holeSizes: sizes, bullIn: 1.2 });
    const src = new ArrayFrameSource(img);
    const cal = detectRing(src, { diameterIn: 32 })!;
    const res = detectHoles(src, cal, { holeDiameterIn: 0.3 });
    console.log('mixed sizes', res.holes.map((h) => [h.pIn.x.toFixed(2), h.pIn.y.toFixed(2), h.diameterIn.toFixed(2)]));
    expect(res.holes.length).toBe(5);
    for (const want of holes) expect(res.holes.some((h) => Math.hypot(h.pIn.x - want.x, h.pIn.y - want.y) < 0.2)).toBe(true);
  });
});

describe('grayscale picture through the colour pipeline (night-vision CCTV)', () => {
  it('finds exactly the real holes and no extra marks', () => {
    const img = synthTarget({ w: 1920, h: 1080, cx: 960, cy: 540, rPx: 480, holes: HOLES });
    const rgb = new Uint8Array(img.w * img.h * 3);
    for (let i = 0; i < img.d.length; i++) rgb[3 * i] = rgb[3 * i + 1] = rgb[3 * i + 2] = Math.max(0, Math.min(255, Math.round(img.d[i])));
    const src = new RgbArrayFrameSource(rgb, img.w, img.h);
    const cal = detectRing(src, { diameterIn: 32 })!;
    const res = detectHoles(src, cal, { holeDiameterIn: 0.3 });
    expect(res.colourful).toBe(false);
    expect(res.holes.length).toBe(HOLES.length);
  });
});
