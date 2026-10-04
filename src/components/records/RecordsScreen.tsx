'use client';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileSpreadsheet, Pencil, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import { Button, Input, Segmented, StatusPill } from '@/components/ui';
import { db, type FirerRecord, type SessionRecord } from '@/services/db';
import { deleteFirer, download, exportBackup, exportCsv, importBackup, matchesFirer, statsOf } from '@/services/records';
import { useSettings } from '@/state/settings';
import { useAnalyzer } from '@/state/analyzer';
import { fmt, initials, today } from '@/lib/format';
import { useBlobUrl } from '@/lib/useBlobUrl';
import { FirerDialog } from './FirerDialog';
import { SessionDialog } from './SessionDialog';
import { TrendChart } from './TrendChart';

export function RecordsScreen() {
  const firers = useLiveQuery(() => db().firers.orderBy('updatedAt').reverse().toArray(), []);
  const sessions = useLiveQuery(() => db().sessions.toArray(), []);
  const [tab, setTab] = useState<'firers' | 'weapons'>('firers');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ firer: FirerRecord | null } | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const restore = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('firer');
    if (id) setSelected(id);
  }, []);

  const byFirer = useMemo(() => {
    const m = new Map<string, SessionRecord[]>();
    for (const s of sessions ?? []) m.set(s.firerId, [...(m.get(s.firerId) ?? []), s]);
    return m;
  }, [sessions]);

  const list = (firers ?? []).filter((f) => matchesFirer(f, q));
  const current = firers?.find((f) => f.id === selected) ?? null;

  return (
    <div className="mx-auto max-w-[1400px] p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Records</h1>
          <p className="text-sm text-muted">
            Stored on this computer. {plural(firers?.length ?? 0, 'firer')}, {plural(sessions?.length ?? 0, 'group')}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setDialog({ firer: null })}>
            New firer
          </Button>
          <Button icon={<FileSpreadsheet size={16} />} onClick={async () => download(await exportCsv(), `rfa-results-${today()}.csv`)}>
            Export CSV
          </Button>
          <Button icon={<Download size={16} />} onClick={async () => download(await exportBackup(), `rfa-backup-${today()}.json`)}>
            Back up
          </Button>
          <Button icon={<Upload size={16} />} onClick={() => restore.current?.click()}>
            Restore
          </Button>
          <input
            ref={restore}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const r = await importBackup(f);
                setNote({ tone: 'ok', text: `Restored ${r.firers} firers and ${r.sessions} groups.` });
              } catch (err) {
                setNote({ tone: 'bad', text: err instanceof Error ? err.message : String(err) });
              }
            }}
          />
        </div>
      </div>
      {note && (
        <p className={clsx('mt-3 rounded-md px-3 py-2 text-sm', note.tone === 'ok' ? 'bg-ok/12 text-ok' : 'bg-bad/12 text-bad')} role="status">
          {note.text}
        </p>
      )}

      <div className="mt-4 w-full max-w-xs">
        <Segmented
          label="Records view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'firers', label: 'Firers' },
            { value: 'weapons', label: 'Weapons' },
          ]}
        />
      </div>

      {tab === 'weapons' ? (
        <WeaponTable sessions={sessions ?? []} firers={firers ?? []} />
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className="flex flex-col rounded-lg border border-rule bg-sheet">
            <div className="relative p-3">
              <Search size={16} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <Input placeholder="Search name, number, rank or unit" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search firers" />
            </div>
            {firers && firers.length === 0 ? (
              <div className="px-4 pb-6 text-sm text-muted">
                No firers yet. Add one here, or from the Analyze screen when you save a result.
              </div>
            ) : (
              <ul className="max-h-[70vh] overflow-y-auto border-t border-rule">
                {list.map((f) => {
                  const st = statsOf(byFirer.get(f.id) ?? []);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(f.id)}
                        aria-current={selected === f.id}
                        className={clsx('flex w-full items-center gap-3 border-b border-rule px-3 py-2.5 text-left last:border-b-0', selected === f.id ? 'bg-olive-soft' : 'hover:bg-sunk')}
                      >
                        <Avatar firer={f} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {f.rank} {f.name}
                          </span>
                          <span className="block truncate text-sm text-muted">
                            {f.serviceNo}
                            {f.unit ? `, ${f.unit}` : ''}
                            {f.subunit ? `, ${f.subunit}` : ''}
                          </span>
                        </span>
                        {st.last && <StatusPill status={st.last.status} className="shrink-0 text-xs" />}
                      </button>
                    </li>
                  );
                })}
                {list.length === 0 && firers && firers.length > 0 && <li className="px-4 py-4 text-sm text-muted">No firer matches “{q}”.</li>}
              </ul>
            )}
          </section>

          {current ? (
            <FirerDetail firer={current} sessions={byFirer.get(current.id) ?? []} onEdit={() => setDialog({ firer: current })} onDeleted={() => setSelected(null)} />
          ) : (
            <section className="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-rule p-6 text-center text-muted">
              Choose a firer to see their groups and progress.
            </section>
          )}
        </div>
      )}

      <FirerDialog open={!!dialog} firer={dialog?.firer} onClose={() => setDialog(null)} onSaved={(f) => setSelected(f.id)} />
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Avatar({ firer, size }: { firer: FirerRecord; size: number }) {
  const url = useBlobUrl(firer.photo);
  return (
    <span className="num grid shrink-0 place-items-center overflow-hidden rounded-md bg-sunk font-semibold text-muted" style={{ width: size, height: size * 1.15, fontSize: size * 0.38 }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(firer.name)
      )}
    </span>
  );
}

function FirerDetail({ firer, sessions, onEdit, onDeleted }: { firer: FirerRecord; sessions: SessionRecord[]; onEdit: () => void; onDeleted: () => void }) {
  const rules = useSettings((s) => s.rules);
  const setMeta = useAnalyzer((s) => s.setMeta);
  const router = useRouter();
  const [open, setOpen] = useState<SessionRecord | null>(null);
  const st = statsOf(sessions);
  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
  const limits = rules.classes.slice(0, 3).map((c) => ({ value: c.maxIn, label: c.label }));

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-rule bg-sheet p-4 sm:p-5">
      <header className="flex flex-wrap items-start gap-4">
        <Avatar firer={firer} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold leading-tight">
            {firer.rank} {firer.name}
          </h2>
          <p className="text-muted">
            {firer.serviceNo}
            {firer.unit ? `, ${firer.unit}` : ''}
            {firer.subunit ? `, ${firer.subunit}` : ''}
            {firer.leftHanded ? ', left-handed' : ''}
          </p>
          {firer.notes && <p className="mt-1 text-sm">{firer.notes}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              const last = sorted[0];
              setMeta({ firerId: firer.id, ...(last?.weaponSerial ? { weaponSerial: last.weaponSerial } : {}) });
              router.push('/');
            }}
            title="Open the Analyze screen with this firer selected"
          >
            Fire next group
          </Button>
          <Button size="sm" icon={<Pencil size={14} />} onClick={onEdit}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={async () => {
              if (confirm(`Delete ${firer.rank} ${firer.name} and all ${sessions.length} of their groups? This cannot be undone.`)) {
                await deleteFirer(firer.id);
                onDeleted();
              }
            }}
          >
            Delete
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-4">
        <Tile label="Groups fired" value={String(st.sessions)} />
        <Tile label="Zeroed" value={String(st.zeroed)} />
        <Tile label="Best group" value={st.bestGroupIn != null ? `${fmt(st.bestGroupIn)} in` : '–'} />
        <Tile label="Average of last 5" value={st.recentAvgGroupIn != null ? `${fmt(st.recentAvgGroupIn)} in` : '–'} />
      </dl>

      <div>
        <h3 className="mb-1 font-display text-lg font-semibold">Grouping over time</h3>
        <TrendChart sessions={sessions} limits={limits} />
      </div>

      <div>
        <h3 className="mb-2 font-display text-lg font-semibold">Groups</h3>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted">No groups recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Target</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Weapon</th>
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 pr-3 text-right font-medium">Group</th>
                  <th className="py-2 pr-3 text-right font-medium">Radial</th>
                  <th className="py-2 font-medium">Class</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.id} className="cursor-pointer border-b border-rule last:border-b-0 hover:bg-sunk" onClick={() => setOpen(s)}>
                    <td className="py-1.5 pr-3">
                      <Thumb blob={s.image} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setOpen(s)}>
                        {s.date}
                      </button>
                      <span className="block text-xs text-muted">
                        {s.groupNo ? `Group ${s.groupNo}, ` : ''}
                        {s.rangeM} m
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">{s.weaponSerial || '–'}</td>
                    <td className="py-1.5 pr-3">
                      <StatusPill status={s.status} className="text-xs" />
                    </td>
                    <td className="num py-1.5 pr-3 text-right text-base font-semibold">{s.groupIn != null ? `${fmt(s.groupIn)} in` : '–'}</td>
                    <td className="num py-1.5 pr-3 text-right text-base">{s.radialCm != null ? `${fmt(s.radialCm, 1)} cm` : '–'}</td>
                    <td className="py-1.5">{s.classification ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <SessionDialog session={open} firer={firer} onClose={() => setOpen(null)} />
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-sheet px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function Thumb({ blob }: { blob?: Blob }) {
  const url = useBlobUrl(blob);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-11 w-11 rounded border border-rule bg-scope object-cover" />
  ) : (
    <span className="block h-11 w-11 rounded bg-sunk" />
  );
}

function WeaponTable({ sessions, firers }: { sessions: SessionRecord[]; firers: FirerRecord[] }) {
  const names = new Map(firers.map((f) => [f.id, `${f.rank} ${f.name}`]));
  const rows = useMemo(() => {
    const m = new Map<string, SessionRecord[]>();
    for (const s of sessions) if (s.weaponSerial) m.set(s.weaponSerial, [...(m.get(s.weaponSerial) ?? []), s]);
    return [...m.entries()]
      .map(([serial, list]) => {
        const sorted = list.sort((a, b) => b.createdAt - a.createdAt);
        const lastZero = sorted.find((s) => s.status === 'ZEROED');
        return { serial, last: sorted[0], count: list.length, lastZero };
      })
      .sort((a, b) => b.last.createdAt - a.last.createdAt);
  }, [sessions]);
  if (!rows.length) return <p className="mt-4 text-sm text-muted">Weapons appear here once a group is saved with a weapon number.</p>;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-rule bg-sheet">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th className="px-4 py-2.5 font-medium">Weapon no</th>
            <th className="px-4 py-2.5 font-medium">Latest result</th>
            <th className="px-4 py-2.5 font-medium">Fired by</th>
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium">Last zeroed</th>
            <th className="px-4 py-2.5 text-right font-medium">Groups</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.serial} className="border-b border-rule last:border-b-0">
              <td className="num px-4 py-2 text-base font-semibold">{r.serial}</td>
              <td className="px-4 py-2">
                <StatusPill status={r.last.status} className="text-xs" />
              </td>
              <td className="px-4 py-2">{names.get(r.last.firerId) ?? '–'}</td>
              <td className="px-4 py-2">{r.last.date}</td>
              <td className="px-4 py-2">{r.lastZero ? r.lastZero.date : 'Never'}</td>
              <td className="num px-4 py-2 text-right text-base">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
