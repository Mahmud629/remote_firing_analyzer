'use client';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Dialog, Field, Input, Segmented, Select } from '@/components/ui';
import type { CctvCamera } from '@/state/settings';
import { BRANDS, maskedRtsp, pathNameFor } from '@/services/mediamtx';

const blank = (): CctvCamera => {
  const id = Math.random().toString(36).slice(2, 7);
  return { id, name: '', brand: 'hikvision', ip: '', port: 554, username: 'admin', password: '', channel: 1, substream: false, path: '/stream1', url: '', pathName: '' };
};

export function CameraDialog({ open, camera, onClose, onSave }: { open: boolean; camera: CctvCamera | null; onClose: () => void; onSave: (c: CctvCamera) => void }) {
  const [c, setC] = useState<CctvCamera>(blank);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (open) setC(camera ?? blank());
  }, [open, camera]);
  const set = <K extends keyof CctvCamera>(k: K, v: CctvCamera[K]) => setC((x) => ({ ...x, [k]: v }));
  const hls = c.brand === 'hls';
  const valid = c.name.trim() && (hls ? c.url.trim() : c.ip.trim());

  return (
    <Dialog open={open} onClose={onClose} title={camera ? 'Edit camera' : 'Add camera'}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({ ...c, name: c.name.trim(), pathName: c.pathName || pathNameFor(c.name, c.id) });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={c.name} onChange={(e) => set('name', e.target.value)} placeholder="Lane 1" autoFocus required />
          </Field>
          <Field label="Brand">
            <Select value={c.brand} onChange={(e) => set('brand', e.target.value as CctvCamera['brand'])}>
              {BRANDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {hls ? (
          <Field label="HLS address">
            <Input value={c.url} onChange={(e) => set('url', e.target.value)} placeholder="http://server:8888/cam1/index.m3u8" required />
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <Field label="IP address">
                <Input value={c.ip} onChange={(e) => set('ip', e.target.value)} placeholder="192.168.1.64" inputMode="decimal" required />
              </Field>
              <Field label="RTSP port">
                <Input type="number" value={c.port} onChange={(e) => set('port', Number(e.target.value) || 554)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username">
                <Input value={c.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
              </Field>
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="cam-password" className="text-muted">
                  Password
                </label>
                <div className="relative">
                  <Input id="cam-password" type={show ? 'text' : 'password'} value={c.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" className="pr-9" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            {c.brand === 'custom' ? (
              <Field label="RTSP path">
                <Input value={c.path} onChange={(e) => set('path', e.target.value)} placeholder="/stream1" />
              </Field>
            ) : (
              <div className="grid grid-cols-[96px_1fr] items-end gap-3">
                <Field label="Channel">
                  <Input type="number" min={1} value={c.channel} onChange={(e) => set('channel', Math.max(1, Number(e.target.value) || 1))} />
                </Field>
                <Segmented
                  label="Stream"
                  value={c.substream ? 'sub' : 'main'}
                  onChange={(v) => set('substream', v === 'sub')}
                  options={[
                    { value: 'main', label: 'Main stream' },
                    { value: 'sub', label: 'Sub stream' },
                  ]}
                />
              </div>
            )}
            <p className="break-all rounded-md bg-sunk px-3 py-2 font-mono text-xs text-muted">{maskedRtsp(c)}</p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            Save and connect
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
