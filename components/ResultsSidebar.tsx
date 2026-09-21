'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { ZeroingResults, Unit, FirerInfo } from '@/types';
import { convertValue } from '@/lib/calculations';
import { getFirerClassification, getClassificationWithColor } from '@/lib/firingClassification';

interface ResultsSidebarProps {
  results: ZeroingResults | null;
  isCalibrated: boolean;
  unit: Unit;
  firerInfo: FirerInfo;
}

export function ResultsSidebar({ results, isCalibrated, unit, firerInfo }: ResultsSidebarProps) {
  const getStatusBorder = (status: string) => {
    switch (status) {
      case 'ZEROED':
        return 'border-green-500 shadow-lg shadow-green-500/50';
      case 'ADJUSTMENT_REQUIRED':
        return 'border-yellow-500 shadow-lg shadow-yellow-500/50';
      case 'WASHOUT':
        return 'border-red-500 shadow-lg shadow-red-500/50';
      default:
        return 'border-slate-500 shadow-lg shadow-slate-500/30';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ZEROED':
        return 'text-green-400';
      case 'ADJUSTMENT_REQUIRED':
        return 'text-yellow-400';
      case 'WASHOUT':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const formatValue = (value: number | null, sourceUnit: 'inches' | 'cm' = 'inches') => {
    if (value === null) return 'N/A';
    const converted = convertValue(value, sourceUnit, unit);
    const symbol = unit === 'inches' ? '"' : unit === 'cm' ? ' cm' : ' mm';
    return converted.toFixed(2) + symbol;
  };

  const formatCmValue = (value: number | null) => {
    if (value === null) return 'N/A';
    return value.toFixed(2) + ' cm';
  };

  return (
    <div className="flex flex-col gap-1 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-1">
      {!isCalibrated ? (
        <Card className="p-1.5 bg-slate-900/50 border border-slate-600 text-xs text-slate-400">
          Calibrate scale to begin
        </Card>
      ) : !results ? (
        <Card className="p-1.5 bg-slate-900/50 border border-slate-600 text-xs text-slate-400">
          Mark bullets and POA
        </Card>
      ) : (
        <>
          {/* Firer Details Card */}
          <Card className="p-1.5 bg-slate-900/50 border border-cyan-500/60 shadow-md shadow-cyan-500/20 rounded">
            <p className="text-xs text-cyan-400 font-bold mb-1">FIRER DETAILS</p>
            <div className="text-xs space-y-0.5">
              {firerInfo.name && <p className="text-cyan-300"><span className="font-bold">Name:</span> {firerInfo.name}</p>}
              {firerInfo.rank && <p className="text-cyan-300"><span className="font-bold">Rk:</span> {firerInfo.rank}</p>}
              {firerInfo.weaponNumber && <p className="text-cyan-300"><span className="font-bold">Wpn:</span> {firerInfo.weaponNumber}</p>}
              <p className="text-cyan-300"><span className="font-bold">Date:</span> {firerInfo.date}</p>
              <p className="text-cyan-300"><span className="font-bold">Rng:</span> {firerInfo.range}m</p>
            </div>
          </Card>

          {/* Status - BIG AND BOLD */}
          <Card className={`p-1.5 bg-slate-900/50 border-2 ${getStatusBorder(results.status)} rounded text-center font-black text-lg ${getStatusText(results.status)}`}>
            {results.status === 'WASHOUT' ? 'WASHOUT' : results.groupingInches && results.groupingInches > 10 ? `${results.groupingInches.toFixed(2)}" Grouping` : results.status}
          </Card>

          {/* Bullets Marked */}
          <Card className="p-1.5 bg-slate-900/50 border border-orange-500/60 shadow-md shadow-orange-500/30 rounded">
            <p className="text-xs text-orange-400 font-bold">Bullets</p>
            <p className="text-lg font-bold text-orange-300">{results.bulletCount}/5</p>
          </Card>

          {/* Grouping - IMPORTANT, BIG FONT */}
          {results.groupingInches !== null && (
            <Card className="p-1.5 bg-slate-900/50 border border-blue-500/60 shadow-md shadow-blue-500/30 rounded">
              <p className="text-xs text-blue-400 font-bold">GROUPING</p>
              <p className="text-xl font-black text-blue-300">{formatValue(results.groupingInches, 'inches')}</p>
              <p className={`text-xs mt-1 font-bold ${results.groupingInches <= 10 ? 'text-green-400' : 'text-red-400'}`}>
                {results.groupingInches <= 10 ? '✓ VALID' : '✗ EXCEEDS'}
              </p>
              {/* Firing Classification with Color */}
              {(() => {
                const classInfo = getClassificationWithColor(results.groupingInches);
                return (
                  <div className={`text-xs mt-2 pt-2 border-t border-blue-500/30 font-bold px-2 py-1 rounded ${classInfo.bgColor} ${classInfo.textColor}`}>
                    {classInfo.classification}
                  </div>
                );
              })()}
            </Card>
          )}

          {/* Washout Reason */}
          {results.status === 'WASHOUT' && results.washoutReasons.length > 0 && (
            <Card className="p-1.5 bg-slate-900/50 border border-red-500/60 shadow-md shadow-red-500/30 rounded">
              <p className="text-xs text-red-400 font-bold">WASHOUT</p>
              {results.washoutReasons.map((reason, idx) => (
                <p key={idx} className="text-xs text-red-300 leading-tight mt-0.5">
                  • {reason}
                </p>
              ))}
            </Card>
          )}

          {/* MPI - ALWAYS SHOW, BOLD */}
          {results.mpiInches && results.mpiCm && (
            <Card className="p-1.5 bg-slate-900/50 border border-purple-500/60 shadow-md shadow-purple-500/30 rounded">
              <p className="text-xs text-purple-400 font-bold">MPI CORRECTION</p>
              <div className="space-y-1 mt-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-purple-300">H:</span>
                  <span className="text-sm font-bold text-purple-200">
                    {results.mpiInches.x > 0 ? 'R' : 'L'} {Math.abs(results.mpiInches.x).toFixed(2)}"
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-purple-300">V:</span>
                  <span className="text-sm font-bold text-purple-200">
                    {results.mpiInches.y > 0 ? 'Low' : 'High'} {Math.abs(results.mpiInches.y).toFixed(2)}"
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Radial Error - ALWAYS SHOW */}
          {results.radialErrorInches !== null && results.radialErrorCm !== null && (
            <Card className="p-1.5 bg-slate-900/50 border border-cyan-500/60 shadow-md shadow-cyan-500/30 rounded">
              <p className="text-xs text-cyan-400 font-bold">RADIAL ERROR</p>
              <p className="text-lg font-bold text-cyan-300 mt-0.5">{formatValue(results.radialErrorInches, 'inches')}</p>
              <p className={`text-xs font-bold mt-0.5 ${results.radialErrorCm <= 5 ? 'text-green-400' : 'text-yellow-400'}`}>
                {results.radialErrorCm <= 5 ? '✓ ZEROED' : '⚠ ADJ NEEDED'}
              </p>
            </Card>
          )}

          {/* Correction - ALWAYS SHOW, BOLD */}
          {results.correctionCm && (
            <Card className="p-1.5 bg-slate-900/50 border border-indigo-500/60 shadow-md shadow-indigo-500/30 rounded">
              <p className="text-xs text-indigo-400 font-bold">ZEROING ADJUSTMENT</p>
              <div className="space-y-0.5 mt-1 text-sm font-bold">
                <div className="text-indigo-300">
                  {results.correctionCm.x > 0 ? 'R' : 'L'} {Math.abs(results.correctionCm.x).toFixed(1)} cm
                </div>
                <div className="text-indigo-300">
                  {results.correctionCm.y > 0 ? '↑ Raise' : '↓ Lower'} {Math.abs(results.correctionCm.y).toFixed(1)} cm
                </div>
              </div>
            </Card>
          )}

          {/* Sight Rotation - ALWAYS SHOW */}
          {results.sightRotations && (
            <Card className="p-1.5 bg-slate-900/50 border border-pink-500/60 shadow-md shadow-pink-500/30 rounded">
              <p className="text-xs text-pink-400 font-bold">SIGHT TURNS (BD-08)</p>
              <div className="space-y-0.5 mt-1">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-pink-300">Lat:</span>
                  <span className="text-pink-200">{results.sightRotations.lateral.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-pink-300">Ver:</span>
                  <span className="text-pink-200">{results.sightRotations.vertical.toFixed(2)}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Training Feedback */}
          {results.trainingFeedback && (
            <Card className="p-1.5 bg-slate-900/50 border border-amber-500/60 shadow-md shadow-amber-500/30 rounded">
              <p className="text-xs text-amber-400 font-bold">FEEDBACK</p>
              <p className="text-xs text-amber-200 leading-tight mt-0.5">{results.trainingFeedback}</p>
            </Card>
          )}

          {/* Legend - Compact */}
          <Card className="p-1.5 bg-slate-900/50 border border-slate-600 rounded text-xs mt-1">
            <p className="text-slate-300 font-bold text-xs mb-1">LEGEND</p>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-700 border border-red-500"></div>
                <span className="text-slate-400 text-xs">Bullet Impacts</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-slate-400 text-xs">POA</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-1 bg-yellow-400 mx-1"></div>
                <span className="text-slate-400 text-xs">MPI Cross</span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
