'use client';
import clsx from 'clsx';
import { Plus, ScanSearch, Trash2 } from 'lucide-react';
import { TileButton } from '@/components/ui';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { live } from '@/state/live';
import { StepCard, type StepState } from './StepCard';
import { useAnalysis } from './useAnalysis';

export function BulletsCard() {
  const view = useAnalysis();
  const mode = useAnalyzer((s) => s.mode);
  const shots = useAnalyzer((s) => s.shots);
  const liveView = useAnalyzer((s) => s.live);
  const selectedId = useAnalyzer((s) => s.selectedId);
  const tool = useAnalyzer((s) => s.tool);
  const busy = useAnalyzer((s) => !!s.busy);
  const select = useAnalyzer((s) => s.select);
  const remove = useAnalyzer((s) => s.removeShot);
  const clearShots = useAnalyzer((s) => s.clearShots);
  const setTool = useAnalyzer((s) => s.setTool);
  const redetect = useAnalyzer((s) => s.redetectHoles);
  const req = useSettings((s) => s.rules.requiredRounds);

  const isLive = mode === 'live';
  const rows = isLive
    ? (liveView?.holes ?? []).filter((h) => h.confirmed && !h.previous).map((h) => ({ id: h.id, doubt: h.merged }))
    : shots.map((s) => ({ id: s.id, doubt: !!s.merged || (s.confidence != null && s.confidence < 0.5) }));
  const n = rows.length;
  const state: StepState = !view ? 'todo' : n === req ? 'done' : 'now';

  return (
    <StepCard n={3} title="Bullets" state={state} right={<span className={clsx(n === req ? 'text-ok' : 'text-ink')}>{view ? `${n}/${req}` : ''}</span>} fill>
      <div className="flex h-full min-h-[120px] flex-col gap-2.5">
        {mode === 'review' && (
          <div className="grid grid-cols-3 gap-1.5">
            <TileButton icon={<Plus size={18} />} label="Add" active={tool === 'add'} onClick={() => setTool('add')} title="Click a missed hole to mark it (A)" />
            <TileButton icon={<ScanSearch size={18} />} label="Again" disabled={busy || !view} onClick={() => void redetect()} title="Find the holes again (keeps your marks)" />
            <TileButton icon={<Trash2 size={18} />} label="Clear" disabled={!n} onClick={clearShots} title="Remove all marks" />
          </div>
        )}
        {n > 0 && view ? (
          <ol className="grid grid-cols-2 gap-1.5">
            {rows.map((r, i) => (
              <li
                key={r.id}
                onMouseEnter={() => !isLive && select(r.id)}
                title={r.doubt ? 'Check this mark' : undefined}
                className={clsx('flex h-10 items-center gap-1.5 rounded-md border px-1.5', selectedId === r.id ? 'border-hit/70 bg-hit/15' : 'border-rule bg-sunk/60')}
              >
                <span className={clsx('num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold text-black', r.doubt ? 'bg-warn' : 'bg-hit')}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold">Bullet {i + 1}</span>
                <button type="button" onClick={() => (isLive ? live.removeHole(r.id) : remove(r.id))} className="rounded p-1 text-muted hover:bg-bad/10 hover:text-bad" aria-label={`Delete bullet ${i + 1}`}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ol>
        ) : mode === 'empty' ? (
          <ol className="flex flex-1 flex-col justify-center gap-3 text-sm text-muted">
            {['Photograph the target square-on with the whole outer ring in view.', 'The ring is calibrated and every hole is marked automatically.', 'Drag a mark to move it, or use Add for a missed hole.', 'Choose the firer, then Save group.'].map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunk text-xs font-bold text-ink">{i + 1}</span>
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="grid flex-1 place-items-center text-center text-sm text-muted">{view ? (isLive ? 'Waiting for the first hit' : 'No bullets marked. Use Add, or Again.') : 'Bullets appear here once the picture is calibrated'}</p>
        )}
      </div>
    </StepCard>
  );
}
