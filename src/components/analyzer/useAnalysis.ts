'use client';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { analyze } from '@/core/analysis';
import { toImage, toTarget } from '@/core/calibration';
import type { Analysis, Calibration, Vec2 } from '@/core/types';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { db } from '@/services/db';

export interface AnalysisView {
  analysis: Analysis;
  calibration: Calibration;
  shotsPx: Vec2[];
  shotsIn: Vec2[];
  poaPx: Vec2;
  poaIn: Vec2;
  mpiPx: Vec2 | null;
  pairPx: [Vec2, Vec2] | null;
  live: boolean;
}

/** The analysis for whatever is on the stage: the reviewed frame or the live feed. */
export function useAnalysis(): AnalysisView | null {
  const mode = useAnalyzer((s) => s.mode);
  const calibration = useAnalyzer((s) => s.calibration);
  const shots = useAnalyzer((s) => s.shots);
  const poa = useAnalyzer((s) => s.poa);
  const live = useAnalyzer((s) => s.live);
  const firerId = useAnalyzer((s) => s.meta.firerId);
  const rules = useSettings((s) => s.rules);
  const firer = useLiveQuery(() => (firerId ? db().firers.get(firerId) : undefined), [firerId]);
  const leftHanded = !!firer?.leftHanded;

  return useMemo(() => {
    let cal: Calibration | null;
    let pts: Vec2[];
    let poaPx: Vec2;
    if (mode === 'live') {
      cal = live?.phase === 'locked' ? live.calibration : null;
      if (!cal) return null;
      pts = live!.holes.filter((h) => h.confirmed && !h.previous).map((h) => h.p);
      poaPx = cal.center;
    } else {
      cal = calibration;
      if (!cal) return null;
      pts = shots.map((s) => s.p);
      poaPx = poa ?? cal.center;
    }
    const shotsIn = pts.map((p) => toTarget(cal!, p));
    const poaIn = toTarget(cal, poaPx);
    const analysis = analyze(shotsIn, poaIn, rules, { leftHanded });
    return {
      analysis,
      calibration: cal,
      shotsPx: pts,
      shotsIn,
      poaPx,
      poaIn,
      mpiPx: analysis.mpiIn ? toImage(cal, analysis.mpiIn) : null,
      pairPx: analysis.group ? [pts[analysis.group.pair[0]], pts[analysis.group.pair[1]]] : null,
      live: mode === 'live',
    };
  }, [mode, calibration, shots, poa, live, rules, leftHanded]);
}
