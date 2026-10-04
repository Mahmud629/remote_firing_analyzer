'use client';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { pxPerInch, toImage } from '@/core/calibration';
import type { Calibration, Vec2 } from '@/core/types';
import { useAnalyzer, type LiveSource } from '@/state/analyzer';
import { useSettings } from '@/state/settings';
import { live } from '@/state/live';
import { openCamera, stopStream } from '@/services/camera';
import { useAnalysis } from './useAnalysis';
import { StageToolbar } from './StageToolbar';
import { MeasureDialog } from './MeasureDialog';
import { notify } from '@/state/toast';

type Drag =
  | { kind: 'pan'; x: number; y: number; tx: number; ty: number; moved: boolean; startX: number; startY: number }
  | { kind: 'shot'; id: string }
  | { kind: 'poa' }
  | { kind: 'center'; dx: number; dy: number }
  | { kind: 'rx' }
  | { kind: 'ry' }
  | { kind: 'pinch'; d0: number; z0: number; cx: number; cy: number; tx0: number; ty0: number };

const MAX_ZOOM = 14;

export function TargetStage() {
  const mode = useAnalyzer((s) => s.mode);
  const frame = useAnalyzer((s) => s.frame);
  const liveView = useAnalyzer((s) => s.live);
  const liveSource = useAnalyzer((s) => s.liveSource);
  const busy = useAnalyzer((s) => s.busy);
  const tool = useAnalyzer((s) => s.tool);
  const loadFile = useAnalyzer((s) => s.loadFile);

  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [videoDims, setVideoDims] = useState({ w: 1280, h: 720 });
  const [view, setView] = useState({ z: 1, tx: 0, ty: 0 });
  const [dragOver, setDragOver] = useState(false);

  const W = mode === 'live' ? videoDims.w : (frame?.width ?? 1);
  const H = mode === 'live' ? videoDims.h : (frame?.height ?? 1);
  const fit = Math.min(size.w / W, size.h / H) * 0.98;
  const bx = (size.w - W * fit) / 2;
  const by = (size.h - H * fit) / 2;

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // reset zoom when the picture changes
  useEffect(() => setView({ z: 1, tx: 0, ty: 0 }), [frame?.url, mode, W, H]);

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      setView((v) => {
        const z = Math.min(MAX_ZOOM, Math.max(1, v.z * factor));
        const cx = (px - bx - v.tx) / v.z;
        const cy = (py - by - v.ty) / v.z;
        if (z === 1) return { z: 1, tx: 0, ty: 0 };
        return { z, tx: px - bx - cx * z, ty: py - by - cy * z };
      });
    },
    [bx, by],
  );

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (mode === 'empty') return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, mode]);

  const fitView = useCallback(() => setView({ z: 1, tx: 0, ty: 0 }), []);
  const zoomBy = useCallback((f: number) => zoomAt(size.w / 2, size.h / 2, f), [zoomAt, size]);

  /* ----------------------------- pointer logic ---------------------------- */
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const toImg = (clientX: number, clientY: number): Vec2 => {
    const r = content.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };

  const startDrag = (e: RPointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    viewport.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = d;
    if (d.kind !== 'pan' && d.kind !== 'pinch') useAnalyzer.getState().beginEdit();
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (mode === 'empty' || e.button === 2) return;
    viewport.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = viewport.current!.getBoundingClientRect();
      drag.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: view.z, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, tx0: view.tx, ty0: view.ty };
      return;
    }
    drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false, startX: e.clientX, startY: e.clientY };
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = useAnalyzer.getState();
    switch (d.kind) {
      case 'pan': {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.hypot(dx, dy) > 4) d.moved = true;
        if (d.moved && view.z > 1) setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
        break;
      }
      case 'pinch': {
        const [a, b] = [...pointers.current.values()];
        if (!a || !b) break;
        const z = Math.min(MAX_ZOOM, Math.max(1, (d.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / d.d0));
        const cx = (d.cx - bx - d.tx0) / d.z0;
        const cy = (d.cy - by - d.ty0) / d.z0;
        setView(z === 1 ? { z: 1, tx: 0, ty: 0 } : { z, tx: d.cx - bx - cx * z, ty: d.cy - by - cy * z });
        break;
      }
      case 'shot':
        st.moveShot(d.id, toImg(e.clientX, e.clientY));
        break;
      case 'poa':
        useAnalyzer.setState({ poa: toImg(e.clientX, e.clientY), savedId: null });
        break;
      case 'center':
      case 'rx':
      case 'ry': {
        const c = st.calibration;
        if (!c) break;
        const p = toImg(e.clientX, e.clientY);
        let next: Calibration = { ...c, method: 'manual', confidence: 1 };
        if (d.kind === 'center') next = { ...next, center: { x: p.x - d.dx, y: p.y - d.dy } };
        if (d.kind === 'rx') {
          const r = Math.max(10, Math.abs(p.x - c.center.x));
          next = e.shiftKey ? { ...next, radiusX: r } : { ...next, radiusX: r, radiusY: c.radiusY * (r / c.radiusX) };
        }
        if (d.kind === 'ry') {
          const r = Math.max(10, Math.abs(p.y - c.center.y));
          next = e.shiftKey ? { ...next, radiusY: r } : { ...next, radiusY: r, radiusX: c.radiusX * (r / c.radiusY) };
        }
        const poaFollows = st.poa && Math.hypot(st.poa.x - c.center.x, st.poa.y - c.center.y) < 1;
        useAnalyzer.setState({ calibration: next, poa: poaFollows ? next.center : st.poa, savedId: null });
        break;
      }
    }
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    pointers.current.delete(e.pointerId);
    if (d?.kind === 'pinch') {
      if (pointers.current.size < 2) drag.current = null;
      return;
    }
    drag.current = null;
    if (!d || d.kind !== 'pan' || d.moved || mode !== 'review') return;
    const st = useAnalyzer.getState();
    const p = toImg(e.clientX, e.clientY);
    if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) return;
    if (tool === 'add') st.addShot(p);
    else if (tool === 'aim') st.setPoa(p);
    else if (tool === 'measure') st.addMeasurePoint(p);
    else st.select(null);
  };

  /* ------------------------------ keyboard ------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], dialog')) return;
      const st = useAnalyzer.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        st.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || st.mode !== 'review') return;
      const k = e.key.toLowerCase();
      if (k === 'v') st.setTool('move');
      else if (k === 'a') st.setTool('add');
      else if (k === 'p') st.setTool('aim');
      else if (k === 'r') st.setTool('ring');
      else if (k === 'm') st.setTool('measure');
      else if ((k === 'delete' || k === 'backspace') && st.selectedId) st.removeShot(st.selectedId);
      else if (k === '0') fitView();
      else if (k === '+' || k === '=') zoomBy(1.4);
      else if (k === '-') zoomBy(1 / 1.4);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitView, zoomBy]);

  /* ------------------------------- dropping ------------------------------ */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void loadFile(f);
  };

  const cursor =
    mode !== 'review' ? (view.z > 1 ? 'cursor-grab' : 'cursor-default') : tool === 'add' || tool === 'aim' || tool === 'measure' ? 'cursor-crosshair' : view.z > 1 ? 'cursor-grab' : 'cursor-default';

  return (
    <div
      className="scope-bg relative flex min-h-[55vh] flex-1 flex-col overflow-hidden rounded-lg bg-scope lg:min-h-0"
      onDragOver={(e) => {
        e.preventDefault();
        if (mode !== 'live') setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <StageToolbar onFit={fitView} onZoom={zoomBy} zoom={view.z} />
      <div
        ref={viewport}
        className={clsx('relative flex-1 touch-none select-none overflow-hidden', cursor)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {mode === 'empty' && <EmptyStage />}
        {mode !== 'empty' && (
          <div
            ref={content}
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: W * fit, height: H * fit, transform: `translate(${bx + view.tx}px, ${by + view.ty}px) scale(${view.z})` }}
          >
            {mode === 'review' && frame && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={frame.url} alt="Target" draggable={false} className="absolute inset-0 h-full w-full" />
            )}
            {mode === 'live' && liveSource && <LiveVideo source={liveSource} onDims={(w, h) => setVideoDims({ w, h })} />}
            <Overlay W={W} H={H} k={1 / (fit * view.z)} startDrag={startDrag} />
          </div>
        )}
        {dragOver && (
          <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-lg border-2 border-dashed border-hit/80 bg-black/40 text-lg font-medium text-white">
            Drop the photo to analyse it
          </div>
        )}
        {busy && (
          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-sm text-white" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {busy}
          </div>
        )}
      </div>
      <MeasureDialog />
      {mode === 'live' && liveView?.error && <p className="absolute bottom-3 left-3 rounded bg-bad px-3 py-1.5 text-sm text-white">{liveView.error}</p>}
    </div>
  );
}

/* --------------------------------- overlay -------------------------------- */

function Overlay({ W, H, k, startDrag }: { W: number; H: number; k: number; startDrag: (e: RPointerEvent, d: Drag) => void }) {
  const mode = useAnalyzer((s) => s.mode);
  const reviewCal = useAnalyzer((s) => s.calibration);
  const shots = useAnalyzer((s) => s.shots);
  const session = useAnalyzer((s) => s.session);
  const showOverlay = useAnalyzer((s) => s.showOverlay);
  const measure = useAnalyzer((s) => s.measure);
  const selectedId = useAnalyzer((s) => s.selectedId);
  const tool = useAnalyzer((s) => s.tool);
  const liveView = useAnalyzer((s) => s.live);
  const calibre = useSettings((s) => s.calibreMm);
  const view = useAnalysis();

  const isLive = mode === 'live';
  const cal = isLive ? (liveView?.calibration ?? null) : reviewCal;
  const locked = isLive ? liveView?.phase === 'locked' : !!cal;
  const holeR = cal ? (pxPerInch(cal) * (calibre / 25.4)) / 2 : 6 * k;
  const r = Math.max(holeR * 1.7, 10 * k);
  const sw = 2; // screen px, non-scaling
  const label = (n: number, p: Vec2, color = 'var(--c-hit)') => (
    <text x={p.x + r * 1.05} y={p.y - r * 0.95} fontSize={15 * k} fontWeight={700} fill={color} stroke="#000" strokeWidth={3 * k} paintOrder="stroke" style={{ fontFamily: 'var(--font-display)' }}>
      {n}
    </text>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      {cal && (
        <g>
          <ellipse
            key={locked ? 'locked' : 'searching'}
            cx={cal.center.x}
            cy={cal.center.y}
            rx={cal.radiusX}
            ry={cal.radiusY}
            fill="none"
            stroke={locked ? 'var(--c-ring)' : 'var(--c-hit)'}
            strokeWidth={locked ? 2.5 : 2}
            strokeDasharray={locked ? undefined : '10 8'}
            vectorEffect="non-scaling-stroke"
            className={locked ? 'ring-locked' : undefined}
            style={{ ['--sw-from' as string]: '7px', ['--sw-to' as string]: '2.5px' }}
          />
          {!isLive && tool === 'ring' && (
            <g>
              <Handle p={cal.center} k={k} label="Move ring" onDown={(e) => startDrag(e, { kind: 'center', dx: 0, dy: 0 })} />
              <Handle p={{ x: cal.center.x + cal.radiusX, y: cal.center.y }} k={k} label="Resize ring" onDown={(e) => startDrag(e, { kind: 'rx' })} />
              <Handle p={{ x: cal.center.x, y: cal.center.y + cal.radiusY }} k={k} label="Resize ring height" onDown={(e) => startDrag(e, { kind: 'ry' })} />
            </g>
          )}
        </g>
      )}

      {/* earlier groups of this session, see-through */}
      {cal &&
        locked &&
        showOverlay &&
        session?.groups
          .filter((g) => g.visible)
          .map((g) =>
            g.shotsIn.map((pIn, i) => {
              const p = toImage(cal, pIn);
              return (
                <g key={`g${g.no}-${i}`} pointerEvents="none" opacity={0.55}>
                  <circle cx={p.x} cy={p.y} r={r} fill={g.color} fillOpacity={0.35} stroke={g.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <text x={p.x} y={p.y + 4 * k} textAnchor="middle" fontSize={11 * k} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={2.5 * k} paintOrder="stroke" style={{ fontFamily: 'var(--font-display)' }}>
                    {g.no}
                  </text>
                </g>
              );
            }),
          )}

      {/* two-point calibration in progress */}
      {measure.length > 0 && (
        <g pointerEvents="none">
          {measure.length === 2 && <line x1={measure[0].x} y1={measure[0].y} x2={measure[1].x} y2={measure[1].y} stroke="var(--c-ring)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
          {measure.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={7 * k} fill="none" stroke="#000" strokeWidth={4} vectorEffect="non-scaling-stroke" />
              <circle cx={p.x} cy={p.y} r={7 * k} fill="none" stroke="var(--c-ring)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <text x={p.x + 10 * k} y={p.y - 8 * k} fontSize={14 * k} fontWeight={700} fill="var(--c-ring)" stroke="#000" strokeWidth={3 * k} paintOrder="stroke">
                {i === 0 ? 'A' : 'B'}
              </text>
            </g>
          ))}
        </g>
      )}

      {view?.pairPx && view.shotsPx.length >= 2 && (
        <line x1={view.pairPx[0].x} y1={view.pairPx[0].y} x2={view.pairPx[1].x} y2={view.pairPx[1].y} stroke="var(--c-hit)" strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
      )}

      {/* live candidates and confirmed holes */}
      {isLive &&
        liveView?.holes
          .filter((h) => !h.previous)
          .map((h) => (
            <g key={h.id} onPointerDown={(e) => (e.stopPropagation(), h.confirmed && live.removeHole(h.id))} className={h.confirmed ? 'cursor-pointer' : undefined}>
              <title>{h.confirmed ? 'Tap to remove a false mark' : 'Checking'}</title>
              <circle cx={h.p.x} cy={h.p.y} r={r} fill="none" stroke="#000" strokeOpacity={h.confirmed ? 0.9 : 0.4} strokeWidth={sw + 2.5} vectorEffect="non-scaling-stroke" />
              <circle cx={h.p.x} cy={h.p.y} r={r} fill="none" stroke="var(--c-hit)" strokeOpacity={h.confirmed ? 1 : 0.45} strokeWidth={sw} strokeDasharray={h.confirmed ? undefined : '4 3'} vectorEffect="non-scaling-stroke" />
              {h.confirmed && h.seq != null && label(h.seq, h.p)}
            </g>
          ))}

      {/* review marks */}
      {!isLive &&
        shots.map((s, i) => {
          const sel = s.id === selectedId;
          const doubt = s.merged || (s.confidence != null && s.confidence < 0.5);
          return (
            <g
              key={s.id}
              className={tool === 'move' ? 'cursor-move' : 'cursor-pointer'}
              onPointerDown={(e) => {
                if (e.button === 2) return;
                useAnalyzer.getState().select(s.id);
                startDrag(e, { kind: 'shot', id: s.id });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                useAnalyzer.getState().removeShot(s.id);
              }}
            >
              <title>{`Hit ${i + 1}${doubt ? ' (check)' : ''}. Drag to move, right-click to delete.`}</title>
              <circle cx={s.p.x} cy={s.p.y} r={r * 1.6} fill="transparent" />
              <circle cx={s.p.x} cy={s.p.y} r={r} fill="none" stroke="#000" strokeWidth={sw + 2.5} vectorEffect="non-scaling-stroke" />
              <circle cx={s.p.x} cy={s.p.y} r={r} fill={sel ? 'rgba(255,194,14,0.25)' : 'none'} stroke={doubt ? '#FF8A00' : 'var(--c-hit)'} strokeWidth={sel ? sw + 1 : sw} strokeDasharray={doubt ? '5 3' : undefined} vectorEffect="non-scaling-stroke" />
              <circle cx={s.p.x} cy={s.p.y} r={1.6 * k} fill="var(--c-hit)" />
              {label(i + 1, s.p, doubt ? '#FF8A00' : 'var(--c-hit)')}
            </g>
          );
        })}

      {view && (
        <g
          onPointerDown={(e) => !isLive && startDrag(e, { kind: 'poa' })}
          className={isLive ? undefined : 'cursor-move'}
        >
          <title>Aiming point. Drag to move.</title>
          <circle cx={view.poaPx.x} cy={view.poaPx.y} r={14 * k} fill="transparent" />
          <path
            d={`M${view.poaPx.x - 13 * k} ${view.poaPx.y}H${view.poaPx.x - 4 * k}M${view.poaPx.x + 4 * k} ${view.poaPx.y}H${view.poaPx.x + 13 * k}M${view.poaPx.x} ${view.poaPx.y - 13 * k}V${view.poaPx.y - 4 * k}M${view.poaPx.x} ${view.poaPx.y + 4 * k}V${view.poaPx.y + 13 * k}`}
            stroke="#000"
            strokeWidth={5}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M${view.poaPx.x - 13 * k} ${view.poaPx.y}H${view.poaPx.x - 4 * k}M${view.poaPx.x + 4 * k} ${view.poaPx.y}H${view.poaPx.x + 13 * k}M${view.poaPx.x} ${view.poaPx.y - 13 * k}V${view.poaPx.y - 4 * k}M${view.poaPx.x} ${view.poaPx.y + 4 * k}V${view.poaPx.y + 13 * k}`}
            stroke="var(--c-aim)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}

      {view?.mpiPx && view.shotsPx.length >= 2 && (
        <g pointerEvents="none">
          <path
            d={`M${view.mpiPx.x} ${view.mpiPx.y - 8 * k}L${view.mpiPx.x + 8 * k} ${view.mpiPx.y}L${view.mpiPx.x} ${view.mpiPx.y + 8 * k}L${view.mpiPx.x - 8 * k} ${view.mpiPx.y}Z`}
            fill="var(--c-mpi)"
            stroke="#000"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </svg>
  );
}

function Handle({ p, k, label, onDown }: { p: Vec2; k: number; label: string; onDown: (e: RPointerEvent) => void }) {
  return (
    <g onPointerDown={onDown} className="cursor-grab">
      <title>{label}</title>
      <circle cx={p.x} cy={p.y} r={16 * k} fill="transparent" />
      <circle cx={p.x} cy={p.y} r={7 * k} fill="var(--c-ring)" stroke="#000" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/* ------------------------------- live video ------------------------------- */

type HlsErr = { details: string; response?: { code?: number } };

/** hls.js error codes in plain words. */
function describeHlsError(label: string, d: HlsErr, playedBefore: boolean): string {
  const code = d.response?.code;
  if (playedBefore) return `${label}: the camera feed was lost (network, power or camera restart).`;
  switch (d.details) {
    case 'manifestLoadError':
    case 'levelLoadError':
      return code === 0 || code === undefined
        ? `${label}: the browser could not reach the video server (port 8888). Open Settings > CCTV cameras and press Test.`
        : `${label}: MediaMTX could not make a video from this camera (HTTP ${code}). Most often the camera sends H.265 or MJPEG: set it to H.264. Press Test in Settings > CCTV cameras for details.`;
    case 'manifestLoadTimeOut':
    case 'levelLoadTimeOut':
      return `${label}: the camera is too slow to start. Set its I Frame Interval to 25 to 50 (one to two seconds).`;
    case 'manifestIncompatibleCodecsError':
      return `${label}: this browser cannot play the camera's video format (probably H.265). Set the camera to H.264.`;
    default:
      return `${label}: ${d.details}. Press Test in Settings > CCTV cameras.`;
  }
}

function LiveVideo({ source, onDims }: { source: LiveSource; onDims: (w: number, h: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const stopLive = useAnalyzer((s) => s.stopLive);

  useEffect(() => {
    const v = ref.current!;
    let stream: MediaStream | null = null;
    let hls: { destroy(): void } | null = null;
    let cancelled = false;
    let played = false;
    const onPlaying = () => (played = true);
    v.addEventListener('playing', onPlaying);
    const fail = async (text: string) => {
      if (cancelled) return;
      const kept = await live.rescue();
      notify('error', 'Live view stopped', kept ? `${text} The last picture and the counted hits were kept for review.` : text);
      if (!kept) stopLive();
    };
    (async () => {
      try {
        if (source.kind === 'camera') {
          stream = await openCamera(source.deviceId);
          if (cancelled) return stopStream(stream);
          v.srcObject = stream;
        } else {
          v.crossOrigin = 'anonymous'; // needed to read pixels from a CCTV stream
          const { default: Hls } = await import('hls.js');
          if (Hls.isSupported()) {
            // patient loading: a camera with a long keyframe gap needs a while before the first playlist
            const patient = { default: { maxTimeToFirstByteMs: 45000, maxLoadTimeMs: 60000, timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 }, errorRetry: { maxNumRetry: 2, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } };
            const h = new Hls({ lowLatencyMode: false, backBufferLength: 10, manifestLoadPolicy: patient, playlistLoadPolicy: patient });
            hls = h;
            h.on(Hls.Events.ERROR, (_e, data) => {
              if (data.fatal) fail(describeHlsError(source.label, data as unknown as HlsErr, played));
            });
            h.loadSource(source.url);
            h.attachMedia(v);
          } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
            v.src = source.url;
          } else {
            return fail('This browser cannot play HLS streams. Use Chrome, Edge or Safari.');
          }
        }
        await v.play().catch(() => undefined);
        if (!cancelled) live.start(v, source.kind === 'camera' ? 'camera' : 'stream');
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        fail(
          name === 'NotAllowedError'
            ? 'Camera access was refused. Allow the camera in the browser address bar, then start again.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'That camera is not available. Pick another camera.'
              : `Could not start ${source.label}: ${err instanceof Error ? err.message : err}`,
        );
      }
    })();
    return () => {
      cancelled = true;
      v.removeEventListener('playing', onPlaying);
      live.stop();
      stopStream(stream);
      hls?.destroy();
      v.srcObject = null;
      v.removeAttribute('src');
      v.load();
    };
  }, [source, stopLive]);

  return (
    <video
      ref={ref}
      muted
      playsInline
      autoPlay
      onLoadedMetadata={(e) => onDims(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
      onResize={(e) => onDims(e.currentTarget.videoWidth || 1280, e.currentTarget.videoHeight || 720)}
      className="absolute inset-0 h-full w-full"
    />
  );
}

/* ------------------------------- empty stage ------------------------------ */

function EmptyStage() {
  const loadFile = useAnalyzer((s) => s.loadFile);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
      <svg viewBox="-100 -100 200 200" className="pointer-events-none absolute h-[88%] max-h-[640px] w-auto opacity-[0.16]" aria-hidden>
        {[96, 78, 60, 42].map((r) => (
          <circle key={r} r={r} fill="none" stroke="#e7eae3" strokeWidth={r === 96 ? 1.6 : 0.8} />
        ))}
        <circle r={18} fill="#e7eae3" />
        <path d="M-100 0H100M0 -100V100" stroke="#e7eae3" strokeWidth={0.4} />
      </svg>
      <div className="relative max-w-md">
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Point it at the target.</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-white/70">Drop a photo here, or start a camera from the left panel.</p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-olive px-5 font-semibold text-olive-ink hover:brightness-105"
        >
          <ImagePlus size={18} aria-hidden />
          Choose a photo
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
