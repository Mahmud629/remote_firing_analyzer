'use client';

import { useCallback, useEffect, useState } from 'react';
import { SESSION_STORAGE_KEY } from '@/lib/config';
import type { SavedSession } from '@/types';

const MAX_INLINE_IMAGE_LENGTH = 220_000;

function sanitizeSession(session: SavedSession): SavedSession {
  const image =
    session.targetImageBase64 &&
    session.targetImageBase64.length <= MAX_INLINE_IMAGE_LENGTH
      ? session.targetImageBase64
      : undefined;

  return {
    ...session,
    targetImageBase64: image,
  };
}

function readSessions(): SavedSession[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as SavedSession[]) : [];
  } catch (error) {
    console.error('Unable to read saved sessions:', error);
    return [];
  }
}

export function useSessions() {
  const [sessions, setSessions] = useState<SavedSession[]>([]);

  useEffect(() => {
    setSessions(readSessions());
  }, []);

  const persist = useCallback((next: SavedSession[]) => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      setSessions(next);
      return true;
    } catch (error) {
      console.error('Unable to save sessions:', error);
      return false;
    }
  }, []);

  const getSessions = useCallback(() => sessions, [sessions]);

  const saveSession = useCallback(
    (session: SavedSession) => {
      const safe = sanitizeSession(session);
      const withoutDuplicate = sessions.filter((item) => item.id !== safe.id);
      return persist([safe, ...withoutDuplicate].slice(0, 100));
    },
    [persist, sessions],
  );

  const deleteSession = useCallback(
    (id: string) => persist(sessions.filter((item) => item.id !== id)),
    [persist, sessions],
  );

  const clearAllSessions = useCallback(() => {
    if (typeof window === 'undefined') return false;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessions([]);
    return true;
  }, []);

  return {
    sessions,
    getSessions,
    saveSession,
    deleteSession,
    clearAllSessions,
  };
}
