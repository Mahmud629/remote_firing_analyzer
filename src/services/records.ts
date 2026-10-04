import { db, newId, type FirerRecord, type SessionRecord } from './db';

export type FirerInput = Omit<FirerRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function saveFirer(input: FirerInput): Promise<FirerRecord> {
  const now = Date.now();
  const existing = input.id ? await db().firers.get(input.id) : undefined;
  const rec: FirerRecord = {
    ...input,
    serviceNo: input.serviceNo.trim(),
    name: input.name.trim(),
    rank: input.rank.trim(),
    unit: input.unit.trim(),
    subunit: (input.subunit ?? '').trim(),
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db().firers.put(rec);
  return rec;
}

export async function deleteFirer(id: string) {
  await db().transaction('rw', db().firers, db().sessions, async () => {
    await db().sessions.where('firerId').equals(id).delete();
    await db().firers.delete(id);
  });
}

export async function findFirerByServiceNo(serviceNo: string) {
  const s = serviceNo.trim();
  if (!s) return undefined;
  return db().firers.where('serviceNo').equalsIgnoreCase(s).first();
}

export function matchesFirer(f: FirerRecord, q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [f.name, f.serviceNo, f.rank, f.unit, f.subunit ?? ''].some((v) => v.toLowerCase().includes(t));
}

export async function saveSession(s: Omit<SessionRecord, 'id' | 'createdAt'>): Promise<SessionRecord> {
  const rec: SessionRecord = { ...s, id: newId(), createdAt: Date.now() };
  await db().transaction('rw', db().firers, db().sessions, async () => {
    await db().sessions.put(rec);
    await db().firers.update(s.firerId, { updatedAt: rec.createdAt });
  });
  return rec;
}

export const deleteSession = (id: string) => db().sessions.delete(id);

export async function firerSessions(firerId: string) {
  const list = await db().sessions.where('firerId').equals(firerId).toArray();
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export interface FirerStats {
  sessions: number;
  zeroed: number;
  bestGroupIn: number | null;
  recentAvgGroupIn: number | null;
  last?: SessionRecord;
}

export function statsOf(sessions: SessionRecord[]): FirerStats {
  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
  const groups = sorted.filter((s) => s.groupIn != null && s.shotsIn.length === s.requiredRounds).map((s) => s.groupIn!);
  const recent = groups.slice(0, 5);
  return {
    sessions: sorted.length,
    zeroed: sorted.filter((s) => s.status === 'ZEROED').length,
    bestGroupIn: groups.length ? Math.min(...groups) : null,
    recentAvgGroupIn: recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null,
    last: sorted[0],
  };
}

/* ------------------------------ backup ------------------------------ */

const BACKUP_KIND = 'rfa-backup';

async function blobToDataUrl(b?: Blob) {
  if (!b) return undefined;
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

async function dataUrlToBlob(u?: string) {
  if (!u) return undefined;
  return (await fetch(u)).blob();
}

export async function exportBackup(): Promise<Blob> {
  const firers = await db().firers.toArray();
  const sessions = await db().sessions.toArray();
  const payload = {
    kind: BACKUP_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    firers: await Promise.all(firers.map(async (f) => ({ ...f, photo: await blobToDataUrl(f.photo) }))),
    sessions: await Promise.all(sessions.map(async (s) => ({ ...s, image: await blobToDataUrl(s.image), closeUp: await blobToDataUrl(s.closeUp) }))),
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

/** Merges a backup into the database; records with the same id are replaced. */
export async function importBackup(file: File): Promise<{ firers: number; sessions: number }> {
  const data = JSON.parse(await file.text());
  if (data?.kind !== BACKUP_KIND || !Array.isArray(data.firers) || !Array.isArray(data.sessions)) {
    throw new Error('This file is not a Remote Firing Analyzer backup.');
  }
  const firers: FirerRecord[] = await Promise.all(data.firers.map(async (f: FirerRecord & { photo?: string }) => ({ ...f, photo: await dataUrlToBlob(f.photo) })));
  const sessions: SessionRecord[] = await Promise.all(
    data.sessions.map(async (s: SessionRecord & { image?: string; closeUp?: string }) => ({ ...s, image: await dataUrlToBlob(s.image), closeUp: await dataUrlToBlob(s.closeUp) })),
  );
  await db().transaction('rw', db().firers, db().sessions, async () => {
    await db().firers.bulkPut(firers);
    await db().sessions.bulkPut(sessions);
  });
  return { firers: firers.length, sessions: sessions.length };
}

export async function exportCsv(): Promise<Blob> {
  const firers = new Map((await db().firers.toArray()).map((f) => [f.id, f]));
  const sessions = (await db().sessions.toArray()).sort((a, b) => a.createdAt - b.createdAt);
  const head = ['Date', 'Service no', 'Rank', 'Name', 'Unit', 'Sub unit / Coy', 'Weapon', 'Range (m)', 'Rounds', 'Result', 'Group (in)', 'Radial error (cm)', 'MPI x (cm)', 'MPI y (cm)', 'Classification', 'Notes'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = sessions.map((s) => {
    const f = firers.get(s.firerId);
    return [
      s.date,
      f?.serviceNo,
      f?.rank,
      f?.name,
      f?.unit,
      f?.subunit,
      s.weaponSerial,
      s.rangeM,
      s.shotsIn.length,
      s.status,
      s.groupIn?.toFixed(2),
      s.radialCm?.toFixed(1),
      s.offsetCm?.x.toFixed(1),
      s.offsetCm?.y.toFixed(1),
      s.classification,
      s.notes,
    ].map(esc).join(',');
  });
  return new Blob(['\ufeff' + [head.join(','), ...rows].join('\n')], { type: 'text/csv' });
}

export async function clearAll() {
  await db().transaction('rw', db().firers, db().sessions, async () => {
    await db().sessions.clear();
    await db().firers.clear();
  });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
