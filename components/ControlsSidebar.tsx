'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Unit, FirerInfo, SavedSession } from '@/types';
import { FirerInfoModal } from './FirerInfoModal';

interface ControlsSidebarProps {
  currentMode: 'bullet' | 'poa' | 'calibration' | null;
  onModeChange: (mode: 'bullet' | 'poa' | 'calibration' | null) => void;
  onImageUpload: (file: File) => void;
  onReset: () => void;
  onUndoLastBullet: () => void;
  onClearBullets: () => void;
  onDeleteMarker: (id: string) => void;
  bulletCount: number;
  bulletMarkers: Array<{ id: string; index: number }>;
  hasImage: boolean;
  isCalibrated: boolean;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  firerInfo: FirerInfo;
  onFirerInfoChange: (info: FirerInfo) => void;
  onSaveSession: () => void;
  onExportReport: () => void;
  isAnalysisComplete: boolean;
  getSessions: () => SavedSession[];
  deleteSession: (id: string) => void;
  clearAllSessions: () => void;
  inputMode: 'upload' | 'camera';
  onInputModeChange: (mode: 'upload' | 'camera') => void;
}

export function ControlsSidebar({
  currentMode,
  onModeChange,
  onImageUpload,
  onReset,
  onUndoLastBullet,
  onClearBullets,
  onDeleteMarker,
  bulletCount,
  bulletMarkers,
  hasImage,
  isCalibrated,
  unit,
  onUnitChange,
  firerInfo,
  onFirerInfoChange,
  onSaveSession,
  onExportReport,
  isAnalysisComplete,
  getSessions,
  deleteSession,
  clearAllSessions,
  inputMode,
  onInputModeChange,
}: ControlsSidebarProps) {
  const [showFirerModal, setShowFirerModal] = useState(false);
  const sessions = getSessions();

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
      {/* FIRER/WPN DETAILS Button */}
      <Button
        onClick={() => setShowFirerModal(true)}
        className="w-full text-xs py-2 font-bold bg-gradient-to-r from-cyan-700 to-cyan-800 hover:from-cyan-600 hover:to-cyan-700 text-cyan-100 rounded mb-1 border border-cyan-500/50 shadow-lg"
      >
        FIRER/WPN DETAILS
      </Button>

      {/* Step 1: Image Upload */}
      <Card className="p-1.5 bg-slate-900/50 border border-slate-500/60 shadow-md shadow-slate-500/20 rounded">
        <p className="text-xs text-slate-300 mb-1 font-bold">1. LOAD IMAGE</p>

        <div className="grid grid-cols-2 gap-1 mb-1">
          

          <Button
            type="button"
            onClick={() => onInputModeChange('camera')}
            className={`text-xs py-1 font-bold ${
              inputMode === 'camera'
                ? 'bg-sky-700 hover:bg-sky-600 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            CCTV/Camera
          </Button>
         </div>

        <label className="cursor-pointer">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
        />

        <div
          onClick={() => onInputModeChange('upload')}
          className={`px-2 py-2 text-xs rounded text-center transition-colors font-semibold ${
            inputMode === 'upload'
              ? 'bg-blue-700 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Upload
        </div>
       
      </label>

        {inputMode === 'camera' && (
          <div className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded text-center font-semibold border border-slate-600">
            Use center panel to connect and capture CCTV/Camera image
          </div>
        )}

        {hasImage && <p className="text-xs text-green-400 mt-0.5 font-bold">✓ Loaded</p>}
      </Card>

      {/* Step 2: Calibration */}
      {hasImage && (
        <Card className="p-1.5 bg-slate-900/50 border border-purple-500/60 shadow-md shadow-purple-500/20 rounded">
          <p className="text-xs text-purple-300 mb-1 font-bold">2. CALIBRATE</p>
          <Button
            onClick={() =>
              onModeChange(currentMode === 'calibration' ? null : 'calibration')
            }
            className={`w-full text-xs py-1 font-bold ${
              currentMode === 'calibration'
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : isCalibrated ? 'bg-green-700 hover:bg-green-800 text-white' : 'bg-purple-700 hover:bg-purple-600 text-white'
            }`}
          >
            {currentMode === 'calibration' ? '● Active' : isCalibrated ? '✓ Done' : 'Start'}
          </Button>
          
          {/* Calibration Help Text */}
          {currentMode === 'calibration' && (
            <div className="mt-1.5 p-1.5 bg-purple-900/30 border border-purple-500/40 rounded">
              <p className="text-xs text-purple-300 leading-relaxed">
                <span className="font-bold block mb-0.5">How to Calibrate:</span>
                1. Click on first known reference point on target
              </p>
              <p className="text-xs text-purple-300 leading-relaxed">
                2. Click on second reference point
              </p>
              <p className="text-xs text-purple-300 leading-relaxed">
                3. Enter the actual distance between points (in inches) when prompted
              </p>
              <p className="text-xs text-purple-200 italic mt-1">
                ⚠ Use precise measurements for accurate analysis
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Step 3: Mark Bullets */}
      {hasImage && isCalibrated && (
        <Card className="p-1.5 bg-slate-900/50 border border-orange-500/60 shadow-md shadow-orange-500/20 rounded">
          <p className="text-xs text-orange-300 mb-1 font-bold">3. BULLETS ({bulletCount}/5)</p>
          <Button
            onClick={() =>
              onModeChange(currentMode === 'bullet' ? null : 'bullet')
            }
            className={`w-full text-xs py-1 font-bold ${
              currentMode === 'bullet'
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : bulletCount === 5 ? 'bg-green-700 hover:bg-green-800 text-white' : 'bg-orange-700 hover:bg-orange-600 text-white'
            }`}
          >
            {currentMode === 'bullet' ? '● Mark' : bulletCount === 5 ? '✓ Done' : 'Mark'}
          </Button>

          {/* Bullet list - compact */}
          {bulletCount > 0 && (
            <div className="mt-1 space-y-0.5 max-h-12 overflow-y-auto text-xs">
              {bulletMarkers.map((marker) => (
                <div
                  key={marker.id}
                  className="flex items-center justify-between gap-1 p-0.5 bg-slate-800/50 rounded border border-orange-500/30"
                >
                  <span className="text-orange-300 font-bold text-xs">#{marker.index + 1}</span>
                  <Button
                    onClick={() => onDeleteMarker(marker.id)}
                    className="h-4 w-4 p-0 text-xs bg-red-700 hover:bg-red-600 text-red-100 flex items-center justify-center font-bold"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Mark POA */}
      {hasImage && isCalibrated && bulletCount === 5 && (
        <Card className="p-1.5 bg-slate-900/50 border border-green-500/60 shadow-md shadow-green-500/20 rounded">
          <p className="text-xs text-green-300 mb-1 font-bold">4. POINT OF AIM</p>
          <Button
            onClick={() => onModeChange(currentMode === 'poa' ? null : 'poa')}
            className={`w-full text-xs py-1 font-bold ${
              currentMode === 'poa'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-green-700 hover:bg-green-600 text-white'
            }`}
          >
            {currentMode === 'poa' ? '● Mark POA' : 'Mark POA'}
          </Button>
        </Card>
      )}

      {/* Unit Selector - Only when calibrated */}
      {isCalibrated && (
        <Card className="p-1.5 bg-slate-900/50 border border-blue-500/60 shadow-md shadow-blue-500/20 rounded">
          <p className="text-xs text-blue-300 mb-1 font-bold">UNIT</p>
          <div className="grid grid-cols-3 gap-1">
            {(['inches', 'cm', 'mm'] as const).map((u) => (
              <Button
                key={u}
                onClick={() => onUnitChange(u)}
                className={`text-xs py-1 font-bold ${
                  unit === u
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {u === 'inches' ? '"' : u}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Edit Controls */}
      {bulletCount > 0 && (
        <Card className="p-1.5 bg-slate-900/50 border border-slate-500/60 shadow-md shadow-slate-500/20 rounded">
          <p className="text-xs text-slate-300 mb-1 font-bold">EDIT</p>
          <div className="space-y-0.5">
            <Button
              onClick={onUndoLastBullet}
              className="w-full text-xs py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold"
            >
              Undo
            </Button>
            <Button
              onClick={onClearBullets}
              className="w-full text-xs py-1 bg-red-800 hover:bg-red-700 text-red-200 font-bold"
            >
              Clear
            </Button>
          </div>
        </Card>
      )}

      {/* Export & Save Controls */}
      {isAnalysisComplete && (
        <Card className="p-1.5 bg-slate-900/50 border border-lime-500/60 shadow-md shadow-lime-500/20 rounded">
          <p className="text-xs text-lime-300 mb-1 font-bold">ACTIONS</p>
          <div className="space-y-0.5">
            <Button
              onClick={onExportReport}
              className="w-full text-xs py-1 bg-lime-700 hover:bg-lime-600 text-lime-100 font-bold"
            >
              Export Report
            </Button>
            <Button
              onClick={onSaveSession}
              className="w-full text-xs py-1 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 font-bold"
            >
              Save Session
            </Button>
          </div>
        </Card>
      )}

      {/* Reset */}
      <Card className="p-1.5 bg-slate-900/50 border border-slate-500/60 shadow-md shadow-slate-500/20 rounded mt-auto">
        <Button
          onClick={onReset}
          className="w-full text-xs py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold"
        >
          Reset All
        </Button>
      </Card>

      {/* Firer Info Modal */}
      <FirerInfoModal
        isOpen={showFirerModal}
        onClose={() => setShowFirerModal(false)}
        firerInfo={firerInfo}
        onFirerInfoChange={onFirerInfoChange}
      />
    </div>
  );
}