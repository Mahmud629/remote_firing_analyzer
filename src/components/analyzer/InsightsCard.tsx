'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { BookOpen, ChevronDown, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { Panel } from '@/components/ui';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { STATUS_LABEL, fmtLen } from '@/lib/format';
import type { PatternId } from '@/core/precis';
import { useAnalysis } from './useAnalysis';
import { PatternSketch, PrecisChartDialog } from './PrecisChart';
import { PATTERN_BY_ID } from '@/core/precis';

/** Each tile has its own colour: blue = what the group looks like, amber = the error, green = the fix. */
const TONES = {
  aim: 'border-aim/40 bg-aim/10 text-aim',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  ok: 'border-ok/40 bg-ok/10 text-ok',
} as const;

function Block({ label, tone, children }: { label: string; tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <div className={clsx('flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-md border border-l-4 px-3 py-2 text-center', TONES[tone])}>
      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      <div className="text-sm font-medium leading-snug text-ink">{children}</div>
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
  const [chart, setChart] = useState(false);
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
  // Précis shot group analysis: a good group (within the good-group limit) has no firer error;
  // a wider group gets one pattern from Table 12-1 with its error and remedy.
  const patterns = diags.filter((d) => d.pattern);
  const quality = diags.find((d) => d.kind === 'quality');
  const primary = diags.find((d) => d.error);
  const good = !primary && quality?.title === 'Good group';
  const types = primary ? [primary.title] : quality ? [quality.title] : [];
  const error = !a
    ? '–'
    : primary
      ? primary.error!
      : good
        ? a.status === 'ZEROED'
          ? 'No error.'
          : a.status === 'ADJUST'
            ? `No firer error. Sights off by ${a.radialErrorCm!.toFixed(1)} cm.`
            : 'No error so far.'
        : (a.reasons[0] ?? '–');
  const fix = !a
    ? '–'
    : a.count > a.required
      ? 'Delete false marks, or press Next group.'
      : a.count < a.required
        ? 'Mark the missing bullets.'
        : primary?.remedy
          ? primary.remedy
          : a.status === 'ADJUST'
            ? 'Apply the sight correction.'
            : a.status === 'ZEROED'
              ? 'None needed. Weapon zeroed.'
              : '–';
  const highlight = patterns.map((d) => d.pattern!) as PatternId[];

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
            <Block label="Grouping type" tone="aim">
              <span className="flex items-center justify-center gap-2">
                {primary?.pattern && <PatternSketch p={PATTERN_BY_ID[primary.pattern]} size={34} active />}
                <span>{types.length ? types.join(' · ') : '–'}</span>
              </span>
            </Block>
            <Block label="Error" tone={good && a.status !== 'WASHOUT' ? 'ok' : 'warn'}>{error}</Block>
            <Block label="Solution" tone="ok">{fix}</Block>
            <div className="flex items-center justify-center gap-4">
              {(diags.length > 0 || a.reasons.length > 0) && (
                <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 py-1 text-sm font-medium text-muted hover:text-ink" aria-expanded={open}>
                  Details
                  <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} />
                </button>
              )}
              <button type="button" onClick={() => setChart(true)} className="flex items-center gap-1.5 py-1 text-sm font-medium text-muted hover:text-ink" title="Shot group analysis chart (OWC précis Table 12-1)">
                <BookOpen size={15} />
                Précis chart
              </button>
            </div>
            <PrecisChartDialog open={chart} onClose={() => setChart(false)} highlight={highlight} />
            {(diags.length > 0 || a.reasons.length > 0) && (
              <>
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
                        {d.pattern ? (
                          <>
                            <span className="mt-0.5 block">
                              <span className="font-semibold text-warn">Error:</span> {d.error} <span className="text-muted">{PATTERN_BY_ID[d.pattern].why}</span>
                            </span>
                            <span className="mt-0.5 block">
                              <span className="font-semibold text-ok">Remedy:</span> {d.remedy}
                            </span>
                            {d.ref && <span className="mt-0.5 block text-xs text-muted">{d.ref}</span>}
                          </>
                        ) : (
                          d.advice && <span className="mt-0.5 block text-muted">{d.advice}</span>
                        )}
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
