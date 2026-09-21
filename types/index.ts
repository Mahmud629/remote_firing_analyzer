// Point types for the zeroing analyzer
export interface Point {
  x: number;
  y: number;
}

export interface MarkedPoint extends Point {
  id: string;
  type: 'bullet' | 'poa' | 'calibration';
}

export interface AnalysisData {
  bullets: Point[];
  poa: Point | null;
  calibrationPoints: Point[];
  scaleInches: number | null;
  scalePixels: number | null;
}

export type Unit = 'inches' | 'cm' | 'mm';

export interface ZeroingResults {
  status: 'WASHOUT' | 'ZEROED' | 'ADJUSTMENT_REQUIRED' | 'INCOMPLETE';
  bulletCount: number;
  groupingInches: number | null;
  groupingPixelPair: [Point, Point] | null; // The two farthest bullets
  mpiInches: Point | null;
  mpiCm: Point | null;
  radialErrorInches: number | null;
  radialErrorCm: number | null;
  windageClicksNeeded: number | null;
  elevationClicksNeeded: number | null;
  correctionCm: Point | null; // Correction in cm
  sightRotations: {
    lateral: number;
    vertical: number;
  } | null;
  washoutReasons: string[];
  feedback: string[];
  trainingFeedback: string | null;
}

export interface CanvasState {
  image: HTMLImageElement | null;
  markers: MarkedPoint[];
  hoveredMarkerId: string | null;
  selectedMarkerId: string | null;
}

// Firer Information
export interface FirerInfo {
  name: string;
  rank: string;
  weaponNumber: string;
  wpnNo?: string; // Weapon serial number
  photoBase64?: string; // Photo stored as base64 string
  date: string;
  range: number; // in meters
}

// Weapon Details
export interface WpnDetails {
  wpnNo: string;
  zeroed: boolean;
  notes?: string;
}

// Saved Session
export interface SavedSession {
  id: string;
  firerInfo: FirerInfo;
  results: ZeroingResults;
  savedAt: string; // ISO timestamp
  targetImageBase64?: string; // Base64 encoded target image with shots
}

