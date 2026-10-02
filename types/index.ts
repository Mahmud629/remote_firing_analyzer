export interface Point {
  x: number;
  y: number;
}

export type MarkerType = 'bullet' | 'poa' | 'calibration';
export type MarkingMode = 'manual' | 'auto';
export type MarkerSource = 'manual' | 'ml' | 'system';
export type Unit = 'inches' | 'cm' | 'mm';

export interface MarkedPoint extends Point {
  id: string;
  type: MarkerType;
  source?: MarkerSource;
  confidence?: number;
}

export interface Calibration {
  scalePixels: number;
  scaleInches: number;
}

export interface AnalysisData {
  bullets: Point[];
  poa: Point | null;
  calibrationPoints: Point[];
  scaleInches: number | null;
  scalePixels: number | null;
}

export interface SightDirections {
  lateral: 'LEFT' | 'RIGHT' | 'NONE';
  vertical: 'UP' | 'DOWN' | 'NONE';
}

export interface ZeroingResults {
  status: 'WASHOUT' | 'ZEROED' | 'ADJUSTMENT_REQUIRED' | 'INCOMPLETE';
  bulletCount: number;
  groupingInches: number | null;
  groupingPixelPair: [Point, Point] | null;
  mpiInches: Point | null;
  mpiCm: Point | null;
  radialErrorInches: number | null;
  radialErrorCm: number | null;
  windageClicksNeeded: number | null;
  elevationClicksNeeded: number | null;
  correctionCm: Point | null;
  sightRotations: {
    lateral: number;
    vertical: number;
  } | null;
  sightDirections?: SightDirections | null;
  washoutReasons: string[];
  feedback: string[];
  trainingFeedback: string | null;
}

/** Compatibility alias for older report components. */
export type FiringResult = ZeroingResults;

export interface CanvasState {
  image: HTMLImageElement | null;
  markers: MarkedPoint[];
  hoveredMarkerId: string | null;
  selectedMarkerId: string | null;
}

export interface FirerInfo {
  name: string;
  rank: string;
  serviceNumber?: string;
  weaponSerial?: string;
  date: string;
  range: number;
  photoBase64?: string;

  /** Legacy field retained while older UI components are being phased out. */
  weaponNumber?: string;
  /** Legacy field retained while older UI components are being phased out. */
  wpnNo?: string;
}

export interface WpnDetails {
  wpnNo: string;
  zeroed: boolean;
  notes?: string;
}

export interface SavedSession {
  id: string;
  firerInfo: FirerInfo;
  results: ZeroingResults;
  savedAt: string;
  markingMode?: MarkingMode;
  targetImageBase64?: string;
}

export interface DetectionPoint extends Point {
  confidence: number;
}

export interface DetectionResult {
  detections: DetectionPoint[];
  model?: string;
  inferenceMs?: number;
}

export type WorkflowStage =
  | 'source'
  | 'calibration'
  | 'marking'
  | 'aim'
  | 'analysis'
  | 'review'
  | 'report';
