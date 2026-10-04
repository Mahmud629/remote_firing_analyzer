'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { Panel } from '@/components/ui';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { STATUS_LABEL, adviceFix, fmtLen } from '@/lib/format';
import { useAnalysis } from './useAnalysis';

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-md bg-sunk px-3 py-2 text-center">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <div className="text-sm font-medium leading-snug">{children}</div>
    </div>
  );
}

/** Fills the rest of the right column: type of group, error and the fix; the long text sits under Details. */
export function InsightsCard() {
  const view = useAnalysis();
  const session = useAnalyzer((s) => s.session);
  const firerId = useAnalyzer((s) => s.meta.firerId);
  const toggleGroup = useAnalyzer((s) => s.toggleGroup);
  const unit = useSettings((s) => s.unit);
  const [open, setOpen] = useState(false);
  const own = session && session.firerId === firerId ? session : null;
  const a = view?.analysis;

  if (!a && !own?.groups.length) {
    return (
      <Panel title="Group analysis" fill centered className="lg:min-h-[150px]">
        <div className="grid h-full min-h-[90px] place-items-center text-center text-sm text-muted">
          <span className="flex flex-col items-center gap-2">
            <Lightbulb size={26} className="opacity-50" aria-hidden />
            Type of group, error and fix appear here.
          </span>
        </div>
      </Panel>
    );
  }

  const diags = a?.diagnostics ?? [];
  const types = diags.map((d) => d.title).slice(0, 3);
  const error = a ? (a.reasons[0] ?? (a.status === 'ZEROED' ? 'No error' : '–')) : '–';
  const advice = diags.find((d) => d.advice)?.advice;
  const fix = !a
    ? '–'
    : a.count > a.required
      ? 'Delete false marks, or press Next group.'
      : a.count < a.required
        ? 'Mark the missing bullets.'
        : advice
          ? adviceFix(advice)
          : a.status === 'ADJUST'
            ? 'Apply the sight correction.'
            : a.status === 'ZEROED'
              ? 'None needed.'
              : '–';

  return (
    <Panel title="Group analysis" fill centered className="lg:min-h-[150px]">
      <div className="flex flex-col gap-2">
        {own && own.groups.length > 0 && (
          <ul className="flex flex-col gap-1">
            {own.groups.map((g) => (
              <li key={g.no} className="flex items-center gap-2 rounded-md bg-sunk px-2.5 py-1.5 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="font-semibold">Group {g.no}</span>
                <span className="num text-muted">{g.groupIn != null ? fmtLen(g.groupIn, unit) : '–'}</span>
                <span className={clsx('ml-auto text-xs font-semibold', g.status === 'ZEROED' ? 'text-ok' : g.status === 'ADJUST' ? 'text-warn' : 'text-bad')}>{STATUS_LABEL[g.status]}</span>
                <button type="button" onClick={() => toggleGroup(g.no)} className="rounded p-0.5 text-muted hover:text-ink" aria-label={g.visible ? `Hide group ${g.no}` : `Show group ${g.no}`}>
                  {g.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {a && (
          <>
            <Block label="Grouping type">{types.length ? types.join(' · ') : '–'}</Block>
            <Block label="Error">{error}</Block>
            <Block label="Solution">{fix}</Block>
            {(diags.length > 0 || a.reasons.length > 0) && (
              <>
                <button type="button" onClick={() => setOpen(!open)} className="flex items-center justify-center gap-1.5 py-1 text-sm font-medium text-muted hover:text-ink" aria-expanded={open}>
                  Details
                  <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <ul className="flex flex-col gap-2.5 text-center">
                    {a.reasons.map((r, i) => (
                      <li key={`r${i}`} className="text-sm leading-snug text-muted">
                        {r}
                      </li>
                    ))}
                    {diags.map((d) => (
                      <li key={d.id} className="text-sm leading-snug">
                        <span className="font-semibold">{d.title}.</span> {d.detail}
                        {d.advice && <span className="mt-0.5 block text-muted">{d.advice}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
