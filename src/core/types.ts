/**
 * Core domain types.
 *
 * Two coordinate spaces are used throughout the app:
 *  - Image space: pixels of the source image/frame, origin top-left, y grows DOWN.
 *  - Target space: inches on the physical target, origin at the centre of the
 *    outer ring, x grows RIGHT, y grows UP. All analysis happens in target space,
 *    so results never depend on camera resolution.
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Ellipse fitted to the outer ring. A camera looking up at a raised target or
 * from one side sees the ring as a (possibly rotated) ellipse.
 */
export interface Calibration {
  center: Vec2; // image px
  radiusX: number; // image px (semi-axis along `angle`)
  radiusY: number; // image px (semi-axis perpendicular to `angle`)
  /** Rotation of the radiusX axis from the image x axis, radians (default 0). */
  angle?: number;
  /**
   * Perspective (optional): 3x3 row-major homography from target inches
   * (x right, y up, origin = ring centre) to image px. When present it is used
   * instead of the ellipse for all conversions; editing the ring removes it.
   */
  H?: number[];
  diameterIn: number; // physical diameter of the ring, e.g. 32
  /** auto: ring found; manual: ring placed by hand; points: two known points */
  method: 'auto' | 'manual' | 'points';
  confidence: number; // 0..1
}

export type ShotSource = 'auto' | 'manual' | 'live';

export interface Shot {
  id: string;
  /** Position in image px of the frame the shot was marked on. */
  p: Vec2;
  source: ShotSource;
  confidence?: number;
  /** Detector thinks this blob may contain more than one hole. */
  merged?: boolean;
  /** Order of appearance (live tracking only). */
  seq?: number;
}

export type ZeroStatus = 'ZEROED' | 'ADJUST' | 'WASHOUT' | 'INCOMPLETE';

export interface ClassBand {
  maxIn: number; // inclusive upper bound of grouping; the last band is open-ended
  label: string;
}

export interface Rules {
  requiredRounds: number;
  maxGroupIn: number;
  /** Group up to this size (in) is a good group: no firer error (précis shot group analysis). */
  goodGroupIn: number;
  zeroToleranceCm: number;
  lateralCmPerTurn: number;
  verticalCmPerTurn: number;
  targetDiameterIn: number;
  classes: ClassBand[];
}

export interface AxisCorrection {
  /** Direction the MPI has to move to reach the aiming point. */
  direction: 'left' | 'right' | 'up' | 'down' | 'none';
  cm: number;
  turns: number;
}

export interface Diagnostic {
  id: string;
  kind: 'firing' | 'zeroing' | 'quality';
  title: string;
  detail: string;
  advice?: string;
  /** Précis shot-group pattern (Table 12-1) this diagnostic stands for. */
  pattern?: import('./precis').PatternId;
  /** Error column of the précis table. */
  error?: string;
  /** Remedies column of the précis table. */
  remedy?: string;
  /** Where it is in the précis. */
  ref?: string;
}

export interface Analysis {
  status: ZeroStatus;
  reasons: string[];
  count: number;
  required: number;
  /** Extreme spread, centre to centre. */
  group: { sizeIn: number; pair: [number, number] } | null;
  /** Mean point of impact, target space (inches). */
  mpiIn: Vec2 | null;
  /** MPI minus POA in cm (x right, y up). */
  offsetCm: Vec2 | null;
  radialErrorCm: number | null;
  correction: { lateral: AxisCorrection; vertical: AxisCorrection } | null;
  classification: string | null;
  diagnostics: Diagnostic[];
}
