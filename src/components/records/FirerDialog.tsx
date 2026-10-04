'use client';
import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Input, Toggle } from '@/components/ui';
import type { FirerRecord } from '@/services/db';
import { findFirerByServiceNo, saveFirer } from '@/services/records';
import { initials } from '@/lib/format';

const RANKS = [
  'Sainik',
  'Lance Corporal',
  'Corporal',
  'Sergeant',
  'Warrant Officer',
  'Senior Warrant Officer',
  'Master Warrant Officer',
  'Second Lieutenant',
  'Lieutenant',
  'Captain',
  'Major',
  'Lieutenant Colonel',
  'Colonel',
];

const empty = { serviceNo: '', rank: '', name: '', unit: '', subunit: '', leftHanded: false, notes: '' };
const COYS = ['HQ Coy', 'A Coy', 'B Coy', 'C Coy', 'D Coy', 'Sp Coy', 'Sigs Coy', 'Admin Coy'];

export function FirerDialog({ open, onClose, firer, onSaved }: { open: boolean; onClose: () => void; firer?: FirerRecord | null; onSaved?: (f: FirerRecord) => void }) {
  const [form, setForm] = useState(empty);
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(firer ? { serviceNo: firer.serviceNo, rank: firer.rank, name: firer.name, unit: firer.unit, subunit: firer.subunit ?? '', leftHanded: firer.leftHanded, notes: firer.notes ?? '' } : empty);
    setPhoto(firer?.photo);
    setError(null);
  }, [open, firer]);

  useEffect(() => {
    if (!photo) return setPhotoUrl(null);
    const u = URL.createObjectURL(photo);
    setPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serviceNo.trim() || !form.name.trim()) {
      setError('Personal number and name are both needed.');
      return;
    }
    const clash = await findFirerByServiceNo(form.serviceNo);
    if (clash && clash.id !== firer?.id) {
      setError(`Personal number ${form.serviceNo} already belongs to ${clash.rank} ${clash.name}.`);
      return;
    }
    setSaving(true);
    try {
      const rec = await saveFirer({ ...form, id: firer?.id, photo });
      onSaved?.(rec);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={firer ? 'Edit firer' : 'New firer'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <label className="group relative grid h-20 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-rule bg-sunk text-lg font-semibold text-muted">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="num">{initials(form.name)}</span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[11px] text-white opacity-0 group-hover:opacity-100">Photo</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(await shrinkPhoto(f));
              }}
            />
          </label>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Personal number">
              <Input value={form.serviceNo} onChange={set('serviceNo')} autoFocus required />
            </Field>
            <Field label="Rank">
              <Input value={form.rank} onChange={set('rank')} list="rfa-ranks" />
            </Field>
          </div>
        </div>
        <datalist id="rfa-ranks">
          {RANKS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit">
            <Input value={form.unit} onChange={set('unit')} />
          </Field>
          <Field label="Sub unit / Coy">
            <Input value={form.subunit} onChange={set('subunit')} list="rfa-coys" placeholder="e.g. A Coy" />
          </Field>
        </div>
        <datalist id="rfa-coys">
          {COYS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Toggle checked={form.leftHanded} onChange={(v) => setForm((f) => ({ ...f, leftHanded: v }))} label="Fires left-handed" hint="Mirrors the trigger-control coaching note." />
        <Field label="Notes">
          <textarea value={form.notes} onChange={set('notes')} rows={2} className="w-full rounded-md border border-rule bg-sheet px-3 py-2 text-[15px] focus:border-aim focus:outline-none" />
        </Field>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {firer ? 'Save changes' : 'Add firer'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
}
