import Dexie, { type EntityTable } from 'dexie';
import type { AxisCorrection, Vec2, ZeroStatus } from '../core/types';

/** One soldier. `serviceNo` is the personal number used to find them again. */
export interface FirerRecord {
  id: string;
  serviceNo: string;
  rank: string;
  name: string;
  unit: string;
  /** Sub-unit / company (Coy), e.g. "A Coy" */
  subunit?: string;
  leftHanded: boolean;
  photo?: Blob;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedShot extends Vec2 {
  source: 'auto' | 'manual' | 'live';
  confidence?: number;
}

/** One fired group (normally 5 rounds) with its result. */
export interface SessionRecord {
  id: string;
  firerId: string;
  weaponSerial: string;
  date: string; // yyyy-mm-dd
  rangeM: number;
  status: ZeroStatus;
  reasons: string[];
  groupIn: number | null;
  radialCm: number | null;
  mpiIn: Vec2 | null;
  offsetCm: Vec2 | null;
  correction: { lateral: AxisCorrection; vertical: AxisCorrection } | null;
  classification: string | null;
  diagnostics: { title: string; detail: string; advice?: string; error?: string; remedy?: string; ref?: string }[];
  shotsIn: SavedShot[];
  poaIn: Vec2;
  calibration: { method: 'auto' | 'manual' | 'points'; confidence: number; diameterIn: number };
  /** Firing session this group belongs to, and its number within the session. */
  sessionId?: string;
  groupNo?: number;
  requiredRounds: number;
  image?: Blob; // annotated target, JPEG
  closeUp?: Blob; // annotated close-up of the group, JPEG
  notes?: string;
  createdAt: number;
}

/** A change not yet copied to the local database file on the PC. */
export interface OutboxItem {
  seq?: number;
  op: 'putFirer' | 'putSession' | 'delFirer' | 'delSession' | 'clearAll';
  id: string;
}

export class RfaDatabase extends Dexie {
  firers!: EntityTable<FirerRecord, 'id'>;
  sessions!: EntityTable<SessionRecord, 'id'>;
  outbox!: EntityTable<OutboxItem, 'seq'>;
  constructor() {
    super('remote-firing-analyzer');
    this.version(1).stores({
      firers: 'id, serviceNo, name, updatedAt',
      sessions: 'id, firerId, weaponSerial, date, createdAt, status',
    });
    this.version(2).stores({ outbox: '++seq' });
  }
}

let instance: RfaDatabase | null = null;
/** Lazily opened so static pre-rendering never touches IndexedDB. */
export function db(): RfaDatabase {
  if (!instance) instance = new RfaDatabase();
  return instance;
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
