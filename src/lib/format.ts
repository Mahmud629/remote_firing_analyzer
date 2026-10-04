import type { AxisCorrection, ZeroStatus } from '../core/types';

export const STATUS_LABEL: Record<ZeroStatus, string> = {
  ZEROED: 'Zeroed',
  ADJUST: 'Adjust sights',
  WASHOUT: 'Washout',
  INCOMPLETE: 'Waiting for rounds',
};

export const STATUS_TONE: Record<ZeroStatus, 'ok' | 'warn' | 'bad' | 'idle'> = {
  ZEROED: 'ok',
  ADJUST: 'warn',
  WASHOUT: 'bad',
  INCOMPLETE: 'idle',
};

export const fmt = (v: number | null | undefined, digits = 2) => (v == null || !isFinite(v) ? '–' : v.toFixed(digits));

export function correctionText(c: AxisCorrection): string {
  if (c.direction === 'none') return 'No change';
  return `${c.cm.toFixed(1)} cm ${c.direction}`;
}

export function turnsText(c: AxisCorrection): string {
  if (c.direction === 'none') return '0 turns';
  const t = c.turns;
  return `${t.toFixed(2)} ${t === 1 ? 'turn' : 'turns'}`;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  );
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type Unit = 'in' | 'cm' | 'mm';
export const UNITS: { value: Unit; label: string }[] = [
  { value: 'in', label: 'Inch' },
  { value: 'cm', label: 'cm' },
  { value: 'mm', label: 'mm' },
];

/** Length given in inches, shown in the chosen unit. */
export function fmtLen(inches: number | null | undefined, unit: Unit): string {
  if (inches == null || !isFinite(inches)) return '–';
  if (unit === 'cm') return `${(inches * 2.54).toFixed(1)} cm`;
  if (unit === 'mm') return `${(inches * 25.4).toFixed(0)} mm`;
  return `${inches.toFixed(2)}″`;
}

/** Advice texts are "cause. fix." : returns the fix (the second sentence), or the whole text when it is a single sentence. */
export function adviceFix(advice: string | undefined): string {
  if (!advice) return '';
  const sentences = advice.match(/[^.!?]+[.!?]+/g)?.map((t) => t.trim()) ?? [advice.trim()];
  return (sentences[1] ?? sentences[0]).trim();
}
