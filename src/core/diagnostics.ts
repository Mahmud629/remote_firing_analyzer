import type { Diagnostic, Rules, Vec2 } from './types';
import { bounds, dist, extremeSpread, mean } from './geometry';
import { PATTERN_BY_ID, clockHour, clockOf, type PatternId } from './precis';

export interface FiringDiagnosticsOptions {
  leftHanded?: boolean;
  /** Point of aim in target inches. */
  poa?: Vec2;
  /** MPI distance from the point of aim (in) inside which the weapon counts as zeroed. */
  toleranceIn?: number;
  /** A group up to this size (in) is a good group: no firer error is reported. */
  goodIn?: number;
  /** Elongated groups longer than this (in) are "long", otherwise "short". */
  longIn?: number;
}

function fromPattern(id: PatternId, detail: string, title?: string): Diagnostic {
  const p = PATTERN_BY_ID[id];
  return {
    id,
    kind: 'firing',
    pattern: id,
    title: title ?? p.name,
    detail,
    error: p.error,
    remedy: p.remedy,
    advice: `${p.why} Remedy: ${p.remedy}`,
    ref: `OWC précis ${p.ref}`,
  };
}

const f1 = (n: number) => n.toFixed(1);
const shotList = (idx: number[]) => (idx.length === 1 ? `shot ${idx[0] + 1}` : `shots ${idx.map((i) => i + 1).join(', ')}`);

/**
 * Clock sector of the précis patterns judged by direction (right-handed terms).
 * The sectors are wide on purpose: a coach calls a group low left of the aim a
 * 7 o'clock group even when it sits nearer 8.
 *   3:30–4:30 jerk · 4:30–5:30 low right · 6:30–8:30 buck · 10:00–12:00 flinch
 * Other directions (high, high right, right, straight low, left) have no précis
 * firer error: they are the sight setting.
 */
function clockPattern(hr: number): PatternId | null {
  if (hr >= 3.5 && hr < 4.5) return 'clock-4';
  if (hr >= 4.5 && hr < 5.5) return 'low-right';
  if (hr >= 6.5 && hr < 8.5) return 'clock-7';
  if (hr >= 10 && hr < 12) return 'clock-11';
  return null;
}

/** Clock time to the nearest half hour, e.g. "7½". */
function clockText(h: number): string {
  let r = Math.round(h * 2) / 2;
  if (r < 1) r += 12;
  const whole = Math.floor(r);
  return `${whole === 0 ? 12 : whole}${r % 1 ? '½' : ''}`;
}

/**
 * Shot group analysis after the OWC précis (Table 12-1, paras 1217, 1417, 1419).
 *
 * 1. A group within the good-group limit (5 in by default) AND on the aiming point
 *    (MPI within the zero tolerance) is a good group: no error.
 *    A tight group off the aiming point is judged by where it sits, as in the précis:
 *    at 4 o'clock a jerk, low right trigger / left elbow, at 7 o'clock a buck, at
 *    11 o'clock a flinch. In any other direction it is the sight setting.
 * 2. Over the limit, the shots are split into the firer's main group (the most
 *    shots that fit in a good group) and the shots that went astray. Where the
 *    strays went, seen from the main group, names the error:
 *      above or below           -> bifocal group (Ser 6)
 *      4 o'clock                -> jerk (Ser 8)
 *      4:30 to 5:30, low right  -> trigger control / left elbow (Ser 5)
 *      7 o'clock                -> buck (Ser 7)
 *      11 o'clock               -> flinch (Ser 9)
 *      out to one side          -> horizontal group (Ser 2 / 4)
 *      both ends of a line      -> vertical / horizontal group (Ser 1–4)
 *      every way                -> scattered group (Ser 10)
 *    Judging from the main group rather than the aiming point keeps the answer
 *    right while the weapon is still being zeroed.
 * 3. With no clear main group the shape decides: long/short vertical or
 *    horizontal, otherwise scattered.
 * Clock positions are for a right-handed firer and are mirrored for a left-handed one.
 */
export function firingDiagnostics(shots: Vec2[], opts: FiringDiagnosticsOptions = {}): Diagnostic[] {
  if (shots.length < 3) return [];
  const goodIn = opts.goodIn ?? 5;
  const longIn = opts.longIn ?? 7;
  const mirror = !!opts.leftHanded;
  const size = extremeSpread(shots)!.size;

  if (size <= goodIn) return position(shots, opts, `A tight group (${f1(size)} in)`);

  const split = findSplit(shots, goodIn);
  if (split) {
    const { core, strays, centre } = split;
    const vec = strays.map((i) => {
      const d = { x: shots[i].x - centre.x, y: shots[i].y - centre.y };
      return mirror ? { x: -d.x, y: d.y } : d;
    });
    const m = mean(vec)!;
    const mLen = Math.hypot(m.x, m.y);
    const consistent = mLen > 0 && vec.every((v) => (v.x * m.x + v.y * m.y) / (Math.hypot(v.x, v.y) * mLen) >= 0.64);
    const coreText = `${shotList(core)[0].toUpperCase()}${shotList(core).slice(1)} form the main group (${f1(split.coreSize)} in)`;
    if (consistent) {
      const hr = clockOf({ x: 0, y: 0 }, m);
      const seen = clockHour(clockOf({ x: 0, y: 0 }, mirror ? { x: -m.x, y: m.y } : m));
      const away = `${shotList(strays)} ${strays.length === 1 ? 'is' : 'are'} ${f1(mLen)} in away at ${seen} o’clock`;
      const lh = mirror ? ' (left-handed firer: clock mirrored)' : '';
      const id = clockPattern(hr);
      if (id) {
        const title = id === 'low-right' ? (mirror ? 'Low left group' : 'Low right group') : `Group at ${seen} o’clock`;
        return [fromPattern(id, `${coreText}; ${away}${lh}.`, title)];
      }
      if (Math.abs(m.y) >= Math.abs(m.x)) {
        const where = m.y > 0 ? 'above' : 'below';
        return [fromPattern('bifocal', `${coreText}; ${shotList(strays)} ${strays.length === 1 ? 'is' : 'are'} ${f1(mLen)} in ${where} it. Two points of focus.`)];
      }
      const b = bounds(shots);
      return [fromPattern(b.w > longIn ? 'long-horizontal' : 'short-horizontal', `${coreText}; ${away}, out to the side.`)];
    }
    if (vec.every((v) => Math.abs(v.y) >= 1.5 * Math.abs(v.x))) return [shape(shots, longIn, 'vertical')];
    if (vec.every((v) => Math.abs(v.x) >= 1.5 * Math.abs(v.y))) return [shape(shots, longIn, 'horizontal')];
    return [fromPattern('scattered', `${coreText}; ${shotList(strays)} went astray in different directions.`)];
  }
  const d = shape(shots, longIn);
  if (d.pattern === 'scattered') {
    // a wide but round group sitting off the aim at a précis clock position
    const pos = position(shots, opts, `A round group (${f1(size)} in)`);
    if (pos[0]?.pattern) return pos;
  }
  return [d];
}

/** Long / short vertical or horizontal from the shape of the whole group, otherwise scattered. */
function shape(shots: Vec2[], longIn: number, force?: 'vertical' | 'horizontal'): Diagnostic {
  const b = bounds(shots);
  const h = b.w;
  const v = b.h;
  if (force === 'vertical' || (!force && v >= 1.8 * h)) {
    return fromPattern(v > longIn ? 'long-vertical' : 'short-vertical', `Shots strung up and down: ${f1(v)} in high, ${f1(h)} in wide.`);
  }
  if (force === 'horizontal' || (!force && h >= 1.8 * v)) {
    return fromPattern(h > longIn ? 'long-horizontal' : 'short-horizontal', `Shots strung sideways: ${f1(h)} in wide, ${f1(v)} in high.`);
  }
  return fromPattern('scattered', `Shots cover ${f1(h)} × ${f1(v)} in with no main group.`);
}

/**
 * Where the whole group sits round the aiming point (OWC précis Table 12-1 Ser 5, 7, 8, 9).
 * Returns nothing when the MPI is within the zero tolerance.
 */
function position(shots: Vec2[], opts: FiringDiagnosticsOptions, what: string): Diagnostic[] {
  if (!opts.poa) return [];
  const c = mean(shots)!;
  const off = dist(c, opts.poa);
  if (off <= (opts.toleranceIn ?? 2)) return [];
  const mirror = !!opts.leftHanded;
  const hr = clockOf(opts.poa, c, mirror);
  const seen = clockOf(opts.poa, c);
  const where = `${what} with its MPI ${f1(off)} in from the aiming point, at about ${clockText(seen)} o’clock`;
  const id = clockPattern(hr);
  if (id) {
    const p = PATTERN_BY_ID[id];
    const shown = mirror && p.clock ? 12 - p.clock : p.clock;
    const title = id === 'low-right' ? (mirror ? 'Low left group' : 'Low right group') : `Group at ${shown} o’clock`;
    const lh = mirror ? ' (left-handed firer: clock mirrored)' : '';
    return [fromPattern(id, `${where}${lh}. Coach the firer, then apply the sight correction and fire again to confirm.`, title)];
  }
  return [
    {
      id: 'offset',
      kind: 'zeroing',
      title: `Group at ${clockHour(seen)} o’clock`,
      detail: `${where}. No firer error is named for this position in the précis: the sights are off.`,
      error: `Sights not zeroed: MPI ${f1(off * 2.54)} cm off.`,
      remedy: 'Apply the sight correction.',
    },
  ];
}

/**
 * The firer's main group: the most shots (at least half) that sit together, with the
 * other shots clearly apart from it. "Clearly apart" means the gap to the nearest
 * stray is well over the spacing inside the main group, so the next shot along a
 * string does not count as a stray. The main group may be a little over the
 * good-group limit (up to 1.5 times), as a real firer's group often is.
 */
function findSplit(shots: Vec2[], goodIn: number): { core: number[]; strays: number[]; centre: Vec2; coreSize: number } | null {
  const n = shots.length;
  if (n < 3 || n > 12) return null;
  const minCore = Math.max(2, Math.ceil(n / 2));
  type Cand = { core: number[]; strays: number[]; size: number; gap: number };
  let best: Cand | null = null;
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    const core: number[] = [];
    const strays: number[] = [];
    for (let i = 0; i < n; i++) ((mask >> i) & 1 ? core : strays).push(i);
    if (core.length < minCore) continue;
    const pts = core.map((i) => shots[i]);
    const size = extremeSpread(pts)!.size;
    if (size > 1.5 * goodIn) continue;
    const spacing = Math.max(...pts.map((p, a) => Math.min(...pts.filter((_, b) => b !== a).map((q) => dist(p, q)))));
    const gap = Math.min(...strays.map((i) => Math.min(...pts.map((q) => dist(shots[i], q)))));
    if (gap < Math.max(2.5, 1.3 * spacing)) continue;
    if (!best || core.length > best.core.length || (core.length === best.core.length && gap / Math.max(size, 0.5) > best.gap / Math.max(best.size, 0.5))) {
      best = { core, strays, size, gap };
    }
  }
  if (!best) return null;
  return { core: best.core, strays: best.strays, centre: mean(best.core.map((i) => shots[i]))!, coreSize: best.size };
}

export function zeroingDiagnostics(
  groupIn: number | null,
  offsetCm: Vec2 | null,
  radialCm: number | null,
  rules: Rules,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (groupIn != null) {
    const good = rules.goodGroupIn ?? 5;
    const zeroed = radialCm != null && radialCm <= rules.zeroToleranceCm;
    const q =
      groupIn <= good
        ? zeroed
          ? ['Good group', `Grouping ${groupIn.toFixed(1)} in, within the ${good} in limit, and on the aiming point.`]
          : ['Tight group', `Grouping ${groupIn.toFixed(1)} in is within the ${good} in limit, but the group is off the aiming point.`]
        : groupIn <= rules.maxGroupIn
          ? ['Wide group', `Grouping ${groupIn.toFixed(1)} in is over the ${good} in good-group limit, so the firer has an error to correct.`]
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
