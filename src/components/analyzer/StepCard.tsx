'use client';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

export type StepState = 'done' | 'now' | 'todo' | 'warn';

const EDGE: Record<StepState, string> = { done: 'border-l-ok', now: 'border-l-olive', warn: 'border-l-warn', todo: 'border-l-rule' };
const BADGE: Record<StepState, string> = { done: 'bg-ok text-white', now: 'bg-olive text-olive-ink', warn: 'bg-warn text-white', todo: 'bg-sunk text-muted' };

/** A numbered step: the badge turns into a check when the step is done. */
export function StepCard({ n, title, state, right, children, fill }: { n: number; title: string; state: StepState; right?: ReactNode; children: ReactNode; fill?: boolean }) {
  return (
    <section className={clsx('flex flex-1 flex-col overflow-hidden rounded-lg border border-l-[3px] border-rule bg-sheet', EDGE[state], fill && 'min-h-0')}>
      <header className="grid shrink-0 grid-cols-[3rem_1fr_3rem] items-center border-b border-rule px-3 py-2">
        <span className={clsx('num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold', BADGE[state])}>{state === 'done' ? <Check size={14} strokeWidth={3} /> : n}</span>
        <h2 className="text-center font-display text-[17px] font-semibold leading-none">{title}</h2>
        <span className="num justify-self-end text-sm font-semibold">{right}</span>
      </header>
      <div className={clsx('flex flex-1 flex-col px-3 py-3', fill ? 'min-h-0 overflow-y-auto' : 'justify-center')}>{children}</div>
    </section>
  );
}
