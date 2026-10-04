'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Minus, Target } from 'lucide-react';
import { Segmented } from '@/components/ui';
import type { AxisCorrection } from '@/core/types';
import { useSettings } from '@/state/settings';
import { STATUS_LABEL, STATUS_TONE, UNITS, correctionText, fmt, fmtLen, turnsText } from '@/lib/format';
import { useAnalysis } from './useAnalysis';

const toneText = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', idle: 'text-muted' };
const toneBg = { ok: 'bg-ok/10', warn: 'bg-warn/10', bad: 'bg-bad/10', idle: 'bg-sunk' };

/** Status, grouping, error and the solution. Everything else sits under Details. */
export function ResultPanel() {
  const view = useAnalysis();
  const unit = useSettings((s) => s.unit);
  const update = useSettings((s) => s.update);
  const [open, setOpen] = useState(false);

  if (!view) {
    return (
      <section className="flex min-h-[170px] flex-col items-center justify-center gap-2 rounded-lg border border-rule bg-sheet p-4 text-center text-muted">
        <Target size={30} className="opacity-50" aria-hidden />
        <span className="font-display text-lg font-semibold text-ink">Result</span>
        <span className="text-sm">Appears as soon as the picture is calibrated</span>
      </section>
    );
  }
  const a = view.analysis;
  const tone = STATUS_TONE[a.status];
  const cm = (v: number | null) => (v == null ? null : v / 2.54);
  const alt = (inches: number | null) => (inches == null ? undefined : unit === 'in' ? `${fmt(inches * 2.54, 1)} cm` : `${fmt(inches)}″`);
  const off = a.offsetCm;

  return (
    <section className="overflow-hidden rounded-lg border border-rule bg-sheet" aria-live="polite">
      <div className={clsx('relative flex items-center justify-center px-4 py-3', toneBg[tone])}>
        <h2 className={clsx('text-center font-display text-[32px] font-bold uppercase leading-none tracking-wide', toneText[tone])}>{STATUS_LABEL[a.status]}</h2>
        <span className="num absolute right-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted">
          <span className="text-ink">{a.count}</span>/{a.required}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-px border-y border-rule bg-rule">
        <Tile label="Grouping" value={a.group ? fmtLen(a.group.sizeIn, unit) : '–'} sub={a.classification ?? alt(a.group?.sizeIn ?? null)} big />
        <Tile label="Error" value={fmtLen(cm(a.radialErrorCm), unit)} sub={alt(cm(a.radialErrorCm))} big />
      </dl>

      {a.correction && a.count >= 2 && (
        <div className="p-3">
          <h3 className="mb-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted">Solution: move the MPI</h3>
          <div className="grid grid-cols-2 gap-2">
            <Correction axis="Lateral" c={a.correction.lateral} />
            <Correction axis="Vertical" c={a.correction.vertical} />
          </div>
        </div>
      )}

      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-1.5 border-t border-rule px-4 py-2 text-sm font-medium text-muted hover:text-ink" aria-expanded={open}>
        Details
        <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-rule">
          <dl className="grid grid-cols-2 gap-px bg-rule">
            <Tile label="MPI from aim" value={off ? `${fmtLen(Math.abs(off.x) / 2.54, unit)} ${off.x >= 0 ? 'R' : 'L'}` : '–'} sub={off ? `${fmtLen(Math.abs(off.y) / 2.54, unit)} ${off.y >= 0 ? 'high' : 'low'}` : undefined} />
            <Tile label="Sight turns" value={a.correction ? `Lat ${fmt(a.correction.lateral.turns)}` : '–'} sub={a.correction ? `Ver ${fmt(a.correction.vertical.turns)}` : undefined} />
          </dl>
          <div className="p-3">
            <Segmented label="Length unit" value={unit} onChange={(u) => update({ unit: u })} options={UNITS} />
          </div>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className="flex min-h-[78px] flex-col items-center justify-center bg-sheet px-3 py-2.5 text-center">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={clsx('num font-semibold leading-tight', big ? 'text-[28px]' : 'text-lg')}>{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

const ICON = { left: ArrowLeft, right: ArrowRight, up: ArrowUp, down: ArrowDown, none: Minus };

function Correction({ axis, c }: { axis: string; c: AxisCorrection }) {
  const Icon = ICON[c.direction];
  return (
    <div className="flex min-h-[84px] flex-col items-center justify-center gap-0.5 rounded-md bg-sunk px-2 py-2 text-center">
      <span className="text-xs text-muted">{axis}</span>
      <span className="num flex items-center gap-1.5 text-[17px] font-semibold leading-tight">
        <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-full', c.direction === 'none' ? 'bg-rule text-muted' : 'bg-olive text-olive-ink')}>
          <Icon size={14} aria-hidden />
        </span>
        {correctionText(c)}
      </span>
      <span className="num text-sm text-muted">{turnsText(c)}</span>
    </div>
  );
}
