'use client';
import { create } from 'zustand';
import type { Calibration, Shot, Vec2, ZeroStatus } from '../core/types';
import type { LockPhase } from '../vision/tracker';
import { vision } from '../services/vision';
import { pxPerInch, toImage } from '../core/calibration';
import { holeDiameterIn, settings } from './settings';
import { notify } from './toast';
import { today } from '../lib/format';
import { newId } from '../services/db';

export interface Frame {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  source: 'upload' | 'camera' | 'stream';
}

export type Tool = 'move' | 'add' | 'aim' | 'ring' | 'measure';
export type Mode = 'empty' | 'live' | 'review';
export type LiveSource = { kind: 'camera'; deviceId?: string; label: string } | { kind: 'stream'; url: string; label: string; cameraId?: string };

export interface LiveHole {
  id: string;
  p: Vec2;
  seq?: number;
  confirmed: boolean;
  previous: boolean;
  merged: boolean;
}

export interface LiveView {
  phase: LockPhase;
  progress: number;
  calibration: Calibration | null;
  holes: LiveHole[];
  width: number;
  height: number;
  ms: number;
  lowResolution: boolean;
  error?: string;
  captureIn?: number;
  learning?: boolean;
}

export interface SessionMeta {
  firerId: string | null;
  weaponSerial: string;
  rangeM: number;
  date: string;
  notes: string;
}

/** A finished group kept on screen (see-through) while the firer fires again. */
export interface OverlayGroup {
  no: number;
  recordId: string;
  shotsIn: Vec2[];
  poaIn: Vec2;
  color: string;
  visible: boolean;
  groupIn: number | null;
  status: ZeroStatus;
}

export interface FiringSession {
  id: string;
  firerId: string;
  groups: OverlayGroup[];
}

export const GROUP_COLORS = ['#ff4fd8', '#3ddc84', '#4ab4ff', '#ff9f43', '#b388ff', '#ff6b6b'];

interface Snapshot {
  shots: Shot[];
  poa: Vec2 | null;
  calibration: Calibration | null;
}

interface AnalyzerState {
  mode: Mode;
  frame: Frame | null;
  calibration: Calibration | null;
  shots: Shot[];
  poa: Vec2 | null;
  tool: Tool;
  selectedId: string | null;
  history: Snapshot[];
  busy: string | null;
  live: LiveView | null;
  liveSource: LiveSource | null;
  meta: SessionMeta;
  savedId: string | null;
  session: FiringSession | null;
  showOverlay: boolean;
  /** Two-point calibration in progress (image px). */
  measure: Vec2[];

  setTool: (t: Tool) => void;
  select: (id: string | null) => void;
  setMeta: (p: Partial<SessionMeta>) => void;
  loadFile: (file: File) => Promise<void>;
  setFrame: (blob: Blob, width: number, height: number, source: Frame['source']) => Promise<void>;
  fromLive: (blob: Blob, width: number, height: number, cal: Calibration, shots: Shot[], source: Frame['source']) => void;
  detectAll: () => Promise<void>;
  redetectHoles: () => Promise<void>;
  setCalibration: (c: Calibration) => void;
  addMeasurePoint: (p: Vec2) => void;
  applyMeasure: (distanceIn: number) => void;
  cancelMeasure: () => void;
  addShot: (p: Vec2) => void;
  moveShot: (id: string, p: Vec2) => void;
  removeShot: (id: string) => void;
  clearShots: () => void;
  setPoa: (p: Vec2) => void;
  beginEdit: () => void;
  undo: () => void;
  groupSaved: (g: Omit<OverlayGroup, 'no' | 'color' | 'visible'>, sessionId: string) => void;
  nextGroup: () => void;
  endSession: () => void;
  toggleGroup: (no: number) => void;
  toggleOverlay: () => void;
  setLive: (v: LiveView | null) => void;
  startLive: (src: LiveSource) => void;
  stopLive: () => void;
  clear: () => void;
}

let shotSeq = 0;
const sid = () => `s${Date.now().toString(36)}${(shotSeq++).toString(36)}`;

function measureImage(blob: Blob): Promise<{ width: number; height: number }> {
  return createImageBitmap(blob).then((b) => {
    const r = { width: b.width, height: b.height };
    b.close();
    return r;
  });
}

export const useAnalyzer = create<AnalyzerState>()((set, get) => {
  const snapshot = (): Snapshot => {
    const s = get();
    return { shots: s.shots, poa: s.poa, calibration: s.calibration };
  };
  const commit = (patch: Partial<AnalyzerState>) => set((s) => ({ history: [...s.history.slice(-49), snapshot()], savedId: null, ...patch }));

  const visionOpts = () => {
    const st = settings();
    return { diameterIn: st.rules.targetDiameterIn, holeDiameterIn: holeDiameterIn(st), sensitivity: st.sensitivity, minConfidence: st.minConfidence };
  };

  /** Holes that belong to earlier groups of this session are not counted again. */
  const withoutEarlierGroups = (cal: Calibration, holes: { p: Vec2 }[]) => {
    const groups = get().session?.groups ?? [];
    if (!groups.length) return { kept: holes, dropped: 0 };
    const tol = Math.max(5, pxPerInch(cal) * (holeDiameterIn() * 0.8 + 0.15));
    const old = groups.flatMap((g) => g.shotsIn.map((p) => toImage(cal, p)));
    const kept = holes.filter((h) => !old.some((o) => Math.hypot(o.x - h.p.x, o.y - h.p.y) < tol));
    return { kept, dropped: holes.length - kept.length };
  };

  return {
    mode: 'empty',
    frame: null,
    calibration: null,
    shots: [],
    poa: null,
    tool: 'move',
    selectedId: null,
    history: [],
    busy: null,
    live: null,
    liveSource: null,
    meta: { firerId: null, weaponSerial: '', rangeM: 100, date: today(), notes: '' },
    savedId: null,
    session: null,
    showOverlay: true,
    measure: [],

    setTool: (tool) => set({ tool, measure: [] }),
    select: (selectedId) => set({ selectedId }),
    setMeta: (p) => set((s) => ({ meta: { ...s.meta, ...p } })),

    loadFile: async (file) => {
      if (!file.type.startsWith('image/')) {
        notify('error', 'Not a picture', `${file.name} is not an image file.`);
        return;
      }
      try {
        const { width, height } = await measureImage(file);
        await get().setFrame(file, width, height, 'upload');
      } catch {
        notify('error', 'Could not open the photo', file.name);
      }
    },

    setFrame: async (blob, width, height, source) => {
      const old = get().frame;
      if (old) URL.revokeObjectURL(old.url);
      set({
        mode: 'review',
        frame: { url: URL.createObjectURL(blob), blob, width, height, source },
        calibration: null,
        shots: [],
        poa: null,
        history: [],
        selectedId: null,
        live: null,
        savedId: null,
        tool: 'move',
        measure: [],
      });
      await get().detectAll();
    },

    fromLive: (blob, width, height, cal, shots, source) => {
      const old = get().frame;
      if (old) URL.revokeObjectURL(old.url);
      set({
        mode: 'review',
        frame: { url: URL.createObjectURL(blob), blob, width, height, source },
        calibration: cal,
        shots,
        poa: cal.center,
        history: [],
        selectedId: null,
        live: null,
        savedId: null,
        tool: 'move',
        measure: [],
      });
      notify('ok', 'Frame captured', `${shots.length} ${shots.length === 1 ? 'hit' : 'hits'} marked. Check and save.`);
    },

    detectAll: async () => {
      const f = get().frame;
      if (!f) return;
      set({ busy: 'Analysing' });
      try {
        const res = await vision.run(f.blob, { findRing: true, findHoles: true, ...visionOpts() });
        if (get().frame !== f) return;
        if (res.error) throw new Error(res.error);
        if (!res.ring) {
          const r = Math.min(f.width, f.height) * 0.42;
          set({
            calibration: { center: { x: f.width / 2, y: f.height / 2 }, radiusX: r, radiusY: r, diameterIn: settings().rules.targetDiameterIn, method: 'manual', confidence: 0 },
            poa: { x: f.width / 2, y: f.height / 2 },
            tool: 'ring',
          });
          notify('warn', 'Ring not found', 'Drag the blue ring onto the outer circle, or use Two points to calibrate.');
          return;
        }
        const { kept, dropped } = withoutEarlierGroups(res.ring, res.holes ?? []);
        const shots: Shot[] = (kept as NonNullable<typeof res.holes>).map((h) => ({ id: sid(), p: h.p, source: 'auto', confidence: h.confidence, merged: h.merged }));
        set({ calibration: res.ring, poa: res.ring.center, shots });
        notify('ok', 'Calibration done', 'Outer ring found automatically.');
        const req = settings().rules.requiredRounds;
        const doubt = shots.filter((s) => s.merged).length;
        notify(
          shots.length === req && !doubt ? 'ok' : 'warn',
          'Bullet marks done',
          `${shots.length} of ${req} found${dropped ? `, ${dropped} from earlier groups ignored` : ''}${doubt ? `. Check ${doubt} orange ${doubt === 1 ? 'mark' : 'marks'}` : ''}.`,
        );
        if (res.lowResolution) notify('warn', 'Target is small in the picture', 'Move closer or zoom in for reliable holes.');
      } catch (err) {
        notify('error', 'Detection failed', err instanceof Error ? err.message : String(err));
      } finally {
        set({ busy: null });
      }
    },

    redetectHoles: async () => {
      const { frame: f, calibration } = get();
      if (!f || !calibration) return;
      set({ busy: 'Finding holes' });
      try {
        const res = await vision.run(f.blob, { findRing: false, findHoles: true, calibration, ...visionOpts() });
        const { kept } = withoutEarlierGroups(calibration, res.holes ?? []);
        const auto: Shot[] = (kept as NonNullable<typeof res.holes>).map((h) => ({ id: sid(), p: h.p, source: 'auto', confidence: h.confidence, merged: h.merged }));
        const manual = get().shots.filter((s) => s.source === 'manual');
        const tol = Math.max(4, pxPerInch(calibration) * holeDiameterIn());
        const fresh = auto.filter((a) => !manual.some((m) => Math.hypot(m.p.x - a.p.x, m.p.y - a.p.y) < tol));
        commit({ shots: [...manual, ...fresh] });
        notify('ok', 'Bullet marks done', `${manual.length + fresh.length} marked.`);
      } finally {
        set({ busy: null });
      }
    },

    setCalibration: (c) => {
      const s = get();
      const poaWasCentre = !s.poa || !s.calibration || Math.hypot(s.poa.x - s.calibration.center.x, s.poa.y - s.calibration.center.y) < 1;
      commit({ calibration: c, poa: poaWasCentre ? c.center : s.poa });
    },

    addMeasurePoint: (p) => set((s) => ({ measure: s.measure.length >= 2 ? [p] : [...s.measure, p] })),
    cancelMeasure: () => set({ measure: [] }),
    applyMeasure: (distanceIn) => {
      const s = get();
      const [a, b] = s.measure;
      const f = s.frame;
      if (!a || !b || !f || !(distanceIn > 0)) return;
      const ppi = Math.hypot(b.x - a.x, b.y - a.y) / distanceIn;
      const diameterIn = settings().rules.targetDiameterIn;
      const hadRing = !!s.calibration && s.calibration.confidence > 0;
      const center = hadRing ? s.calibration!.center : { x: f.width / 2, y: f.height / 2 };
      const cal: Calibration = { center, radiusX: (ppi * diameterIn) / 2, radiusY: (ppi * diameterIn) / 2, diameterIn, method: 'points', confidence: 1 };
      commit({ calibration: cal, poa: hadRing ? (s.poa ?? center) : center, measure: [], tool: hadRing ? 'move' : 'aim' });
      notify('ok', 'Calibration done', `Two points: 1 in = ${ppi.toFixed(1)} px.${hadRing ? '' : ' Now click the aiming point.'}`);
    },

    addShot: (p) => {
      const id = sid();
      commit({ shots: [...get().shots, { id, p, source: 'manual' }], selectedId: id });
    },
    moveShot: (id, p) => set((s) => ({ shots: s.shots.map((x) => (x.id === id ? { ...x, p, source: 'manual', merged: false } : x)), savedId: null })),
    removeShot: (id) => commit({ shots: get().shots.filter((s) => s.id !== id), selectedId: null }),
    clearShots: () => commit({ shots: [], selectedId: null }),
    setPoa: (p) => commit({ poa: p }),
    beginEdit: () => set((s) => ({ history: [...s.history.slice(-49), snapshot()] })),
    undo: () => {
      const h = get().history;
      if (!h.length) return;
      set({ ...h[h.length - 1], history: h.slice(0, -1), savedId: null });
    },

    groupSaved: (g, sessionId) => {
      const s = get();
      const firerId = s.meta.firerId!;
      const session: FiringSession = s.session && s.session.id === sessionId ? s.session : { id: sessionId, firerId, groups: [] };
      const no = session.groups.length + 1;
      const group: OverlayGroup = { ...g, no, color: GROUP_COLORS[(no - 1) % GROUP_COLORS.length], visible: true };
      set({ session: { ...session, groups: [...session.groups, group] }, savedId: g.recordId });
    },
    nextGroup: () => {
      set({ shots: [], history: [], savedId: null, selectedId: null, showOverlay: true });
      const n = (get().session?.groups.length ?? 0) + 1;
      notify('info', `Group ${n}`, 'Earlier groups are shown see-through and will not be counted again.');
    },
    endSession: () => {
      set({ session: null, savedId: null });
      notify('ok', 'Session ended');
    },
    toggleGroup: (no) =>
      set((s) => (s.session ? { session: { ...s.session, groups: s.session.groups.map((g) => (g.no === no ? { ...g, visible: !g.visible } : g)) } } : {})),
    toggleOverlay: () => set((s) => ({ showOverlay: !s.showOverlay })),

    setLive: (live) => set({ live }),
    startLive: (liveSource) => set({ mode: 'live', liveSource, live: null, selectedId: null, busy: null, measure: [] }),
    stopLive: () => set((s) => ({ mode: s.frame ? 'review' : 'empty', live: null })),
    clear: () => {
      const old = get().frame;
      if (old) URL.revokeObjectURL(old.url);
      set({ mode: 'empty', frame: null, calibration: null, shots: [], poa: null, history: [], live: null, savedId: null, selectedId: null, measure: [] });
    },
  };
});

export const newSessionId = () => newId();
