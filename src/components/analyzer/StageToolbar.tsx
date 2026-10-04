'use client';
import clsx from 'clsx';
import { Camera, Crosshair, Hand, Layers, Locate, Maximize, Minus, Plus, RefreshCw, Ruler, ScanSearch, Circle, Square, Undo2, StepForward } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAnalyzer, type Tool } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { live } from '@/state/live';

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'move', label: 'Move', key: 'V', icon: <Hand size={17} /> },
  { id: 'add', label: 'Add hit', key: 'A', icon: <Plus size={17} /> },
  { id: 'aim', label: 'Aiming point', key: 'P', icon: <Crosshair size={17} /> },
  { id: 'ring', label: 'Adjust ring', key: 'R', icon: <Circle size={17} /> },
  { id: 'measure', label: 'Two points: click two points a known distance apart', key: 'M', icon: <Ruler size={17} /> },
];

function ToolButton({ active, onClick, label, children, disabled }: { active?: boolean; onClick: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx('grid h-9 w-9 place-items-center rounded-md transition-colors disabled:opacity-40', active ? 'bg-olive text-olive-ink' : 'text-white/85 hover:bg-white/12 hover:text-white')}
    >
      {children}
    </button>
  );
}

const bar = 'flex items-center gap-0.5 rounded-lg bg-black/70 p-1 backdrop-blur';

export function StageToolbar({ onFit, onZoom, zoom }: { onFit: () => void; onZoom: (f: number) => void; zoom: number }) {
  const mode = useAnalyzer((s) => s.mode);
  const tool = useAnalyzer((s) => s.tool);
  const setTool = useAnalyzer((s) => s.setTool);
  const undo = useAnalyzer((s) => s.undo);
  const canUndo = useAnalyzer((s) => s.history.length > 0);
  const busy = useAnalyzer((s) => !!s.busy);
  const redetect = useAnalyzer((s) => s.redetectHoles);
  const detectAll = useAnalyzer((s) => s.detectAll);
  const measure = useAnalyzer((s) => s.measure);
  if (mode === 'empty') return null;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
      {mode === 'review' ? (
        <div className="pointer-events-auto flex flex-col items-start gap-1.5">
          <div className={bar} role="toolbar" aria-label="Marking tools">
            {TOOLS.map((t) => (
              <ToolButton key={t.id} active={tool === t.id} onClick={() => setTool(t.id)} label={`${t.label} (${t.key})`}>
                {t.icon}
              </ToolButton>
            ))}
            <span className="mx-1 h-6 w-px bg-white/20" />
            <ToolButton onClick={undo} disabled={!canUndo} label="Undo (Ctrl+Z)">
              <Undo2 size={17} />
            </ToolButton>
            <ToolButton onClick={() => void redetect()} disabled={busy} label="Find holes again (keeps your marks)">
              <ScanSearch size={17} />
            </ToolButton>
            <ToolButton onClick={() => void detectAll()} disabled={busy} label="Calibrate and detect again">
              <RefreshCw size={17} />
            </ToolButton>
            <OverlayButton />
          </div>
          {tool === 'measure' && (
            <p className="rounded-md bg-black/70 px-2.5 py-1 text-sm text-white">{measure.length === 0 ? 'Click point A' : 'Click point B'}</p>
          )}
        </div>
      ) : (
        <LiveControls />
      )}
      <div className={clsx(bar, 'pointer-events-auto')} role="toolbar" aria-label="Zoom">
        <span className="hidden items-center sm:flex">
          <ToolButton onClick={() => onZoom(1 / 1.4)} disabled={zoom <= 1} label="Zoom out (-)">
            <Minus size={17} />
          </ToolButton>
          <span className="num w-10 text-center text-sm text-white/85">{zoom.toFixed(1)}×</span>
          <ToolButton onClick={() => onZoom(1.4)} label="Zoom in (+)">
            <Plus size={17} />
          </ToolButton>
        </span>
        <ToolButton onClick={onFit} label="Fit to screen (0)">
          <Maximize size={16} />
        </ToolButton>
      </div>
    </div>
  );
}

function OverlayButton() {
  const has = useAnalyzer((s) => (s.session?.groups.length ?? 0) > 0);
  const on = useAnalyzer((s) => s.showOverlay);
  const toggle = useAnalyzer((s) => s.toggleOverlay);
  if (!has) return null;
  return (
    <ToolButton active={on} onClick={toggle} label={on ? 'Hide earlier groups' : 'Show earlier groups'}>
      <Layers size={17} />
    </ToolButton>
  );
}

function LiveControls() {
  const view = useAnalyzer((s) => s.live);
  const stopLive = useAnalyzer((s) => s.stopLive);
  const required = useSettings((s) => s.rules.requiredRounds);
  const counted = view?.holes.filter((h) => h.confirmed && !h.previous).length ?? 0;
  const phase = view?.phase ?? 'searching';
  const status =
    phase !== 'locked'
      ? phase === 'steadying'
        ? 'Locking ring…'
        : 'Finding ring…'
      : view?.learning
        ? 'Hold fire, reading target…'
        : view?.captureIn != null
          ? `${counted}/${required}, capturing in ${Math.ceil(view.captureIn)} s`
          : `Ready. ${counted}/${required} hits`;
  return (
    <div className={clsx(bar, 'pointer-events-auto pr-1')}>
      <span className="flex items-center gap-2 px-2 text-sm font-medium text-white" role="status" aria-live="polite">
        <span className={clsx('h-2.5 w-2.5 rounded-full', phase === 'locked' && !view?.learning ? 'bg-[var(--c-ok)]' : 'animate-pulse bg-hit')} />
        {status}
      </span>
      <span className="mx-1 h-6 w-px bg-white/20" />
      <ToolButton onClick={() => void live.capture()} label="Capture now">
        <Camera size={17} />
      </ToolButton>
      <ToolButton onClick={() => live.nextGroup()} disabled={phase !== 'locked'} label="Next group (keep these holes, count only new ones)">
        <StepForward size={17} />
      </ToolButton>
      <ToolButton onClick={() => live.relock()} label="Find the ring again">
        <Locate size={17} />
      </ToolButton>
      <ToolButton onClick={stopLive} label="Stop live">
        <Square size={15} />
      </ToolButton>
      <OverlayButton />
    </div>
  );
}
