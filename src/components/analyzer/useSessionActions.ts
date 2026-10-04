'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { newSessionId, useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { notify } from '@/state/toast';
import { live } from '@/state/live';
import { db } from '@/services/db';
import { saveSession } from '@/services/records';
import { canvasToBlob, loadImage, renderAnnotated } from '@/services/annotate';
import { downloadPdf } from '@/services/pdf';
import { buildSession } from '@/lib/session';
import { STATUS_LABEL } from '@/lib/format';
import { toImage } from '@/core/calibration';
import { useAnalysis } from './useAnalysis';

/** Firer list and selection, shared by the firer card and the action bar. */
export function useFirers() {
  const meta = useAnalyzer((s) => s.meta);
  const setMeta = useAnalyzer((s) => s.setMeta);
  const firers = useLiveQuery(() => db().firers.orderBy('updatedAt').reverse().toArray(), []);
  const firer = firers?.find((f) => f.id === meta.firerId) ?? null;
  const pickFirer = (id: string) => {
    if (useAnalyzer.getState().session && useAnalyzer.getState().session!.firerId !== id) useAnalyzer.setState({ session: null });
    setMeta({ firerId: id });
  };
  return { meta, setMeta, firers, firer, pickFirer };
}

/** Save group, PDF and next group. */
export function useSessionActions() {
  const { meta, firer } = useFirers();
  const mode = useAnalyzer((s) => s.mode);
  const frame = useAnalyzer((s) => s.frame);
  const shots = useAnalyzer((s) => s.shots);
  const savedId = useAnalyzer((s) => s.savedId);
  const session = useAnalyzer((s) => s.session);
  const groupSaved = useAnalyzer((s) => s.groupSaved);
  const nextGroupState = useAnalyzer((s) => s.nextGroup);
  const rules = useSettings((s) => s.rules);
  const view = useAnalysis();
  const [working, setWorking] = useState(false);

  const canUse = mode === 'review' && !!frame && !!view;
  const ownSession = session && session.firerId === meta.firerId ? session : null;
  const nextNo = (ownSession?.groups.length ?? 0) + 1;

  const annotated = async (closeUp = false) => {
    const img = await loadImage(frame!.url);
    const cal = view!.calibration;
    const overlayPts = (ownSession?.groups ?? []).filter((g) => g.visible && !(savedId && g.recordId === savedId)).flatMap((g) => g.shotsIn.map((p) => toImage(cal, p)));
    return renderAnnotated({
      focus: closeUp ? (view!.shotsPx.length ? [...view!.shotsPx, ...overlayPts, view!.poaPx] : [view!.poaPx]) : undefined,
      maxDim: closeUp ? 900 : 1200,
      image: img,
      width: frame!.width,
      height: frame!.height,
      calibration: cal,
      shots: view!.shotsPx,
      overlays: (ownSession?.groups ?? []).filter((g) => g.visible && !(savedId && g.recordId === savedId)).map((g) => ({ color: g.color, label: String(g.no), points: g.shotsIn.map((p) => toImage(cal, p)) })),
      poa: view!.poaPx,
      mpi: view!.shotsPx.length >= 2 ? view!.mpiPx : null,
      pair: view!.shotsPx.length >= 2 ? view!.pairPx : null,
    });
  };

  const save = async () => {
    if (!canUse) return;
    if (!firer) {
      notify('warn', 'Choose the firer first', 'Pick or add the firer in Firer details.');
      return;
    }
    setWorking(true);
    try {
      const sessionId = ownSession?.id ?? newSessionId();
      const canvas = await annotated();
      const close = await annotated(true);
      const rec = await saveSession({ ...buildSession(view!, meta, rules, shots), sessionId, groupNo: nextNo, image: await canvasToBlob(canvas), closeUp: await canvasToBlob(close) });
      groupSaved({ recordId: rec.id, shotsIn: view!.shotsIn, poaIn: view!.poaIn, groupIn: rec.groupIn, status: rec.status }, sessionId);
      notify('ok', `Group ${nextNo} saved`, `${firer.rank} ${firer.name}: ${STATUS_LABEL[rec.status]}`);
    } catch (err) {
      notify('error', 'Could not save', err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const pdf = async () => {
    if (!canUse) return;
    setWorking(true);
    try {
      const canvas = await annotated();
      const close = await annotated(true);
      const current = savedId ? await db().sessions.get(savedId) : undefined;
      const group = current ?? { ...buildSession(view!, meta, rules, shots), groupNo: nextNo };
      const sessionGroups = ownSession ? (await db().sessions.where('id').anyOf(ownSession.groups.map((g) => g.recordId)).toArray()).sort((a, b) => (a.groupNo ?? 0) - (b.groupNo ?? 0)) : [];
      await downloadPdf({ group, firer, imageDataUrl: canvas.toDataURL('image/jpeg', 0.9), closeUpDataUrl: close.toDataURL('image/jpeg', 0.9), sessionGroups });
      notify('ok', 'PDF downloaded');
    } catch (err) {
      notify('error', 'PDF failed', err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const next = () => {
    nextGroupState();
    if (mode === 'live') live.nextGroup();
  };

  return { firer, ownSession, nextNo, canUse, working, savedId, save, pdf, next };
}
