'use client';
import { Eraser, EyeOff, Eye, FileDown, Loader2, RefreshCw, Save, StepForward, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAnalyzer } from '@/state/analyzer';
import { notify } from '@/state/toast';
import { useSessionActions } from './useSessionActions';

/** The main buttons above the target (like the reference layout). */
export function ActionBar() {
  const { ownSession, nextNo, canUse, working, savedId, save, pdf, next } = useSessionActions();
  const mode = useAnalyzer((s) => s.mode);
  const busy = useAnalyzer((s) => !!s.busy);
  const shots = useAnalyzer((s) => s.shots.length);
  const showOverlay = useAnalyzer((s) => s.showOverlay);
  const toggleOverlay = useAnalyzer((s) => s.toggleOverlay);
  const endSession = useAnalyzer((s) => s.endSession);
  const detectAll = useAnalyzer((s) => s.detectAll);
  const clear = useAnalyzer((s) => s.clear);
  const hasGroups = (ownSession?.groups.length ?? 0) > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-sheet p-2">
      {savedId ? (
        <Button variant="primary" onClick={next} icon={<StepForward size={16} />}>
          Next group
        </Button>
      ) : (
        <Button variant="primary" onClick={save} disabled={!canUse || working} icon={working ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
          Save group {nextNo}
        </Button>
      )}
      <Button onClick={pdf} disabled={!canUse || working} icon={<FileDown size={16} />} title="Download the PDF result sheet">
        PDF
      </Button>
      <span className="mx-1 hidden h-6 w-px bg-rule sm:block" />
      <Button onClick={() => void detectAll()} disabled={mode !== 'review' || busy} icon={<RefreshCw size={16} />} title="Calibrate and find the holes again">
        Re-detect
      </Button>
      {hasGroups && (
        <Button onClick={toggleOverlay} icon={showOverlay ? <EyeOff size={16} /> : <Eye size={16} />} title="Earlier groups of this session shown see-through">
          {showOverlay ? 'Hide overlay' : 'Show overlay'}
        </Button>
      )}
      <span className="ml-auto" />
      {ownSession && (
        <Button variant="ghost" onClick={endSession} icon={<X size={16} />} title="Finish this firer's session">
          End session
        </Button>
      )}
      <Button
        variant="danger"
        disabled={mode === 'empty'}
        icon={<Eraser size={16} />}
        onClick={() => {
          if (shots > 0 && !savedId && !confirm('Clear this target? Marks that are not saved will be lost.')) return;
          clear();
          notify('info', 'Target cleared');
        }}
      >
        Clear target
      </Button>
    </div>
  );
}
