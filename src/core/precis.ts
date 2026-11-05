import type { Vec2 } from './types';

/**
 * Shot group analysis as taught in the OWC précis (Table 12-1, para 1217;
 * reasons in para 1417 and common errors in para 1419). The wording of the
 * error and remedy columns follows the précis so the app and the coach speak
 * the same language.
 */
export type PatternId =
  | 'long-vertical'
  | 'long-horizontal'
  | 'short-vertical'
  | 'short-horizontal'
  | 'low-right'
  | 'bifocal'
  | 'clock-7'
  | 'clock-4'
  | 'clock-11'
  | 'scattered';

export interface GroupPattern {
  id: PatternId;
  /** Serial in Table 12-1. */
  ser: number;
  name: string;
  /** Short form for the "Error" tile. */
  error: string;
  /** Fuller explanation of the error (précis para 1417 / 1419). */
  why: string;
  remedy: string;
  ref: string;
  /** Clock position for the patterns that are judged by where the group sits. */
  clock?: number;
  /** Bullet marks for the small reference sketch: x right, y up, roughly -1..1 around the aiming point. */
  sketch: Vec2[];
}

const at = (cx: number, cy: number, r = 0.12): Vec2[] => [
  { x: cx, y: cy },
  { x: cx + r, y: cy + r * 0.5 },
  { x: cx - r * 0.8, y: cy + r * 0.7 },
  { x: cx - r * 0.5, y: cy - r * 0.9 },
  { x: cx + r * 0.7, y: cy - r * 0.6 },
];

export const GROUP_PATTERNS: GroupPattern[] = [
  {
    id: 'long-vertical',
    ser: 1,
    name: 'Long vertical group',
    error: 'Wrong sight alignment (vertical error) and improper breathing.',
    why: 'Foresight tip held high or low in the backsight U, and wrong breathing control: the barrel moves with the rise and fall of the chest, or the breath is held too long before the shot.',
    remedy: 'Explain the mistake to the firer. Dry aiming practice and breathing control exercise.',
    ref: 'Table 12-1 Ser 1; paras 1417b, 1419j',
    sketch: [{ x: 0, y: 0.8 }, { x: 0.06, y: 0.42 }, { x: -0.02, y: 0.04 }, { x: 0.04, y: -0.4 }, { x: 0, y: -0.8 }],
  },
  {
    id: 'long-horizontal',
    ser: 2,
    name: 'Long horizontal group',
    error: 'Wrong sight alignment (lateral error); left hand moving sideways.',
    why: 'Foresight tip held left or right in the backsight U, and the left hand moves horizontally because of poor holding.',
    remedy: 'Explain the mistake to the firer. Dry aiming practice.',
    ref: 'Table 12-1 Ser 2; para 1417a',
    sketch: [{ x: -0.8, y: 0 }, { x: -0.4, y: -0.06 }, { x: 0.02, y: 0.04 }, { x: 0.42, y: -0.04 }, { x: 0.8, y: 0 }],
  },
  {
    id: 'short-vertical',
    ser: 3,
    name: 'Short vertical group',
    error: 'Wrong placement of the aiming point.',
    why: 'The aim is taken a little higher or lower on the target for each shot, often with uneven breathing.',
    remedy: 'Explain the mistake to the firer. Dry aiming practice.',
    ref: 'Table 12-1 Ser 3',
    sketch: [{ x: 0, y: 0.36 }, { x: 0.04, y: 0.17 }, { x: -0.03, y: 0 }, { x: 0.02, y: -0.18 }, { x: 0, y: -0.36 }],
  },
  {
    id: 'short-horizontal',
    ser: 4,
    name: 'Short horizontal group',
    error: 'Wrong placement of the aiming point.',
    why: 'The aim is taken a little left or right on the target for each shot, often with the left hand not steady.',
    remedy: 'Explain the mistake to the firer. Dry aiming practice.',
    ref: 'Table 12-1 Ser 4',
    sketch: [{ x: -0.36, y: 0 }, { x: -0.17, y: 0.04 }, { x: 0, y: -0.03 }, { x: 0.18, y: 0.02 }, { x: 0.36, y: 0 }],
  },
  {
    id: 'low-right',
    ser: 5,
    name: 'Low right group',
    error: 'Improper trigger control, or left elbow slipping out.',
    why: 'The trigger is not pressed straight to the rear with steadily rising pressure, or the left elbow slides out while firing.',
    remedy: 'Tin disc exercise.',
    ref: 'Table 12-1 Ser 5; para 1418',
    clock: 5,
    sketch: at(0.33, -0.57),
  },
  {
    id: 'bifocal',
    ser: 6,
    name: 'Bifocal group',
    error: 'Critical focus: once on the foresight, once on the point of aim.',
    why: 'Shots go below the point of aim when the eye is on the point of aim and above when it is on the foresight tip; the trigger pull is not understood.',
    remedy: 'Blank target exercise.',
    ref: 'Table 12-1 Ser 6; paras 1417c, 1419h',
    sketch: [{ x: -0.1, y: 0.55 }, { x: 0.1, y: 0.62 }, { x: 0, y: -0.42 }, { x: -0.13, y: -0.53 }, { x: 0.11, y: -0.5 }],
  },
  {
    id: 'clock-7',
    ser: 7,
    name: 'Group at 7 o’clock',
    error: 'Buck: shoulder pushed forward to meet the recoil.',
    why: 'Just before the shot the firer tenses the shoulder muscles and pushes the shoulder forward to take up the recoil.',
    remedy: 'Ball and dummy round exercise.',
    ref: 'Table 12-1 Ser 7; para 1419g',
    clock: 7,
    sketch: at(-0.33, -0.57),
  },
  {
    id: 'clock-4',
    ser: 8,
    name: 'Group at 4 o’clock',
    error: 'Jerk: trigger pressed rapidly (snatched).',
    why: 'The trigger is pressed rapidly the instant the sight picture looks right, or after holding the breath too long and pressing before breathing out.',
    remedy: 'Tin disc exercise.',
    ref: 'Table 12-1 Ser 8; para 1419e',
    clock: 4,
    sketch: at(0.57, -0.33),
  },
  {
    id: 'clock-11',
    ser: 9,
    name: 'Group at 11 o’clock',
    error: 'Flinch: reaction to the expected recoil.',
    why: 'Reaction to the expected recoil: head moves, eye closes, left arm tenses or the shoulders pull back.',
    remedy: 'Apply cotton in the ears and tin disc exercise.',
    ref: 'Table 12-1 Ser 9; paras 1412d, 1419f',
    clock: 11,
    sketch: at(-0.33, 0.57),
  },
  {
    id: 'scattered',
    ser: 10,
    name: 'Scattered group',
    error: 'All possible mistakes committed together.',
    why: 'All factors of a correct hold are not ensured; elbows and body move while firing; too much strength or too long a time in the aim.',
    remedy: 'Re-examine all the factors of a steady hold.',
    ref: 'Table 12-1 Ser 10; paras 1417d, 1419a',
    sketch: [{ x: -0.7, y: 0.6 }, { x: 0.72, y: 0.7 }, { x: 0.04, y: -0.18 }, { x: -0.78, y: -0.6 }, { x: 0.7, y: -0.76 }],
  },
];

export const PATTERN_BY_ID = Object.fromEntries(GROUP_PATTERNS.map((p) => [p.id, p])) as Record<PatternId, GroupPattern>;

/** Clock position of `p` seen from `from` (12 = straight up, 3 = right), as a fraction 0 < h <= 12. */
export function clockOf(from: Vec2, p: Vec2, mirror = false): number {
  const dx = (p.x - from.x) * (mirror ? -1 : 1);
  const dy = p.y - from.y;
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const h = deg / 30;
  return h === 0 ? 12 : h;
}

/** Rounded clock hour, 1..12. */
export function clockHour(h: number): number {
  const r = Math.round(h) % 12;
  return r === 0 ? 12 : r;
}
