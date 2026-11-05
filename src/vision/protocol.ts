import type { Calibration } from '../core/types';
import type { Hole } from './holes';
import type { LiveSettings, LiveStepResult } from './live_engine';

/** Live change detection, run inside the worker (the learned target stays there). */
export interface LiveRequest {
  /** the locked calibration; a new `version` makes the engine learn the target again */
  calibration: Calibration;
  version: number;
  settings: LiveSettings;
  /** process the frame in this request */
  step: boolean;
  command?: { kind: 'nextGroup' } | { kind: 'remove'; id: string } | { kind: 'clear' };
}

export interface VisionRequest {
  id: number;
  /** frame; may be omitted for live commands */
  bitmap?: ImageBitmap;
  findRing: boolean;
  findHoles: boolean;
  /** Use this calibration for hole detection instead of a fresh ring search. */
  calibration?: Calibration | null;
  diameterIn: number;
  holeDiameterIn: number;
  sensitivity: number;
  minConfidence: number;
  /** kept for compatibility (old learning pass); ignored by the ML detector */
  learn?: boolean;
  /** Live video: lighter ring search. */
  live?: boolean;
  liveStep?: LiveRequest;
}

export interface VisionResponse {
  id: number;
  ring: Calibration | null;
  holes: Hole[] | null;
  lowResolution?: boolean;
  ms: number;
  error?: string;
  live?: LiveStepResult;
  /** which detector produced the holes */
  detector?: 'ml' | 'classic';
}
