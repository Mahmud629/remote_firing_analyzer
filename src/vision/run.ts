import { detectRing } from './ring';
import { detectHoles } from './holes';
import type { FrameSource } from './frame';
import type { VisionRequest, VisionResponse } from './protocol';

/** One pass of the pipeline: ring (calibration) -> holes. Shared by worker and fallback. */
export function runPipeline(src: FrameSource, req: Omit<VisionRequest, 'bitmap'>): VisionResponse {
  const t0 = performance.now();
  const ring = req.findRing ? detectRing(src, { diameterIn: req.diameterIn }) : null;
  const cal = req.calibration ?? ring;
  let holes: VisionResponse['holes'] = null;
  let lowResolution = false;
  if (req.findHoles && cal) {
    const levels = req.learn ? [req.sensitivity, Math.max(0, req.sensitivity - 0.2), Math.min(1, req.sensitivity + 0.2)] : [req.sensitivity];
    holes = [] as NonNullable<VisionResponse['holes']>;
    for (const sensitivity of levels) {
      const res = detectHoles(src, cal, {
        holeDiameterIn: req.holeDiameterIn,
        sensitivity,
        minConfidence: req.learn ? Math.min(0.1, req.minConfidence) : req.minConfidence,
        halfSizePass: !req.live,
      });
      holes.push(...res.holes);
      lowResolution = res.lowResolution;
    }
  }
  return { id: req.id, ring, holes, lowResolution, ms: performance.now() - t0 };
}
