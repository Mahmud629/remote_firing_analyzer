import { describe, expect, it } from 'vitest';
import { analyze, recordStatus, DEFAULT_RULES, classify } from '../src/core';

const centre = { x: 0, y: 0 };
const tight = (dx = 0, dy = 0) => [
  { x: dx + 0.5, y: dy + 0.5 },
  { x: dx - 0.5, y: dy + 0.4 },
  { x: dx + 0.2, y: dy - 0.6 },
  { x: dx - 0.3, y: dy - 0.2 },
  { x: dx + 0.1, y: dy - 0.1 },
];

describe('zeroing analysis', () => {
  it('zeroed when MPI is within 5 cm', () => {
    const a = analyze(tight(), centre);
    expect(a.status).toBe('ZEROED');
    expect(a.classification).toBe('Marksman');
    expect(a.radialErrorCm!).toBeLessThan(5);
  });

  it('adjustment with correct direction and BD-08 turns', () => {
    // group 4 in right (10.16 cm) and 2 in low (5.08 cm)
    const a = analyze(tight(4, -2), centre);
    expect(a.status).toBe('ADJUST');
    expect(a.correction!.lateral.direction).toBe('left');
    expect(a.correction!.vertical.direction).toBe('up');
    expect(a.correction!.lateral.turns).toBeCloseTo(a.correction!.lateral.cm / 32, 6);
    expect(a.correction!.vertical.turns).toBeCloseTo(a.correction!.vertical.cm / 24, 6);
    expect(a.correction!.lateral.cm).toBeCloseTo(10.16, 1);
  });

  it('washout when the group is wider than 10 in', () => {
    const shots = [{ x: -6, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }];
    const a = analyze(shots, centre);
    expect(a.status).toBe('WASHOUT');
    expect(a.group!.sizeIn).toBeCloseTo(11, 6);
  });

  it('washout with too many rounds; incomplete (saved as washout) with too few', () => {
    expect(analyze([...tight(), { x: 0, y: 0 }], centre).status).toBe('WASHOUT');
    const few = analyze(tight().slice(0, 3), centre);
    expect(few.status).toBe('INCOMPLETE');
    expect(recordStatus(few)).toBe('WASHOUT');
  });

  it('classification bands', () => {
    expect(classify(4)).toBe('Marksman');
    expect(classify(4.01)).toBe('First class firer');
    expect(classify(7)).toBe('First class firer');
    expect(classify(10)).toBe('Standard firer');
    expect(classify(10.5)).toBe('Requires training');
  });

  it('flags vertical stringing in inches regardless of image size', () => {
    const shots = [{ x: 0, y: 3 }, { x: 0.3, y: 1.5 }, { x: -0.2, y: 0 }, { x: 0.1, y: -1.5 }, { x: 0, y: -3 }];
    const a = analyze(shots, centre, DEFAULT_RULES);
    expect(a.diagnostics.some((d) => d.id === 'vertical')).toBe(true);
  });

  it('uses the aiming point, not the ring centre', () => {
    const a = analyze(tight(0, 6), { x: 0, y: 6 });
    expect(a.status).toBe('ZEROED');
  });
});
