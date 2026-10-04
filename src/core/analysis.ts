import type { Analysis, AxisCorrection, Rules, Vec2, ZeroStatus } from './types';
import { IN_TO_CM, classify, DEFAULT_RULES } from './rules';
import { extremeSpread, mean } from './geometry';
import { firingDiagnostics, zeroingDiagnostics } from './diagnostics';

export interface AnalyzeOptions {
  leftHanded?: boolean;
}

/**
 * Zeroing analysis. `shots` and `poa` are in target space (inches, y up).
 *
 * Status rules (from the original RFA):
 *  - more rounds than required            -> WASHOUT
 *  - grouping larger than the limit       -> WASHOUT
 *  - radial error within tolerance        -> ZEROED
 *  - otherwise                            -> ADJUST
 * While fewer rounds than required are on the target the status is
 * INCOMPLETE; a record saved in that state is stored as WASHOUT.
 */
export function analyze(shots: Vec2[], poa: Vec2, rules: Rules = DEFAULT_RULES, opts: AnalyzeOptions = {}): Analysis {
  const count = shots.length;
  const required = rules.requiredRounds;
  const reasons: string[] = [];
  const spread = extremeSpread(shots);
  const group = spread ? { sizeIn: spread.size, pair: spread.pair } : null;
  const mpiIn = mean(shots);

  let offsetCm: Vec2 | null = null;
  let radialErrorCm: number | null = null;
  let correction: Analysis['correction'] = null;
  if (mpiIn) {
    offsetCm = { x: (mpiIn.x - poa.x) * IN_TO_CM, y: (mpiIn.y - poa.y) * IN_TO_CM };
    radialErrorCm = Math.hypot(offsetCm.x, offsetCm.y);
    correction = {
      lateral: axis(-offsetCm.x, rules.lateralCmPerTurn, 'right', 'left'),
      vertical: axis(-offsetCm.y, rules.verticalCmPerTurn, 'up', 'down'),
    };
  }

  let status: ZeroStatus;
  if (count === 0) {
    status = 'INCOMPLETE';
    reasons.push('No shots marked yet.');
  } else if (count > required) {
    status = 'WASHOUT';
    reasons.push(`${count} rounds on the target; the practice needs exactly ${required}.`);
  } else if (group && group.sizeIn > rules.maxGroupIn) {
    status = 'WASHOUT';
    reasons.push(`Grouping ${group.sizeIn.toFixed(2)} in is over the ${rules.maxGroupIn} in limit.`);
  } else if (count < required) {
    status = 'INCOMPLETE';
    reasons.push(`${count} of ${required} rounds found.`);
  } else if (radialErrorCm != null && radialErrorCm <= rules.zeroToleranceCm) {
    status = 'ZEROED';
  } else {
    status = 'ADJUST';
    reasons.push(`MPI is ${radialErrorCm!.toFixed(1)} cm from the aiming point (tolerance ${rules.zeroToleranceCm} cm).`);
  }

  const diagnostics = [
    ...zeroingDiagnostics(group?.sizeIn ?? null, offsetCm, radialErrorCm, rules),
    ...firingDiagnostics(shots, opts),
  ];

  return {
    status,
    reasons,
    count,
    required,
    group,
    mpiIn,
    offsetCm,
    radialErrorCm,
    correction,
    classification: count >= 2 ? classify(group?.sizeIn ?? null, rules) : null,
    diagnostics,
  };
}

/** Status written to the records: an unfinished group counts as a washout. */
export function recordStatus(a: Analysis): ZeroStatus {
  return a.status === 'INCOMPLETE' ? 'WASHOUT' : a.status;
}

function axis(moveCm: number, cmPerTurn: number, pos: AxisCorrection['direction'], neg: AxisCorrection['direction']): AxisCorrection {
  const cm = Math.abs(moveCm);
  if (cm < 0.05) return { direction: 'none', cm: 0, turns: 0 };
  return { direction: moveCm > 0 ? pos : neg, cm, turns: cm / cmPerTurn };
}
