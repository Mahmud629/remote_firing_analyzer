'use client';
import { create } from 'zustand';

export type Tone = 'ok' | 'info' | 'warn' | 'error';
export interface Toast {
  id: number;
  tone: Tone;
  title: string;
  text?: string;
}

let seq = 0;
export const useToasts = create<{ list: Toast[]; dismiss: (id: number) => void }>()((set) => ({
  list: [],
  dismiss: (id) => set((s) => ({ list: s.list.filter((t) => t.id !== id) })),
}));

/** Pop-up notice in the top-right corner. Errors stay longer. */
export function notify(tone: Tone, title: string, text?: string) {
  const id = ++seq;
  useToasts.setState((s) => ({ list: [...s.list.filter((t) => t.title !== title).slice(-3), { id, tone, title, text }] }));
  setTimeout(() => useToasts.getState().dismiss(id), tone === 'error' ? 8000 : tone === 'warn' ? 6000 : 3800);
}
