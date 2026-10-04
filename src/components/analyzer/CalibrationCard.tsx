'use client';
import { Circle, Ruler, Wand2 } from 'lucide-react';
import { TileButton } from '@/components/ui';
import { useAnalyzer } from '@/state/analyzer';
import { live } from '@/state/live';
import { StepCard, type StepState } from './StepCard';

/** Three ways to calibrate: automatic, drag the ring, or two known points. */
export function CalibrationCard() {
  const mode = useAnalyzer((s) => s.mode);
  const cal = useAnalyzer((s) => s.calibration);
  const liveView = useAnalyzer((s) => s.live);
  const busy = useAnalyzer((s) => !!s.busy);
  const tool = useAnalyzer((s) => s.tool);
  const measure = useAnalyzer((s) => s.measure);
  const setTool = useAnalyzer((s) => s.setTool);
  const detectAll = useAnalyzer((s) => s.detectAll);

  const isLive = mode === 'live';
  const review = mode === 'review';
  const found = isLive ? liveView?.phase === 'locked' : !!cal && cal.confidence > 0;
  const state: StepState = mode === 'empty' ? 'todo' : found ? 'done' : isLive || busy ? 'now' : 'warn';

  return (
    <StepCard n={2} title="Calibrate" state={state}>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-1.5">
          <TileButton
            icon={<Wand2 size={18} />}
            label="Auto"
            disabled={mode === 'empty' || busy}
            onClick={() => (isLive ? live.relock() : void detectAll())}
            title={isLive ? 'Find the 32 in ring again' : 'Find the 32 in ring and the holes automatically'}
          />
          <TileButton icon={<Circle size={18} />} label="Ring" active={review && tool === 'ring'} disabled={!review} onClick={() => setTool('ring')} title="Drag the blue handles onto the outer ring (R)" />
          <TileButton icon={<Ruler size={18} />} label="Points" active={review && tool === 'measure'} disabled={!review} onClick={() => setTool('measure')} title="Two points: click two points a known distance apart (M)" />
        </div>
        {review && tool === 'measure' && <p className="text-center text-sm font-medium text-olive">{measure.length === 0 ? 'Click point A on the target' : 'Click point B'}</p>}
        {state === 'warn' && <p className="text-center text-sm text-warn">Ring not found. Use Ring or Points.</p>}
      </div>
    </StepCard>
  );
}
