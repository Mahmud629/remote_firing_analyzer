'use client';
/**
 * Local database link. The app always works from the browser store (IndexedDB). When the RFA local server
 * is running on this PC (server/server.mjs) every change is also written to a SQLite file (data/rfa.db),
 * and anything missing on either side is copied across. If the server is off, changes wait in the outbox
 * and are sent when it comes back.
 */
import { create } from 'zustand';
import { db, type FirerRecord, type OutboxItem, type SessionRecord } from './db';
import { blobToDataUrl, dataUrlToBlob } from './blob';

export type LocalDbState = 'unknown' | 'online' | 'offline';
/** Why the database could not be reached: not started, or running but refusing this page's web address. */
export type LocalDbReason = 'not-started' | 'blocked' | null;

export interface LocalDbInfo {
  state: LocalDbState;
  dbPath: string;
  firers: number;
  sessions: number;
  dbBytes: number;
  pending: number;
  busy: boolean;
  lastSync: number | null;
  error: string | null;
  reason: LocalDbReason;
}

export const useLocalDb = create<LocalDbInfo>(() => ({ state: 'unknown', dbPath: '', firers: 0, sessions: 0, dbBytes: 0, pending: 0, busy: false, lastSync: null, error: null, reason: null }));
const set = (p: Partial<LocalDbInfo>) => useLocalDb.setState(p);

const isLocalPage = () => typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

/** Where the database may be: the page's own server (start-app.bat serves the app from it), then this PC's port 3939. */
function candidates(): string[] {
  const env = process.env.NEXT_PUBLIC_RFA_DB_URL;
  const list = env ? [env.replace(/\/$/, '')] : [];
  if (isLocalPage() && window.location.port !== '3000') list.push(window.location.origin);
  list.push('http://localhost:3939', 'http://127.0.0.1:3939');
  return [...new Set(list)];
}

let base: string | null = null;
export function localDbBase(): string {
  return base ?? candidates()[0];
}

async function call(path: string, init?: RequestInit & { timeout?: number }) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init?.timeout ?? 8000);
  try {
    const headers = init?.body ? { 'Content-Type': 'application/json' } : undefined;
    return await fetch(localDbBase() + path, { ...init, headers, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function healthAt(b: string): Promise<'ok' | 'blocked' | 'no'> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(b + '/api/health', { signal: ctl.signal, cache: 'no-store' });
    if (r.status === 403) return 'blocked';
    const j = await r.json();
    if (j?.app !== 'rfa-local-db' && !j?.ok) return 'no';
    base = b;
    set({ state: 'online', reason: null, dbPath: j.dbPath, firers: j.firers, sessions: j.sessions, dbBytes: j.dbBytes, error: null });
    return 'ok';
  } catch {
    return 'no';
  } finally {
    clearTimeout(t);
  }
}

async function health(): Promise<boolean> {
  // the address that worked last time first, then the others
  const list = base ? [base, ...candidates().filter((c) => c !== base)] : candidates();
  let blocked = false;
  for (const b of list) {
    const r = await healthAt(b);
    if (r === 'ok') return true;
    if (r === 'blocked') blocked = true;
  }
  set({ state: 'offline', reason: blocked ? 'blocked' : 'not-started' });
  return false;
}

async function refreshPending() {
  set({ pending: await db().outbox.count() });
}

export async function queueLocalDb(op: OutboxItem['op'], id: string) {
  try {
    await db().outbox.add({ op, id });
    await refreshPending();
    void flush();
  } catch {
    /* the browser store is still the master copy */
  }
}

async function putFirerRemote(f: FirerRecord) {
  const r = await call(`/api/firers/${f.id}`, { method: 'PUT', body: JSON.stringify({ ...f, photo: await blobToDataUrl(f.photo) }) });
  if (!r.ok) throw new Error(`firer ${r.status}`);
}

async function putSessionRemote(s: SessionRecord) {
  const send = async () =>
    call(`/api/sessions/${s.id}`, { method: 'PUT', body: JSON.stringify({ ...s, image: await blobToDataUrl(s.image), closeUp: await blobToDataUrl(s.closeUp) }) });
  let r = await send();
  if (r.status === 409) {
    const f = await db().firers.get(s.firerId);
    if (f) await putFirerRemote(f);
    r = await send();
  }
  if (!r.ok) throw new Error(`session ${r.status}`);
}

let flushing: Promise<void> | null = null;
let again = false;

/** Sends waiting changes to the local database, oldest first. Stops at the first network failure. */
export function flush(): Promise<void> {
  if (flushing) { again = true; return flushing; }
  flushing = (async () => {
    do {
      again = false;
      if (!(await health())) break;
      for (const it of await db().outbox.orderBy('seq').toArray()) {
        try {
          if (it.op === 'putFirer') { const f = await db().firers.get(it.id); if (f) await putFirerRemote(f); }
          else if (it.op === 'putSession') { const s = await db().sessions.get(it.id); if (s) await putSessionRemote(s); }
          else if (it.op === 'delFirer') await call(`/api/firers/${it.id}`, { method: 'DELETE' });
          else if (it.op === 'delSession') await call(`/api/sessions/${it.id}`, { method: 'DELETE' });
          else if (it.op === 'clearAll') await call('/api/all', { method: 'DELETE' });
          await db().outbox.delete(it.seq!);
        } catch (e) {
          set({ state: 'offline', error: (e as Error).message });
          break;
        }
      }
      await refreshPending();
    } while (again);
    await health();
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Full two-way catch-up: sends waiting changes, then copies whatever is missing or older on either side. */
export async function syncNow(): Promise<{ pulled: number; pushed: number } | null> {
  set({ busy: true });
  try {
    await flush();
    if (useLocalDb.getState().state !== 'online') return null;
    const idx = await (await call('/api/index')).json() as { firers: { id: string; updatedAt: number }[]; sessions: { id: string }[] };
    const remoteF = new Map(idx.firers.map((f) => [f.id, f.updatedAt]));
    const remoteS = new Set(idx.sessions.map((s) => s.id));
    let pulled = 0, pushed = 0;

    for (const f of await db().firers.toArray()) {
      const rt = remoteF.get(f.id);
      if (rt == null || f.updatedAt > rt) { await putFirerRemote(f); pushed++; }
    }
    for (const s of await db().sessions.toArray()) {
      if (!remoteS.has(s.id)) { await putSessionRemote(s); pushed++; }
    }
    for (const [id, rt] of remoteF) {
      const local = await db().firers.get(id);
      if (local && local.updatedAt >= rt) continue;
      const j = await (await call(`/api/firers/${id}`)).json();
      const photo = j.photoUrl ? await (await call(j.photoUrl.replace(/^\/api/, '/api'))).blob() : undefined;
      await db().firers.put({ ...j.record, photo });
      pulled++;
    }
    for (const id of remoteS) {
      if (await db().sessions.get(id)) continue;
      const j = await (await call(`/api/sessions/${id}`)).json();
      const image = j.imageUrl ? await (await call(j.imageUrl)).blob() : undefined;
      const closeUp = j.closeUpUrl ? await (await call(j.closeUpUrl)).blob() : undefined;
      await db().sessions.put({ ...j.record, image, closeUp });
      pulled++;
    }
    await health();
    set({ lastSync: Date.now(), error: null });
    return { pulled, pushed };
  } catch (e) {
    set({ error: (e as Error).message });
    return null;
  } finally {
    set({ busy: false });
    await refreshPending();
  }
}

let started = false;
/** Called once when the app opens: catches up now, then re-checks (every 5 s while the database is not found, so it
 * connects by itself as soon as it is started; every minute once connected). */
export function startLocalDb() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void syncNow();
  let last = Date.now();
  setInterval(() => {
    const s = useLocalDb.getState();
    if (s.busy) return;
    const offline = s.state !== 'online';
    if (!offline && Date.now() - last < 60_000) return;
    last = Date.now();
    void (offline || s.pending > 0 ? syncNow() : health());
  }, 5_000);
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && useLocalDb.getState().state !== 'online') void syncNow(); });
}
