'use client';
import Link from 'next/link';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Camera, Cctv, ImagePlus, Play, Square } from 'lucide-react';
import { Button, Segmented, Select } from '@/components/ui';
import { StepCard } from './StepCard';
import { useAnalyzer } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { listCameras, type CameraDevice } from '@/services/camera';
import { hlsUrlOf, mtxState, type CamState } from '@/services/mediamtx';
import { CameraTestDialog } from '@/components/settings/CameraTestDialog';
import type { CctvCamera } from '@/state/settings';

type Tab = 'photo' | 'camera' | 'cctv';

const DOT: Record<CamState, string> = { online: 'bg-ok', connecting: 'bg-warn', missing: 'bg-muted', unreachable: 'bg-bad' };

export function SourcePanel() {
  const mode = useAnalyzer((s) => s.mode);
  const frame = useAnalyzer((s) => s.frame);
  const liveSource = useAnalyzer((s) => s.liveSource);
  const startLive = useAnalyzer((s) => s.startLive);
  const stopLive = useAnalyzer((s) => s.stopLive);
  const loadFile = useAnalyzer((s) => s.loadFile);
  const cctv = useSettings((s) => s.cctv);
  const [tab, setTab] = useState<Tab>('photo');
  const [cams, setCams] = useState<CameraDevice[]>([]);
  const [camId, setCamId] = useState('');
  const [cctvId, setCctvId] = useState('');
  const [states, setStates] = useState<Record<string, CamState>>({});
  const [testCam, setTestCam] = useState<CctvCamera | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const live = mode === 'live';

  useEffect(() => {
    if (tab !== 'camera') return;
    let ok = true;
    listCameras(true).then((c) => {
      if (!ok) return;
      setCams(c);
      setCamId((id) => id || c[0]?.deviceId || '');
    });
    return () => {
      ok = false;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== 'cctv') return;
    setCctvId((id) => id || cctv.cameras[0]?.id || '');
    let ok = true;
    const poll = async () => {
      const entries = await Promise.all(cctv.cameras.map(async (c) => [c.id, await mtxState(cctv.apiUrl, c)] as const));
      if (ok) setStates(Object.fromEntries(entries));
    };
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      ok = false;
      clearInterval(t);
    };
  }, [tab, cctv]);

  const selectedCam = cctv.cameras.find((c) => c.id === cctvId) ?? cctv.cameras[0];
  // Start live first checks the camera (and says what is wrong); when all is well the live view starts by itself.
  const startCctv = () => selectedCam && setTestCam(selectedCam);

  return (
    <StepCard n={1} title="Load picture" state={mode === 'empty' ? 'now' : 'done'}>
      <div className="flex flex-col gap-3">
        <Segmented<Tab>
          label="Picture source"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'photo', label: 'Photo', icon: <ImagePlus size={15} /> },
            { value: 'camera', label: 'Camera', icon: <Camera size={15} /> },
            { value: 'cctv', label: 'CCTV', icon: <Cctv size={15} /> },
          ]}
        />

        {tab === 'photo' && (
          <>
            <Button variant="primary" onClick={() => file.current?.click()} icon={<ImagePlus size={17} />}>
              Choose photo
            </Button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
                e.target.value = '';
              }}
            />
          </>
        )}

        {tab === 'camera' && (
          <>
            <Select aria-label="Camera" value={camId} onChange={(e) => setCamId(e.target.value)} disabled={!cams.length}>
              {cams.length ? cams.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label}</option>) : <option>No camera found</option>}
            </Select>
            {live ? (
              <Button onClick={stopLive} icon={<Square size={14} />}>
                Stop
              </Button>
            ) : (
              <Button variant="primary" icon={<Play size={16} />} disabled={!cams.length} onClick={() => startLive({ kind: 'camera', deviceId: camId || undefined, label: cams.find((c) => c.deviceId === camId)?.label ?? 'Camera' })}>
                Start live
              </Button>
            )}
          </>
        )}

        {tab === 'cctv' &&
          (cctv.cameras.length === 0 ? (
            <Link href="/settings/#cctv" className="rounded-md border border-dashed border-rule px-3 py-3 text-center text-sm text-aim hover:bg-sunk">
              Add a CCTV camera in Settings
            </Link>
          ) : (
            <>
              <ul className="flex flex-col gap-1" role="radiogroup" aria-label="CCTV camera">
                {cctv.cameras.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={cctvId === c.id}
                      onClick={() => setCctvId(c.id)}
                      className={clsx('flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm', cctvId === c.id ? 'border-olive bg-olive-soft' : 'border-rule hover:bg-sunk')}
                    >
                      <span className={clsx('h-2.5 w-2.5 rounded-full', DOT[states[c.id] ?? 'missing'])} title={states[c.id] ?? 'unknown'} />
                      <span className="flex-1 truncate font-medium">{c.name}</span>
                      <span className="text-xs text-muted">{c.brand === 'hls' ? 'HLS' : c.ip}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {live ? (
                <Button onClick={stopLive} icon={<Square size={14} />}>
                  Stop
                </Button>
              ) : (
                <Button variant="primary" icon={<Play size={16} />} onClick={startCctv}>
                  Start live
                </Button>
              )}
            </>
          ))}
        {mode !== 'empty' && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-ok">
            <span aria-hidden>✓</span>
            {mode === 'live' ? `Live: ${liveSource?.label ?? 'camera'}` : `Loaded: ${frame?.source === 'upload' ? 'photo' : 'captured frame'} ${frame?.width}×${frame?.height}`}
          </p>
        )}
      </div>
      <CameraTestDialog
        camera={testCam}
        onClose={() => setTestCam(null)}
        onPass={() => {
          if (!testCam) return;
          const cam = testCam;
          setTestCam(null);
          startLive({ kind: 'stream', url: hlsUrlOf(cctv, cam), label: cam.name, cameraId: cam.id });
        }}
      />
    </StepCard>
  );
}
