'use client';
import clsx from 'clsx';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { STATUS_LABEL, STATUS_TONE, correctionText, fmt, fmtLen } from '@/lib/format';
import { useAnalysis } from './useAnalysis';

const tone = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', idle: 'text-muted' };

/** One strip under the target: equal boxes, centred text. */
export function StatusBar() {
  const view = useAnalysis();
  const unit = useSettings((s) => s.unit);
  const mode = useAnalyzer((s) => s.mode);
  const ms = useAnalyzer((s) => s.live?.ms ?? 0);
  const a = view?.analysis;
  const cm = (v: number | null | undefined) => (v == null ? null : v / 2.54);
  const live = mode === 'live';

  const cell = (label: string, value: string, cls?: string) => (
    <div className="flex min-h-[56px] min-w-0 flex-col items-center justify-center bg-sheet px-2 py-1.5 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={clsx('num text-[16px] font-semibold leading-tight', cls)}>{value}</div>
    </div>
  );

  return (
    <div
      className={clsx('grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3', live ? 'xl:grid-cols-6' : 'xl:grid-cols-5')}
      role="status"
    >
      {cell('Status', a ? STATUS_LABEL[a.status].toUpperCase() : '–', a ? tone[STATUS_TONE[a.status]] : undefined)}
      {cell('Grouping', a?.group ? fmtLen(a.group.sizeIn, unit) : '–')}
      {cell('Radial', a ? fmtLen(cm(a.radialErrorCm), unit) : '–')}
      {cell('Correction', a?.correction && a.count >= 2 ? `${correctionText(a.correction.lateral)} | ${correctionText(a.correction.vertical)}` : '–')}
      {cell('Sight turns', a?.correction && a.count >= 2 ? `Lat ${fmt(a.correction.lateral.turns)} | Ver ${fmt(a.correction.vertical.turns)}` : '–')}
      {live && cell('Live', ms ? `${Math.round(ms)} ms/frame` : 'starting', 'text-olive')}
    </div>
  );
}
