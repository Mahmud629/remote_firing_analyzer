import 'fake-indexeddb/auto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { createRfaServer, hostingOrigins } from '../server/server.mjs';

// 1x1 JPEG
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
let dir: string;
let app: Awaited<ReturnType<typeof createRfaServer>>;
let base: string;

const firer = (id: string, extra = {}) => ({ id, serviceNo: 'BA-1', rank: 'Capt', name: 'Test', unit: '10 Sigs', subunit: 'A Coy', leftHanded: false, createdAt: 1, updatedAt: 5, ...extra });
const session = (id: string, firerId: string, extra = {}) => ({
  id, firerId, weaponSerial: 'W1', date: '2026-10-11', rangeM: 25, status: 'ZEROED', reasons: [], groupIn: 1.9, radialCm: 2.1, mpiIn: { x: 0, y: 0 }, offsetCm: { x: 1.5, y: -2 },
  correction: null, classification: '4 in', diagnostics: [], shotsIn: [1, 2, 3, 4, 5].map((i) => ({ x: i, y: i, source: 'auto' })), poaIn: { x: 0, y: 0 },
  calibration: { method: 'auto', confidence: 1, diameterIn: 32 }, requiredRounds: 5, createdAt: 10, ...extra,
});
const put = (p: string, body: unknown, method = 'PUT') => fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rfa-'));
  app = await createRfaServer({ dataDir: dir });
  const a = await app.listen(0);
  base = `http://127.0.0.1:${a.port}`;
  process.env.NEXT_PUBLIC_RFA_DB_URL = base;
});
afterAll(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('local database server', () => {
  it('stores, reads and deletes a firer with photo and a group with pictures', async () => {
    expect((await put('/api/firers/f1', firer('f1', { photo: JPG }))).status).toBe(200);
    expect((await put('/api/sessions/s1', session('s1', 'f1', { image: JPG, closeUp: JPG }))).status).toBe(200);
    const f = await (await fetch(base + '/api/firers/f1')).json();
    expect(f.record.name).toBe('Test');
    expect((await fetch(base + f.photoUrl)).status).toBe(200);
    const s = await (await fetch(base + '/api/sessions/s1')).json();
    expect(s.record.shotsIn).toHaveLength(5);
    expect((await fetch(base + s.imageUrl)).headers.get('content-type')).toBe('image/jpeg');
    expect(fs.readdirSync(path.join(dir, 'images')).length).toBe(3);
    await fetch(base + '/api/firers/f1', { method: 'DELETE' });
    expect((await fetch(base + '/api/sessions/s1')).status).toBe(404);
    expect(fs.readdirSync(path.join(dir, 'images')).length).toBe(0);
  });

  it('writes a real SQLite file with a flat results view', async () => {
    await put('/api/firers/f2', firer('f2'));
    await put('/api/sessions/s2', session('s2', 'f2'));
    app.store.saveNow();
    const head = fs.readFileSync(path.join(dir, 'rfa.db')).subarray(0, 15).toString();
    expect(head).toBe('SQLite format 3');
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const d = new SQL.Database(fs.readFileSync(path.join(dir, 'rfa.db')));
    const r = d.exec('SELECT service_no, subunit, result, group_in, offset_y_cm, rounds FROM v_results')[0].values[0];
    expect(r).toEqual(['BA-1', 'A Coy', 'ZEROED', 1.9, -2, 5]);
  });

  it('refuses bad ids, orphan groups, foreign origins and survives restart', async () => {
    expect((await put('/api/firers/..%2Fx', firer('x'))).status).toBe(400);
    expect((await put('/api/sessions/s9', session('s9', 'nobody'))).status).toBe(409);
    expect((await fetch(base + '/api/health', { headers: { Origin: 'http://evil.example' } })).status).toBe(403);
    expect((await fetch(base + '/api/files/..%2F..%2Frfa.db')).status).toBe(404);
    const again = await createRfaServer({ dataDir: dir });
    app.store.saveNow();
    expect(again.store.stats().sessions).toBe(1);
    await again.close();
  });
});

describe('browser to database sync', () => {
  it('queues changes, sends them, and restores a wiped browser from the file', async () => {
    const { db } = await import('../src/services/db');
    const rec = await import('../src/services/records');
    const ldb = await import('../src/services/localdb');
    await rec.clearAll(); await ldb.flush(); await put('/api/all', {}, 'DELETE');

    const f = await rec.saveFirer({ serviceNo: 'BA-77', rank: 'Maj', name: 'Sync Test', unit: '10 Sigs', subunit: 'HQ Coy', leftHanded: true });
    const s = await rec.saveSession({ ...session('x', f.id), id: undefined, image: new Blob(['abc'], { type: 'image/jpeg' }) } as never);
    await ldb.flush();
    expect(await db().outbox.count()).toBe(0);
    const idx = await (await fetch(base + '/api/index')).json();
    expect(idx.firers.map((x: { id: string }) => x.id)).toContain(f.id);
    expect(idx.sessions.map((x: { id: string }) => x.id)).toContain(s.id);

    // browser data lost
    await db().sessions.clear(); await db().firers.clear(); await db().outbox.clear();
    const r = await ldb.syncNow();
    expect(r?.pulled).toBe(2);
    expect((await db().firers.get(f.id))?.subunit).toBe('HQ Coy');
    expect(await (await db().sessions.get(s.id))!.image!.text()).toBe('abc');

    // delete is sent, and is not brought back by the next sync
    await rec.deleteFirer(f.id);
    await ldb.syncNow();
    expect(await db().firers.count()).toBe(0);
    expect(app.store.stats().firers).toBe(0);
  });

  it('keeps changes in the outbox while the server is down and sends them later', async () => {
    const { db } = await import('../src/services/db');
    const rec = await import('../src/services/records');
    const ldb = await import('../src/services/localdb');
    const port = new URL(base).port;
    await app.close();
    const f = await rec.saveFirer({ serviceNo: 'BA-88', rank: 'Lt', name: 'Offline', unit: 'U', subunit: '', leftHanded: false });
    await ldb.flush();
    expect(ldb.useLocalDb.getState().state).toBe('offline');
    expect(await db().outbox.count()).toBeGreaterThan(0);
    app = await createRfaServer({ dataDir: dir });
    await app.listen(Number(port));
    await ldb.flush();
    expect(await db().outbox.count()).toBe(0);
    expect(app.store.getFirer(f.id)?.record.name).toBe('Offline');
  });

  it('accepts this project\'s Firebase site, answers on IPv6 too, and tells a refused page why', async () => {
    expect(hostingOrigins(path.resolve(__dirname, '..'))).toContain('https://remote-firing-analyzer.web.app');
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'rfa-'));
    const srv = await createRfaServer({ dataDir: d2, extraOrigins: ['https://remote-firing-analyzer.web.app'] });
    const port = (await srv.listen(0)).port;
    const b2 = `http://127.0.0.1:${port}`;
    const ok = await fetch(b2 + '/api/health', { headers: { Origin: 'https://remote-firing-analyzer.web.app' } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://remote-firing-analyzer.web.app');
    const no = await fetch(b2 + '/api/health', { headers: { Origin: 'https://evil.example' } });
    expect(no.status).toBe(403);
    expect(no.headers.get('access-control-allow-origin')).toBe('https://evil.example'); // readable refusal, no data
    expect((await no.json()).firers).toBeUndefined();
    const v6 = await fetch(`http://[::1]:${port}/api/health`).then((r) => r.json()).catch(() => null);
    if (v6) expect(v6.app).toBe('rfa-local-db'); // only where the PC has IPv6
    await srv.close();
    fs.rmSync(d2, { recursive: true, force: true });
  });
});
