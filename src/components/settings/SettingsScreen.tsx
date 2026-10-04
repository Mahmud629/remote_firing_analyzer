'use client';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { Activity, Download, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Field, Input, Panel, Segmented, Select, Toggle } from '@/components/ui';
import { DEFAULT_SETTINGS, useSettings, type CctvCamera } from '@/state/settings';
import { notify } from '@/state/toast';
import { clearAll, download } from '@/services/records';
import { UNITS } from '@/lib/format';
import { BRANDS, maskedRtsp, mediamtxYaml, mtxConnect, mtxPing, mtxRemove, mtxState, type CamState } from '@/services/mediamtx';
import { CameraDialog } from './CameraDialog';
import { CameraTestDialog } from './CameraTestDialog';

function NumberField({ label, value, onChange, step = 0.1, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <Field label={label}>
      <Input type="number" step={step} min={min} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

const STATE_TEXT: Record<CamState, [string, string]> = {
  online: ['Online', 'bg-ok'],
  connecting: ['No picture yet', 'bg-warn'],
  missing: ['Not connected', 'bg-muted'],
  unreachable: ['MediaMTX off', 'bg-bad'],
};

export function SettingsScreen() {
  const s = useSettings();
  const r = s.rules;
  const setClass = (i: number, maxIn: number) => s.updateRules({ classes: r.classes.map((c, j) => (j === i ? { ...c, maxIn } : c)) });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-3 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => confirm('Restore all default settings? CCTV cameras are kept.') && s.update({ ...resetKeepCctv() })}>
          Defaults
        </Button>
      </div>

      <CctvSection />

      <Panel title="Zeroing rules">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField label="Rounds per group" value={r.requiredRounds} step={1} min={1} onChange={(v) => s.updateRules({ requiredRounds: Math.max(1, Math.round(v)) })} />
          <NumberField label="Max group (in)" value={r.maxGroupIn} onChange={(v) => s.updateRules({ maxGroupIn: v })} />
          <NumberField label="Zero tolerance (cm)" value={r.zeroToleranceCm} onChange={(v) => s.updateRules({ zeroToleranceCm: v })} />
          <NumberField label="Lateral cm per turn" value={r.lateralCmPerTurn} onChange={(v) => s.updateRules({ lateralCmPerTurn: Math.max(0.1, v) })} />
          <NumberField label="Vertical cm per turn" value={r.verticalCmPerTurn} onChange={(v) => s.updateRules({ verticalCmPerTurn: Math.max(0.1, v) })} />
          <NumberField label="Outer ring (in)" value={r.targetDiameterIn} onChange={(v) => s.updateRules({ targetDiameterIn: Math.max(1, v) })} />
          {r.classes.slice(0, 3).map((c, i) => (
            <NumberField key={c.label} label={`${c.label} up to (in)`} value={c.maxIn} onChange={(v) => setClass(i, v)} />
          ))}
        </div>
      </Panel>

      <Panel title="Detection">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Typical calibre" hint="Starting size only. Holes from about 0.7× to 1.7× of it are found.">
            <Select value={String(s.calibreMm)} onChange={(e) => s.update({ calibreMm: Number(e.target.value) })}>
              <option value="5.56">5.56 mm</option>
              <option value="7.62">7.62 mm (BD-08)</option>
              <option value="9">9 mm</option>
            </Select>
          </Field>
          <NumberField label="Default range (m)" value={s.defaultRangeM} step={1} min={1} onChange={(v) => s.update({ defaultRangeM: v })} />
          <Field label={`Sensitivity ${Math.round(s.sensitivity * 100)}%`}>
            <input type="range" min={0} max={1} step={0.05} value={s.sensitivity} onChange={(e) => s.update({ sensitivity: Number(e.target.value) })} className="accent-[var(--c-olive)]" />
          </Field>
          <Field label={`Minimum certainty ${Math.round(s.minConfidence * 100)}%`}>
            <input type="range" min={0.1} max={0.9} step={0.05} value={s.minConfidence} onChange={(e) => s.update({ minConfidence: Number(e.target.value) })} className="accent-[var(--c-olive)]" />
          </Field>
        </div>
        <div className="mt-4">
          <Toggle checked={s.autoCapture} onChange={(v) => s.update({ autoCapture: v })} label="Auto capture in live view" hint={`When all ${r.requiredRounds} hits are in and steady.`} />
        </div>
      </Panel>

      <Panel title="Appearance">
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Length unit on screen">
            <Segmented label="Length unit" value={s.unit} onChange={(unit) => s.update({ unit })} options={UNITS} />
          </Field>
          <Field label="Theme">
          <Segmented
            label="Theme"
            value={s.theme}
            onChange={(theme) => s.update({ theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          </Field>
        </div>
      </Panel>

      <Panel title="Data">
        <p className="text-sm text-muted">Records are kept in this browser. Back them up from the Records page.</p>
        <Button
          className="mt-3"
          variant="danger"
          icon={<Trash2 size={15} />}
          onClick={async () => {
            if (confirm('Delete every firer and group on this computer? This cannot be undone.')) {
              await clearAll();
              notify('ok', 'All records deleted');
            }
          }}
        >
          Delete all records
        </Button>
      </Panel>
    </div>
  );
}

function resetKeepCctv() {
  const { cctv: _c, ...rest } = DEFAULT_SETTINGS;
  void _c;
  return rest;
}

function CctvSection() {
  const cctv = useSettings((s) => s.cctv);
  const update = useSettings((s) => s.update);
  const [edit, setEdit] = useState<{ cam: CctvCamera | null } | null>(null);
  const [testCam, setTestCam] = useState<CctvCamera | null>(null);
  const [states, setStates] = useState<Record<string, CamState>>({});
  const [server, setServer] = useState<'checking' | 'ok' | 'off'>('checking');
  const setCctv = (patch: Partial<typeof cctv>) => update({ cctv: { ...cctv, ...patch } });

  const refresh = useCallback(async () => {
    try {
      await mtxPing(cctv.apiUrl);
      setServer('ok');
    } catch {
      setServer('off');
    }
    const entries = await Promise.all(cctv.cameras.map(async (c) => [c.id, await mtxState(cctv.apiUrl, c)] as const));
    setStates(Object.fromEntries(entries));
  }, [cctv]);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [refresh]);

  const connect = async (c: CctvCamera, quiet = false) => {
    try {
      await mtxConnect(cctv.apiUrl, c);
      if (!quiet) notify('ok', 'Camera connected', `${c.name} added to MediaMTX.`);
    } catch (err) {
      notify('error', `${c.name} not connected`, err instanceof Error ? err.message : String(err));
    }
    void refresh();
  };

  const save = async (c: CctvCamera) => {
    const exists = cctv.cameras.some((x) => x.id === c.id);
    const cameras = exists ? cctv.cameras.map((x) => (x.id === c.id ? c : x)) : [...cctv.cameras, c];
    update({ cctv: { ...cctv, cameras } });
    setEdit(null);
    if (c.brand === 'hls') notify('ok', 'Camera saved', c.name);
    else await connect(c);
  };

  const remove = async (c: CctvCamera) => {
    if (!confirm(`Remove ${c.name}?`)) return;
    update({ cctv: { ...cctv, cameras: cctv.cameras.filter((x) => x.id !== c.id) } });
    if (c.brand !== 'hls') await mtxRemove(cctv.apiUrl, c.pathName).catch(() => undefined);
    notify('ok', 'Camera removed', c.name);
  };

  return (
    <section id="cctv" className="rounded-lg border border-rule bg-sheet">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <h2 className="font-display text-[17px] font-semibold">CCTV cameras</h2>
        <div className="flex gap-2">
          <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => Promise.all(cctv.cameras.map((c) => connect(c, true))).then(() => notify('ok', 'Cameras connected'))} disabled={!cctv.cameras.length}>
            Connect all
          </Button>
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ cam: null })}>
            Add camera
          </Button>
        </div>
      </header>
      <div className="px-4 pb-4 pt-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="MediaMTX API">
            <Input value={cctv.apiUrl} onChange={(e) => setCctv({ apiUrl: e.target.value })} />
          </Field>
          <Field label="MediaMTX streams">
            <Input value={cctv.hlsUrl} onChange={(e) => setCctv({ hlsUrl: e.target.value })} />
          </Field>
          <span className={clsx('flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium', server === 'ok' ? 'bg-ok/12 text-ok' : server === 'off' ? 'bg-bad/12 text-bad' : 'bg-sunk text-muted')}>
            <span className={clsx('h-2.5 w-2.5 rounded-full', server === 'ok' ? 'bg-ok' : server === 'off' ? 'bg-bad' : 'bg-muted')} />
            {server === 'ok' ? 'MediaMTX running' : server === 'off' ? 'MediaMTX not found' : 'Checking'}
          </span>
        </div>

        {server === 'off' && (
          <div className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
            <p className="font-semibold text-warn">MediaMTX is not running</p>
            <ol className="mt-1.5 list-decimal pl-5 leading-relaxed">
              <li>
                Open the <b>mediamtx</b> folder inside this project.
              </li>
              <li>
                Double-click <b>start-mediamtx.bat</b>. A black window opens: keep it open.
              </li>
              <li>If Windows asks about the firewall, choose Allow access.</li>
              <li>Come back here and press Check again.</li>
            </ol>
            <p className="mt-1.5 text-xs text-muted">Shortcut: start-app.bat in the main folder starts MediaMTX and the analyzer together.</p>
            <Button size="sm" className="mt-2" icon={<RefreshCw size={14} />} onClick={() => void refresh()}>
              Check again
            </Button>
          </div>
        )}

        <ul className="mt-4 flex flex-col divide-y divide-rule rounded-md border border-rule">
          {cctv.cameras.map((c) => {
            const [label, dot] = STATE_TEXT[states[c.id] ?? 'missing'];
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className={clsx('h-3 w-3 rounded-full', dot)} title={label} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {c.name} <span className="font-normal text-muted">{BRANDS.find((b) => b.value === c.brand)?.label}</span>
                  </span>
                  <span className="block truncate font-mono text-xs text-muted">{c.brand === 'hls' ? c.url : maskedRtsp(c)}</span>
                </span>
                <span className="text-xs text-muted">{label}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setTestCam(c)} title="Test this camera: finds out why it does not play" aria-label={`Test ${c.name}`}>
                    <Activity size={15} />
                  </Button>
                  {c.brand !== 'hls' && (
                    <Button size="sm" variant="ghost" onClick={() => connect(c)} title="Connect">
                      <RefreshCw size={15} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ cam: c })} aria-label={`Edit ${c.name}`}>
                    <Pencil size={15} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c)} aria-label={`Remove ${c.name}`}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </li>
            );
          })}
          {cctv.cameras.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No cameras yet</li>}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<Download size={14} />} onClick={() => download(new Blob([mediamtxYaml(cctv)], { type: 'text/yaml' }), 'mediamtx.yml')}>
            Export mediamtx.yml
          </Button>
          <span className="text-xs text-muted">Optional: a permanent config with your cameras. It contains passwords.</span>
        </div>
      </div>
      <CameraTestDialog camera={testCam} onClose={() => setTestCam(null)} />
      <CameraDialog open={!!edit} camera={edit?.cam ?? null} onClose={() => setEdit(null)} onSave={save} />
    </section>
  );
}
