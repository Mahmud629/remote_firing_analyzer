import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_RULES, firingDiagnostics, GROUP_PATTERNS, clockOf } from '../src/core';
import type { Vec2 } from '../src/core';

const poa = { x: 0, y: 0 };
const opts = { poa, toleranceIn: 5 / 2.54, goodIn: 5, longIn: 7 };
const ids = (shots: Vec2[], o = {}) => firingDiagnostics(shots, { ...opts, ...o }).filter((d) => d.pattern).map((d) => d.pattern);
/** A tight 4-shot main group round (cx, cy). */
const core = (cx = 0, cy = 0): Vec2[] => [
  { x: cx + 0.8, y: cy + 0.5 }, { x: cx - 0.9, y: cy + 0.3 }, { x: cx - 0.3, y: cy - 0.9 }, { x: cx + 0.6, y: cy - 0.7 },
];
const atClock = (h: number, r: number, c: Vec2 = { x: 0, y: 0 }): Vec2 => ({ x: c.x + r * Math.sin((h * Math.PI) / 6), y: c.y + r * Math.cos((h * Math.PI) / 6) });

describe('OWC précis shot group analysis (Table 12-1)', () => {
  it('has all ten patterns with error and remedy', () => {
    expect(GROUP_PATTERNS.map((p) => p.ser)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const p of GROUP_PATTERNS) expect(p.error && p.remedy).toBeTruthy();
  });

  it('clock positions', () => {
    expect(Math.round(clockOf(poa, { x: 0, y: 5 }))).toBe(12);
    expect(Math.round(clockOf(poa, { x: 5, y: 0 }))).toBe(3);
    expect(Math.round(clockOf(poa, { x: 0, y: -5 }))).toBe(6);
    expect(Math.round(clockOf(poa, { x: -5, y: 0 }, true))).toBe(3);
  });

  it('a group within 5 in is a good group with no firer error, whatever its shape', () => {
    expect(ids([...core(), { x: 0.2, y: 0.1 }])).toEqual([]);
    // drawn out up and down but only 4 in long: still good
    expect(ids([{ x: 0, y: 2 }, { x: 0.2, y: 1 }, { x: -0.1, y: 0 }, { x: 0.1, y: -1 }, { x: 0, y: -2 }])).toEqual([]);
    const a = analyze([...core(), { x: 0.2, y: 0.1 }], poa, DEFAULT_RULES);
    expect(a.status).toBe('ZEROED');
    expect(a.diagnostics.find((d) => d.kind === 'quality')?.title).toBe('Good group');
  });

  it('a tight group off the aim is judged by where it sits (précis clock positions)', () => {
    const tight = (h: number, r = 10) => { const c = atClock(h, r); return [...core(c.x, c.y), c]; };
    expect(ids(tight(4))).toEqual(['clock-4']);
    expect(ids(tight(5))).toEqual(['low-right']);
    expect(ids(tight(7))).toEqual(['clock-7']);
    expect(ids(tight(11))).toEqual(['clock-11']);
    // other directions: no firer error, the sights are off
    const d = firingDiagnostics(tight(2), opts);
    expect(d.filter((x) => x.pattern)).toEqual([]);
    expect(d[0]?.id).toBe('offset');
    expect(d[0]?.error).toMatch(/Sights not zeroed/);
    // within the zero tolerance: good group, nothing to report
    expect(firingDiagnostics(tight(7, 1), opts)).toEqual([]);
  });

  it('field photo 2: a 4.6 in group low left, 10 in off the aim -> group at 7 o’clock', () => {
    const shots = [{ x: -9.75, y: -5.09 }, { x: -8.48, y: -8.23 }, { x: -6.71, y: -7.48 }, { x: -8.04, y: -3.94 }, { x: -6.93, y: -5.53 }];
    const a = analyze(shots, poa, DEFAULT_RULES);
    const d = a.diagnostics.find((x) => x.pattern)!;
    expect(d.pattern).toBe('clock-7');
    expect(d.title).toBe('Group at 7 o’clock');
    expect(d.error).toMatch(/Buck/);
    expect(a.diagnostics.find((x) => x.kind === 'quality')?.title).toBe('Tight group');
  });

  it('the field photo: four shots round the centre, one high right -> bifocal, not scattered', () => {
    const shots = [{ x: 2.3, y: -1.2 }, { x: -1.1, y: -2.05 }, { x: -2.3, y: 2.0 }, { x: 3.76, y: 6.8 }, { x: -2.75, y: -0.07 }];
    expect(ids(shots)).toEqual(['bifocal']);
    expect(analyze(shots, poa, DEFAULT_RULES).diagnostics.find((d) => d.pattern)?.detail).toMatch(/shot 4 is .* above/);
  });

  it('bifocal: two above, three below', () => {
    expect(ids([{ x: 0, y: 3 }, { x: 0.6, y: 3.3 }, { x: 0, y: -3 }, { x: 0.6, y: -3.2 }, { x: -0.5, y: -2.8 }])).toEqual(['bifocal']);
  });

  it('strays from the main group by clock: jerk, low right, buck, flinch', () => {
    expect(ids([...core(), atClock(4, 6)])).toEqual(['clock-4']);
    expect(ids([...core(), atClock(5, 6)])).toEqual(['low-right']);
    expect(ids([...core(), atClock(7, 6)])).toEqual(['clock-7']);
    expect(ids([...core(), atClock(11, 6)])).toEqual(['clock-11']);
    // two strays together at 4 o'clock
    expect(ids([...core().slice(0, 3), atClock(4, 6), atClock(4, 6.6)])).toEqual(['clock-4']);
    // judged from the main group, so it holds while the weapon is still off zero
    const c = { x: -4, y: 5 };
    expect(ids([...core(c.x, c.y), atClock(4, 6, c)])).toEqual(['clock-4']);
  });

  it('left-handed firer: clock mirrored', () => {
    expect(ids([...core(), atClock(8, 6)], { leftHanded: true })).toEqual(['clock-4']);
    expect(ids([...core(), atClock(4, 6)], { leftHanded: true })).toEqual(['clock-7']);
  });

  it('a shot out to the side is a horizontal error', () => {
    expect(ids([...core(), atClock(3, 6)])).toEqual(['short-horizontal']);
    expect(ids([...core(), atClock(9, 8)])).toEqual(['long-horizontal']);
  });

  it('strings: short and long, vertical and horizontal', () => {
    expect(ids([{ x: 0, y: 3 }, { x: 0.3, y: 1.5 }, { x: -0.2, y: 0 }, { x: 0.1, y: -1.5 }, { x: 0, y: -3 }])).toEqual(['short-vertical']);
    expect(ids([{ x: 0, y: 4.5 }, { x: 0.3, y: 2.2 }, { x: -0.2, y: 0 }, { x: 0.1, y: -2.2 }, { x: 0, y: -4.5 }])).toEqual(['long-vertical']);
    expect(ids([{ x: 4.5, y: 0 }, { x: 2.2, y: 0.3 }, { x: 0, y: -0.2 }, { x: -2.2, y: 0.1 }, { x: -4.5, y: 0 }])).toEqual(['long-horizontal']);
    // main group with strays at both ends of a vertical line
    expect(ids([...core().slice(0, 3), { x: 0, y: 5 }, { x: 0.2, y: -5 }])).toEqual(['long-vertical']);
  });

  it('scattered', () => {
    expect(ids([{ x: -4, y: 4 }, { x: 4, y: 4.5 }, { x: 0, y: 0 }, { x: -4.5, y: -4 }, { x: 4, y: -4 }])).toEqual(['scattered']);
  });

  it('analyze() reports the précis error and remedy', () => {
    const a = analyze([{ x: 0, y: 4.5 }, { x: 0.3, y: 2.2 }, { x: -0.2, y: 0 }, { x: 0.1, y: -2.2 }, { x: 0, y: -4.5 }], poa, DEFAULT_RULES);
    const d = a.diagnostics.find((x) => x.pattern)!;
    expect(d.error).toMatch(/breathing/);
    expect(d.remedy).toMatch(/Dry aiming/);
    expect(d.ref).toMatch(/Table 12-1 Ser 1/);
  });
});
