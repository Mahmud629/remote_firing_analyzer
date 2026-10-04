/// <reference lib="webworker" />
import { CanvasFrameSource } from './frame';
import { runPipeline } from './run';
import type { VisionRequest, VisionResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<VisionRequest>) => {
  const { bitmap, ...req } = e.data;
  let res: VisionResponse;
  try {
    const src = new CanvasFrameSource(bitmap, bitmap.width, bitmap.height);
    res = runPipeline(src, req);
  } catch (err) {
    res = { id: req.id, ring: null, holes: null, ms: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    bitmap.close();
  }
  ctx.postMessage(res);
};
