'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WpnDetails, SavedSession } from '@/types';

interface WpnDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (details: WpnDetails) => void;
  autoWpnNo?: string; // Auto-populated from firing results
  savedWpnDetails?: WpnDetails[]; // List of previously saved weapon details
}

export function WpnDetailsModal({ isOpen, onClose, onSave, autoWpnNo = '', savedWpnDetails = [] }: WpnDetailsModalProps) {
  const [wpnNo, setWpnNo] = useState('');
  const [zeroed, setZeroed] = useState(false);
  const [notes, setNotes] = useState('');
  const [allWeaponSessions, setAllWeaponSessions] = useState<WpnDetails[]>([]);

  // Extract weapon data from all saved sessions
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const sessionsData = localStorage.getItem('rifle_zeroing_sessions');
        if (sessionsData) {
          const sessions: SavedSession[] = JSON.parse(sessionsData);
          // Extract unique weapons from sessions with their zeroing status
          const weaponsMap = new Map<string, WpnDetails>();
          
          sessions.forEach((session) => {
            if (session.firerInfo.wpnNo) {
              // Determine zeroing status based on results
              const zeroingStatus = session.results.status === 'ZEROED';
              
              if (!weaponsMap.has(session.firerInfo.wpnNo)) {
                weaponsMap.set(session.firerInfo.wpnNo, {
                  wpnNo: session.firerInfo.wpnNo,
                  zeroed: zeroingStatus,
                  notes: undefined,
                });
              } else {
                // Update status if the weapon is zeroed in the latest session
                const existingWeapon = weaponsMap.get(session.firerInfo.wpnNo)!;
                if (zeroingStatus) {
                  existingWeapon.zeroed = true;
                }
              }
            }
          });
          
          // Merge with manually saved weapons (manually saved take precedence)
          const mergedWeapons = Array.from(weaponsMap.values());
          savedWpnDetails.forEach((saved) => {
            const index = mergedWeapons.findIndex(w => w.wpnNo === saved.wpnNo);
            if (index >= 0) {
              mergedWeapons[index] = saved; // Override with manually saved
            } else {
              mergedWeapons.push(saved);
            }
          });
          
          setAllWeaponSessions(mergedWeapons);
        }
      } catch (error) {
        console.error('Error extracting weapons from sessions:', error);
      }
    }
  }, [savedWpnDetails, isOpen]);

  // Auto-populate wpnNo whenever autoWpnNo changes
  useEffect(() => {
    if (autoWpnNo) {
      setWpnNo(autoWpnNo);
    }
  }, [autoWpnNo]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!wpnNo.trim()) {
      alert('Please enter or confirm weapon number');
      return;
    }

    onSave({
      wpnNo,
      zeroed,
      notes: notes || undefined,
    });

    // Reset form
    setWpnNo('');
    setZeroed(false);
    setNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-slate-900/95 border-2 border-amber-500/70 rounded shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-900/40 to-amber-800/40 border-b border-amber-500/50 px-4 py-3">
          <h2 className="text-lg font-black text-amber-300">WPN DETAILS</h2>
          <p className="text-xs text-amber-400">Record weapon zeroing status</p>
        </div>

        {/* Form Content */}
        <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
          <div>
            <label className="text-xs text-amber-400 font-bold block mb-1">
              Weapon Number {autoWpnNo && <span className="text-amber-300">(auto-detected)</span>}
            </label>
            <Input
              value={wpnNo}
              onChange={(e) => setWpnNo(e.target.value)}
              placeholder="Enter or confirm weapon serial number"
              className="h-8 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-amber-400 font-bold block mb-2">Zeroing Status</label>
            <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded border border-amber-500/20">
              <input
                type="checkbox"
                id="zeroed"
                checked={zeroed}
                onChange={(e) => setZeroed(e.target.checked)}
                className="w-4 h-4 cursor-pointer"
              />
              <label htmlFor="zeroed" className="text-sm text-amber-100 cursor-pointer">
                Weapon is Zeroed
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs text-amber-400 font-bold block mb-1">Remarks (Rmk)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add remarks about this weapon..."
              className="w-full p-2 text-sm rounded bg-slate-800/50 border border-amber-500/30 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/70 resize-none"
              rows={2}
            />
          </div>

          {/* Saved Weapons Table */}
          {allWeaponSessions && allWeaponSessions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-amber-500/30">
              <label className="text-xs text-amber-400 font-bold block mb-2">Saved Weapons</label>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-amber-700/30 border-b border-amber-500/30">
                      <th className="px-2 py-1 text-left text-amber-300 font-bold">Wpn No</th>
                      <th className="px-2 py-1 text-left text-amber-300 font-bold">Status</th>
                      <th className="px-2 py-1 text-left text-amber-300 font-bold">Rmk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allWeaponSessions.map((wpn, idx) => (
                      <tr key={idx} className="border-b border-amber-500/20 hover:bg-amber-900/20">
                        <td className="px-2 py-1 text-amber-100">{wpn.wpnNo}</td>
                        <td className="px-2 py-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            wpn.zeroed 
                              ? 'bg-green-700/50 text-green-200' 
                              : 'bg-red-700/50 text-red-200'
                          }`}>
                            {wpn.zeroed ? 'Zeroed' : 'Not Zeroed'}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-amber-200 text-xs">{wpn.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-amber-500/30 px-4 py-3 flex gap-2 justify-end">
          <Button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold bg-amber-700 hover:bg-amber-600 text-amber-100 rounded"
          >
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}
