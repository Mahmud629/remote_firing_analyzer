import type { DetectedCircle, Point, TargetTransform } from '@/types';
import { TARGET_PROFILE } from '@/lib/config';

type LoadedImage = {
  image: HTMLImageElement;
  width: number;
  height: number;
};

async function loadImage(imageDataUrl: string): Promise<LoadedImage> {
  const image = new Image();
  image.decoding = 'async';
  image.src = imageDataUrl;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Target image could not be loaded.'));
  });

  return {
    image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function solve3x3(matrix: number[][], vector: number[]): number[] | null {
  const a = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(a[pivot][column]) < 1e-9) return null;

    [a[column], a[pivot]] = [a[pivot], a[column]];

    const divisor = a[column][column];
    for (let j = column; j < 4; j += 1) {
      a[column][j] /= divisor;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = a[row][column];
      for (let j = column; j < 4; j += 1) {
        a[row][j] -= factor * a[column][j];
      }
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
}

function fitCircle(points: Point[]): { center: Point; radius: number; rmse: number } | null {
  if (points.length < 8) return null;

  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sbx = 0;
  let sby = 0;
  let sb = 0;

  for (const point of points) {
    const b = -(point.x * point.x + point.y * point.y);
    sx += point.x;
    sy += point.y;
    sxx += point.x * point.x;
    syy += point.y * point.y;
    sxy += point.x * point.y;
    sbx += point.x * b;
    sby += point.y * b;
    sb += b;
  }

  const n = points.length;
  const solved = solve3x3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ],
    [sbx, sby, sb],
  );

  if (!solved) return null;

  const [d, e, f] = solved;
  const center = { x: -d / 2, y: -e / 2 };
  const radiusSquared = center.x * center.x + center.y * center.y - f;

  if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) return null;

  const radius = Math.sqrt(radiusSquared);
  const errors = points.map(
    (point) =>
      Math.hypot(point.x - center.x, point.y - center.y) - radius,
  );
  const rmse = Math.sqrt(
    errors.reduce((sum, error) => sum + error * error, 0) / errors.length,
  );

  return { center, radius, rmse };
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * ratio)),
  );
  return sorted[index];
}

function sampleLuma(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const ix = Math.max(0, Math.min(width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (iy * width + ix) * 4;
  return (
    data[index] * 0.2126 +
    data[index + 1] * 0.7152 +
    data[index + 2] * 0.0722
  );
}

function collectOuterRingCandidates(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  center: Point,
): Point[] {
  const minDimension = Math.min(width, height);
  const minRadius = minDimension * 0.37;
  const maxRadius = minDimension * 0.505;
  const rayCount = 300;
  const radialSamples = 180;
  const candidates: Array<Point & { luma: number }> = [];

  for (let ray = 0; ray < rayCount; ray += 1) {
    const angle = (ray / rayCount) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let darkest: Point & { luma: number } = {
      x: center.x,
      y: center.y,
      luma: 255,
    };

    for (let sample = 0; sample < radialSamples; sample += 1) {
      const radius =
        minRadius +
        ((maxRadius - minRadius) * sample) / (radialSamples - 1);
      const x = center.x + radius * cos;
      const y = center.y + radius * sin;

      if (x < 0 || y < 0 || x >= width || y >= height) continue;

      const luma = sampleLuma(data, width, height, x, y);
      if (luma < darkest.luma) {
        darkest = { x, y, luma };
      }
    }

    candidates.push(darkest);
  }

  const lumas = candidates.map((point) => point.luma);
  const adaptiveThreshold = Math.min(135, percentile(lumas, 0.72) + 18);

  return candidates
    .filter((point) => point.luma <= adaptiveThreshold)
    .map(({ x, y }) => ({ x, y }));
}

function rejectOutliers(
  points: Point[],
  circle: { center: Point; radius: number },
): Point[] {
  const residuals = points.map((point) =>
    Math.abs(
      Math.hypot(
        point.x - circle.center.x,
        point.y - circle.center.y,
      ) - circle.radius,
    ),
  );

  const median = percentile(residuals, 0.5);
  const threshold = Math.max(circle.radius * 0.02, median * 2.8, 2);

  return points.filter((_, index) => residuals[index] <= threshold);
}

export async function detectOuterTargetCircle(
  imageDataUrl: string,
): Promise<DetectedCircle> {
  const loaded = await loadImage(imageDataUrl);
  const maxDimension = 900;
  const downscale = Math.min(
    1,
    maxDimension / Math.max(loaded.width, loaded.height),
  );

  const width = Math.max(1, Math.round(loaded.width * downscale));
  const height = Math.max(1, Math.round(loaded.height * downscale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Automatic calibration canvas is unavailable.');
  }

  context.drawImage(loaded.image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);

  let center: Point = { x: width / 2, y: height / 2 };
  let points = collectOuterRingCandidates(
    imageData.data,
    width,
    height,
    center,
  );

  let fitted = fitCircle(points);
  if (!fitted) {
    throw new Error('Outer target circle could not be detected.');
  }

  center = fitted.center;
  points = collectOuterRingCandidates(
    imageData.data,
    width,
    height,
    center,
  );

  fitted = fitCircle(points);
  if (!fitted) {
    throw new Error('Outer target circle could not be fitted.');
  }

  const inliers = rejectOutliers(points, fitted);
  const refined = fitCircle(inliers) || fitted;

  const minDimension = Math.min(width, height);
  const radiusRatio = refined.radius / minDimension;
  const coverage = Math.min(1, inliers.length / 240);
  const residualScore = Math.max(
    0,
    1 - refined.rmse / Math.max(1, refined.radius * 0.025),
  );
  const sizeScore =
    radiusRatio >= 0.38 && radiusRatio <= 0.52 ? 1 : 0.35;
  const confidence = Math.max(
    0,
    Math.min(1, coverage * 0.45 + residualScore * 0.45 + sizeScore * 0.1),
  );

  const inverseScale = 1 / downscale;

  const result: DetectedCircle = {
    center: {
      x: refined.center.x * inverseScale,
      y: refined.center.y * inverseScale,
    },
    radiusPixels: refined.radius * inverseScale,
    physicalRadiusInches: TARGET_PROFILE.outerCircleRadiusInches,
    confidence,
    method: 'auto-circle',
  };

  if (
    !Number.isFinite(result.radiusPixels) ||
    result.radiusPixels <= 0 ||
    confidence < TARGET_PROFILE.autoCalibrationMinConfidence
  ) {
    throw new Error(
      'Outer circle detection confidence is too low. Capture the target more squarely and try again.',
    );
  }

  return result;
}

export async function normalizeTargetImage(
  imageDataUrl: string,
  circle: DetectedCircle,
): Promise<{ imageDataUrl: string; transform: TargetTransform }> {
  const loaded = await loadImage(imageDataUrl);
  const outputSize = TARGET_PROFILE.normalizedTargetSize;
  const cropSize = circle.radiusPixels * 2;
  const cropLeft = circle.center.x - circle.radiusPixels;
  const cropTop = circle.center.y - circle.radiusPixels;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Target normalization canvas is unavailable.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(
    loaded.image,
    cropLeft,
    cropTop,
    cropSize,
    cropSize,
    0,
    0,
    outputSize,
    outputSize,
  );

  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.beginPath();
  context.arc(
    outputSize / 2,
    outputSize / 2,
    outputSize / 2,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();

  return {
    imageDataUrl: canvas.toDataURL('image/jpeg', 0.94),
    transform: {
      cropLeft,
      cropTop,
      cropSize,
      outputSize,
    },
  };
}

export function mapNormalizedPointToSource(
  point: Point,
  transform: TargetTransform,
): Point {
  return {
    x:
      transform.cropLeft +
      (point.x / transform.outputSize) * transform.cropSize,
    y:
      transform.cropTop +
      (point.y / transform.outputSize) * transform.cropSize,
  };
}
