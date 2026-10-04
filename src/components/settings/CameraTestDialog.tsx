'use client';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button, Dialog } from '@/components/ui';
import { useSettings, type CctvCamera } from '@/state/settings';
import { notify } from '@/state/toast';
import { diagnoseCamera, type CheckStep } from '@/services/mediamtx';

const ICON = {
  run: <Loader2 size={18} className="animate-spin text-muted" aria-label="Checking" />,
  ok: <CheckCircle2 size={18} className="text-ok" aria-label="OK" />,
  warn: <AlertTriangle size={18} className="text-warn" aria-label="Warning" />,
  fail: <XCircle size={18} className="text-bad" aria-label="Problem" />,
};

/**
 * Checks a camera step by step and says what is wrong and what to change.
 * With onPass it is the "connecting" screen of Start live: it closes and starts when nothing failed.
 */
export function CameraTestDialog({ camera, onClose, onPass }: { camera: CctvCamera | null; onClose: () => void; onPass?: () => void }) {
  const cctv = useSettings((s) => s.cctv);
  const [steps, setSteps] = useState<CheckStep[]>([]);
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    setSteps([]);
    setRunning(true);
    void diagnoseCamera(cctv, camera, (s) => !cancelled && setSteps(s)).then((s) => {
      if (cancelled) return;
      setRunning(false);
      if (onPass && !s.some((x) => x.state === 'fail')) setTimeout(() => !cancelled && onPass(), 500);
    });
    return () => {
      cancelled = true;
    };
    // the camera settings are read once per run on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, round]);

  const failed = steps.some((s) => s.state === 'fail');
  const report = () =>
    [`Camera check: ${camera?.name}`, ...steps.map((s) => `[${s.state.toUpperCase()}] ${s.title}${s.detail ? ` - ${s.detail}` : ''}${s.fix ? `\n    Fix: ${s.fix}` : ''}`)].join('\n');

  return (
    <Dialog open={!!camera} onClose={onClose} title={onPass ? `Connecting to ${camera?.name ?? ''}` : `Test ${camera?.name ?? ''}`} wide>
      <ul className="flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s.id} className={clsx('flex gap-3 rounded-md border p-3', s.state === 'fail' ? 'border-bad/40 bg-bad/8' : s.state === 'warn' ? 'border-warn/40 bg-warn/8' : 'border-rule')}>
            <span className="mt-0.5 shrink-0">{ICON[s.state]}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{s.title}</span>
              {s.detail && <span className="block text-sm">{s.detail}</span>}
              {s.fix && (
                <span className="mt-1 block text-sm text-muted">
                  <b className="text-ink">What to do: </b>
                  {s.fix}
                </span>
              )}
            </span>
          </li>
        ))}
        {steps.length === 0 && <li className="text-sm text-muted">Starting the check…</li>}
      </ul>
      {!running && steps.length > 0 && (
        <p className={clsx('mt-3 text-center text-sm font-semibold', failed ? 'text-bad' : 'text-ok')}>
          {failed ? 'This camera cannot be shown yet. Fix the problem above and run the test again.' : onPass ? 'All good. Starting the live view…' : 'This camera is ready to use.'}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy size={14} />}
          disabled={!steps.length}
          onClick={() => void navigator.clipboard?.writeText(report()).then(() => notify('ok', 'Report copied'))}
        >
          Copy report
        </Button>
        <Button size="sm" icon={<RefreshCw size={14} />} disabled={running} onClick={() => setRound((r) => r + 1)}>
          Test again
        </Button>
        <Button size="sm" variant="primary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
