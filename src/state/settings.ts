'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_RULES } from '../core/rules';
import type { Rules } from '../core/types';
import type { Unit } from '../lib/format';

export type CameraBrand = 'hikvision' | 'dahua' | 'custom' | 'hls';

export interface CctvCamera {
  id: string;
  name: string;
  brand: CameraBrand;
  ip: string;
  port: number;
  username: string;
  password: string;
  channel: number;
  substream: boolean;
  /** RTSP path for 'custom' brand, e.g. /stream1 */
  path: string;
  /** Full HLS address for 'hls' (no MediaMTX registration) */
  url: string;
  /** Path name inside MediaMTX */
  pathName: string;
}

export interface CctvSettings {
  /** MediaMTX Control API, e.g. http://localhost:9997 */
  apiUrl: string;
  /** MediaMTX HLS server, e.g. http://localhost:8888 */
  hlsUrl: string;
  cameras: CctvCamera[];
}

export interface Settings {
  rules: Rules;
  calibreMm: number;
  /** 0 strict .. 1 sensitive */
  sensitivity: number;
  minConfidence: number;
  /** Freeze the live view by itself once all rounds are found and steady. */
  autoCapture: boolean;
  defaultRangeM: number;
  cctv: CctvSettings;
  theme: 'system' | 'light' | 'dark';
  /** Length unit for results on screen (the rules stay in inches and cm). */
  unit: Unit;
}

export const DEFAULT_SETTINGS: Settings = {
  rules: DEFAULT_RULES,
  calibreMm: 7.62,
  sensitivity: 0.5,
  minConfidence: 0.35,
  autoCapture: true,
  defaultRangeM: 100,
  cctv: { apiUrl: 'http://localhost:9997', hlsUrl: 'http://localhost:8888', cameras: [] },
  theme: 'system',
  unit: 'in',
};

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
  updateRules: (patch: Partial<Rules>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      updateRules: (patch) => set((s) => ({ rules: { ...s.rules, ...patch } })),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'rfa-settings',
      version: 2,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings> & { streams?: { id: string; name: string; url: string }[] };
        let cctv = p.cctv ?? current.cctv;
        // version 1 stored plain HLS lanes: keep them as direct HLS cameras
        if (!p.cctv && p.streams?.length)
          cctv = {
            ...cctv,
            cameras: p.streams.map((x) => ({ id: x.id, name: x.name, brand: 'hls' as const, ip: '', port: 554, username: '', password: '', channel: 1, substream: false, path: '', url: x.url, pathName: x.id })),
          };
        const { streams: _old, ...rest } = p;
        void _old;
        return { ...current, ...rest, cctv, rules: { ...DEFAULT_RULES, ...(p.rules ?? {}) } };
      },
    },
  ),
);

/** Settings snapshot for non-React code. */
export const settings = () => useSettings.getState();
export const holeDiameterIn = (s: Settings = settings()) => s.calibreMm / 25.4;
