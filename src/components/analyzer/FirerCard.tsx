'use client';
import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Field, Input, Panel } from '@/components/ui';
import { FirerDialog } from '@/components/records/FirerDialog';
import { matchesFirer } from '@/services/records';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/services/db';
import { useFirers } from './useSessionActions';

export function FirerCard() {
  const { meta, setMeta, firers, firer, pickFirer } = useFirers();
  const serials = useLiveQuery(async () => [...new Set((await db().sessions.toArray()).map((x) => x.weaponSerial).filter(Boolean))].sort(), []);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [dialog, setDialog] = useState(false);
  const matches = useMemo(() => (firers ?? []).filter((f) => matchesFirer(f, query)).slice(0, 8), [firers, query]);
  const choose = (id: string) => {
    pickFirer(id);
    setPicking(false);
    setQuery('');
  };

  return (
    <Panel title="Firer details" centered>
      <div className="flex flex-col gap-3">
        {firer && !picking ? (
          <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-3 rounded-md border border-rule px-3 py-2 text-left hover:bg-sunk" title="Change firer">
            <span className="num grid h-10 w-10 shrink-0 place-items-center rounded-full bg-olive text-base font-bold text-olive-ink">{firer.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1 text-center">
              <span className="block truncate font-semibold">
                {firer.rank} {firer.name}
              </span>
              <span className="block truncate text-sm text-muted">
                {firer.serviceNo}
                {firer.unit ? `, ${firer.unit}` : ''}
                {firer.subunit ? `, ${firer.subunit}` : ''}
              </span>
            </span>
            <span className="text-xs font-medium text-aim">Change</span>
          </button>
        ) : (
          <div>
            <Input className="text-center" placeholder="Search firer by name or number" value={query} onChange={(e) => (setQuery(e.target.value), setPicking(true))} onFocus={() => setPicking(true)} aria-label="Firer" />
            {picking && (
              <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-rule bg-sheet shadow-lg">
                {matches.map((f) => (
                  <button key={f.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-sunk" onClick={() => choose(f.id)}>
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

        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Field label="Weapon no" center>
            <Input className="text-center" value={meta.weaponSerial} onChange={(e) => setMeta({ weaponSerial: e.target.value })} list="rfa-serials" aria-label="Weapon no" />
          </Field>
          <Field label="Range (m)" center>
            <Input className="text-center" type="number" min={1} aria-label="Range in metres" value={meta.rangeM} onChange={(e) => setMeta({ rangeM: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <datalist id="rfa-serials">{serials?.map((x) => <option key={x} value={x} />)}</datalist>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date" center>
            <Input className="text-center" type="date" value={meta.date} onChange={(e) => setMeta({ date: e.target.value })} />
          </Field>
          <Field label="Remarks" center>
            <Input className="text-center" value={meta.notes} onChange={(e) => setMeta({ notes: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
      </div>
      <FirerDialog open={dialog} onClose={() => setDialog(false)} onSaved={(f) => choose(f.id)} />
    </Panel>
  );
}
