import type { WorkflowStage } from '@/types';

export const APP_NAME = 'Remote Firing Analyzer';
export const APP_VERSION = '3.0';

export const ZEROING_PROFILE = {
  requiredShots: 5,
  maxGroupingInches: 10,
  zeroedRadialErrorCm: 5,
  lateralCmPerRotation: 32,
  verticalCmPerRotation: 24,
} as const;

export const TARGET_PROFILE = {
  outerCircleRadiusInches: Number(
    process.env.NEXT_PUBLIC_TARGET_OUTER_RADIUS_INCHES || 32,
  ),
  normalizedTargetSize: Number(
    process.env.NEXT_PUBLIC_NORMALIZED_TARGET_SIZE || 1024,
  ),
  autoCalibrationMinConfidence: Number(
    process.env.NEXT_PUBLIC_AUTO_CALIBRATION_MIN_CONFIDENCE || 0.55,
  ),
} as const;

export const SESSION_STORAGE_KEY = 'rfa:sessions:v3';

const configuredStreamBase =
  process.env.NEXT_PUBLIC_STREAM_BASE_URL || 'http://localhost:8888';

export const STREAM_BASE_URL = configuredStreamBase.replace(/\/+$/, '');
export const STREAM_CAMERA_COUNT = Number(
  process.env.NEXT_PUBLIC_STREAM_CAMERA_COUNT || 12,
);

export const ML_ENDPOINT =
  process.env.NEXT_PUBLIC_ML_API_URL?.trim() || '';

export const ML_CONFIDENCE_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_ML_CONFIDENCE_THRESHOLD || 0.5,
);

export const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

export const WORKFLOW_STEPS: Array<{
  id: WorkflowStage;
  number: number;
  title: string;
  short: string;
}> = [
  { id: 'source', number: 1, title: 'Target Source', short: 'Load or capture target' },
  { id: 'calibration', number: 2, title: 'Auto Calibration', short: 'Detect 32" outer radius' },
  { id: 'marking', number: 3, title: 'Bullet Detection', short: 'ML detect or manual correction' },
  { id: 'aim', number: 4, title: 'Point of Aim', short: 'Mark intended aim point' },
  { id: 'analysis', number: 5, title: 'Analysis', short: 'Calculate firing result' },
  { id: 'review', number: 6, title: 'Review', short: 'Verify result and feedback' },
  { id: 'report', number: 7, title: 'Database / Report', short: 'Store record or print result' },
];
