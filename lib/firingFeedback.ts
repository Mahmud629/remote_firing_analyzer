import { Point } from '@/types';
import { calculateDistance } from './calculations';

export interface FiringAnalysis {
  zeroingErrors: string[];
  firingErrors: string[];
  overallFeedback: string;
}

export function analyzeFiringPattern(
  bullets: Point[],
  mpi: Point | null,
  poa: Point | null,
  groupingInches: number | null,
  radialErrorCm: number | null
): FiringAnalysis {
  const zeroingErrors: string[] = [];
  const firingErrors: string[] = [];

  if (!mpi || !poa || !groupingInches) {
    return {
      zeroingErrors: ['Insufficient data for analysis'],
      firingErrors: [],
      overallFeedback: 'Cannot analyze firing pattern with incomplete data.',
    };
  }

  // Analyze grouping shape for firing errors
  const xs = bullets.map(b => b.x);
  const ys = bullets.map(b => b.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const horizontalSpread = maxX - minX;
  const verticalSpread = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // --- FIRING ERRORS DETECTION ---

  // 1. Long Vertical Group Error - breathing control issue
  if (verticalSpread > horizontalSpread * 1.8 && verticalSpread > 30) {
    firingErrors.push(
      'Long Vertical Group Error: Bullets strung vertically. Likely causes:\n' +
        '  • Poor breathing control - breathing during firing\n' +
        '  • Vertical error in sight alignment (back sight U or front sight tip misalignment)\n' +
        'Corrective action: Practice breath control - fire between breaths, hold breath steady'
    );
  }

  // 2. Long Horizontal Group Error - trigger control issue
  if (horizontalSpread > verticalSpread * 1.8 && horizontalSpread > 30) {
    firingErrors.push(
      'Long Horizontal Group Error: Bullets spread horizontally. Likely causes:\n' +
        '  • Left hand moving horizontally due to poor holding\n' +
        '  • Lateral error in sight alignment (back sight U or front sight tip)\n' +
        'Corrective action: Improve grip stability, ensure firm butt contact with shoulder'
    );
  }

  // 3. Bifocal Group Error - wrong focusing of eye / trigger pull issue
  if (bullets.length >= 4) {
    // Check for clustering in two distinct groups
    let lowCount = 0;
    let highCount = 0;
    for (const bullet of bullets) {
      if (bullet.y > centerY + 15) lowCount++;
      else if (bullet.y < centerY - 15) highCount++;
    }
    if ((lowCount >= 2 && highCount >= 1) || (highCount >= 2 && lowCount >= 1)) {
      firingErrors.push(
        'Bifocal Group Error: Two distinct bullet groups detected. Likely causes:\n' +
        '  • Wrong focusing of eye - focusing on aiming point instead of front sight\n' +
        '  • Improper trigger pull - inconsistent trigger pressure\n' +
        'Corrective action: Focus on front sight consistently, practice smooth trigger pull'
      );
    }
  }

  // 4. Scattered Group Error - poor firing position
  if (horizontalSpread > 40 && verticalSpread > 40) {
    firingErrors.push(
      'Scattered Group Error: Bullets scattered widely across target. Likely causes:\n' +
        '  • All factors of correct hold not ensured\n' +
        '  • Frequent movement of elbows and body while firing\n' +
        '  • Poor firing position stability\n' +
        'Corrective action: Establish stable firing position, keep elbows firm, practice body control'
    );
  }

  // 5. Low-Left Clustering (Trigger Jerk)
  let lowLeftCount = 0;
  for (const bullet of bullets) {
    if (bullet.x < centerX - 20 && bullet.y > centerY + 20) {
      lowLeftCount++;
    }
  }
  if (lowLeftCount >= 2) {
    firingErrors.push(
      'Trigger Jerk Detected: Multiple shots in low-left cluster. \n' +
        '  • Jerking trigger sideways and downward during firing\n' +
        'Corrective action: Fire smoothly with even trigger pressure, avoid sudden movements'
    );
  }

  // 6. Flinch pattern (inconsistent high shots)
  let highCount = 0;
  for (const bullet of bullets) {
    if (bullet.y < centerY - 25) highCount++;
  }
  if (highCount >= 2) {
    firingErrors.push(
      'Flinch Reaction Detected: Multiple high shots indicating flinch.\n' +
        '  • Anticipating recoil by moving head/shoulders backward\n' +
        '  • Closing eye or tensing muscles before shot\n' +
        'Corrective action: Practice dry fire to reduce recoil anticipation, relax before firing'
    );
  }

  // --- ZEROING ERRORS DETECTION ---

  // Check MPI shift (deviation from POA)
  const mpiShiftX = mpi.x - poa.x;
  const mpiShiftY = mpi.y - poa.y;
  const mpiShiftDistance = calculateDistance(mpi, poa);

  if (Math.abs(mpiShiftX) > 50) {
    zeroingErrors.push(
      `Horizontal Zero Offset: MPI shifted ${Math.abs(mpiShiftX).toFixed(0)}px from POA\n` +
        '  Sight requires horizontal (lateral/windage) adjustment'
    );
  }

  if (Math.abs(mpiShiftY) > 50) {
    zeroingErrors.push(
      `Vertical Zero Offset: MPI shifted ${Math.abs(mpiShiftY).toFixed(0)}px from POA\n` +
        '  Sight requires vertical (elevation) adjustment'
    );
  }

  if (mpiShiftDistance < 25 && groupingInches <= 4) {
    zeroingErrors.push('Weapon appears to be properly zeroed - minimal sight adjustment needed');
  } else if (mpiShiftDistance > 100) {
    zeroingErrors.push(
      'Significant zero offset detected. Multiple sight adjustments required.\n' +
        '  Recommend starting fresh zero procedure.'
    );
  }

  // Grouping quality feedback
  if (groupingInches <= 2) {
    zeroingErrors.push('Excellent grouping - very tight consistency achieved');
  } else if (groupingInches <= 4) {
    zeroingErrors.push('Good grouping - acceptable accuracy for zeroing');
  } else if (groupingInches <= 7) {
    zeroingErrors.push('Fair grouping - acceptable for first class firing');
  } else if (groupingInches <= 10) {
    zeroingErrors.push('Poor grouping - requires additional training on firing fundamentals');
  }

  // Combine all feedback
  const allErrors = [...zeroingErrors, ...firingErrors];
  const overallFeedback = allErrors.length > 0
    ? 'Detailed analysis complete. Review firing and zeroing errors above for corrective training.'
    : 'No specific errors detected. Continue maintaining good firing discipline.';

  return {
    zeroingErrors,
    firingErrors,
    overallFeedback,
  };
}
