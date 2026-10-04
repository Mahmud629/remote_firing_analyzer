'use client';
import { useSyncExternalStore, type ReactNode } from 'react';

const subscribe = () => () => {};

/**
 * Renders its children in the browser only. Every screen of this app depends on things that exist
 * only in the browser (camera, saved records, saved settings, today's date), so server-rendered
 * HTML would never match and only causes hydration warnings.
 */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  return <>{inBrowser ? children : fallback}</>;
}

export function ScreenLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-muted" role="status">
      Loading…
    </div>
  );
}
