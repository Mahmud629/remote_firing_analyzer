'use client';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToasts } from '@/state/toast';

const ICON = { ok: CheckCircle2, info: Info, warn: AlertTriangle, error: XCircle };
const BAR = { ok: 'bg-ok', info: 'bg-aim', warn: 'bg-warn', error: 'bg-bad' };
const TXT = { ok: 'text-ok', info: 'text-aim', warn: 'text-warn', error: 'text-bad' };

export function Toaster() {
  const list = useToasts((s) => s.list);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex w-[min(380px,calc(100vw-24px))] -translate-x-1/2 flex-col-reverse gap-2" role="status" aria-live="polite">
      {list.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} className="toast-in pointer-events-auto flex overflow-hidden rounded-lg border border-rule bg-sheet shadow-xl">
            <span className={clsx('w-1.5 shrink-0', BAR[t.tone])} />
            <div className="flex flex-1 items-start gap-3 px-3 py-2.5">
              <Icon size={20} className={clsx('mt-0.5 shrink-0', TXT[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{t.title}</p>
                {t.text && <p className="mt-0.5 text-sm leading-snug text-muted">{t.text}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted hover:text-ink" aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
