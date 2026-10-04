import type { Rules } from './types';

export const IN_TO_CM = 2.54;

/** Defaults carried over from the original RFA rule set (BD-08, 5-round group). */
export const DEFAULT_RULES: Rules = {
  requiredRounds: 5,
  maxGroupIn: 10,
  zeroToleranceCm: 5,
  lateralCmPerTurn: 32,
  verticalCmPerTurn: 24,
  targetDiameterIn: 32,
  classes: [
    { maxIn: 4, label: 'Marksman' },
    { maxIn: 7, label: 'First class firer' },
    { maxIn: 10, label: 'Standard firer' },
    { maxIn: 1e9, label: 'Requires training' }, // open-ended (kept JSON-safe)
  ],
};

export function classify(groupIn: number | null, rules: Rules = DEFAULT_RULES): string | null {
  if (groupIn == null) return null;
  for (const band of rules.classes) if (groupIn <= band.maxIn) return band.label;
  return rules.classes[rules.classes.length - 1]?.label ?? null;
}
