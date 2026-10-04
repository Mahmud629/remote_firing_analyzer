import type { Rules, Shot } from '../core/types';
import type { SessionRecord } from '../services/db';
import { recordStatus } from '../core/analysis';
import type { SessionMeta } from '../state/analyzer';
import type { AnalysisView } from '../components/analyzer/useAnalysis';

/** Turns what is on screen into a record (everything in target inches, no pixels). */
export function buildSession(view: AnalysisView, meta: SessionMeta, rules: Rules, shots: Shot[]): Omit<SessionRecord, 'id' | 'createdAt'> {
  const a = view.analysis;
  return {
    firerId: meta.firerId ?? '',
    weaponSerial: meta.weaponSerial.trim(),
    date: meta.date,
    rangeM: meta.rangeM,
    status: recordStatus(a),
    reasons: a.status === 'INCOMPLETE' ? [`Only ${a.count} of ${a.required} rounds on the target.`] : a.reasons,
    groupIn: a.group?.sizeIn ?? null,
    radialCm: a.radialErrorCm,
    mpiIn: a.mpiIn,
    offsetCm: a.offsetCm,
    correction: a.correction,
    classification: a.classification,
    diagnostics: a.diagnostics.map(({ title, detail, advice }) => ({ title, detail, advice })),
    shotsIn: view.shotsIn.map((p, i) => ({ ...p, source: shots[i]?.source ?? 'manual', confidence: shots[i]?.confidence })),
    poaIn: view.poaIn,
    calibration: { method: view.calibration.method, confidence: view.calibration.confidence, diameterIn: view.calibration.diameterIn },
    requiredRounds: rules.requiredRounds,
    notes: meta.notes.trim() || undefined,
  };
}
