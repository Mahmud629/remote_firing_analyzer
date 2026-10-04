import type { Calibration, Vec2 } from '../core/types';
import { pxPerInch } from '../core/calibration';

export interface AnnotateInput {
  image: CanvasImageSource;
  width: number;
  height: number;
  calibration: Calibration | null;
  shots: Vec2[];
  /** Earlier groups of the session, drawn see-through. */
  overlays?: { color: string; label: string; points: Vec2[] }[];
  poa: Vec2 | null;
  mpi: Vec2 | null;
  pair?: [Vec2, Vec2] | null;
  maxDim?: number;
  /** Crop to these points (a close-up of the group) instead of the whole ring. */
  focus?: Vec2[];
}

/** Draws the marked target (cropped to the ring) for records and reports. */
export function renderAnnotated(a: AnnotateInput): HTMLCanvasElement {
  const cal = a.calibration;
  let crop = { x: 0, y: 0, w: a.width, h: a.height };
  if (cal && a.focus && a.focus.length) {
    const ppi = pxPerInch(cal);
    const xs = a.focus.map((p) => p.x);
    const ys = a.focus.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = Math.max(3 * ppi, (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2) * 1.25 + ppi);
    const x = Math.max(0, cx - half);
    const y = Math.max(0, cy - half);
    crop = { x, y, w: Math.min(a.width, cx + half) - x, h: Math.min(a.height, cy + half) - y };
  } else if (cal) {
    const px = cal.radiusX * 1.1;
    const py = cal.radiusY * 1.1;
    const x = Math.max(0, cal.center.x - px);
    const y = Math.max(0, cal.center.y - py);
    crop = { x, y, w: Math.min(a.width, cal.center.x + px) - x, h: Math.min(a.height, cal.center.y + py) - y };
  }
  const maxDim = a.maxDim ?? 1200;
  const s = Math.min(1.5, maxDim / Math.max(crop.w, crop.h));
  const c = document.createElement('canvas');
  c.width = Math.round(crop.w * s);
  c.height = Math.round(crop.h * s);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(a.image, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  const T = (p: Vec2) => ({ x: (p.x - crop.x) * s, y: (p.y - crop.y) * s });
  const unit = cal ? pxPerInch(cal) * s : c.width / 40; // one inch on the drawing
  const lw = Math.max(1.5, unit * 0.06);

  if (cal) {
    const ctr = T(cal.center);
    g.strokeStyle = 'rgba(34,195,255,0.9)';
    g.lineWidth = lw;
    g.beginPath();
    g.ellipse(ctr.x, ctr.y, cal.radiusX * s, cal.radiusY * s, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const r = Math.max(6, unit * 0.32);
  for (const o of a.overlays ?? []) {
    for (const p of o.points) {
      const q = T(p);
      g.globalAlpha = 0.35;
      g.fillStyle = o.color;
      g.beginPath();
      g.arc(q.x, q.y, r, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.8;
      g.strokeStyle = o.color;
      g.lineWidth = lw;
      g.stroke();
      g.globalAlpha = 1;
    }
  }
  if (a.pair) {
    const [p, q] = a.pair.map(T);
    g.setLineDash([lw * 3, lw * 2]);
    g.strokeStyle = 'rgba(255,194,14,0.95)';
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.stroke();
    g.setLineDash([]);
  }
  g.font = `600 ${Math.max(12, unit * 0.5)}px "Barlow Condensed", Arial, sans-serif`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  a.shots.forEach((p, i) => {
    const q = T(p);
    g.lineWidth = lw * 2.4;
    g.strokeStyle = '#000';
    g.beginPath();
    g.arc(q.x, q.y, r, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = lw * 1.2;
    g.strokeStyle = '#FFC20E';
    g.stroke();
    const label = String(i + 1);
    g.lineWidth = 4;
    g.strokeStyle = '#000';
    g.strokeText(label, q.x + r + 2, q.y - r);
    g.fillStyle = '#FFC20E';
    g.fillText(label, q.x + r + 2, q.y - r);
  });
  if (a.poa) {
    const q = T(a.poa);
    const k = r * 1.6;
    g.strokeStyle = '#2E9BFF';
    g.lineWidth = lw * 1.4;
    g.beginPath();
    g.moveTo(q.x - k, q.y);
    g.lineTo(q.x + k, q.y);
    g.moveTo(q.x, q.y - k);
    g.lineTo(q.x, q.y + k);
    g.stroke();
  }
  if (a.mpi) {
    const q = T(a.mpi);
    const k = r * 0.9;
    g.fillStyle = '#E3173E';
    g.strokeStyle = '#000';
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(q.x, q.y - k);
    g.lineTo(q.x + k, q.y);
    g.lineTo(q.x, q.y + k);
    g.lineTo(q.x - k, q.y);
    g.closePath();
    g.fill();
    g.stroke();
  }
  return c;
}

export const canvasToBlob = (c: HTMLCanvasElement, q = 0.85) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image encoding failed'))), 'image/jpeg', q));

export async function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}
