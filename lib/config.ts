import type { WorkflowStage } from '@/types';

export const APP_NAME = 'Remote Firing Analyzer';
export const APP_VERSION = '2.0';

export const ZEROING_PROFILE = {
  requiredShots: 5,
  maxGroupingInches: 10,
  zeroedRadialErrorCm: 5,
  lateralCmPerRotation: 32,
  verticalCmPerRotation: 24,
} as const;

export const SESSION_STORAGE_KEY = 'rfa:sessions:v2';

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

export const WORKFLOW_STEPS: Array<{
  id: WorkflowStage;
  number: number;
  title: string;
  short: string;
}> = [
  { id: 'source', number: 1, title: 'Target Source', short: 'Load or capture target' },
  { id: 'calibration', number: 2, title: 'Calibration', short: 'Set image scale' },
  { id: 'marking', number: 3, title: 'Bullet Marks', short: 'Manual or Auto Detect' },
  { id: 'aim', number: 4, title: 'Point of Aim', short: 'Mark intended aim point' },
  { id: 'analysis', number: 5, title: 'Analysis', short: 'Calculate firing result' },
  { id: 'review', number: 6, title: 'Review', short: 'Verify result and feedback' },
  { id: 'report', number: 7, title: 'Save / Report', short: 'Store or print result' },
];
