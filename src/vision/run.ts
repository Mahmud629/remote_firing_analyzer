import { findTarget } from './ringfinder';
import { detectHoles } from './holes';
import { detectHolesML } from './holes_ml';
import { LiveEngine } from './live_engine';
import { changeVerifier } from './change_ml';
import type { FrameSource } from './frame';
import type { LiveRequest, VisionRequest, VisionResponse } from './protocol';

/**
 * One pass of the pipeline, shared by the worker and the main-thread fallback:
 *   ring (calibration, with perspective)  ->  holes (photo: HoleNet)  |  live step (change detection + ChangeNet)
 */
export function runPipeline(src: FrameSource | null, req: Omit<VisionRequest, 'bitmap'>): VisionResponse {
  const t0 = performance.now();
  const ring = src && req.findRing ? findTarget(src, { diameterIn: req.diameterIn }) : null;
  const cal = req.calibration ?? ring;
  let holes: VisionResponse['holes'] = null;
  let lowResolution = false;
  let detector: VisionResponse['detector'];
  if (src && req.findHoles && cal) {
    try {
      const res = detectHolesML(src, cal, { holeDiameterIn: req.holeDiameterIn, sensitivity: req.sensitivity });
      holes = res.holes;
      lowResolution = res.lowResolution;
      detector = 'ml';
    } catch {
      // model failed to load: classic detector so the app keeps working
      const res = detectHoles(src, { ...cal, angle: 0, H: undefined }, { holeDiameterIn: req.holeDiameterIn, sensitivity: req.sensitivity, minConfidence: req.minConfidence });
      holes = res.holes;
      lowResolution = res.lowResolution;
      detector = 'classic';
    }
  }
  const live = req.liveStep ? liveStep(src, req.liveStep) : undefined;
  return { id: req.id, ring, holes, lowResolution, ms: performance.now() - t0, live, detector };
}

let engine: LiveEngine | null = null;
let engineVersion = -1;

function liveStep(src: FrameSource | null, r: LiveRequest) {
  if (!engine) engine = new LiveEngine(r.settings, safeVerifier);
  engine.setSettings(r.settings);
  if (r.command?.kind === 'clear') {
    engine = new LiveEngine(r.settings, safeVerifier);
    engineVersion = -1;
  }
  if (r.version !== engineVersion) {
    engine.reset(r.calibration);
    engineVersion = r.version;
  }
  if (r.command?.kind === 'nextGroup') engine.nextGroup();
  if (r.command?.kind === 'remove') engine.remove(r.command.id);
  if (!src || !r.step) return undefined;
  return engine.step(src);
}

let verifierBroken = false;
function safeVerifier(before: Float32Array, after: Float32Array, size: number) {
  if (verifierBroken) return 1;
  try {
    return changeVerifier(before, after, size);
  } catch {
    verifierBroken = true;
    return 1;
  }
}
