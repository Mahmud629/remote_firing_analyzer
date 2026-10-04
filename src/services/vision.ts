'use client';
import type { VisionRequest, VisionResponse } from '../vision/protocol';
import { CanvasFrameSource } from '../vision/frame';
import { runPipeline } from '../vision/run';

type Options = Omit<VisionRequest, 'id' | 'bitmap'>;

/**
 * Runs the vision pipeline in a Web Worker so the UI and video stay smooth.
 * Falls back to the main thread where workers or OffscreenCanvas are missing.
 */
class VisionClient {
  private worker: Worker | null = null;
  private failed = false;
  private seq = 0;
  private pending = new Map<number, (r: VisionResponse) => void>();

  private ensure(): Worker | null {
    if (this.worker || this.failed) return this.worker;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      this.failed = true;
      return null;
    }
    try {
      this.worker = new Worker(new URL('../vision/worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<VisionResponse>) => {
        const done = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        done?.(e.data);
      };
      this.worker.onerror = () => {
        this.failed = true;
        this.worker?.terminate();
        this.worker = null;
        for (const [id, done] of this.pending) done({ id, ring: null, holes: null, ms: 0, error: 'Vision worker stopped' });
        this.pending.clear();
      };
    } catch {
      this.failed = true;
    }
    return this.worker;
  }

  async run(source: ImageBitmapSource, opts: Options): Promise<VisionResponse> {
    const id = ++this.seq;
    const bitmap = await createImageBitmap(source);
    const worker = this.ensure();
    if (!worker) {
      try {
        const src = new CanvasFrameSource(bitmap, bitmap.width, bitmap.height);
        return runPipeline(src, { ...opts, id });
      } finally {
        bitmap.close();
      }
    }
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({ ...opts, id, bitmap } satisfies VisionRequest, [bitmap]);
    });
  }
}

export const vision = new VisionClient();
