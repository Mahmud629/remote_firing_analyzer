'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FirerInfo, SavedSession } from '@/types';

interface MenuProps {
  firerInfo: FirerInfo;
  onFirerInfoChange: (info: FirerInfo) => void;
  sessions: SavedSession[];
  deleteSession: (id: string) => void;
  clearAllSessions: () => void;
}

export function SettingsMenu({ firerInfo, onFirerInfoChange, sessions, deleteSession, clearAllSessions }: MenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 hover:bg-slate-700 rounded transition-colors"
        title="Settings Menu"
      >
        <div className="flex gap-0.5">
          <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
          <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
          <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-slate-800 border border-slate-600 rounded shadow-lg z-50 max-h-96 overflow-y-auto">
          {/* Firer Information Section */}
          <div className="p-1.5 border-b border-slate-700">
            <p className="text-xs text-cyan-300 mb-1 font-bold">FIRER INFORMATION</p>
            <div className="space-y-0.5 text-xs">
              <div>
                <label className="text-cyan-400 font-semibold block">Name</label>
                <Input
                  value={firerInfo.name}
                  onChange={(e) => onFirerInfoChange({ ...firerInfo, name: e.target.value })}
                  placeholder="Firer Name"
                  className="h-6 text-xs"
                />
              </div>
              <div>
                <label className="text-cyan-400 font-semibold block">Rk</label>
                <Input
                  value={firerInfo.rank}
                  onChange={(e) => onFirerInfoChange({ ...firerInfo, rank: e.target.value })}
                  placeholder="Rank"
                  className="h-6 text-xs"
                />
              </div>
              <div>
                <label className="text-cyan-400 font-semibold block">Wpn Number</label>
                <Input
                  value={firerInfo.weaponNumber}
                  onChange={(e) => onFirerInfoChange({ ...firerInfo, weaponNumber: e.target.value })}
                  placeholder="Weapon Number"
                  className="h-6 text-xs"
                />
              </div>
              <div>
                <label className="text-cyan-400 font-semibold block">Date</label>
                <Input
                  type="date"
                  value={firerInfo.date}
                  onChange={(e) => onFirerInfoChange({ ...firerInfo, date: e.target.value })}
                  className="h-6 text-xs"
                />
              </div>
              <div>
                <label className="text-cyan-400 font-semibold block">Rng (m)</label>
                <Input
                  type="number"
                  value={firerInfo.range}
                  onChange={(e) => onFirerInfoChange({ ...firerInfo, range: parseInt(e.target.value) || 100 })}
                  className="h-6 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Saved Sessions Section */}
          <div className="p-1.5">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="w-full text-xs py-1 bg-amber-700 hover:bg-amber-600 text-amber-100 font-bold rounded mb-1"
            >
              Saved Sessions ({sessions.length})
            </button>

            {showSessions && (
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {sessions.length === 0 ? (
                  <p className="text-xs text-slate-400 p-1">No saved sessions</p>
                ) : (
                  <>
                    {sessions.map((session) => (
                      <div key={session.id} className="flex flex-col gap-0.5 p-0.5 bg-slate-700/50 rounded border border-slate-600">
                        <div className="text-xs font-bold text-amber-300">
                          {session.firerInfo.name} - {session.firerInfo.date}
                        </div>
                        <div className="text-xs text-slate-300">
                          {session.results.bulletCount} bullets | {session.results.groupingInches?.toFixed(2)}" | {session.results.status}
                        </div>
                        <Button
                          onClick={() => deleteSession(session.id)}
                          className="w-full text-xs py-0.5 bg-red-700 hover:bg-red-600 text-red-100 font-bold"
                        >
                          Delete
                        </Button>
                      </div>
                    ))}
                    {sessions.length > 0 && (
                      <Button
                        onClick={() => {
                          clearAllSessions();
                          setShowSessions(false);
                        }}
                        className="w-full text-xs py-1 bg-red-800 hover:bg-red-700 text-red-200 font-bold mt-1"
                      >
                        Clear All
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
