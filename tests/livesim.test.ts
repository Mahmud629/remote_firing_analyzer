import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ArrayFrameSource } from '../src/vision/frame';
import { detectRing } from '../src/vision/ring';
import { runPipeline } from '../src/vision/run';
import { HoleTracker, RingLock } from '../src/vision/tracker';

// Replays a rendered 40 s session (2 frames/s): 15 s clean target, then one shot every 3 s.
const TRUTH = [[1.1, 2.3], [-2.0, 0.9], [0.6, -1.7], [2.6, -0.6], [-0.9, -2.9]];
describe.skipIf(!existsSync('/tmp/e2e/seq/000.gray'))('live session replay', () => {
  it('locks, learns the clean target, then counts exactly the five new holes in order', { timeout: 180000 }, () => {
    const lock = new RingLock();
    const tracker = new HoleTracker(0.36);
    let learning = 0;
    const log: string[] = [];
    for (let i = 0; i < 80; i++) {
      const b = readFileSync(`/tmp/e2e/seq/${String(i).padStart(3, '0')}.gray`);
      const d = new Float32Array(1280 * 720);
      for (let k = 0; k < d.length; k++) d[k] = b[k];
      const src = new ArrayFrameSource({ w: 1280, h: 720, d });
      const locked = lock.calibration;
      const st = lock.update(detectRing(src, { diameterIn: 32 }));
      if (st.event === "locked") learning = 8;
      if (!locked) continue;
      // same code path as the worker (learning = several sensitivities, unioned)
      const res = runPipeline(src, { id: 0, findRing: false, findHoles: true, calibration: locked, diameterIn: 32, holeDiameterIn: 0.3, sensitivity: 0.5, minConfidence: 0.35, learn: learning > 0 });
      const dets = (res.holes ?? []).map((h) => ({ pIn: h.pIn, confidence: h.confidence, merged: h.merged }));
      if (learning) {
        tracker.learnBaseline(dets);
        learning--;
      } else tracker.update(dets);
      log.push(`${(i / 2).toFixed(1)}s counted=${tracker.current.length} checking=${tracker.all.filter((t) => !t.confirmed).length} printed=${tracker.previous.length}`);
    }
    console.log("PREV", JSON.stringify(tracker.previous.map((t) => [+t.pIn.x.toFixed(2), +t.pIn.y.toFixed(2)])));
    const cur = tracker.current;
    console.log(JSON.stringify(cur.map((t) => [t.seq, +t.pIn.x.toFixed(2), +t.pIn.y.toFixed(2)])));
    expect(cur.length).toBe(5);
    cur.forEach((t, k) => expect(Math.hypot(t.pIn.x - TRUTH[k][0], t.pIn.y - TRUTH[k][1])).toBeLessThan(0.4));
  });
});
