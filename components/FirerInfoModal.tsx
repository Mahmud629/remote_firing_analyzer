'use client';

import React, { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FirerInfo } from '@/types';

interface FirerInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  firerInfo: FirerInfo;
  onFirerInfoChange: (info: FirerInfo) => void;
}

export function FirerInfoModal({ isOpen, onClose, firerInfo, onFirerInfoChange }: FirerInfoModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onFirerInfoChange({
          ...firerInfo,
          photoBase64: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    onFirerInfoChange({
      ...firerInfo,
      photoBase64: undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-slate-900/95 border-2 border-cyan-500/70 rounded shadow-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-900/40 to-cyan-800/40 border-b border-cyan-500/50 px-4 py-3">
          <h2 className="text-lg font-black text-cyan-300">FIRER/WPN DETAILS</h2>
          <p className="text-xs text-cyan-400">Enter shooter and weapon information</p>
        </div>

        {/* Form Content */}
        <div className="p-4 space-y-3">
          {/* Photo Section - Small Box */}
          <div className="bg-slate-800/30 border border-cyan-500/30 rounded p-3">
            <label className="text-xs text-cyan-400 font-bold block mb-2">Firer Photo</label>
            {firerInfo.photoBase64 ? (
              <div className="space-y-2">
                <img
                  src={firerInfo.photoBase64}
                  alt="Firer"
                  className="w-24 h-32 object-cover rounded border border-cyan-500/50 mx-auto"
                />
                <button
                  onClick={removePhoto}
                  className="w-full px-3 py-1.5 text-xs font-bold bg-red-700/60 hover:bg-red-600 text-red-100 rounded transition-colors"
                >
                  Remove Photo
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-32 mx-auto px-3 py-2 text-xs font-bold bg-cyan-700/50 hover:bg-cyan-600 text-cyan-100 rounded transition-colors flex items-center justify-center text-center"
              >
                + Add Photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>

          <div>
            <label className="text-xs text-cyan-400 font-bold block mb-1">BA/Snk No. (ID)</label>
            <Input
              value={firerInfo.weaponNumber}
              onChange={(e) => onFirerInfoChange({ ...firerInfo, weaponNumber: e.target.value })}
              placeholder="Enter BA/Snk No."
              className="h-8 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-cyan-400 font-bold block mb-1">Rank (Rk)</label>
            <Input
              value={firerInfo.rank}
              onChange={(e) => onFirerInfoChange({ ...firerInfo, rank: e.target.value })}
              placeholder="Enter rank"
              className="h-8 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-cyan-400 font-bold block mb-1">Firer Name</label>
            <Input
              value={firerInfo.name}
              onChange={(e) => onFirerInfoChange({ ...firerInfo, name: e.target.value })}
              placeholder="Enter name"
              className="h-8 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-cyan-400 font-bold block mb-1">Wpn No. (Serial)</label>
            <Input
              value={firerInfo.wpnNo || ''}
              onChange={(e) => onFirerInfoChange({ ...firerInfo, wpnNo: e.target.value })}
              placeholder="Enter weapon serial number"
              className="h-8 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-cyan-400 font-bold block mb-1">Date</label>
            <Input
              type="date"
              value={firerInfo.date}
              onChange={(e) => onFirerInfoChange({ ...firerInfo, date: e.target.value })}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-cyan-400 font-bold block mb-1">Range (Rng) - Meters</label>
            <Input
              type="number"
              value={firerInfo.range}
              onChange={(e) => onFirerInfoChange({ ...firerInfo, range: parseInt(e.target.value) || 100 })}
              placeholder="100"
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-cyan-500/30 px-4 py-3 flex gap-2 justify-end">
          <Button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
          >
            Done
          </Button>
        </div>
      </Card>
    </div>
  );
}
