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

export interface DetectedCircle {
  center: Point;
  radiusPixels: number;
  physicalRadiusInches: number;
  confidence: number;
  method: 'auto-circle';
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
  weaponNumber?: string;
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
  calibration?: DetectedCircle | null;
  sourceType?: 'upload' | 'camera';
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

export interface TargetTransform {
  cropLeft: number;
  cropTop: number;
  cropSize: number;
  outputSize: number;
}

export type WorkflowStage =
  | 'source'
  | 'calibration'
  | 'marking'
  | 'aim'
  | 'analysis'
  | 'review'
  | 'report';
