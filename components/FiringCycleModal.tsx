'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { FiringCycleAnimation } from './FiringCycleAnimation';

interface FiringCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FiringCycleModal({ isOpen, onClose }: FiringCycleModalProps) {
  const [showAnimation, setShowAnimation] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
      <Card className="w-full max-w-4xl bg-slate-900/95 border-2 border-green-600/70 shadow-2xl rounded max-h-[90vh] overflow-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-green-600/40">
            <h2 className="text-xl font-bold text-green-300">FIRING CYCLE</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAnimation(!showAnimation)}
                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                  showAnimation
                    ? 'bg-amber-600/80 text-amber-100 border border-amber-500/70'
                    : 'bg-slate-700/80 text-slate-300 border border-slate-600/70 hover:bg-slate-600'
                }`}
              >
                {showAnimation ? 'Show Diagram' : 'Show Animation'}
              </button>
              <button
                onClick={onClose}
                className="text-2xl font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {showAnimation ? (
            // Animated Version
            <div className="mb-6">
              <FiringCycleAnimation />
            </div>
          ) : (
            // Diagram Version
            <div className="bg-slate-800/50 border border-green-600/40 rounded p-4 flex items-center justify-center mb-6">
              <Image
                src="/firing-cycle.png"
                alt="Firing Cycle Diagram"
                width={1200}
                height={750}
                className="w-full h-auto rounded"
                priority
              />
            </div>
          )}

          {/* Description */}
          <div className="mt-6 p-4 bg-slate-800/40 border border-green-600/30 rounded text-sm text-slate-300">
            <p className="font-bold text-green-300 mb-2">Firing Cycle Steps:</p>
            <ul className="space-y-2 text-xs">
              <li><span className="text-green-400 font-bold">Step 1:</span> Natural Alignment of the Weapon to the Point of Aim</li>
              <li><span className="text-green-400 font-bold">Step 2:</span> Correct Sight Picture and First pull</li>
              <li><span className="text-green-400 font-bold">Step 3:</span> 2 X Breathing Cycle</li>
              <li><span className="text-green-400 font-bold">Step 4:</span> 8-10 seconds breathing pause, Second (final) pull and follow through</li>
            </ul>
          </div>

          {/* Close Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-bold bg-green-700 hover:bg-green-600 text-green-100 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
