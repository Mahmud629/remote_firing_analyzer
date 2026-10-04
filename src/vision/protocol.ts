import type { Calibration } from '../core/types';
import type { Hole } from './holes';

export interface VisionRequest {
  id: number;
  bitmap: ImageBitmap;
  findRing: boolean;
  findHoles: boolean;
  /** Use this calibration for hole detection instead of a fresh ring search. */
  calibration?: Calibration | null;
  diameterIn: number;
  holeDiameterIn: number;
  sensitivity: number;
  minConfidence: number;
  /**
   * Learning the clean target: run the hole detector at several sensitivities
   * and return everything. A higher sensitivity is not a superset (blobs can
   * merge with ring lines and then fail the shape test), so one pass is not enough.
   */
  learn?: boolean;
  /** Live video: skip the slower half-size pass. */
  live?: boolean;
}

export interface VisionResponse {
  id: number;
  ring: Calibration | null;
  holes: Hole[] | null;
  lowResolution?: boolean;
  ms: number;
  error?: string;
}
