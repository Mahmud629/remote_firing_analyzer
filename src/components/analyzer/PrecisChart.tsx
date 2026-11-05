'use client';
import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { Dialog } from '@/components/ui';
import { GROUP_PATTERNS, type GroupPattern, type PatternId } from '@/core/precis';

/** Small target with the bullet marks of one précis pattern. */
export function PatternSketch({ p, size = 84, active }: { p: GroupPattern; size?: number; active?: boolean }) {
  const s = size / 2;
  const k = s * 0.82;
  return (
    <svg width={size} height={size} viewBox={`${-s} ${-s} ${size} ${size}`} aria-hidden className="shrink-0">
      <rect x={-s} y={-s} width={size} height={size} rx={6} className="fill-sunk" />
      {[0.85, 0.55, 0.25].map((r) => (
        <circle key={r} r={r * k} fill="none" strokeWidth={1} className="stroke-rule" />
      ))}
      <line x1={-k} x2={k} y1={0} y2={0} strokeWidth={0.8} strokeDasharray="2 3" className="stroke-muted" />
      <line y1={-k} y2={k} x1={0} x2={0} strokeWidth={0.8} strokeDasharray="2 3" className="stroke-muted" />
      <rect x={-4} y={-4} width={8} height={8} fill="none" strokeWidth={1.4} className="stroke-aim" />
      {p.sketch.map((d, i) => (
        <circle key={i} cx={d.x * k} cy={-d.y * k} r={size / 26} className={active ? 'fill-warn' : 'fill-ink'} />
      ))}
    </svg>
  );
}

/** OWC précis Table 12-1 (Shot Group Analysis), with the pattern(s) of this group picked out. */
export function PrecisChartDialog({ open, onClose, highlight = [] }: { open: boolean; onClose: () => void; highlight?: PatternId[] }) {
  const first = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => first.current?.scrollIntoView({ block: 'center' }));
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Shot group analysis" wide>
      <p className="mb-3 text-sm text-muted">
        After the OWC précis, Table 12-1 (para 1217) with the reasons in paras 1417 and 1419. The square is the point of aim. Clock positions are for a right-handed firer;
        for a left-handed firer they are mirrored.
      </p>
      <ol className="grid gap-2.5 sm:grid-cols-2">
        {GROUP_PATTERNS.map((p) => {
          const on = highlight.includes(p.id);
          return (
            <li key={p.id} ref={on && p.id === highlight[0] ? first : undefined} className={clsx('flex gap-3 rounded-lg border p-2.5', on ? 'border-warn bg-warn/10' : 'border-rule')}>
              <PatternSketch p={p} active={on} />
              <div className="min-w-0 text-sm leading-snug">
                <div className="flex items-baseline gap-1.5">
                  <span className="num text-xs text-muted">{p.ser}.</span>
                  <span className="font-semibold">{p.name}</span>
                  {on && <span className="ml-auto rounded bg-warn px-1.5 text-[11px] font-semibold text-white">This group</span>}
                </div>
                <div className="mt-1">
                  <span className="font-semibold text-warn">Error: </span>
                  {p.error}
                </div>
                <div className="mt-0.5 text-muted">{p.why}</div>
                <div className="mt-1">
                  <span className="font-semibold text-ok">Remedy: </span>
                  {p.remedy}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}
