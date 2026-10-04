'use client';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Eye, EyeOff, FileDown, Save, StepForward, UserPlus, X } from 'lucide-react';
import { Button, Field, Input, Panel } from '@/components/ui';
import { FirerDialog } from '@/components/records/FirerDialog';
import { newSessionId, useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { notify } from '@/state/toast';
import { live } from '@/state/live';
import { db } from '@/services/db';
import { matchesFirer, saveSession } from '@/services/records';
import { canvasToBlob, loadImage, renderAnnotated } from '@/services/annotate';
import { downloadPdf } from '@/services/pdf';
import { buildSession } from '@/lib/session';
import { STATUS_LABEL, fmt } from '@/lib/format';
import { toImage } from '@/core/calibration';
import { useAnalysis } from './useAnalysis';

export function SessionPanel() {
  const s = useAnalyzer();
  const { meta, setMeta, mode, frame, shots, savedId, session } = s;
  const rules = useSettings((x) => x.rules);
  const view = useAnalysis();
  const firers = useLiveQuery(() => db().firers.orderBy('updatedAt').reverse().toArray(), []);
  const serials = useLiveQuery(async () => [...new Set((await db().sessions.toArray()).map((x) => x.weaponSerial).filter(Boolean))].sort(), []);
  const firer = firers?.find((f) => f.id === meta.firerId) ?? null;
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [more, setMore] = useState(false);
  const [working, setWorking] = useState(false);
  const matches = useMemo(() => (firers ?? []).filter((f) => matchesFirer(f, query)).slice(0, 8), [firers, query]);
  const canUse = mode === 'review' && !!frame && !!view;
  const ownSession = session && session.firerId === meta.firerId ? session : null;
  const nextNo = (ownSession?.groups.length ?? 0) + 1;

  const pickFirer = (id: string) => {
    if (session && session.firerId !== id) useAnalyzer.setState({ session: null });
    setMeta({ firerId: id });
    setPicking(false);
    setQuery('');
  };

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
    if (!canUse || !firer) return;
    setWorking(true);
    try {
      const sessionId = ownSession?.id ?? newSessionId();
      const canvas = await annotated();
      const close = await annotated(true);
      const rec = await saveSession({ ...buildSession(view!, meta, rules, shots), sessionId, groupNo: nextNo, image: await canvasToBlob(canvas), closeUp: await canvasToBlob(close) });
      s.groupSaved({ recordId: rec.id, shotsIn: view!.shotsIn, poaIn: view!.poaIn, groupIn: rec.groupIn, status: rec.status }, sessionId);
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
      const current = savedId ? await db().sessions.get(savedId) : undefined;
      const group = current ?? { ...buildSession(view!, meta, rules, shots), groupNo: nextNo };
      const sessionGroups = ownSession ? (await db().sessions.where('id').anyOf(ownSession.groups.map((g) => g.recordId)).toArray()).sort((a, b) => (a.groupNo ?? 0) - (b.groupNo ?? 0)) : [];
      const close = await annotated(true);
      await downloadPdf({ group, firer, imageDataUrl: canvas.toDataURL('image/jpeg', 0.9), closeUpDataUrl: close.toDataURL('image/jpeg', 0.9), sessionGroups });
      notify('ok', 'PDF downloaded');
    } catch (err) {
      notify('error', 'PDF failed', err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const next = () => {
    s.nextGroup();
    if (mode === 'live') live.nextGroup();
  };

  return (
    <Panel title="Firer and session">
      <div className="flex flex-col gap-3">
        {firer && !picking ? (
          <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-3 rounded-md border border-rule px-3 py-2 text-left hover:bg-sunk" title="Change firer">
            <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-full bg-olive text-sm font-bold text-olive-ink">{firer.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {firer.rank} {firer.name}
              </span>
              <span className="block truncate text-sm text-muted">{firer.serviceNo}</span>
            </span>
          </button>
        ) : (
          <div>
            <Input placeholder="Search firer" value={query} onChange={(e) => (setQuery(e.target.value), setPicking(true))} onFocus={() => setPicking(true)} aria-label="Firer" />
            {picking && (
              <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-rule bg-sheet shadow-lg">
                {matches.map((f) => (
                  <button key={f.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-sunk" onClick={() => pickFirer(f.id)}>
                    <span className="font-medium">
                      {f.rank} {f.name}
                    </span>
                    <span className="text-muted"> {f.serviceNo}</span>
                  </button>
                ))}
                <button type="button" onClick={() => setDialog(true)} className="flex w-full items-center gap-2 border-t border-rule px-3 py-2 text-left text-sm font-medium text-aim hover:bg-sunk">
                  <UserPlus size={16} aria-hidden /> New firer
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Input placeholder="Weapon no" aria-label="Weapon no" value={meta.weaponSerial} onChange={(e) => setMeta({ weaponSerial: e.target.value })} list="rfa-serials" />
          <div className="relative">
            <Input type="number" min={1} aria-label="Range in metres" value={meta.rangeM} onChange={(e) => setMeta({ rangeM: Number(e.target.value) || 0 })} className="pr-7" />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">m</span>
          </div>
        </div>
        <datalist id="rfa-serials">{serials?.map((x) => <option key={x} value={x} />)}</datalist>

        {ownSession && ownSession.groups.length > 0 && (
          <ul className="flex flex-col gap-1">
            {ownSession.groups.map((g) => (
              <li key={g.no} className="flex items-center gap-2 rounded-md bg-sunk px-2.5 py-1.5 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ background: g.color }} />
                <span className="font-semibold">Group {g.no}</span>
                <span className="num text-muted">{g.groupIn != null ? `${fmt(g.groupIn)}″` : '–'}</span>
                <span className={clsx('ml-auto text-xs font-semibold', g.status === 'ZEROED' ? 'text-ok' : g.status === 'ADJUST' ? 'text-warn' : 'text-bad')}>{STATUS_LABEL[g.status]}</span>
                <button type="button" onClick={() => s.toggleGroup(g.no)} className="rounded p-0.5 text-muted hover:text-ink" aria-label={g.visible ? `Hide group ${g.no}` : `Show group ${g.no}`}>
                  {g.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          {savedId ? (
            <Button variant="primary" onClick={next} icon={<StepForward size={16} />}>
              Next group
            </Button>
          ) : (
            <Button variant="primary" onClick={save} disabled={!canUse || !firer || working} icon={<Save size={16} />} title={!firer ? 'Choose the firer first' : undefined}>
              Save group {nextNo}
            </Button>
          )}
          <Button onClick={pdf} disabled={!canUse || working} icon={<FileDown size={16} />} title="Download PDF result sheet">
            PDF
          </Button>
        </div>
        {ownSession && (
          <Button size="sm" variant="ghost" onClick={s.endSession} icon={<X size={14} />}>
            End session
          </Button>
        )}

        <button type="button" onClick={() => setMore(!more)} className="flex items-center justify-between text-sm text-muted hover:text-ink" aria-expanded={more}>
          Date and remarks
          <ChevronDown size={15} className={clsx('transition-transform', more && 'rotate-180')} />
        </button>
        {more && (
          <div className="flex flex-col gap-2">
            <Field label="Date">
              <Input type="date" value={meta.date} onChange={(e) => setMeta({ date: e.target.value })} />
            </Field>
            <Field label="Remarks">
              <textarea value={meta.notes} onChange={(e) => setMeta({ notes: e.target.value })} rows={2} className="w-full rounded-md border border-rule bg-sheet px-3 py-2 text-[15px] focus:border-aim focus:outline-none" />
            </Field>
          </div>
        )}
      </div>
      <FirerDialog open={dialog} onClose={() => setDialog(false)} onSaved={(f) => pickFirer(f.id)} />
    </Panel>
  );
}
