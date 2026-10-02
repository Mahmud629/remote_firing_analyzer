'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import CameraCapture from './CameraCapture';
import { AppHeader } from './AppHeader';
import { WorkflowRail } from './WorkflowRail';
import { AnalysisPanel } from './AnalysisPanel';
import {
  ImageCanvas,
  type DisplayMarker,
  type ImageCanvasHandle,
} from './ImageCanvas';
import { analyzeZeroing, calculateDistance } from '@/lib/calculations';
import { detectBulletHoles } from '@/lib/ml/detector';
import { generateFiringReport } from '@/lib/exportReport';
import { useSessions } from '@/hooks/useSessions';
import type {
  FirerInfo,
  MarkedPoint,
  MarkerType,
  MarkingMode,
  Point,
  SavedSession,
  Unit,
  WorkflowStage,
  ZeroingResults,
} from '@/types';

type InputMode = 'upload' | 'camera';
type MlState = 'idle' | 'running' | 'success' | 'error';

function markerId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return prefix + '-' + crypto.randomUUID();
  }
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AnalyzerContainer() {
  const canvasRef = useRef<ImageCanvasHandle>(null);

  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [markers, setMarkers] = useState<MarkedPoint[]>([]);
  const [overlayMarkers, setOverlayMarkers] = useState<MarkedPoint[]>([]);
  const [showOverlay, setShowOverlay] = useState(true);
  const [currentMode, setCurrentMode] = useState<MarkerType | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [scalePixels, setScalePixels] = useState<number | null>(null);
  const [scaleInches, setScaleInches] = useState<number | null>(null);
  const [results, setResults] = useState<ZeroingResults | null>(null);
  const [unit, setUnit] = useState<Unit>('inches');
  const [markingMode, setMarkingMode] = useState<MarkingMode>('manual');
  const [mlState, setMlState] = useState<MlState>('idle');
  const [mlInfo, setMlInfo] = useState('');
  const [workspaceSaved, setWorkspaceSaved] = useState(false);

  const [firerInfo, setFirerInfo] = useState<FirerInfo>({
    name: '',
    rank: '',
    serviceNumber: '',
    weaponSerial: '',
    weaponNumber: '',
    wpnNo: '',
    date: today(),
    range: 100,
  });

  const {
    sessions,
    saveSession,
  } = useSessions();

  const bulletMarkers = useMemo(
    () => markers.filter((marker) => marker.type === 'bullet'),
    [markers],
  );
  const calibrationMarkers = useMemo(
    () => markers.filter((marker) => marker.type === 'calibration'),
    [markers],
  );
  const poaMarker = useMemo(
    () => markers.find((marker) => marker.type === 'poa') || null,
    [markers],
  );

  const isCalibrated = Boolean(scalePixels && scaleInches);
  const bulletCount = bulletMarkers.length;

  const analyze = useCallback(
    (
      nextMarkers: MarkedPoint[],
      nextScalePixels: number | null = scalePixels,
      nextScaleInches: number | null = scaleInches,
    ) => {
      if (!nextScalePixels || !nextScaleInches) {
        setResults(null);
        return;
      }

      const bullets = nextMarkers.filter((marker) => marker.type === 'bullet');
      const poa = nextMarkers.find((marker) => marker.type === 'poa') || null;

      if (!bullets.length) {
        setResults(null);
        return;
      }

      setResults(
        analyzeZeroing(
          bullets,
          poa,
          nextScalePixels,
          nextScaleInches,
        ),
      );
    },
    [scaleInches, scalePixels],
  );

  const resetTargetState = useCallback(() => {
    setMarkers([]);
    setOverlayMarkers([]);
    setShowOverlay(true);
    setCurrentMode(null);
    setHoveredMarkerId(null);
    setScalePixels(null);
    setScaleInches(null);
    setResults(null);
    setMarkingMode('manual');
    setMlState('idle');
    setMlInfo('');
    setWorkspaceSaved(false);
  }, []);

  const setTargetImage = useCallback(
    (image: string) => {
      setImageSrc(image);
      resetTargetState();
    },
    [resetTargetState],
  );

  const resetWorkspace = useCallback(() => {
    setImageSrc(null);
    resetTargetState();
  }, [resetTargetState]);

  const readImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setTargetImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    },
    [setTargetImage],
  );

  const handleMarkerAdd = useCallback(
    (point: Point, type: MarkerType) => {
      setWorkspaceSaved(false);

      if (type === 'poa') {
        const next = [
          ...markers.filter((marker) => marker.type !== 'poa'),
          {
            ...point,
            id: markerId('poa'),
            type: 'poa' as const,
            source: 'manual' as const,
          },
        ];
        setMarkers(next);
        setCurrentMode(null);
        analyze(next);
        return;
      }

      if (type === 'bullet') {
        const next = [
          ...markers,
          {
            ...point,
            id: markerId('bullet'),
            type: 'bullet' as const,
            source: 'manual' as const,
          },
        ];
        setMarkers(next);
        analyze(next);
        return;
      }

      const withoutOldCalibration =
        calibrationMarkers.length >= 2
          ? markers.filter((marker) => marker.type !== 'calibration')
          : markers;

      const nextCalibrationMarker: MarkedPoint = {
        ...point,
        id: markerId('cal'),
        type: 'calibration',
        source: 'manual',
      };

      const next = [...withoutOldCalibration, nextCalibrationMarker];
      const calibration = next.filter(
        (marker) => marker.type === 'calibration',
      );

      setMarkers(next);

      if (calibration.length === 2) {
        const entered = window.prompt(
          'Enter the actual distance between the two calibration points in inches:',
          '1',
        );
        const knownInches = Number(entered);

        if (!Number.isFinite(knownInches) || knownInches <= 0) {
          const reverted = next.filter(
            (marker) => marker.id !== nextCalibrationMarker.id,
          );
          setMarkers(reverted);
          return;
        }

        const pixels = calculateDistance(calibration[0], calibration[1]);
        if (pixels <= 0) {
          alert('Calibration points must be different.');
          return;
        }

        setScalePixels(pixels);
        setScaleInches(knownInches);
        setCurrentMode(null);
        analyze(next, pixels, knownInches);
      }
    },
    [analyze, calibrationMarkers.length, markers],
  );

  const handleMarkerRemove = useCallback(
    (id: string) => {
      if (id.startsWith('overlay-')) return;

      const removed = markers.find((marker) => marker.id === id);
      const next = markers.filter((marker) => marker.id !== id);

      setMarkers(next);
      setWorkspaceSaved(false);

      if (removed?.type === 'calibration') {
        setScalePixels(null);
        setScaleInches(null);
        setResults(null);
        return;
      }

      analyze(next);
    },
    [analyze, markers],
  );

  const startCalibration = () => {
    setMarkers((current) =>
      current.filter((marker) => marker.type !== 'calibration'),
    );
    setScalePixels(null);
    setScaleInches(null);
    setResults(null);
    setCurrentMode('calibration');
  };

  const startManualMarking = () => {
    setMarkingMode('manual');
    setMlState('idle');
    setMlInfo('');
    setCurrentMode('bullet');
  };

  const runAutoDetection = useCallback(async () => {
    if (!imageSrc) return;

    setMarkingMode('auto');
    setCurrentMode(null);
    setMlState('running');
    setMlInfo('Running model…');
    setWorkspaceSaved(false);

    try {
      const detected = await detectBulletHoles(imageSrc);
      const mlMarkers: MarkedPoint[] = detected.detections.map(
        (detection, index) => ({
          x: detection.x,
          y: detection.y,
          id: markerId('ml-' + (index + 1)),
          type: 'bullet',
          source: 'ml',
          confidence: detection.confidence,
        }),
      );

      const next = [
        ...markers.filter((marker) => marker.type !== 'bullet'),
        ...mlMarkers,
      ];

      setMarkers(next);
      setMlState('success');
      setMlInfo(
        String(mlMarkers.length) +
          ' detected' +
          (detected.inferenceMs ? ' · ' + detected.inferenceMs + ' ms' : ''),
      );
      analyze(next);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Automatic detection failed.';
      setMlState('error');
      setMlInfo(message);
    }
  }, [analyze, imageSrc, markers]);

  const clearBullets = () => {
    const next = markers.filter((marker) => marker.type !== 'bullet');
    setMarkers(next);
    setResults(null);
    setMlState('idle');
    setMlInfo('');
    setWorkspaceSaved(false);
  };

  const undoLastBullet = () => {
    const lastBullet = [...markers]
      .reverse()
      .find((marker) => marker.type === 'bullet');
    if (lastBullet) handleMarkerRemove(lastBullet.id);
  };

  const freezeCurrentGroup = () => {
    if (!bulletMarkers.length) return;

    const frozen = bulletMarkers.map((marker, index) => ({
      ...marker,
      id: 'overlay-' + markerId(String(index + 1)),
      source: 'system' as const,
    }));

    setOverlayMarkers((current) => [...current, ...frozen]);

    const next = markers.filter(
      (marker) => marker.type !== 'bullet' && marker.type !== 'poa',
    );
    setMarkers(next);
    setResults(null);
    setCurrentMode(markingMode === 'manual' ? 'bullet' : null);
    setWorkspaceSaved(false);
  };

  const displayMarkers: DisplayMarker[] = useMemo(() => {
    const overlay: DisplayMarker[] = showOverlay
      ? overlayMarkers.map((marker, index) => ({
          ...marker,
          readonlyMarker: true,
          displayColor: '#64748b',
          displayOpacity: 0.45,
          displayLabel: 'P' + (index + 1),
        }))
      : [];

    return [...overlay, ...markers];
  }, [markers, overlayMarkers, showOverlay]);

  const mpiPoint = useMemo<Point | null>(() => {
    if (
      !poaMarker ||
      !results?.mpiInches ||
      !scalePixels ||
      !scaleInches
    ) {
      return null;
    }

    return {
      x: poaMarker.x + (results.mpiInches.x / scaleInches) * scalePixels,
      y: poaMarker.y + (results.mpiInches.y / scaleInches) * scalePixels,
    };
  }, [poaMarker, results, scaleInches, scalePixels]);

  const currentSession = useCallback((): SavedSession | null => {
    if (!results) return null;

    return {
      id: 'session-' + Date.now(),
      firerInfo,
      results,
      markingMode,
      savedAt: new Date().toISOString(),
      targetImageBase64: canvasRef.current?.captureCanvas() || undefined,
    };
  }, [firerInfo, markingMode, results]);

  const handleSave = () => {
    const session = currentSession();
    if (!session) return;

    if (saveSession(session)) {
      setWorkspaceSaved(true);
      alert('Session saved.');
    } else {
      alert('Session could not be saved in this browser.');
    }
  };

  const handleReport = () => {
    const session = currentSession();
    if (session) generateFiringReport(session);
  };

  const canSave = Boolean(
    results &&
      bulletCount === 5 &&
      poaMarker &&
      isCalibrated,
  );

  const activeStage: WorkflowStage = useMemo(() => {
    if (!imageSrc) return 'source';
    if (!isCalibrated) return 'calibration';
    if (bulletCount !== 5) return 'marking';
    if (!poaMarker) return 'aim';
    if (!results) return 'analysis';
    if (!workspaceSaved) return 'review';
    return 'report';
  }, [
    bulletCount,
    imageSrc,
    isCalibrated,
    poaMarker,
    results,
    workspaceSaved,
  ]);

  const completedStages: WorkflowStage[] = useMemo(() => {
    const stages: WorkflowStage[] = [];
    if (imageSrc) stages.push('source');
    if (isCalibrated) stages.push('calibration');
    if (bulletCount === 5) stages.push('marking');
    if (poaMarker) stages.push('aim');
    if (results && results.status !== 'INCOMPLETE') stages.push('analysis');
    if (canSave) stages.push('review');
    if (workspaceSaved) stages.push('report');
    return stages;
  }, [
    bulletCount,
    canSave,
    imageSrc,
    isCalibrated,
    poaMarker,
    results,
    workspaceSaved,
  ]);

  return (
    <div className="rfa-app">
      <AppHeader
        sessionCount={sessions.length}
        markingMode={markingMode}
        onReset={resetWorkspace}
      />

      <main className="rfa-layout">
        <WorkflowRail
          activeStage={activeStage}
          completedStages={completedStages}
          firerInfo={firerInfo}
          onFirerInfoChange={setFirerInfo}
        />

        <section className="rfa-workspace">
          <div className="rfa-workspace-head">
            <div>
              <span className="rfa-eyebrow">TARGET WORKSPACE</span>
              <h2>
                {imageSrc
                  ? 'Analyze the current target'
                  : 'Start with a target image'}
              </h2>
            </div>

            {imageSrc && (
              <div className="rfa-workspace-badges">
                <span className={isCalibrated ? 'is-ok' : ''}>
                  {isCalibrated ? 'CALIBRATED' : 'NOT CALIBRATED'}
                </span>
                <span>{bulletCount} / 5 SHOTS</span>
              </div>
            )}
          </div>

          {!imageSrc ? (
            <div className="rfa-source-stage">
              <div className="rfa-source-tabs">
                <button
                  type="button"
                  className={inputMode === 'upload' ? 'is-active' : ''}
                  onClick={() => setInputMode('upload')}
                >
                  Upload Target
                </button>
                <button
                  type="button"
                  className={inputMode === 'camera' ? 'is-active' : ''}
                  onClick={() => setInputMode('camera')}
                >
                  Camera / CCTV
                </button>
              </div>

              {inputMode === 'upload' ? (
                <label
                  className="rfa-drop-zone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0];
                    if (file) readImageFile(file);
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) readImageFile(file);
                    }}
                  />
                  <div className="rfa-drop-icon">◎</div>
                  <strong>Drop target image here</strong>
                  <span>or click to browse JPG / PNG</span>
                </label>
              ) : (
                <CameraCapture onCapture={setTargetImage} />
              )}
            </div>
          ) : (
            <>
              <div className="rfa-command-bar">
                <button
                  type="button"
                  className={
                    currentMode === 'calibration'
                      ? 'command is-active'
                      : 'command'
                  }
                  onClick={startCalibration}
                >
                  <span>01</span>
                  Calibrate
                </button>

                <button
                  type="button"
                  className={
                    markingMode === 'manual' && currentMode === 'bullet'
                      ? 'command is-active'
                      : 'command'
                  }
                  disabled={!isCalibrated}
                  onClick={startManualMarking}
                >
                  <span>02</span>
                  Manual Mark
                </button>

                <button
                  type="button"
                  className={
                    markingMode === 'auto'
                      ? 'command command-auto is-active'
                      : 'command command-auto'
                  }
                  disabled={!isCalibrated || mlState === 'running'}
                  onClick={runAutoDetection}
                >
                  <span>AI</span>
                  {mlState === 'running' ? 'Detecting…' : 'Auto Detect'}
                </button>

                <button
                  type="button"
                  className={
                    currentMode === 'poa'
                      ? 'command is-active'
                      : 'command'
                  }
                  disabled={!isCalibrated || bulletCount !== 5}
                  onClick={() => setCurrentMode('poa')}
                >
                  <span>03</span>
                  Mark POA
                </button>

                <div className="rfa-command-spacer" />

                <button
                  type="button"
                  className="rfa-compact-command"
                  onClick={undoLastBullet}
                  disabled={!bulletCount}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="rfa-compact-command"
                  onClick={clearBullets}
                  disabled={!bulletCount}
                >
                  Clear Shots
                </button>
                <button
                  type="button"
                  className="rfa-compact-command"
                  onClick={freezeCurrentGroup}
                  disabled={bulletCount !== 5}
                >
                  Next Group
                </button>
                {overlayMarkers.length > 0 && (
                  <button
                    type="button"
                    className="rfa-compact-command"
                    onClick={() => setShowOverlay((current) => !current)}
                  >
                    {showOverlay ? 'Hide Previous' : 'Show Previous'}
                  </button>
                )}
                <button
                  type="button"
                  className="rfa-compact-command is-danger"
                  onClick={resetWorkspace}
                >
                  Change Target
                </button>
              </div>

              {mlState === 'error' && (
                <div className="rfa-alert is-error">
                  <strong>Auto Detect:</strong> {mlInfo}
                </div>
              )}

              {mlState === 'success' && (
                <div className="rfa-alert is-success">
                  <strong>Auto Detect complete.</strong> {mlInfo}. Click any
                  incorrect ML mark to remove it, or choose Manual Mark to add a
                  missed shot.
                </div>
              )}

              <div className="rfa-canvas-wrap">
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
                  groupingPair={results?.groupingPixelPair || null}
                  mpiPoint={mpiPoint}
                  poaPoint={poaMarker}
                />
              </div>

              <div className="rfa-workspace-foot">
                <div className="rfa-legend">
                  <span><i className="manual" /> Manual shot</span>
                  <span><i className="ml" /> ML detected</span>
                  <span><i className="poa" /> Point of aim</span>
                  <span><i className="cal" /> Calibration</span>
                </div>
                <div className="rfa-tip">
                  Tip: zoom in for precise manual correction. Click a mark to
                  remove it.
                </div>
              </div>
            </>
          )}
        </section>

        <AnalysisPanel
          results={results}
          unit={unit}
          markingMode={markingMode}
          mlInfo={markingMode === 'auto' ? mlInfo : undefined}
          onUnitChange={setUnit}
          onSave={handleSave}
          onReport={handleReport}
          canSave={canSave}
        />
      </main>
    </div>
  );
}
