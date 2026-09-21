'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SavedSession } from '@/types';

interface SessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  deleteSession: (id: string) => void;
  clearAllSessions: () => void;
}

export function SessionsModal({
  isOpen,
  onClose,
  sessions,
  deleteSession,
  clearAllSessions,
}: SessionsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
      <Card className="w-full max-w-3xl bg-slate-900/95 border-2 border-amber-600/70 shadow-2xl rounded max-h-[85vh] overflow-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-amber-600/40">
            <h2 className="text-xl font-bold text-amber-300">SAVED SESSIONS</h2>
            <button
              onClick={onClose}
              className="text-2xl font-bold text-slate-400 hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="text-5xl mb-4 opacity-50">💾</div>
              <p className="text-lg font-bold text-slate-300 mb-2">No Saved Sessions</p>
              <p className="text-sm text-slate-400">Save a session after analyzing to view it here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 p-4 bg-slate-800/60 rounded border border-amber-600/40 hover:border-amber-600/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-base font-bold text-amber-300">
                        {session.firerInfo.name || 'Unknown Firer'} - {session.firerInfo.date}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        <span className="text-amber-200">Rank:</span> {session.firerInfo.rank || 'N/A'} | <span className="text-amber-200">Wpn:</span> {session.firerInfo.weaponNumber || 'N/A'} | <span className="text-amber-200">Range:</span> {session.firerInfo.range}m
                      </p>
                    </div>
                    <Button
                      onClick={() => deleteSession(session.id)}
                      className="h-7 px-3 text-xs bg-red-700 hover:bg-red-600 text-red-100 font-bold rounded"
                    >
                      Delete
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                    <div className="p-2 bg-slate-900/50 rounded">
                      <span className="font-bold text-amber-200">Bullets:</span>
                      <p className="text-slate-300 mt-0.5">{session.results.bulletCount}/5</p>
                    </div>
                    <div className="p-2 bg-slate-900/50 rounded">
                      <span className="font-bold text-amber-200">Grouping:</span>
                      <p className="text-slate-300 mt-0.5">{session.results.groupingInches?.toFixed(2)}"</p>
                    </div>
                    <div className="p-2 bg-slate-900/50 rounded">
                      <span className="font-bold text-amber-200">Radial Error:</span>
                      <p className="text-slate-300 mt-0.5">{session.results.radialErrorCm?.toFixed(2)} cm</p>
                    </div>
                    <div className="p-2 bg-slate-900/50 rounded">
                      <span className="font-bold text-amber-200">Status:</span>
                      <p className={`mt-0.5 font-bold ${
                        session.results.status === 'ZEROED' ? 'text-green-400' :
                        session.results.status === 'ADJUSTMENT_REQUIRED' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {session.results.status}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {sessions.length > 0 && (
                <Button
                  onClick={() => {
                    clearAllSessions();
                    onClose();
                  }}
                  className="w-full text-xs py-2.5 bg-red-800 hover:bg-red-700 text-red-200 font-bold mt-4 rounded"
                >
                  Clear All Sessions
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
