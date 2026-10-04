import type { CctvCamera, CctvSettings } from '../state/settings';

/**
 * MediaMTX integration. The browser cannot play RTSP, so MediaMTX pulls each
 * camera's RTSP stream and re-serves it as HLS. Cameras are registered through
 * the MediaMTX Control API (api: yes), so nobody has to edit mediamtx.yml by hand.
 * Paths added through the API last until MediaMTX restarts; the app re-registers
 * a camera whenever it starts its live view, and can also export a mediamtx.yml.
 */

export const BRANDS: { value: CctvCamera['brand']; label: string }[] = [
  { value: 'hikvision', label: 'Hikvision' },
  { value: 'dahua', label: 'Dahua / CP Plus' },
  { value: 'custom', label: 'Other (RTSP path)' },
  { value: 'hls', label: 'Direct HLS link' },
];

export function rtspUrl(c: CctvCamera): string {
  const auth = c.username ? `${encodeURIComponent(c.username)}:${encodeURIComponent(c.password)}@` : '';
  const host = `${c.ip.trim()}:${c.port || 554}`;
  switch (c.brand) {
    case 'hikvision':
      return `rtsp://${auth}${host}/Streaming/Channels/${c.channel || 1}${c.substream ? '02' : '01'}`;
    case 'dahua':
      return `rtsp://${auth}${host}/cam/realmonitor?channel=${c.channel || 1}&subtype=${c.substream ? 1 : 0}`;
    default: {
      const p = c.path.trim() || '/';
      return `rtsp://${auth}${host}${p.startsWith('/') ? p : `/${p}`}`;
    }
  }
}

/** RTSP address with the password hidden, for display. */
export const maskedRtsp = (c: CctvCamera) => rtspUrl(c).replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:••••@');

const trim = (u: string) => u.trim().replace(/\/+$/, '');

export function hlsUrlOf(cctv: CctvSettings, c: CctvCamera) {
  return c.brand === 'hls' ? c.url.trim() : `${trim(cctv.hlsUrl)}/${c.pathName}/index.m3u8`;
}

export function pathNameFor(name: string, id: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return `rfa-${slug || id}`;
}

export class MtxError extends Error {}

async function call(api: string, method: string, path: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${trim(api)}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new MtxError(`MediaMTX is not running (nothing answers at ${trim(api)}). Double-click start-mediamtx.bat in the mediamtx folder and keep that window open.`);
  }
  return res;
}

async function errorText(res: Response) {
  try {
    const j = await res.json();
    return j?.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

/** Checks the Control API answers. */
export async function mtxPing(api: string): Promise<void> {
  const res = await call(api, 'GET', '/v3/config/paths/list?itemsPerPage=1');
  if (res.status === 401 || res.status === 403) throw new MtxError('MediaMTX refused the API request. Allow the "api" action for this computer in authInternalUsers.');
  if (!res.ok) throw new MtxError(`MediaMTX answered ${res.status}: ${await errorText(res)}`);
}

/** Adds the camera to MediaMTX, or updates it if it already exists. */
export async function mtxConnect(api: string, c: CctvCamera): Promise<void> {
  if (c.brand === 'hls') return;
  if (!c.ip.trim()) throw new MtxError(`Enter the IP address of ${c.name}.`);
  const conf: Record<string, unknown> = { source: rtspUrl(c), sourceOnDemand: false, rtspTransport: 'tcp' };
  const exists = (await call(api, 'GET', `/v3/config/paths/get/${c.pathName}`)).ok;
  const send = (body: Record<string, unknown>) =>
    exists ? call(api, 'PATCH', `/v3/config/paths/patch/${c.pathName}`, body) : call(api, 'POST', `/v3/config/paths/add/${c.pathName}`, body);
  let res = await send(conf);
  if (res.status === 400) {
    // older MediaMTX releases do not know rtspTransport
    const { rtspTransport: _t, ...rest } = conf;
    void _t;
    res = await send(rest);
  }
  if (!res.ok) throw new MtxError(`MediaMTX could not add ${c.name}: ${await errorText(res)}`);
}

export async function mtxRemove(api: string, pathName: string): Promise<void> {
  const res = await call(api, 'DELETE', `/v3/config/paths/delete/${pathName}`);
  if (!res.ok && res.status !== 404) throw new MtxError(`MediaMTX could not remove the camera: ${await errorText(res)}`);
}

export type CamState = 'online' | 'connecting' | 'missing' | 'unreachable';

/** online: picture arriving. connecting: registered, no picture yet (wrong IP/password?). */
export async function mtxState(api: string, c: CctvCamera): Promise<CamState> {
  if (c.brand === 'hls') return 'online';
  try {
    const res = await call(api, 'GET', `/v3/paths/get/${c.pathName}`);
    if (res.status === 404) return 'missing';
    if (!res.ok) return 'unreachable';
    const j = await res.json();
    return j?.ready ? 'online' : 'connecting';
  } catch {
    return 'unreachable';
  }
}

/** A complete mediamtx.yml with every camera written in (for a permanent setup). */
export function mediamtxYaml(cctv: CctvSettings): string {
  const api = new URL(trim(cctv.apiUrl) || 'http://localhost:9997');
  const hls = new URL(trim(cctv.hlsUrl) || 'http://localhost:8888');
  const cams = cctv.cameras.filter((c) => c.brand !== 'hls');
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  return `# MediaMTX configuration for Remote Firing Analyzer
# Generated ${new Date().toISOString()}. Contains camera passwords: keep this file private.
logLevel: info

# Control API: lets the app add and check cameras
api: yes
apiAddress: :${api.port || 9997}
apiAllowOrigins: ['*']

# HLS: the browser plays cameras from here
hls: yes
hlsAlwaysRemux: yes
hlsAddress: :${hls.port || 8888}
hlsAllowOrigins: ['*']
hlsVariant: fmp4
hlsSegmentDuration: 1s

# RTSP/WebRTC/SRT/RTMP are not needed by the app
rtsp: yes
moq: no
webrtc: no
srt: no
rtmp: no

authInternalUsers:
  - user: any
    pass:
    ips: []
    permissions:
      - action: read
      - action: playback
  - user: any
    pass:
    ips: ['127.0.0.1', '::1']
    permissions:
      - action: api
      - action: publish

paths:
${cams.length ? cams.map((c) => `  ${c.pathName}:\n    # ${c.name}\n    source: ${q(rtspUrl(c))}\n    rtspTransport: tcp\n    sourceOnDemand: no`).join('\n') : '  # cameras added from the app are registered at runtime'}
  all_others:
`;
}


/* -------------------------------------------------------------------------- */
/* Camera check: finds out WHY a camera does not play and says what to change  */
/* -------------------------------------------------------------------------- */

export type CheckState = 'run' | 'ok' | 'warn' | 'fail';
export interface CheckStep {
  id: string;
  title: string;
  state: CheckState;
  detail?: string;
  fix?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const FIX_CODEC =
  'Set the camera video encoding to H.264 and switch off Smart Codec / H.264+ / H.265+. Dahua: camera web page > Setup > Camera > Video. Hikvision: Configuration > Video/Audio.';
export const FIX_GOP = 'Set the camera I Frame Interval to 25 to 50 (one to two seconds) in the same video settings.';
const VIDEO_CODECS = ['H264', 'H265', 'VP8', 'VP9', 'AV1', 'M-JPEG', 'MPEG-4 Video', 'MPEG-1/2 Video'];
const CODEC_NAME: Record<string, string> = { H264: 'H.264', H265: 'H.265 (HEVC)', 'M-JPEG': 'MJPEG', VP8: 'VP8', VP9: 'VP9', AV1: 'AV1' };

export interface TrackSummary {
  video?: { codec: string; width?: number; height?: number };
  audio?: string;
  all: string[];
}

/** What MediaMTX is receiving from the camera (video and audio formats). */
export async function mtxTracks(api: string, pathName: string): Promise<TrackSummary | null> {
  try {
    const res = await call(api, 'GET', `/v3/paths/get/${pathName}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { tracks?: string[]; tracks2?: { codec: string; codecProps?: { width?: number; height?: number } }[] };
    const t2 = j.tracks2 ?? [];
    const names = j.tracks ?? t2.map((t) => t.codec);
    const v2 = t2.find((t) => VIDEO_CODECS.includes(t.codec));
    const vName = v2?.codec ?? names.find((n) => VIDEO_CODECS.includes(n));
    return {
      video: vName ? { codec: vName, width: v2?.codecProps?.width, height: v2?.codecProps?.height } : undefined,
      audio: names.find((n) => !VIDEO_CODECS.includes(n)),
      all: names,
    };
  } catch {
    return null;
  }
}

/** Can this browser decode the format? (null = cannot tell) */
export function canBrowserPlay(codec: string): boolean | null {
  if (typeof MediaSource === 'undefined') return null;
  const types: Record<string, string> = {
    H264: 'video/mp4; codecs="avc1.42E01E"',
    H265: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
    VP9: 'video/mp4; codecs="vp09.00.10.08"',
    AV1: 'video/mp4; codecs="av01.0.05M.08"',
    VP8: 'video/webm; codecs="vp8"',
  };
  return types[codec] ? MediaSource.isTypeSupported(types[codec]) : false;
}

/** Runs the checks one by one; `onUpdate` receives the list as it grows. */
export async function diagnoseCamera(cctv: CctvSettings, c: CctvCamera, onUpdate?: (steps: CheckStep[]) => void): Promise<CheckStep[]> {
  const steps: CheckStep[] = [];
  const push = (st: CheckStep) => {
    steps.push(st);
    onUpdate?.([...steps]);
    return st;
  };
  const set = (st: CheckStep, patch: Partial<CheckStep>) => {
    Object.assign(st, patch);
    onUpdate?.([...steps]);
  };
  const api = cctv.apiUrl;
  let video: TrackSummary['video'];

  if (c.brand !== 'hls') {
    const s1 = push({ id: 'server', title: 'MediaMTX is running', state: 'run' });
    try {
      await mtxPing(api);
      set(s1, { state: 'ok' });
    } catch {
      set(s1, { state: 'fail', detail: `Nothing answers at ${trim(api)}.`, fix: 'Double-click start-mediamtx.bat in the mediamtx folder and keep the black window open.' });
      return steps;
    }

    const s2 = push({ id: 'camera', title: 'Camera picture reaches MediaMTX', state: 'run' });
    try {
      let st = await mtxState(api, c);
      if (st === 'missing') {
        await mtxConnect(api, c);
        st = 'connecting';
      }
      for (let i = 0; i < 24 && st !== 'online'; i++) {
        await sleep(500);
        st = await mtxState(api, c);
      }
      if (st === 'online') set(s2, { state: 'ok', detail: `${c.ip}:${c.port}` });
      else
        set(s2, {
          state: 'fail',
          detail: `MediaMTX cannot get a picture from ${c.ip}:${c.port}.`,
          fix: `Check the IP address, username, password and channel. Open http://${c.ip} in a browser on this computer: if the camera page opens, the camera is reachable and the username or password is probably wrong.`,
        });
    } catch (e) {
      set(s2, { state: 'fail', detail: e instanceof Error ? e.message : String(e) });
    }
    if (s2.state !== 'ok') return steps;

    const tracks = await mtxTracks(api, c.pathName);
    video = tracks?.video;
    const s3 = push({ id: 'format', title: 'Video format', state: 'run' });
    if (!video) set(s3, { state: 'fail', detail: 'The camera sends no video track.', fix: FIX_CODEC });
    else {
      const name = CODEC_NAME[video.codec] ?? video.codec;
      const size = video.width && video.height ? `, ${video.width}×${video.height}` : '';
      if (!['H264', 'H265', 'VP9', 'AV1', 'VP8'].includes(video.codec)) {
        set(s3, { state: 'fail', detail: `The camera sends ${name}, which browsers cannot play.`, fix: FIX_CODEC });
      } else if (video.codec === 'H265') {
        set(s3, { state: 'warn', detail: `${name}${size}. Only browsers with H.265 support can play it, and many cannot.`, fix: FIX_CODEC });
      } else set(s3, { state: 'ok', detail: `${name}${size}` });
      if (video.width && video.width < 1000) {
        push({
          id: 'size',
          title: 'Picture size',
          state: 'warn',
          detail: `${video.width}×${video.height} is small, so bullet holes may be too small to detect.`,
          fix: 'Use the camera main stream (not the sub stream) and fill the picture with the target.',
        });
      }
    }
    if (steps.some((x) => x.state === 'fail')) return steps;
  }

  const s4 = push({ id: 'playlist', title: 'Video reaches the browser', state: 'run' });
  const url = hlsUrlOf(cctv, c);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    const secs = (performance.now() - t0) / 1000;
    if (res.ok) {
      if (secs > 8) set(s4, { state: 'warn', detail: `Ready only after ${secs.toFixed(0)} s: the camera sends a keyframe every few seconds, so starting is slow.`, fix: FIX_GOP });
      else set(s4, { state: 'ok', detail: `Ready in ${secs.toFixed(1)} s` });
    } else {
      const body = await res.text().catch(() => '');
      let msg = body.slice(0, 120);
      try {
        msg = (JSON.parse(body) as { error?: string }).error ?? msg;
      } catch {
        /* plain text */
      }
      set(s4, { state: 'fail', detail: `MediaMTX answered HTTP ${res.status}${msg ? `: ${msg}` : ''}.`, fix: res.status >= 500 ? FIX_CODEC : 'Press Connect next to the camera in Settings and try again.' });
    }
  } catch {
    if (ctrl.signal.aborted) set(s4, { state: 'fail', detail: 'No video after 45 seconds: the camera did not send a keyframe.', fix: FIX_GOP });
    else
      set(s4, {
        state: 'fail',
        detail: `The browser could not reach ${url}.`,
        fix: 'Check that no other program uses port 8888 (Jupyter does), and that no browser extension, VPN or firewall blocks localhost.',
      });
  } finally {
    clearTimeout(timer);
  }

  if (s4.state !== 'fail' && video) {
    const ok = canBrowserPlay(video.codec);
    const name = CODEC_NAME[video.codec] ?? video.codec;
    push(
      ok === false
        ? { id: 'browser', title: 'This browser can play it', state: 'fail', detail: `This browser cannot decode ${name}.`, fix: FIX_CODEC }
        : { id: 'browser', title: 'This browser can play it', state: 'ok' },
    );
  }
  return steps;
}
