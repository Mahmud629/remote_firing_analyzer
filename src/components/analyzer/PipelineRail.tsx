'use client';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';

type StepState = 'done' | 'active' | 'waiting' | 'attention';

/** The five layers of work, in order, with what each one is doing right now. */
export function PipelineRail() {
  const s = useAnalyzer();
  const required = useSettings((x) => x.rules.requiredRounds);
  const live = s.mode === 'live';
  const lv = s.live;

  const picture: [StepState, string] =
    s.mode === 'empty'
      ? ['active', 'Choose a photo, camera or CCTV lane']
      : live
        ? [lv ? 'done' : 'active', lv ? `${s.liveSource?.label}, ${lv.width}×${lv.height}` : 'Starting video']
        : ['done', `${s.frame?.source === 'upload' ? 'Photo' : 'Captured frame'}, ${s.frame?.width}×${s.frame?.height}`];

  let ring: [StepState, string] = ['waiting', 'Finds the outer ring automatically'];
  if (live && lv) {
    ring =
      lv.phase === 'locked'
        ? ['done', 'Locked on the ring']
        : lv.phase === 'steadying'
          ? ['active', `Holding steady ${Math.round(lv.progress * 6)} of 6 frames`]
          : ['active', 'Searching'];
  } else if (!live && s.calibration) {
    ring =
      s.calibration.method === 'auto'
        ? s.calibration.confidence >= 0.55
          ? ['done', 'Automatic, clean fit on the ring']
          : ['done', 'Automatic. Check the green ring sits on the outer circle']
        : s.calibration.confidence === 0
          ? ['attention', 'Not found: place the ring by hand']
          : ['done', 'Placed by hand'];
  } else if (s.busy) ring = ['active', 'Searching'];

  let holes: [StepState, string] = ['waiting', 'Detects each bullet hole'];
  if (live && lv?.phase === 'locked') {
    const n = lv.holes.filter((h) => h.confirmed && !h.previous).length;
    holes = [n >= required ? 'done' : 'active', `${n} of ${required} confirmed`];
  } else if (!live && s.calibration && !s.busy) {
    const n = s.shots.length;
    holes = [n === required ? 'done' : 'attention', `${n} of ${required} marked`];
  }

  let review: [StepState, string] = ['waiting', 'Check marks and aiming point'];
  if (!live && s.frame && s.calibration && !s.busy) {
    const doubt = s.shots.filter((x) => x.merged || (x.confidence != null && x.confidence < 0.5)).length;
    review = doubt ? ['attention', `${doubt} ${doubt === 1 ? 'mark needs' : 'marks need'} a look (orange)`] : ['done', 'Marks look clean'];
  }

  let record: [StepState, string] = ['waiting', 'Saved to the firer’s record'];
  if (!live && s.frame && s.calibration) record = s.savedId ? ['done', 'Saved'] : s.meta.firerId ? ['active', 'Ready to save'] : ['active', 'Choose the firer to save'];

  const steps: [string, [StepState, string]][] = [
    ['Picture', picture],
    ['Ring calibration', ring],
    ['Hole detection', holes],
    ['Review', review],
    ['Record', record],
  ];

  return (
    <ol className="flex flex-col" aria-label="Progress">
      {steps.map(([title, [state, detail]], i) => (
        <li key={title} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span className={clsx('absolute left-[13px] top-7 h-[calc(100%-24px)] w-0.5', state === 'done' ? 'bg-olive' : 'bg-rule')} aria-hidden />}
          <span
            className={clsx(
              'num relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold',
              state === 'done' && 'bg-olive text-olive-ink',
              state === 'active' && 'bg-hit text-black',
              state === 'attention' && 'bg-warn text-white',
              state === 'waiting' && 'border border-rule bg-sheet text-muted',
            )}
          >
            {state === 'done' ? <Check size={15} strokeWidth={3} /> : i + 1}
          </span>
          <span className="min-w-0 pt-0.5">
            <span className={clsx('block text-[15px] font-medium leading-tight', state === 'waiting' ? 'text-muted' : 'text-ink')}>{title}</span>
            <span className={clsx('block text-sm leading-snug', state === 'attention' ? 'text-warn' : 'text-muted')}>{detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
