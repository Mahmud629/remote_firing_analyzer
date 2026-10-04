'use client';
import { useEffect } from 'react';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { SourcePanel } from './SourcePanel';
import { CalibrationCard } from './CalibrationCard';
import { BulletsCard } from './BulletsCard';
import { AimCard } from './AimCard';
import { TargetStage } from './TargetStage';
import { ActionBar } from './ActionBar';
import { StatusBar } from './StatusBar';
import { FirerCard } from './FirerCard';
import { ResultPanel } from './ResultPanel';
import { InsightsCard } from './InsightsCard';

export function AnalyzerScreen() {
  const defaultRange = useSettings((s) => s.defaultRangeM);
  const setMeta = useAnalyzer((s) => s.setMeta);
  useEffect(() => {
    if (useAnalyzer.getState().mode === 'empty') setMeta({ rangeM: defaultRange });
  }, [defaultRange, setMeta]);

  // Desktop: steps | target | results, every column filled to the bottom.
  // Phones: target, status, result, firer, then the steps.
  return (
    <div className="grid gap-3 p-3 sm:p-4 lg:h-[calc(100dvh-var(--header-h)-var(--footer-h))] lg:grid-cols-[clamp(290px,20vw,440px)_minmax(0,1fr)_clamp(320px,22vw,480px)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <aside className="contents lg:order-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-3 lg:overflow-y-auto">
        <div className="order-4 flex flex-col lg:order-none lg:flex-auto">
          <SourcePanel />
        </div>
        <div className="order-6 flex flex-col lg:order-none lg:flex-auto">
          <CalibrationCard />
        </div>
        <div className="order-7 flex flex-col lg:order-none lg:min-h-[200px] lg:flex-[1.4_1_auto]">
          <BulletsCard />
        </div>
        <div className="order-8 flex flex-col lg:order-none lg:flex-auto">
          <AimCard />
        </div>
      </aside>

      <section className="order-1 flex min-h-0 flex-col gap-2 lg:order-2">
        <ActionBar />
        <TargetStage />
        <StatusBar />
      </section>

      <aside className="contents lg:order-3 lg:flex lg:min-h-0 lg:flex-col lg:gap-3 lg:overflow-y-auto">
        <div className="order-3 lg:order-none">
          <ResultPanel />
        </div>
        <div className="order-5 lg:order-none">
          <FirerCard />
        </div>
        <div className="order-9 flex flex-col lg:order-none lg:flex-1">
          <InsightsCard />
        </div>
      </aside>
    </div>
  );
}
