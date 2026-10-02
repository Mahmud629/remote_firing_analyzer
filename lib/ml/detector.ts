import {
  DetectionPoint,
  DetectionResult,
} from '@/types';
import {
  ML_CONFIDENCE_THRESHOLD,
  ML_ENDPOINT,
} from '@/lib/config';

type ApiDetection = {
  x?: number;
  y?: number;
  confidence?: number;
  score?: number;
};

type ApiResponse = {
  detections?: ApiDetection[];
  bullets?: ApiDetection[];
  model?: string;
  inferenceMs?: number;
  inference_ms?: number;
};

export class DetectorNotConfiguredError extends Error {
  constructor() {
    super(
      'Auto Detect is ready for ML integration, but NEXT_PUBLIC_ML_API_URL is not configured.',
    );
    this.name = 'DetectorNotConfiguredError';
  }
}

function normalizeDetection(item: ApiDetection): DetectionPoint | null {
  const x = Number(item.x);
  const y = Number(item.y);
  const confidence = Number(item.confidence ?? item.score ?? 0);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(confidence)) return null;
  if (confidence < ML_CONFIDENCE_THRESHOLD) return null;

  return { x, y, confidence };
}

export async function detectBulletHoles(
  imageDataUrl: string,
  signal?: AbortSignal,
): Promise<DetectionResult> {
  if (!ML_ENDPOINT) {
    throw new DetectorNotConfiguredError();
  }

  const startedAt = performance.now();
  const response = await fetch(ML_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: imageDataUrl,
      confidenceThreshold: ML_CONFIDENCE_THRESHOLD,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(
      'ML service returned ' +
        response.status +
        ' ' +
        response.statusText,
    );
  }

  const payload = (await response.json()) as ApiResponse;
  const rawDetections = payload.detections ?? payload.bullets ?? [];

  const detections = rawDetections
    .map(normalizeDetection)
    .filter((item): item is DetectionPoint => Boolean(item))
    .sort((a, b) => b.confidence - a.confidence);

  return {
    detections,
    model: payload.model,
    inferenceMs:
      payload.inferenceMs ??
      payload.inference_ms ??
      Math.round(performance.now() - startedAt),
  };
}
