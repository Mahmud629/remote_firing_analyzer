'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { SavedSession } from '@/types';
import { getClassificationWithColor } from '@/lib/firingClassification';
import { generateFiringReport } from '@/lib/exportReport';

interface ResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
}

export function ResultsModal({
  isOpen,
  onClose,
  sessions,
}: ResultsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
      <Card className="w-11/12 max-w-3xl bg-slate-900/95 border-2 border-green-600/70 shadow-2xl rounded max-h-[80vh] overflow-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-green-300">ANALYSIS RESULTS HISTORY</h2>
            <button
              onClick={onClose}
              className="text-xl font-bold text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No results recorded yet</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session, idx) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-2 p-3 bg-slate-800/60 rounded border border-green-600/40"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-green-300">
                        #{idx + 1} - {session.firerInfo.name || 'Unknown'} ({session.firerInfo.date})
                      </p>
                      <p className="text-xs text-slate-400">
                        Rank: {session.firerInfo.rank} | Weapon: {session.firerInfo.weaponNumber} | Range: {session.firerInfo.range}m
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-1 rounded font-bold text-xs ${
                        session.results.status === 'ZEROED' ? 'bg-green-800/40 text-green-200' :
                        session.results.status === 'ADJUSTMENT_REQUIRED' ? 'bg-yellow-800/40 text-yellow-200' :
                        'bg-red-800/40 text-red-200'
                      }`}>
                        {session.results.status}
                      </div>
                      <button
                        onClick={() => generateFiringReport(session)}
                        className="px-3 py-1 rounded font-bold text-xs bg-amber-700/60 text-amber-200 hover:bg-amber-600/80 transition-colors"
                        title="Export firing report as PDF"
                      >
                        📄 Export
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 text-xs text-slate-300 bg-slate-900/30 p-2 rounded">
                    <div>
                      <span className="font-bold text-green-200">Bullets:</span> {session.results.bulletCount}/5
                    </div>
                    <div>
                      <span className="font-bold text-green-200">Grouping:</span> {session.results.groupingInches?.toFixed(2)}"
                    </div>
                    <div>
                      <span className="font-bold text-green-200">Radial Error:</span> {session.results.radialErrorCm?.toFixed(2)} cm
                    </div>
                    <div>
                      <span className="font-bold text-green-200">MPI H:</span> {session.results.mpiCm?.x?.toFixed(2)} cm
                    </div>
                    <div>
                      <span className="font-bold text-green-200">MPI V:</span> {session.results.mpiCm?.y?.toFixed(2)} cm
                    </div>
                    <div>
                      <span className="font-bold text-green-200">Saved:</span> {new Date(session.savedAt).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-bold text-amber-300">Classification:</span>{' '}
                      <span className={`${
                        (() => {
                          const classInfo = getClassificationWithColor(session.results.groupingInches);
                          if (classInfo.classification === 'Marksman') return 'text-red-200';
                          if (classInfo.classification === 'First class firer') return 'text-blue-200';
                          if (classInfo.classification === 'Standard firer') return 'text-green-200';
                          if (classInfo.classification === 'Requires Training') return 'text-orange-200';
                          return 'text-amber-200';
                        })()
                      }`}>
                        {session.results.groupingInches ? getClassificationWithColor(session.results.groupingInches).classification : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
