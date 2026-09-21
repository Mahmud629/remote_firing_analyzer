import { useCallback } from 'react';

const SESSIONS_KEY = 'firing-analyzer-sessions';

type SavedSession = {
  id: string;
  firerInfo: any;
  results: any;
  savedAt: string;
  targetImageBase64?: string;
};

export function useSessions() {
  const getSessions = useCallback((): SavedSession[] => {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(SESSIONS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading sessions from localStorage:', error);
      return [];
    }
  }, []);

  const saveSession = useCallback((session: SavedSession) => {
    if (typeof window === 'undefined') return false;

    try {
      const sessions = getSessions();

      // Remove heavy image data to avoid localStorage quota error
      const safeSession: SavedSession = {
        ...session,
        targetImageBase64: undefined,
      };

      sessions.push(safeSession);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      return true;
    } catch (error) {
      console.error('Error saving session to localStorage:', error);

      try {
        // fallback: save only essential data
        const sessions = getSessions();
        const fallbackSession: SavedSession = {
          id: session.id,
          firerInfo: session.firerInfo,
          results: session.results,
          savedAt: session.savedAt,
        };

        sessions.push(fallbackSession);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        return true;
      } catch (fallbackError) {
        console.error('Fallback save also failed:', fallbackError);
        return false;
      }
    }
  }, [getSessions]);

  const deleteSession = useCallback((id: string) => {
    if (typeof window === 'undefined') return;

    try {
      const sessions = getSessions().filter((s) => s.id !== id);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }, [getSessions]);

  const clearAllSessions = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(SESSIONS_KEY);
    } catch (error) {
      console.error('Error clearing sessions:', error);
    }
  }, []);

  return {
    getSessions,
    saveSession,
    deleteSession,
    clearAllSessions,
  };
}