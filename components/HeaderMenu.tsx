'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SavedSession } from '@/types';

interface HeaderMenuProps {
  onInstructionsClick: () => void;
  sessions?: SavedSession[];
  deleteSession?: (id: string) => void;
  clearAllSessions?: () => void;
  onShowSessions?: () => void;
  onShowResults?: () => void;
  onShowFiringCycle?: () => void;
  onShowWpnDetails?: () => void;
}

export function HeaderMenu({ 
  onInstructionsClick,
  sessions = [],
  deleteSession = () => {},
  clearAllSessions = () => {},
  onShowSessions = () => {},
  onShowResults = () => {},
  onShowFiringCycle = () => {},
  onShowWpnDetails = () => {},
}: HeaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    { label: 'Instructions', icon: '📋', action: () => { onInstructionsClick(); setIsOpen(false); } },
    { label: 'Guidelines', icon: '📖', action: () => alert('Firing Guidelines') },
    { label: 'Firing Cycle', icon: '🔄', action: () => { onShowFiringCycle(); setIsOpen(false); } },
    { label: 'Wpn Details', icon: '🔫', action: () => { onShowWpnDetails(); setIsOpen(false); } },
    { label: 'Results', icon: '📊', action: () => { onShowResults(); setIsOpen(false); } },
    { label: 'Sessions', icon: '💾', action: () => { onShowSessions(); setIsOpen(false); } },
  ];

  return (
    <div ref={menuRef} className="relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-col items-center justify-center gap-1 px-2 py-1.5 bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-yellow-400 rounded font-bold transition-all border border-yellow-600/50 shadow-lg drop-shadow-lg hover:shadow-xl"
        title="Operations Menu"
      >
        <div className="flex flex-col gap-0.5">
          <div className="w-4 h-0.5 bg-yellow-400"></div>
          <div className="w-4 h-0.5 bg-yellow-400"></div>
          <div className="w-4 h-0.5 bg-yellow-400"></div>
        </div>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
            style={{ pointerEvents: 'auto' }}
          />
          <Card className="absolute left-0 top-16 w-48 bg-slate-900/98 border-2 border-yellow-600/70 shadow-2xl rounded z-50">
            <div className="p-1.5 space-y-0.5">
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full flex items-center gap-2 px-2 py-2 text-left text-xs font-bold text-yellow-300 hover:bg-yellow-700/40 rounded transition-colors border border-transparent hover:border-yellow-600/50"
                >
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
