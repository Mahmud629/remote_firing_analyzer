import { Point, ZeroingResults } from '@/types';
import { ZEROING_PROFILE } from '@/lib/config';

export function calculateDistance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function pixelsToInches(
  pixels: number,
  scalePixels: number,
  scaleInches: number,
): number {
  if (!scalePixels) return 0;
  return (pixels / scalePixels) * scaleInches;
}

export function pixelsToCm(
  pixels: number,
  scalePixels: number,
  scaleInches: number,
): number {
  return pixelsToInches(pixels, scalePixels, scaleInches) * 2.54;
}

export function pixelsToMm(
  pixels: number,
  scalePixels: number,
  scaleInches: number,
): number {
  return pixelsToInches(pixels, scalePixels, scaleInches) * 25.4;
}

export function inchesToPixels(
  inches: number,
  scalePixels: number,
  scaleInches: number,
): number {
  if (!scaleInches) return 0;
  return (inches / scaleInches) * scalePixels;
}

export function convertValue(
  value: number,
  fromUnit: 'inches' | 'cm' | 'mm',
  toUnit: 'inches' | 'cm' | 'mm',
): number {
  if (fromUnit === toUnit) return value;

  const inches =
    fromUnit === 'inches'
      ? value
      : fromUnit === 'cm'
        ? value / 2.54
        : value / 25.4;

  if (toUnit === 'inches') return inches;
  if (toUnit === 'cm') return inches * 2.54;
  return inches * 25.4;
}

export function calculateGrouping(
  bullets: Point[],
): { distance: number; pair: [Point, Point] } | null {
  if (bullets.length < 2) return null;

  let maxDistance = -1;
  let pair: [Point, Point] = [bullets[0], bullets[1]];

  for (let i = 0; i < bullets.length; i += 1) {
    for (let j = i + 1; j < bullets.length; j += 1) {
      const distance = calculateDistance(bullets[i], bullets[j]);
      if (distance > maxDistance) {
        maxDistance = distance;
        pair = [bullets[i], bullets[j]];
      }
    }
  }

  return { distance: maxDistance, pair };
}

export function calculateMPI(bullets: Point[]): Point | null {
  if (!bullets.length) return null;

  const total = bullets.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / bullets.length,
    y: total.y / bullets.length,
  };
}

export function calculateRadialError(mpi: Point, poa: Point): number {
  return calculateDistance(mpi, poa);
}

/**
 * Compatibility helper used by older UI. The main analysis uses a calibrated
 * version so training feedback is not tied to camera resolution.
 */
export function analyzeGroupShape(bullets: Point[]): string | null {
  if (bullets.length < 3) return null;

  const xs = bullets.map((b) => b.x);
  const ys = bullets.map((b) => b.y);
  const horizontal = Math.max(...xs) - Math.min(...xs);
  const vertical = Math.max(...ys) - Math.min(...ys);

  if (vertical > horizontal * 1.6) {
    return 'Vertical stringing detected. Review firing consistency.';
  }
  if (horizontal > vertical * 1.6) {
    return 'Horizontal spread detected. Review firing consistency.';
  }
  return 'Group shape is reasonably balanced.';
}

function calibratedTrainingFeedback(
  bullets: Point[],
  scalePixels: number,
  scaleInches: number,
): string | null {
  if (bullets.length < 3) return null;

  const xs = bullets.map((b) => b.x);
  const ys = bullets.map((b) => b.y);
  const horizontalInches = pixelsToInches(
    Math.max(...xs) - Math.min(...xs),
    scalePixels,
    scaleInches,
  );
  const verticalInches = pixelsToInches(
    Math.max(...ys) - Math.min(...ys),
    scalePixels,
    scaleInches,
  );

  if (verticalInches > horizontalInches * 1.6) {
    return 'Vertical stringing detected. Check consistency before the next group.';
  }
  if (horizontalInches > verticalInches * 1.6) {
    return 'Horizontal spread detected. Check consistency before the next group.';
  }
  return 'Group shape is reasonably balanced.';
}

function baseResult(bulletCount: number): ZeroingResults {
  return {
    status: 'INCOMPLETE',
    bulletCount,
    groupingInches: null,
    groupingPixelPair: null,
    mpiInches: null,
    mpiCm: null,
    radialErrorInches: null,
    radialErrorCm: null,
    windageClicksNeeded: null,
    elevationClicksNeeded: null,
    correctionCm: null,
    sightRotations: null,
    sightDirections: null,
    washoutReasons: [],
    feedback: [],
    trainingFeedback: null,
  };
}

export function analyzeZeroing(
  bullets: Point[],
  poa: Point | null,
  scalePixels: number,
  scaleInches: number,
): ZeroingResults {
  const result = baseResult(bullets.length);

  if (!scalePixels || !scaleInches) {
    result.feedback.push('Calibration is required before analysis.');
    return result;
  }

  if (bullets.length !== ZEROING_PROFILE.requiredShots) {
    result.status = 'WASHOUT';
    result.washoutReasons.push(
      \`Exactly \${ZEROING_PROFILE.requiredShots} bullet marks are required (marked: \${bullets.length}).\`,
    );
    return result;
  }

  const grouping = calculateGrouping(bullets);
  const mpiPixels = calculateMPI(bullets);

  if (!grouping || !mpiPixels) {
    result.status = 'WASHOUT';
    result.washoutReasons.push('Unable to calculate the shot group.');
    return result;
  }

  result.groupingInches = pixelsToInches(
    grouping.distance,
    scalePixels,
    scaleInches,
  );
  result.groupingPixelPair = grouping.pair;
  result.trainingFeedback = calibratedTrainingFeedback(
    bullets,
    scalePixels,
    scaleInches,
  );

  if (result.groupingInches > ZEROING_PROFILE.maxGroupingInches) {
    result.status = 'WASHOUT';
    result.washoutReasons.push(
      \`Grouping exceeds \${ZEROING_PROFILE.maxGroupingInches} inches (\${result.groupingInches.toFixed(2)}").\`,
    );
  }

  if (!poa) {
    if (result.status !== 'WASHOUT') result.status = 'INCOMPLETE';
    result.feedback.push('Mark the Point of Aim to complete zeroing analysis.');
    return result;
  }

  const deviationPixels: Point = {
    x: mpiPixels.x - poa.x,
    y: mpiPixels.y - poa.y,
  };

  result.mpiInches = {
    x: pixelsToInches(deviationPixels.x, scalePixels, scaleInches),
    y: pixelsToInches(deviationPixels.y, scalePixels, scaleInches),
  };

  result.mpiCm = {
    x: pixelsToCm(deviationPixels.x, scalePixels, scaleInches),
    y: pixelsToCm(deviationPixels.y, scalePixels, scaleInches),
  };

  result.correctionCm = {
    x: -result.mpiCm.x,
    y: -result.mpiCm.y,
  };

  const radialPixels = calculateRadialError(mpiPixels, poa);
  result.radialErrorInches = pixelsToInches(
    radialPixels,
    scalePixels,
    scaleInches,
  );
  result.radialErrorCm = pixelsToCm(
    radialPixels,
    scalePixels,
    scaleInches,
  );

  result.sightRotations = {
    lateral:
      Math.abs(result.correctionCm.x) /
      ZEROING_PROFILE.lateralCmPerRotation,
    vertical:
      Math.abs(result.correctionCm.y) /
      ZEROING_PROFILE.verticalCmPerRotation,
  };

  result.sightDirections = {
    lateral:
      result.correctionCm.x > 0
        ? 'RIGHT'
        : result.correctionCm.x < 0
          ? 'LEFT'
          : 'NONE',
    vertical:
      result.correctionCm.y > 0
        ? 'UP'
        : result.correctionCm.y < 0
          ? 'DOWN'
          : 'NONE',
  };

  if (result.status !== 'WASHOUT') {
    result.status =
      result.radialErrorCm <= ZEROING_PROFILE.zeroedRadialErrorCm
        ? 'ZEROED'
        : 'ADJUSTMENT_REQUIRED';
  }

  result.feedback.push(
    result.status === 'ZEROED'
      ? 'Group is within the configured zeroing tolerance.'
      : result.status === 'ADJUSTMENT_REQUIRED'
        ? 'Grouping is valid but correction is required.'
        : 'Review the washout reason before continuing.',
  );

  return result;
}
