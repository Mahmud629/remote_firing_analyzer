// RFA local server: serves the app (the "out" folder after `npm run build`) and the local database API.
// Listens on this PC only (127.0.0.1). Start:  node server/server.mjs   (or start-app.bat)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, isSafeId } from './store.mjs';

const MAX_BODY = 40 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.map': 'application/json' };
const localOrigin = (o) => !o || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o);

/** Web addresses (besides this PC) whose pages may use the database: the Firebase site of this project and RFA_ALLOWED_ORIGINS. */
export function hostingOrigins(root) {
  const out = [];
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
    for (const id of Object.values(rc.projects ?? {})) out.push(`https://${id}.web.app`, `https://${id}.firebaseapp.com`);
  } catch { /* no Firebase project */ }
  for (const o of (process.env.RFA_ALLOWED_ORIGINS ?? '').split(',')) if (o.trim()) out.push(o.trim().replace(/\/$/, ''));
  return out;
}

export async function createRfaServer({ dataDir, webRoot, version = '2.7', extraOrigins = [] }) {
  const allowed = (o) => localOrigin(o) || extraOrigins.includes(o);
  const store = await openStore(dataDir);
  store.dailyBackup();
  const backupTimer = setInterval(() => store.dailyBackup(), 6 * 3600 * 1000);
  backupTimer.unref?.();

  const send = (res, code, body, headers = {}) => {
    const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
    res.writeHead(code, { 'Content-Type': isObj ? 'application/json' : 'text/plain', 'Cache-Control': 'no-store', ...headers });
    res.end(isObj ? JSON.stringify(body) : body);
  };
  const readJson = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('bad json'), { code: 400 })); } });
    req.on('error', reject);
  });

  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
    const [a, id] = parts;
    const m = req.method;
    if (a === 'health' && m === 'GET') return send(res, 200, { ok: true, app: 'rfa-local-db', version, dbPath: store.dbPath, ...store.stats() });
    if (a === 'index' && m === 'GET') return send(res, 200, store.index());
    if (a === 'firers' || a === 'sessions') {
      if (!isSafeId(id)) return send(res, 400, { error: 'bad id' });
      const isF = a === 'firers';
      if (m === 'PUT') {
        const body = await readJson(req);
        if (body.id !== id) return send(res, 400, { error: 'id mismatch' });
        try { isF ? store.putFirer(body) : store.putSession(body); } catch (e) { return send(res, e.message === 'unknown firer' ? 409 : 400, { error: e.message }); }
        return send(res, 200, { ok: true });
      }
      if (m === 'GET') {
        const r = isF ? store.getFirer(id) : store.getSession(id);
        if (!r) return send(res, 404, { error: 'not found' });
        const f = (n) => (n ? `/api/files/${n}` : undefined);
        return send(res, 200, isF ? { record: r.record, photoUrl: f(r.photoFile) } : { record: r.record, imageUrl: f(r.imageFile), closeUpUrl: f(r.closeUpFile) });
      }
      if (m === 'DELETE') { isF ? store.deleteFirer(id) : store.deleteSession(id); return send(res, 200, { ok: true }); }
    }
    if (a === 'files' && m === 'GET') {
      const p = store.imageFile(id ?? '');
      if (!p) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(p), { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    }
    if (a === 'all' && m === 'DELETE') { store.clearAll(); return send(res, 200, { ok: true }); }
    if (a === 'backup' && m === 'POST') return send(res, 200, { ok: true, file: store.dailyBackup() });
    if (a === 'download' && m === 'GET') {
      store.saveNow();
      return send(res, 200, fs.readFileSync(store.dbPath), { 'Content-Type': 'application/vnd.sqlite3', 'Content-Disposition': 'attachment; filename="rfa.db"' });
    }
    return send(res, 404, { error: 'no such endpoint' });
  }

  function serveStatic(req, res, url) {
    if (!webRoot || !fs.existsSync(webRoot)) return send(res, 200, 'RFA database server is running. Build the app (npm run build) to serve it here, or use npm run dev on port 3000.');
    let rel = decodeURIComponent(url.pathname);
    let p = path.normalize(path.join(webRoot, rel));
    if (!p.startsWith(path.normalize(webRoot))) return send(res, 403, 'forbidden');
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) p = path.join(webRoot, '404.html');
    if (!fs.existsSync(p)) return send(res, 404, 'not found');
    res.writeHead(fs.existsSync(path.join(webRoot, rel)) ? 200 : 404, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    // a page from another web address gets a readable refusal, so the app can say what is wrong
    if (!allowed(origin)) return send(res, 403, { error: 'origin not allowed', origin });
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return serveStatic(req, res, url);
    } catch (e) {
      return send(res, e.code === 413 || e.code === 400 ? e.code : 500, { error: e.message });
    }
  });

  // Windows may send "localhost" to the IPv6 address (::1): answer there as well
  const server6 = http.createServer((req, res) => server.emit('request', req, res));
  server6.on('error', () => { /* no IPv6 on this PC: IPv4 is enough */ });
  return {
    server, store,
    listen: (port, host = '127.0.0.1') => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        const addr = server.address();
        if (host === '127.0.0.1') server6.listen(addr.port, '::1');
        resolve(addr);
      });
    }),
    close: () => new Promise((r) => { clearInterval(backupTimer); server6.close(); server.close(() => { store.close(); r(); }); server.closeAllConnections?.(); server6.closeAllConnections?.(); }),
  };
}

async function alreadyRunning(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    return (await r.json())?.app === 'rfa-local-db';
  } catch {
    return false;
  }
}

// Run directly: node server/server.mjs [--port 3939] [--data ./data]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const port = Number(arg('--port', process.env.RFA_PORT ?? 3939));
  const dataDir = path.resolve(arg('--data', process.env.RFA_DATA ?? path.join(root, 'data')));
  if (await alreadyRunning(port)) {  // never open the same database file twice
    console.log(`The RFA database is already running (another window). Open the app at http://localhost:${port}`);
    process.exit(0);
  }
  let app;
  try {
    app = await createRfaServer({ dataDir, webRoot: path.join(root, 'out'), extraOrigins: hostingOrigins(root) });
  } catch (e) {
    console.error(`\nThe RFA database could not open its data folder:\n  ${dataDir}\n  ${e.message}\n\nCopy the project to a folder you can write to (for example Documents or D:\\RFA),\nor start it with another folder:  node server\\server.mjs --data D:\\RFA-data\n`);
    process.exit(1);
  }
  try {
    await app.listen(port);
  } catch (e) {
    console.error(e.code === 'EADDRINUSE'
      ? `\nPort ${port} is used by another program. Close it, or start the database on another port:\n  node server\\server.mjs --port 3940   (and open http://localhost:3940)\n`
      : `\nThe RFA database could not start: ${e.message}\n`);
    process.exit(1);
  }
  console.log(`RFA local database ready.\n  Database : ${app.store.dbPath}\n  Open app : http://localhost:${port}\n\nKeep this window open while you use the app.`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
