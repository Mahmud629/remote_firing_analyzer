'use client';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';

type St = 'done' | 'now' | 'todo' | 'warn';

/** Four steps, one word each: where the operator is in the job. */
export function StepsBar() {
  const mode = useAnalyzer((s) => s.mode);
  const cal = useAnalyzer((s) => s.calibration);
  const shots = useAnalyzer((s) => s.shots.length);
  const busy = useAnalyzer((s) => !!s.busy);
  const live = useAnalyzer((s) => s.live);
  const savedId = useAnalyzer((s) => s.savedId);
  const groupNo = useAnalyzer((s) => (s.session?.groups.length ?? 0) + (s.savedId ? 0 : 1));
  const req = useSettings((s) => s.rules.requiredRounds);

  const isLive = mode === 'live';
  const liveHits = live?.holes.filter((h) => h.confirmed && !h.previous).length ?? 0;
  const calibrated = isLive ? live?.phase === 'locked' : !!cal && cal.confidence > 0;
  const hits = isLive ? liveHits : shots;
  const steps: [string, St][] = [
    ['Picture', mode === 'empty' ? 'now' : 'done'],
    ['Calibration', calibrated ? 'done' : mode === 'empty' ? 'todo' : cal && !isLive ? 'warn' : 'now'],
    [`Holes ${calibrated ? `${hits}/${req}` : ''}`.trim(), !calibrated || busy ? 'todo' : hits === req ? 'done' : 'now'],
    [savedId ? `Group ${groupNo} saved` : `Save group ${groupNo}`, savedId ? 'done' : calibrated && hits > 0 && !isLive ? 'now' : 'todo'],
  ];
  return (
    <ol className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Progress">
      {steps.map(([label, st], i) => (
        <li
          key={i}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-full border pl-1 pr-3 text-sm font-medium',
            st === 'done' && 'border-ok/40 bg-ok/10 text-ok',
            st === 'now' && 'border-olive/60 bg-olive-soft text-ink',
            st === 'warn' && 'border-warn/50 bg-warn/10 text-warn',
            st === 'todo' && 'border-rule text-muted',
          )}
        >
          <span
            className={clsx(
              'num grid h-6 w-6 place-items-center rounded-full text-xs font-bold',
              st === 'done' ? 'bg-ok text-white' : st === 'now' ? 'bg-olive text-olive-ink' : st === 'warn' ? 'bg-warn text-white' : 'bg-sunk text-muted',
            )}
          >
            {st === 'done' ? <Check size={14} strokeWidth={3} /> : i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}
