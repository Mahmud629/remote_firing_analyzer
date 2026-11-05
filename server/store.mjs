// RFA local database: a real SQLite file on this PC (sql.js, pure JavaScript, no native build).
// Layout:  <dataDir>/rfa.db          the database
//          <dataDir>/images/         target pictures and photos (JPEG/PNG), one file each
//          <dataDir>/backups/        automatic daily copy of rfa.db (last 14 kept)
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS firers (
  id TEXT PRIMARY KEY,
  service_no TEXT NOT NULL,
  rank TEXT, name TEXT, unit TEXT, subunit TEXT,
  left_handed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  photo_file TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_firers_service_no ON firers(service_no);
CREATE INDEX IF NOT EXISTS ix_firers_updated ON firers(updated_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  firer_id TEXT NOT NULL REFERENCES firers(id) ON DELETE CASCADE,
  weapon_serial TEXT,
  date TEXT,
  range_m REAL,
  status TEXT,
  rounds INTEGER,
  required_rounds INTEGER,
  group_in REAL,
  radial_cm REAL,
  offset_x_cm REAL,
  offset_y_cm REAL,
  classification TEXT,
  firing_session_id TEXT,
  group_no INTEGER,
  notes TEXT,
  image_file TEXT,
  closeup_file TEXT,
  created_at INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_firer ON sessions(firer_id);
CREATE INDEX IF NOT EXISTS ix_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS ix_sessions_status ON sessions(status);

-- Ready-made flat table for Excel, DB Browser for SQLite or any report tool.
CREATE VIEW IF NOT EXISTS v_results AS
SELECT s.date AS date, f.service_no AS service_no, f.rank AS rank, f.name AS name, f.unit AS unit, f.subunit AS subunit,
       s.weapon_serial AS weapon, s.range_m AS range_m, s.rounds AS rounds, s.status AS result,
       s.group_in AS group_in, s.radial_cm AS radial_cm, s.offset_x_cm AS offset_x_cm, s.offset_y_cm AS offset_y_cm,
       s.classification AS classification, s.notes AS notes
FROM sessions s JOIN firers f ON f.id = s.firer_id
ORDER BY s.created_at;
`;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const isSafeId = (v) => typeof v === 'string' && SAFE_ID.test(v);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (v == null ? null : String(v));

function dataUrlToFile(dataUrl) {
  const m = /^data:(image\/(jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? '');
  if (!m) return null;
  return { ext: m[2] === 'png' ? 'png' : 'jpg', bytes: Buffer.from(m[3], 'base64'), mime: m[1] };
}

export async function openStore(dataDir, { autosaveMs = 300 } = {}) {
  fs.mkdirSync(path.join(dataDir, 'images'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  const dbPath = path.join(dataDir, 'rfa.db');
  const SQL = await initSqlJs();
  const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(SCHEMA);
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION};`);

  let timer = null;
  let dirty = false;
  const saveNow = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return;
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(db.export()));
    fs.renameSync(tmp, dbPath);
    dirty = false;
  };
  const touch = () => {
    dirty = true;
    if (!timer) timer = setTimeout(() => { timer = null; try { saveNow(); } catch (e) { console.error('save failed', e); } }, autosaveMs);
  };
  // db.export() resets PRAGMA foreign_keys in sql.js, so it is set again after every save.
  const origExport = db.export.bind(db);
  db.export = () => { const d = origExport(); db.run('PRAGMA foreign_keys = ON;'); return d; };

  const all = (sql, p = []) => {
    const st = db.prepare(sql); st.bind(p);
    const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free();
    return rows;
  };
  const one = (sql, p = []) => all(sql, p)[0];

  const imgPath = (name) => path.join(dataDir, 'images', name);
  const writeImage = (kind, id, dataUrl, oldName) => {
    if (oldName) { try { fs.unlinkSync(imgPath(oldName)); } catch {} }
    if (!dataUrl) return null;
    const f = dataUrlToFile(dataUrl);
    if (!f) return null;
    const name = `${kind}-${id}.${f.ext}`;
    fs.writeFileSync(imgPath(name), f.bytes);
    return name;
  };
  const rmImages = (...names) => names.filter(Boolean).forEach((n) => { try { fs.unlinkSync(imgPath(n)); } catch {} });

  const strip = (rec, keys) => { const c = { ...rec }; keys.forEach((k) => delete c[k]); return c; };

  const api = {
    dbPath,
    dataDir,
    saveNow,
    close() { saveNow(); db.close(); },

    putFirer(rec) {
      if (!isSafeId(rec?.id)) throw new Error('bad id');
      const old = one('SELECT photo_file FROM firers WHERE id=?', [rec.id]);
      const photo = writeImage('photo', rec.id, rec.photo, old?.photo_file);
      const json = JSON.stringify(strip(rec, ['photo']));
      db.run(
        `INSERT INTO firers(id,service_no,rank,name,unit,subunit,left_handed,notes,photo_file,created_at,updated_at,json)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET service_no=excluded.service_no, rank=excluded.rank, name=excluded.name, unit=excluded.unit,
           subunit=excluded.subunit, left_handed=excluded.left_handed, notes=excluded.notes, photo_file=excluded.photo_file,
           created_at=excluded.created_at, updated_at=excluded.updated_at, json=excluded.json`,
        [rec.id, str(rec.serviceNo) ?? '', str(rec.rank), str(rec.name), str(rec.unit), str(rec.subunit), rec.leftHanded ? 1 : 0, str(rec.notes), photo, num(rec.createdAt) ?? Date.now(), num(rec.updatedAt) ?? Date.now(), json],
      );
      touch();
    },
    getFirer(id) {
      const r = one('SELECT json, photo_file FROM firers WHERE id=?', [id]);
      return r ? { record: JSON.parse(r.json), photoFile: r.photo_file } : null;
    },
    deleteFirer(id) {
      const files = all('SELECT image_file a, closeup_file b FROM sessions WHERE firer_id=?', [id]).flatMap((r) => [r.a, r.b]);
      const f = one('SELECT photo_file FROM firers WHERE id=?', [id]);
      db.run('DELETE FROM sessions WHERE firer_id=?', [id]);
      db.run('DELETE FROM firers WHERE id=?', [id]);
      rmImages(...files, f?.photo_file);
      touch();
    },

    putSession(rec) {
      if (!isSafeId(rec?.id) || !isSafeId(rec?.firerId)) throw new Error('bad id');
      if (!one('SELECT 1 x FROM firers WHERE id=?', [rec.firerId])) throw new Error('unknown firer');
      const old = one('SELECT image_file, closeup_file FROM sessions WHERE id=?', [rec.id]);
      const image = writeImage('image', rec.id, rec.image, old?.image_file);
      const closeup = writeImage('closeup', rec.id, rec.closeUp, old?.closeup_file);
      const json = JSON.stringify(strip(rec, ['image', 'closeUp']));
      db.run(
        `INSERT INTO sessions(id,firer_id,weapon_serial,date,range_m,status,rounds,required_rounds,group_in,radial_cm,offset_x_cm,offset_y_cm,classification,firing_session_id,group_no,notes,image_file,closeup_file,created_at,json)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET firer_id=excluded.firer_id, weapon_serial=excluded.weapon_serial, date=excluded.date, range_m=excluded.range_m,
           status=excluded.status, rounds=excluded.rounds, required_rounds=excluded.required_rounds, group_in=excluded.group_in, radial_cm=excluded.radial_cm,
           offset_x_cm=excluded.offset_x_cm, offset_y_cm=excluded.offset_y_cm, classification=excluded.classification,
           firing_session_id=excluded.firing_session_id, group_no=excluded.group_no, notes=excluded.notes, image_file=excluded.image_file,
           closeup_file=excluded.closeup_file, created_at=excluded.created_at, json=excluded.json`,
        [rec.id, rec.firerId, str(rec.weaponSerial), str(rec.date), num(rec.rangeM), str(rec.status), Array.isArray(rec.shotsIn) ? rec.shotsIn.length : null, num(rec.requiredRounds),
         num(rec.groupIn), num(rec.radialCm), num(rec.offsetCm?.x), num(rec.offsetCm?.y), str(rec.classification), str(rec.sessionId), num(rec.groupNo), str(rec.notes), image, closeup, num(rec.createdAt) ?? Date.now(), json],
      );
      touch();
    },
    getSession(id) {
      const r = one('SELECT json, image_file, closeup_file FROM sessions WHERE id=?', [id]);
      return r ? { record: JSON.parse(r.json), imageFile: r.image_file, closeUpFile: r.closeup_file } : null;
    },
    deleteSession(id) {
      const r = one('SELECT image_file a, closeup_file b FROM sessions WHERE id=?', [id]);
      db.run('DELETE FROM sessions WHERE id=?', [id]);
      rmImages(r?.a, r?.b);
      touch();
    },

    index() {
      return {
        firers: all('SELECT id, updated_at AS updatedAt FROM firers'),
        sessions: all('SELECT id, created_at AS createdAt FROM sessions'),
      };
    },
    stats() {
      return {
        firers: one('SELECT COUNT(*) n FROM firers').n,
        sessions: one('SELECT COUNT(*) n FROM sessions').n,
        dbBytes: fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0,
      };
    },
    clearAll() {
      db.run('DELETE FROM sessions'); db.run('DELETE FROM firers');
      for (const f of fs.readdirSync(path.join(dataDir, 'images'))) rmImages(f);
      touch();
    },
    imageFile(name) {
      if (!/^(photo|image|closeup)-[A-Za-z0-9_-]{1,64}\.(jpg|png)$/.test(name)) return null;
      const p = imgPath(name);
      return fs.existsSync(p) ? p : null;
    },
    /** Copies rfa.db into backups/ (one per day; keeps the last 14). */
    dailyBackup(now = new Date()) {
      saveNow();
      if (!fs.existsSync(dbPath)) return null;
      const dir = path.join(dataDir, 'backups');
      const name = `rfa-${now.toISOString().slice(0, 10)}.db`;
      const target = path.join(dir, name);
      if (!fs.existsSync(target)) fs.copyFileSync(dbPath, target);
      const olds = fs.readdirSync(dir).filter((f) => /^rfa-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
      olds.slice(0, Math.max(0, olds.length - 14)).forEach((f) => fs.unlinkSync(path.join(dir, f)));
      return name;
    },
  };
  return api;
}
