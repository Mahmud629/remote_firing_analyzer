'use client';
import clsx from 'clsx';
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import type { ZeroStatus } from '@/core/types';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }>(
  function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        {...rest}
        className={clsx(
          'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
          size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-10 px-3.5 text-[15px]',
          variant === 'primary' && 'bg-olive text-olive-ink hover:brightness-110',
          variant === 'secondary' && 'border border-rule bg-sheet text-ink hover:bg-sunk',
          variant === 'ghost' && 'text-ink hover:bg-sunk',
          variant === 'danger' && 'border border-bad/40 bg-sheet text-bad hover:bg-bad/10',
          className,
        )}
      >
        {icon}
        {children}
      </button>
    );
  },
);

export function Field({ label, hint, children, className, center }: { label: string; hint?: string; children: ReactNode; className?: string; center?: boolean }) {
  return (
    <label className={clsx('flex flex-col gap-1 text-sm', className)}>
      <span className={clsx('text-muted', center && 'text-center')}>{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-10 w-full rounded-md border border-rule bg-sheet px-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-aim focus:outline-none';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={clsx(inputCls, className)} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx(inputCls, 'pr-8', className)}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-rule transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:bg-olive peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-aim"
      />
      <span>
        <span className="block text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Equal-size square-ish button: icon above, label below. Used for the step-card actions. */
export function TileButton({ icon, label, active, disabled, onClick, title }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={clsx(
        'flex h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        active ? 'border-olive bg-olive text-olive-ink' : 'border-rule bg-sheet text-ink hover:bg-sunk',
      )}
    >
      {icon}
      <span className="max-w-full truncate leading-none">{label}</span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-sunk p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors',
            value === o.value ? 'bg-olive text-olive-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

const toneCls = {
  ok: 'bg-ok/12 text-ok border-ok/35',
  warn: 'bg-warn/12 text-warn border-warn/35',
  bad: 'bg-bad/12 text-bad border-bad/35',
  idle: 'bg-sunk text-muted border-rule',
};

export function StatusPill({ status, className }: { status: ZeroStatus; className?: string }) {
  return (
    <span className={clsx('num inline-flex items-center rounded border px-2 py-0.5 text-sm font-semibold', toneCls[STATUS_TONE[status]], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx('m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-rule bg-sheet p-0 text-ink shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between border-b border-rule px-5 py-3">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-sunk hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Panel({ title, action, children, className, fill, centered }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; fill?: boolean; centered?: boolean }) {
  return (
    <section className={clsx('rounded-lg border border-rule bg-sheet', fill && 'flex min-h-0 flex-1 flex-col', className)}>
      {title && (
        <header className={clsx('flex shrink-0 items-center gap-2 px-4 pb-1 pt-3', centered ? 'justify-center text-center' : 'justify-between')}>
          <h2 className="font-display text-[17px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={clsx('px-4 pb-4 pt-2', fill && 'min-h-0 flex-1 overflow-y-auto')}>{children}</div>
    </section>
  );
}
