import type { Diagnostic, Rules, Vec2 } from './types';
import { bounds, dist, mean } from './geometry';

/**
 * Coaching diagnostics from the shape of the group. Every threshold is in
 * inches on the target, so the result is the same for any camera or photo
 * resolution (the previous version used raw pixel thresholds).
 */
export function firingDiagnostics(shots: Vec2[], opts: { leftHanded?: boolean } = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (shots.length < 3) return out;
  const b = bounds(shots);
  const c = mean(shots)!;
  const h = b.w;
  const v = b.h;

  if (v >= 1.8 * h && v > 3) {
    out.push({
      id: 'vertical',
      kind: 'firing',
      title: 'Vertical stringing',
      detail: `Shots spread ${v.toFixed(1)} in vertically but only ${h.toFixed(1)} in across.`,
      advice: 'Usually breathing during the release or a changing sight picture in height. Fire in the natural pause after breathing out and keep the foresight tip level with the backsight.',
    });
  }
  if (h >= 1.8 * v && h > 3) {
    out.push({
      id: 'horizontal',
      kind: 'firing',
      title: 'Horizontal spread',
      detail: `Shots spread ${h.toFixed(1)} in across but only ${v.toFixed(1)} in vertically.`,
      advice: 'Usually an unsteady hold or canting. Keep the butt firmly in the shoulder, the supporting hand still and the sights upright.',
    });
  }
  if (h > 6 && v > 6) {
    out.push({
      id: 'scattered',
      kind: 'firing',
      title: 'Scattered group',
      detail: `Shots cover an area of ${h.toFixed(1)} × ${v.toFixed(1)} in.`,
      advice: 'The firing position is not stable. Re-check elbows, body alignment and natural point of aim before the next group.',
    });
  }
  const split = twoClusters(shots);
  if (split) {
    out.push({
      id: 'bifocal',
      kind: 'firing',
      title: 'Two separate groups',
      detail: `Shots form two clusters ${split.separation.toFixed(1)} in apart.`,
      advice: 'Often a change of focus between foresight and target, or an inconsistent trigger press. Keep the eye on the foresight for every shot.',
    });
  }
  const side = opts.leftHanded ? 1 : -1; // low-left for right-handed firers
  const jerk = shots.filter((p) => (p.x - c.x) * side > 1.5 && p.y - c.y < -1.5).length;
  if (jerk >= 2) {
    out.push({
      id: 'trigger',
      kind: 'firing',
      title: opts.leftHanded ? 'Shots low and right' : 'Shots low and left',
      detail: `${jerk} shots fell low and to the ${opts.leftHanded ? 'right' : 'left'} of the group centre.`,
      advice: 'Typical of snatching the trigger. Squeeze straight back with steady pressure until the shot surprises you.',
    });
  }
  const high = shots.filter((p) => p.y - c.y > 2.5).length;
  if (high >= 2 && !out.some((d) => d.id === 'vertical')) {
    out.push({
      id: 'high',
      kind: 'firing',
      title: 'Shots thrown high',
      detail: `${high} shots landed well above the group centre.`,
      advice: 'Can come from anticipating recoil or lifting the head. Practise dry firing and keep the cheek on the butt through the shot.',
    });
  }
  return out;
}

export function zeroingDiagnostics(
  groupIn: number | null,
  offsetCm: Vec2 | null,
  radialCm: number | null,
  rules: Rules,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (groupIn != null) {
    const q =
      groupIn <= 2
        ? ['Excellent group', 'Very tight and consistent.']
        : groupIn <= 4
          ? ['Good group', 'Consistent enough for an accurate zero.']
          : groupIn <= 7
            ? ['Fair group', 'Acceptable, but tighter groups give a more reliable zero.']
            : groupIn <= rules.maxGroupIn
              ? ['Wide group', 'Within limits. Work on firing fundamentals before relying on this zero.']
              : ['Group too wide', `Larger than the ${rules.maxGroupIn} in limit, so the MPI is not reliable.`];
    out.push({ id: 'quality', kind: 'quality', title: q[0], detail: q[1] });
  }
  if (offsetCm && radialCm != null && radialCm > rules.zeroToleranceCm * 4) {
    out.push({
      id: 'big-offset',
      kind: 'zeroing',
      title: 'Large zero offset',
      detail: `The MPI is ${radialCm.toFixed(1)} cm from the aiming point.`,
      advice: 'Confirm the aiming point and sight setting before applying a large correction, then fire a confirmation group.',
    });
  }
  return out;
}

/** Best split into two clusters of >=2 shots each, if the clusters are clearly apart. */
function twoClusters(shots: Vec2[]): { separation: number } | null {
  const n = shots.length;
  if (n < 4 || n > 12) return null;
  let best: { separation: number; spread: number } | null = null;
  for (let mask = 1; mask < 1 << (n - 1); mask++) {
    const a: Vec2[] = [];
    const b: Vec2[] = [];
    for (let i = 0; i < n; i++) ((mask >> i) & 1 ? a : b).push(shots[i]);
    if (a.length < 2 || b.length < 2) continue;
    const ca = mean(a)!;
    const cb = mean(b)!;
    const spread = Math.max(...a.map((p) => dist(p, ca)), ...b.map((p) => dist(p, cb)));
    if (!best || spread < best.spread) best = { separation: dist(ca, cb), spread };
  }
  if (!best) return null;
  return best.separation > 3 && best.separation > 3 * Math.max(best.spread, 0.5) ? { separation: best.separation } : null;
}
