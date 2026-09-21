import { Point, ZeroingResults } from '@/types';

const BD08_LATERAL_CLICKS = 32; // cm per rotation for lateral
const BD08_VERTICAL_CLICKS = 24; // cm per rotation for vertical

export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function pixelsToInches(pixels: number, scalePixels: number, scaleInches: number): number {
  if (scalePixels === 0) return 0;
  return (pixels / scalePixels) * scaleInches;
}

export function pixelsToCm(pixels: number, scalePixels: number, scaleInches: number): number {
  return pixelsToInches(pixels, scalePixels, scaleInches) * 2.54;
}

export function pixelsToMm(pixels: number, scalePixels: number, scaleInches: number): number {
  return pixelsToInches(pixels, scalePixels, scaleInches) * 25.4;
}

export function convertValue(value: number, fromUnit: 'inches' | 'cm' | 'mm', toUnit: 'inches' | 'cm' | 'mm'): number {
  if (fromUnit === toUnit) return value;
  
  // Convert to inches first
  let inches = value;
  if (fromUnit === 'cm') inches = value / 2.54;
  else if (fromUnit === 'mm') inches = value / 25.4;
  
  // Convert to target unit
  if (toUnit === 'inches') return inches;
  else if (toUnit === 'cm') return inches * 2.54;
  else return inches * 25.4;
}

export function inchesToPixels(inches: number, scalePixels: number, scaleInches: number): number {
  if (scaleInches === 0) return 0;
  return (inches / scaleInches) * scalePixels;
}

export function calculateGrouping(bullets: Point[]): { distance: number; pair: [Point, Point] } | null {
  if (bullets.length < 2) return null;

  let maxDistance = 0;
  let farthestPair: [Point, Point] | null = null;
  
  for (let i = 0; i < bullets.length; i++) {
    for (let j = i + 1; j < bullets.length; j++) {
      const distance = calculateDistance(bullets[i], bullets[j]);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthestPair = [bullets[i], bullets[j]];
      }
    }
  }

  return farthestPair ? { distance: maxDistance, pair: farthestPair } : null;
}

export function calculateMPI(bullets: Point[]): Point | null {
  if (bullets.length === 0) return null;

  const sum = bullets.reduce(
    (acc, bullet) => ({
      x: acc.x + bullet.x,
      y: acc.y + bullet.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / bullets.length,
    y: sum.y / bullets.length,
  };
}

export function calculateRadialError(mpi: Point, poa: Point): number {
  return calculateDistance(mpi, poa);
}

export function analyzeGroupShape(bullets: Point[]): string | null {
  if (bullets.length < 3) return null;

  // Calculate bounding box
  const xs = bullets.map(b => b.x);
  const ys = bullets.map(b => b.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const horizontalSpread = maxX - minX;
  const verticalSpread = maxY - minY;
  
  // Check for poor clustering
  if (horizontalSpread < 5 && verticalSpread < 5) {
    return 'Good grouping pattern - tight, consistent group';
  }
  
  // Vertical spread much greater than horizontal
  if (verticalSpread > horizontalSpread * 1.5) {
    return 'Possible breathing control issue - vertical stringing detected';
  }
  
  // Horizontal spread much greater than vertical
  if (horizontalSpread > verticalSpread * 1.5) {
    return 'Possible trigger control issue - horizontal spread detected';
  }
  
  // Wide spread in both directions
  if (horizontalSpread > 15 && verticalSpread > 15) {
    return 'Possible poor firing position or inconsistent hold';
  }
  
  // Check for low-left cluster (trigger jerk pattern)
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  let lowLeftCount = 0;
  for (const bullet of bullets) {
    if (bullet.x < centerX - 3 && bullet.y > centerY + 3) {
      lowLeftCount++;
    }
  }
  if (lowLeftCount >= 3) {
    return 'Possible trigger jerk - low-left clustering';
  }
  
  return null;
}

export function analyzeZeroing(
  bullets: Point[],
  poa: Point | null,
  scalePixels: number,
  scaleInches: number
): ZeroingResults {
  const feedback: string[] = [];
  const washoutReasons: string[] = [];
  const bulletCount = bullets.length;

  // Check for valid bullet count
  if (bulletCount !== 5) {
    if (bulletCount < 5) {
      washoutReasons.push(`Bullet count is less than 5 (marked: ${bulletCount})`);
    } else {
      washoutReasons.push(`Bullet count is more than 5 (marked: ${bulletCount})`);
    }
    return {
      status: 'WASHOUT',
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
      washoutReasons,
      feedback,
      trainingFeedback: null,
    };
  }

  // Calculate grouping in pixels
  const groupingResult = calculateGrouping(bullets);
  if (groupingResult === null) {
    washoutReasons.push('Unable to calculate grouping');
    return {
      status: 'WASHOUT',
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
      washoutReasons,
      feedback,
      trainingFeedback: null,
    };
  }

  const groupingInches = pixelsToInches(groupingResult.distance, scalePixels, scaleInches);

  // Calculate MPI in pixels (always calculate, regardless of grouping)
  const mpiPixels = calculateMPI(bullets);
  if (!mpiPixels) {
    washoutReasons.push('Unable to calculate MPI');
    return {
      status: 'WASHOUT',
      bulletCount,
      groupingInches,
      groupingPixelPair: groupingResult.pair,
      mpiInches: null,
      mpiCm: null,
      radialErrorInches: null,
      radialErrorCm: null,
      windageClicksNeeded: null,
      elevationClicksNeeded: null,
      correctionCm: null,
      sightRotations: null,
      washoutReasons,
      feedback,
      trainingFeedback: null,
    };
  }

  // Calculate correction (MPI deviation from POA)
  let correctionCm: Point | null = null;
  let radialErrorInches: number | null = null;
  let radialErrorCm: number | null = null;
  let status: ZeroingResults['status'] = 'ADJUSTMENT_REQUIRED';
  let windageClicksNeeded: number | null = null;
  let elevationClicksNeeded: number | null = null;
  let sightRotations: { lateral: number; vertical: number } | null = null;
  let mpiInches: Point | null = null;
  let mpiCm: Point | null = null;

  if (poa) {
    // Calculate deviation of MPI from POA in pixels
    const deviationPixels: Point = {
      x: mpiPixels.x - poa.x,
      y: mpiPixels.y - poa.y,
    };

    // Convert deviation to inches and cm
    const deviationInches: Point = {
      x: pixelsToInches(deviationPixels.x, scalePixels, scaleInches),
      y: pixelsToInches(deviationPixels.y, scalePixels, scaleInches),
    };

    correctionCm = {
      x: pixelsToCm(deviationPixels.x, scalePixels, scaleInches) * -1,
      y: pixelsToCm(deviationPixels.y, scalePixels, scaleInches) * -1,
    };

    mpiInches = deviationInches;
    mpiCm = {
      x: correctionCm.x * -1,
      y: correctionCm.y * -1,
    };

    // Calculate radial error (distance from POA to MPI)
    const radialErrorPixels = calculateRadialError(mpiPixels, poa);
    radialErrorInches = pixelsToInches(radialErrorPixels, scalePixels, scaleInches);
    radialErrorCm = pixelsToCm(radialErrorPixels, scalePixels, scaleInches);
    
    console.log('[v0] Radial error - Pixels:', radialErrorPixels, 'Inches:', radialErrorInches, 'Cm:', radialErrorCm);

    // Determine status based on conditions
    if (groupingInches > 10) {
      status = 'WASHOUT';
      if (washoutReasons.length === 0) {
        washoutReasons.push(`Grouping exceeds 10 inches (${groupingInches.toFixed(2)}")`);
      }
    } else if (radialErrorCm <= 5) {
      // Only mark as ZEROED if radial error is within 5cm
      status = 'ZEROED';
    } else {
      // If grouping is acceptable but radial error > 5cm, adjustment is needed
      status = 'ADJUSTMENT_REQUIRED';
    }
    
    console.log('[v0] Status determination - Grouping:', groupingInches.toFixed(2), 'RadialErrorCm:', radialErrorCm?.toFixed(2), 'Status:', status);

    // Calculate sight rotations for BD-08 (cm per rotation)
    sightRotations = {
      lateral: Math.abs(mpiCm.x) / BD08_LATERAL_CLICKS,
      vertical: Math.abs(mpiCm.y) / BD08_VERTICAL_CLICKS,
    };
  } else {
    status = 'INCOMPLETE';
    if (groupingInches > 10) {
      status = 'WASHOUT';
      if (washoutReasons.length === 0) {
        washoutReasons.push(`Grouping exceeds 10 inches (${groupingInches.toFixed(2)}")`);
      }
    }
  }

  const trainingFeedback = analyzeGroupShape(bullets);

  return {
    status,
    bulletCount,
    groupingInches,
    groupingPixelPair: groupingResult.pair,
    mpiInches,
    mpiCm,
    radialErrorInches,
    radialErrorCm,
    windageClicksNeeded,
    elevationClicksNeeded,
    correctionCm,
    sightRotations,
    washoutReasons,
    feedback,
    trainingFeedback,
  };
}
