'use client';
import { Crosshair, LocateFixed } from 'lucide-react';
import { TileButton } from '@/components/ui';
import { useAnalyzer } from '@/state/analyzer';
import { StepCard } from './StepCard';
import { useAnalysis } from './useAnalysis';

/** Point of aim: the ring centre, or a place the operator clicks. */
export function AimCard() {
  const view = useAnalysis();
  const mode = useAnalyzer((s) => s.mode);
  const cal = useAnalyzer((s) => s.calibration);
  const tool = useAnalyzer((s) => s.tool);
  const setTool = useAnalyzer((s) => s.setTool);
  const setPoa = useAnalyzer((s) => s.setPoa);
  const review = mode === 'review' && !!view;
  const centred = !view || (Math.abs(view.poaIn.x) < 0.05 && Math.abs(view.poaIn.y) < 0.05);

  return (
    <StepCard n={4} title="Point of aim" state={view ? 'done' : 'todo'}>
      <div className="grid grid-cols-2 gap-1.5">
        <TileButton icon={<LocateFixed size={18} />} label="Centre" active={review && centred} disabled={!review || !cal} onClick={() => cal && setPoa(cal.center)} title="Aim at the centre of the ring" />
        <TileButton icon={<Crosshair size={18} />} label="Place POA" active={review && tool === 'aim'} disabled={!review} onClick={() => setTool('aim')} title="Click where the firer aimed (P)" />
      </div>
    </StepCard>
  );
}
