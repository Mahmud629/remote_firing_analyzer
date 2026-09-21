'use client';

import CameraCapture from "./CameraCapture";
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ImageCanvas, type ImageCanvasHandle, type DisplayMarker } from './ImageCanvas';
import { ControlsSidebar } from './ControlsSidebar';
import { ResultsSidebar } from './ResultsSidebar';
import { Header } from './Header';
import { Footer } from './Footer';
import { SessionsModal } from './SessionsModal';
import { ResultsModal } from './ResultsModal';
import { FiringCycleModal } from './FiringCycleModal';
import { WpnDetailsModal } from './WpnDetailsModal';
import { analyzeZeroing } from '@/lib/calculations';
import { analyzeFiringPattern } from '@/lib/firingFeedback';
import { Point, MarkedPoint, ZeroingResults, Unit, FirerInfo, WpnDetails } from '@/types';
import { useSessions } from '@/hooks/useSessions';

export function AnalyzerContainer() {
  const [inputMode, setInputMode] = useState<"upload" | "camera">("upload");
  const [cameraKey, setCameraKey] = useState(0);

  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const [markers, setMarkers] = useState<MarkedPoint[]>([]);
  const [overlayMarkers, setOverlayMarkers] = useState<MarkedPoint[]>([]);
  const [showOverlay, setShowOverlay] = useState(true);

  const [currentMode, setCurrentMode] = useState<'bullet' | 'poa' | 'calibration' | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [scaleInches, setScaleInches] = useState<number | null>(null);
  const [scalePixels, setScalePixels] = useState<number | null>(null);
  const [results, setResults] = useState<ZeroingResults | null>(null);
  const [unit, setUnit] = useState<Unit>('inches');

  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showFiringCycleModal, setShowFiringCycleModal] = useState(false);
  const [showWpnDetailsModal, setShowWpnDetailsModal] = useState(false);

  const [wpnDetailsList, setWpnDetailsList] = useState<WpnDetails[]>([]);
  const canvasRef = useRef<ImageCanvasHandle>(null);

  const [firerInfo, setFirerInfo] = useState<FirerInfo>({
    name: '',
    rank: '',
    weaponNumber: '',
    date: new Date().toISOString().split('T')[0],
    range: 100,
  });

  const { getSessions, saveSession, deleteSession, clearAllSessions } = useSessions();

  const handleImageUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      setImageSrc(src);
      setMarkers([]);
      setResults(null);
      setCurrentMode(null);
      setHoveredMarkerId(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCameraCapture = useCallback((img: string) => {
    setImageSrc(img);
    setMarkers([]);
    setResults(null);
    setCurrentMode(null);
    setHoveredMarkerId(null);
  }, []);

  const handleRecaptureSameTarget = useCallback(() => {
    setImageSrc(null);
    setMarkers([]);
    setResults(null);
    setCurrentMode(null);
    setHoveredMarkerId(null);
    setCameraKey((prev) => prev + 1);
  }, []);

  const handleClearImage = useCallback(() => {
    setImageSrc(null);
    setMarkers([]);
    setOverlayMarkers([]);
    setResults(null);
    setCurrentMode(null);
    setHoveredMarkerId(null);
    setScalePixels(null);
    setScaleInches(null);
    setCameraKey((prev) => prev + 1);
  }, []);

  const analyzeWithMarkers = useCallback((
    allMarkers: MarkedPoint[],
    pixels: number | null,
    inches: number | null
  ) => {
    if (!pixels || !inches) {
      setResults(null);
      return;
    }

    const bullets = allMarkers.filter((m) => m.type === 'bullet');
    const poa = allMarkers.find((m) => m.type === 'poa') || null;

    if (bullets.length > 0 || poa) {
      const analysis = analyzeZeroing(bullets, poa, pixels, inches);
      setResults(analysis);
    } else {
      setResults(null);
    }
  }, []);

  const handleMarkerAdd = useCallback(
    (point: Point, type: 'bullet' | 'poa' | 'calibration') => {
      const newMarker: MarkedPoint = {
        ...point,
        id: `${type}-${Date.now()}-${Math.random()}`,
        type,
      };

      let updated = [...markers, newMarker];

      if (type === 'calibration') {
        const calibrationMarkers = updated.filter((m) => m.type === 'calibration');

        if (calibrationMarkers.length > 2) {
          const latestTwo = calibrationMarkers.slice(-2);
          updated = [
            ...updated.filter((m) => m.type !== 'calibration'),
            ...latestTwo,
          ];
        }
      }

      setMarkers(updated);

      if (type === 'calibration') {
        const finalCalibrationMarkers = updated.filter((m) => m.type === 'calibration');

        if (finalCalibrationMarkers.length === 2) {
          const distance = prompt(
            'Enter the actual distance between the two calibration points (in inches):'
          );

          if (distance && !isNaN(parseFloat(distance))) {
            const pixels = Math.sqrt(
              Math.pow(finalCalibrationMarkers[1].x - finalCalibrationMarkers[0].x, 2) +
              Math.pow(finalCalibrationMarkers[1].y - finalCalibrationMarkers[0].y, 2)
            );

            const inches = parseFloat(distance);
            setScalePixels(pixels);
            setScaleInches(inches);
            setCurrentMode(null);
            analyzeWithMarkers(updated, pixels, inches);
          } else {
            const reverted = updated.slice(0, -1);
            setMarkers(reverted);
            analyzeWithMarkers(reverted, scalePixels, scaleInches);
          }

          return;
        }
      }

      analyzeWithMarkers(updated, scalePixels, scaleInches);
    },
    [markers, analyzeWithMarkers, scalePixels, scaleInches]
  );

  const handleMarkerRemove = useCallback((id: string) => {
    if (id.startsWith('overlay-')) return;

    setMarkers((prev) => {
      const updated = prev.filter((m) => m.id !== id);

      const calibrationMarkers = updated.filter((m) => m.type === 'calibration');
      if (calibrationMarkers.length < 2) {
        setScalePixels(null);
        setScaleInches(null);
        analyzeWithMarkers(updated, null, null);
      } else {
        analyzeWithMarkers(updated, scalePixels, scaleInches);
      }

      return updated;
    });
  }, [analyzeWithMarkers, scalePixels, scaleInches]);

  const handleUndoLastBullet = useCallback(() => {
    setMarkers((prev) => {
      let updated = prev;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].type === 'bullet') {
          updated = prev.filter((_, idx) => idx !== i);
          break;
        }
      }
      analyzeWithMarkers(updated, scalePixels, scaleInches);
      return updated;
    });
  }, [analyzeWithMarkers, scalePixels, scaleInches]);

  const handleClearBullets = useCallback(() => {
    setMarkers((prev) => {
      const updated = prev.filter((m) => m.type !== 'bullet');
      analyzeWithMarkers(updated, scalePixels, scaleInches);
      return updated;
    });
  }, [analyzeWithMarkers, scalePixels, scaleInches]);

  const handleReset = useCallback(() => {
    setMarkers([]);
    setOverlayMarkers([]);
    setScalePixels(null);
    setScaleInches(null);
    setResults(null);
    setCurrentMode(null);
    setHoveredMarkerId(null);
    setCameraKey((prev) => prev + 1);
  }, []);

  const handleAddToOverlay = useCallback(() => {
    const currentBullets = markers.filter((m) => m.type === 'bullet');
    if (currentBullets.length === 0) {
      alert('No current bullet markers to add to overlay.');
      return;
    }

    const taggedMarkers = markers.map((m, idx) => ({
      ...m,
      id: `overlay-session-${Date.now()}-${idx}-${m.id}`,
    }));

    setOverlayMarkers((prev) => [...prev, ...taggedMarkers]);
    alert('Current markers added to overlay.');
  }, [markers]);

  const handleStartNextSession = useCallback(() => {
    setMarkers([]);
    setResults(null);
    setCurrentMode(null);
    setHoveredMarkerId(null);
  }, []);

  const handleClearOverlay = useCallback(() => {
    setOverlayMarkers([]);
  }, []);

  const handleSaveSession = useCallback(() => {
    if (!results) {
      alert('No result available to save.');
      return;
    }

    const targetImage = canvasRef.current?.captureCanvas() || '';

    const session = {
      id: `session-${Date.now()}`,
      firerInfo,
      results,
      savedAt: new Date().toISOString(),
      targetImageBase64: targetImage,
    };

    const ok = saveSession(session);

    if (ok) {
      alert('Session saved successfully!');
    } else {
      alert('Session could not be saved. Storage may be full.');
    }
  }, [results, firerInfo, saveSession]);

  const handleExportReport = useCallback(() => {
    if (!results) return;

    const markedCanvasImage = canvasRef.current?.captureCanvas() || imageSrc;
    const firingFeedback =
      results.trainingFeedback ||
      analyzeFiringPattern(results, firerInfo) ||
      'No feedback generated';

    const printWindow = window.open('', '', 'width=900,height=1200');
    if (!printWindow) return;

    const photoHTML = firerInfo.photoBase64
      ? `<img src="${firerInfo.photoBase64}" alt="Firer" class="firer-photo">`
      : '<div class="photo-placeholder">NO PHOTO</div>';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Rifle Zeroing Report - ${firerInfo.name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; background: white; color: #222; }
            .container { max-width: 8.5in; height: 11in; margin: 0 auto; background: white; border: 1px solid #ddd; display: flex; flex-direction: column; }
            .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #f39c12; }
            .header-text h1 { font-size: 36px; margin-bottom: 2px; letter-spacing: 1px; font-weight: bold; }
            .header-text p { font-size: 16px; opacity: 0.9; }
            .firer-photo { width: 70px; height: 90px; object-fit: cover; border: 2px solid #f39c12; border-radius: 3px; }
            .photo-placeholder { width: 70px; height: 90px; background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; color: #999; border: 1px dashed #999; }
            .content { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; font-size: 13px; align-content: start; overflow: hidden; }
            .section { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 3px; padding: 6px; }
            .section-title, .feedback-title { font-weight: bold; font-size: 11px; background: #495057; color: white; padding: 4px 5px; margin-bottom: 4px; border-radius: 2px; }
            .info-item { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid #e9ecef; font-size: 11px; }
            .status { padding: 4px; border-radius: 3px; font-weight: bold; text-align: center; margin: 4px 0; font-size: 11px; }
            .status.zeroed { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .status.adjustment { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
            .status.washout { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .feedback-section { grid-column: 1 / -1; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 3px; padding: 8px; }
            .feedback-content { font-size: 15px; line-height: 1.6; color: #333; }
            .center-target { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 8px 0; padding: 8px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 3px; }
            .target-image { width: 220px; height: 220px; object-fit: contain; border: 2px solid #f39c12; border-radius: 3px; background: white; }
            .target-summary { background: white; border: 1px solid #dee2e6; border-radius: 3px; padding: 7px; width: 100%; max-width: 220px; font-size: 11px; }
            .quote-section { text-align: center; padding: 15px; margin: 8px 0; font-style: italic; font-weight: bold; font-size: 18px; color: white; border: 2px solid #1b5e20; background: #1b5e20; border-radius: 3px; }
            .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 15px 0; margin-bottom: 10px; }
            .signature-line { width: 100%; border-top: 2px solid #000; height: 50px; margin-bottom: 8px; }
            .signature-label { font-size: 12px; font-weight: bold; text-align: center; color: #333; }
            .footer { background: #ecf0f1; padding: 8px 12px; text-align: center; font-size: 12px; border-top: 2px solid #f39c12; margin-top: auto; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="header-text">
                <h1>REMOTE FIRING ANALYZER</h1>
                <p>Digital Target Analysis and Rifle Zeroing Report</p>
              </div>
              <div>${photoHTML}</div>
            </div>

            <div class="content">
              <div>
                <div class="section">
                  <div class="section-title">FIRER DETAILS</div>
                  <div class="info-item"><span>Rank:</span><span>${firerInfo.rank || '-'}</span></div>
                  <div class="info-item"><span>Name:</span><span>${firerInfo.name || '-'}</span></div>
                  <div class="info-item"><span>ID:</span><span>${firerInfo.weaponNumber || '-'}</span></div>
                  <div class="info-item"><span>Range:</span><span>${firerInfo.range}m</span></div>
                  <div class="info-item"><span>Date:</span><span>${firerInfo.date}</span></div>
                </div>
              </div>

              <div>
                <div class="section">
                  <div class="section-title">RESULT</div>
                  <div class="status ${results.status === 'ZEROED' ? 'zeroed' : results.status === 'ADJUSTMENT_REQUIRED' ? 'adjustment' : 'washout'}">${results.status}</div>
                  <div class="info-item"><span>Bullets:</span><span>${results.bulletCount}/5</span></div>
                  <div class="info-item"><span>Grouping:</span><span>${results.groupingInches ? results.groupingInches.toFixed(2) + '"' : 'N/A'}</span></div>
                  <div class="info-item"><span>Radial Error:</span><span>${results.radialErrorCm ? results.radialErrorCm.toFixed(2) + 'cm' : 'N/A'}</span></div>
                </div>
              </div>

              ${markedCanvasImage ? `
              <div class="center-target">
                <img src="${markedCanvasImage}" alt="Target with Markings" class="target-image">
                <div class="target-summary">
                  <div class="section-title">TARGET ANALYSIS</div>
                  <div class="info-item"><span>Shots:</span><span>${results.bulletCount}/5</span></div>
                  <div class="info-item"><span>Status:</span><span>${results.status}</span></div>
                </div>
              </div>` : ''}

              <div class="feedback-section">
                <div class="feedback-title">FEEDBACK</div>
                <div class="feedback-content">${String(firingFeedback).replace(/\n/g, '<br>')}</div>
              </div>
            </div>

            <div class="quote-section">Your Weapon Your skill, One Shot One Kill</div>

            <div class="signature-section">
              <div><div class="signature-line"></div><div class="signature-label">Signature of Firer</div></div>
              <div><div class="signature-line"></div><div class="signature-label">Signature of Instructor</div></div>
            </div>

            <div class="footer">
              <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
            </div>
          </div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [results, imageSrc, firerInfo]);

  const bulletCount = markers.filter((m) => m.type === 'bullet').length;
  const bulletMarkers = markers
    .filter((m) => m.type === 'bullet')
    .map((m, idx) => ({ id: m.id, index: idx }));

  const isCalibrated = scalePixels !== null && scaleInches !== null;
  const poaPoint = markers.find((m) => m.type === 'poa') || null;
  const groupingPair = results?.groupingPixelPair || null;

  let mpiPixelPoint: Point | null = null;
  if (poaPoint && results?.mpiInches && scalePixels && scaleInches) {
    const deviationPixelsX = (results.mpiInches.x / scaleInches) * scalePixels;
    const deviationPixelsY = (results.mpiInches.y / scaleInches) * scalePixels;
    mpiPixelPoint = {
      x: poaPoint.x + deviationPixelsX,
      y: poaPoint.y + deviationPixelsY,
    };
  }

  const displayMarkers: DisplayMarker[] = useMemo(() => {
    const overlay: DisplayMarker[] = showOverlay
      ? overlayMarkers.map((m, idx) => ({
          ...m,
          id: `overlay-${m.id}`,
          readonlyMarker: true,
          displayColor:
            m.type === 'calibration'
              ? '#a855f7'
              : m.type === 'bullet'
              ? '#ef4444'
              : m.type === 'poa'
              ? '#22c55e'
              : '#9ca3af',
          displayOpacity: 0.35,
          displayLabel:
            m.type === 'bullet'
              ? `O${idx + 1}`
              : m.type === 'poa'
              ? 'Prev POA'
              : 'Prev Cal',
        }))
      : [];

    const current: DisplayMarker[] = markers.map((m, idx) => ({
      ...m,
      displayColor:
        m.type === 'calibration'
          ? '#a855f7'
          : m.type === 'bullet'
          ? '#ef4444'
          : m.type === 'poa'
          ? '#22c55e'
          : '#9ca3af',
      displayOpacity: 1,
      displayLabel:
        m.type === 'bullet'
          ? `N${idx + 1}`
          : m.type === 'poa'
          ? 'POA'
          : 'Cal',
    }));

    return [...overlay, ...current];
  }, [overlayMarkers, markers, showOverlay]);

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      <Header
        sessions={getSessions()}
        deleteSession={deleteSession}
        clearAllSessions={clearAllSessions}
        onShowSessions={() => setShowSessionsModal(true)}
        onShowResults={() => setShowResultsModal(true)}
        onShowFiringCycle={() => setShowFiringCycleModal(true)}
        onShowWpnDetails={() => setShowWpnDetailsModal(true)}
      />

      <div className="flex gap-3 flex-1 p-3 overflow-hidden">
        <div className="w-60 overflow-hidden">
          <ControlsSidebar
            currentMode={currentMode}
            onModeChange={setCurrentMode}
            onImageUpload={handleImageUpload}
            onReset={handleReset}
            onUndoLastBullet={handleUndoLastBullet}
            onClearBullets={handleClearBullets}
            onDeleteMarker={handleMarkerRemove}
            bulletCount={bulletCount}
            bulletMarkers={bulletMarkers}
            hasImage={imageSrc !== null}
            isCalibrated={isCalibrated}
            unit={unit}
            onUnitChange={setUnit}
            firerInfo={firerInfo}
            onFirerInfoChange={setFirerInfo}
            onSaveSession={handleSaveSession}
            onExportReport={handleExportReport}
            isAnalysisComplete={results !== null}
            getSessions={getSessions}
            deleteSession={deleteSession}
            clearAllSessions={clearAllSessions}
            inputMode={inputMode}
            onInputModeChange={setInputMode}
          />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {imageSrc && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddToOverlay}
                className="px-3 py-1 rounded bg-green-700 text-white text-sm font-semibold hover:bg-green-600"
              >
                Add to Overlay
              </button>

              <button
                type="button"
                onClick={handleStartNextSession}
                className="px-3 py-1 rounded bg-blue-700 text-white text-sm font-semibold hover:bg-blue-600"
              >
                Start New Session
              </button>

              <button
                type="button"
                onClick={handleRecaptureSameTarget}
                className="px-3 py-1 rounded bg-cyan-700 text-white text-sm font-semibold hover:bg-cyan-600"
              >
                Recapture Same Target
              </button>

              <button
                type="button"
                onClick={() => setShowOverlay((prev) => !prev)}
                className="px-3 py-1 rounded bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600"
              >
                {showOverlay ? 'Hide Overlay' : 'Show Overlay'}
              </button>

              <button
                type="button"
                onClick={handleClearOverlay}
                className="px-3 py-1 rounded bg-amber-700 text-white text-sm font-semibold hover:bg-amber-600"
              >
                Clear Overlay
              </button>

              <button
                type="button"
                onClick={handleClearImage}
                className="px-3 py-1 rounded bg-red-700 text-white text-sm font-semibold hover:bg-red-600 ml-auto"
              >
                Clear Target
              </button>
            </div>
          )}

          {inputMode === "camera" && !imageSrc && (
            <div className="flex-1 overflow-auto">
              <CameraCapture
                key={cameraKey}
                onCapture={handleCameraCapture}
              />
            </div>
          )}

          {imageSrc && (
            <>
              <ImageCanvas
                ref={canvasRef}
                imageSrc={imageSrc}
                markers={displayMarkers}
                onMarkerAdd={handleMarkerAdd}
                onMarkerRemove={handleMarkerRemove}
                onMarkerHover={setHoveredMarkerId}
                currentMode={currentMode}
                hoveredMarkerId={hoveredMarkerId}
                scalePixels={scalePixels}
                groupingPair={groupingPair}
                mpiPoint={mpiPixelPoint}
                poaPoint={poaPoint}
              />

              {results && (
                <div className="h-14 bg-slate-800/80 border-t border-yellow-600/60 px-4 py-2 flex items-center justify-center gap-6 text-center overflow-x-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Status:</span>
                    <span className={`text-sm font-bold ${
                      results.status === 'ZEROED'
                        ? 'text-green-400'
                        : results.status === 'WASHOUT'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                    }`}>
                      {results.status === 'WASHOUT'
                        ? 'WASHOUT'
                        : results.status === 'ADJUSTMENT_REQUIRED'
                        ? 'ADJUSTMENT REQUIRED'
                        : 'ZEROED'}
                    </span>
                  </div>

                  {results.groupingInches !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Grouping:</span>
                      <span className="text-sm font-bold text-blue-300">
                        {results.groupingInches.toFixed(2)}"
                      </span>
                    </div>
                  )}

                  {results.radialErrorCm !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Radial:</span>
                      <span className="text-sm font-bold text-cyan-300">
                        {results.radialErrorCm.toFixed(1)} cm
                      </span>
                    </div>
                  )}

                  {results.correctionCm && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Correction:</span>
                      <span className="text-sm font-bold text-indigo-300">
                        {results.correctionCm.x > 0 ? 'R' : 'L'} {Math.abs(results.correctionCm.x).toFixed(1)}cm |
                        {results.correctionCm.y > 0 ? ' ↑ ' : ' ↓ '}
                        {Math.abs(results.correctionCm.y).toFixed(1)}cm
                      </span>
                    </div>
                  )}

                  {results.sightRotations && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Sight Turns:</span>
                      <span className="text-sm font-bold text-pink-300">
                        Lat: {results.sightRotations.lateral.toFixed(2)} | Ver: {results.sightRotations.vertical.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="w-72 overflow-hidden">
          <ResultsSidebar
            results={results}
            isCalibrated={isCalibrated}
            unit={unit}
            firerInfo={firerInfo}
          />
        </div>
      </div>

      <Footer />

      <SessionsModal
        isOpen={showSessionsModal}
        onClose={() => setShowSessionsModal(false)}
        sessions={getSessions()}
        deleteSession={deleteSession}
        clearAllSessions={clearAllSessions}
      />

      <ResultsModal
        isOpen={showResultsModal}
        onClose={() => setShowResultsModal(false)}
        sessions={getSessions()}
      />

      <FiringCycleModal
        isOpen={showFiringCycleModal}
        onClose={() => setShowFiringCycleModal(false)}
      />

      <WpnDetailsModal
        isOpen={showWpnDetailsModal}
        onClose={() => setShowWpnDetailsModal(false)}
        autoWpnNo={firerInfo.wpnNo || ''}
        savedWpnDetails={wpnDetailsList}
        onSave={(details) => {
          setWpnDetailsList([...wpnDetailsList, details]);
        }}
      />
    </div>
  );
}