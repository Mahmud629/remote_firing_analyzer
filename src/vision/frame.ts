import { type Gray, type Rect, resample, grayFromRGBA } from './image';
export type { Gray };
import type { Vec2 } from '../core/types';

/** A view of (part of) a frame in grayscale. Source px = offset + p / scale. */
export interface GrayView {
  img: Gray;
  scale: number;
  offset: Vec2;
}

/**
 * Anything the detectors can read pixels from. The detectors only ever ask for
 * a (cropped, downscaled) grayscale view, so a 4K photo and a 720p stream are
 * processed at the same cost.
 */
/**
 * luma: brightness. warm: red minus green (scaled, 128 = neutral). Holes show the
 * tan/brown backing board, which stands out strongly from green, black, white and
 * grey print in this channel even when brightness is similar.
 */
export type Channel = 'luma' | 'warm';

export interface FrameSource {
  width: number;
  height: number;
  gray(opts: { crop?: Rect; maxDim: number }): GrayView;
  /** Optional colour channels (sources without colour return null for 'warm'). */
  channel?(opts: { crop?: Rect; maxDim: number }, kind: Channel): GrayView | null;
}

export const WARM_GAIN = 2;
export function warmFromRGBA(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const d = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = Math.max(0, Math.min(255, 128 + WARM_GAIN * (rgba[j] - rgba[j + 1])));
  return { w, h, d };
}

export function fitCrop(src: { width: number; height: number }, crop?: Rect): Rect {
  if (!crop) return { x: 0, y: 0, w: src.width, h: src.height };
  const x = Math.max(0, Math.floor(crop.x));
  const y = Math.max(0, Math.floor(crop.y));
  const x1 = Math.min(src.width, Math.ceil(crop.x + crop.w));
  const y1 = Math.min(src.height, Math.ceil(crop.y + crop.h));
  return { x, y, w: Math.max(1, x1 - x), h: Math.max(1, y1 - y) };
}

/** Output size so the long side equals maxDim (may enlarge small crops). */
export function outputSize(c: Rect, maxDim: number) {
  const s = maxDim / Math.max(c.w, c.h);
  return { w: Math.max(1, Math.round(c.w * s)), h: Math.max(1, Math.round(c.h * s)) };
}

/** Pure in-memory source (tests, Node, and main-thread fallback). */
export class ArrayFrameSource implements FrameSource {
  constructor(private full: Gray) {}
  get width() {
    return this.full.w;
  }
  get height() {
    return this.full.h;
  }
  gray({ crop, maxDim }: { crop?: Rect; maxDim: number }): GrayView {
    const c = fitCrop(this, crop);
    const o = outputSize(c, maxDim);
    const img = resample(this.full, c, o.w, o.h);
    return { img, scale: o.w / c.w, offset: { x: c.x, y: c.y } };
  }
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Drawable = CanvasImageSource & { width: number; height: number };

/** Canvas-backed source; works in a Worker (OffscreenCanvas) and on the main thread. */
export class CanvasFrameSource implements FrameSource {
  private cache = new Map<string, GrayView>();
  constructor(
    private image: Drawable,
    public width: number,
    public height: number,
    private makeCanvas: (w: number, h: number) => AnyCanvas = defaultCanvas,
  ) {}
  gray(opts: { crop?: Rect; maxDim: number }): GrayView {
    return this.channel(opts, 'luma');
  }
  channel({ crop, maxDim }: { crop?: Rect; maxDim: number }, kind: Channel): GrayView {
    const c = fitCrop(this, crop);
    const key = `${kind},${c.x},${c.y},${c.w},${c.h},${maxDim}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const o = outputSize(c, maxDim);
    const canvas = this.makeCanvas(o.w, o.h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.image, c.x, c.y, c.w, c.h, 0, 0, o.w, o.h);
    const data = ctx.getImageData(0, 0, o.w, o.h).data;
    const scale = o.w / c.w;
    const offset = { x: c.x, y: c.y };
    const luma = { img: grayFromRGBA(data, o.w, o.h), scale, offset };
    const warm = { img: warmFromRGBA(data, o.w, o.h), scale, offset };
    this.cache.set(`luma,${c.x},${c.y},${c.w},${c.h},${maxDim}`, luma);
    this.cache.set(`warm,${c.x},${c.y},${c.w},${c.h},${maxDim}`, warm);
    return kind === 'luma' ? luma : warm;
  }
}

function defaultCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** In-memory colour source (tests and Node). */
export class RgbArrayFrameSource implements FrameSource {
  private luma: Gray;
  private warm: Gray;
  constructor(rgb: Uint8Array, public width: number, public height: number) {
    const n = width * height;
    const l = new Float32Array(n);
    const wm = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      l[i] = 0.299 * rgb[j] + 0.587 * rgb[j + 1] + 0.114 * rgb[j + 2];
      wm[i] = Math.max(0, Math.min(255, 128 + WARM_GAIN * (rgb[j] - rgb[j + 1])));
    }
    this.luma = { w: width, h: height, d: l };
    this.warm = { w: width, h: height, d: wm };
  }
  gray(opts: { crop?: Rect; maxDim: number }) {
    return this.channel(opts, 'luma');
  }
  channel({ crop, maxDim }: { crop?: Rect; maxDim: number }, kind: Channel): GrayView {
    const c = fitCrop(this, crop);
    const o = outputSize(c, maxDim);
    return { img: resample(kind === 'luma' ? this.luma : this.warm, c, o.w, o.h), scale: o.w / c.w, offset: { x: c.x, y: c.y } };
  }
}
