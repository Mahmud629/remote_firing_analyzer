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
import {
  detectBulletHoles,
  DetectorNotConfiguredError,
} from '@/lib/ml/detector';
import {
  detectOuterTargetCircle,
  mapNormalizedPointToSource,
  normalizeTargetImage,
} from '@/lib/vision/autoCalibration';
import {
  getDatabaseMode,
  saveSessionToCloud,
} from '@/lib/db/firebase';
import { generateFiringReport } from '@/lib/exportReport';
import { useSessions } from '@/hooks/useSessions';
import { ZEROING_PROFILE } from '@/lib/config';
import type {
  DetectedCircle,
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
type CalibrationState = 'idle' | 'running' | 'success' | 'error';
type SourceType = 'upload' | 'camera';

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
  const [sourceType, setSourceType] = useState<SourceType>('upload');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [markers, setMarkers] = useState<MarkedPoint[]>([]);
  const [overlayMarkers, setOverlayMarkers] = useState<MarkedPoint[]>([]);
  const [showOverlay, setShowOverlay] = useState(true);
  const [currentMode, setCurrentMode] = useState<MarkerType | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [scalePixels, setScalePixels] = useState<number | null>(null);
  const [scaleInches, setScaleInches] = useState<number | null>(null);
  const [calibrationCircle, setCalibrationCircle] =
    useState<DetectedCircle | null>(null);
  const [calibrationState, setCalibrationState] =
    useState<CalibrationState>('idle');
  const [calibrationInfo, setCalibrationInfo] = useState('');
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

  const { sessions, saveSession } = useSessions();
  const databaseMode = getDatabaseMode();

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
    setCalibrationCircle(null);
    setCalibrationState('idle');
    setCalibrationInfo('');
    setResults(null);
    setMarkingMode('manual');
    setMlState('idle');
    setMlInfo('');
    setWorkspaceSaved(false);
  }, []);

  const resetWorkspace = useCallback(() => {
    setImageSrc(null);
    resetTargetState();
  }, [resetTargetState]);

  const detectBulletsForImage = useCallback(
    async (
      image: string,
      circle: DetectedCircle,
      baseMarkers: MarkedPoint[],
    ) => {
      setMarkingMode('auto');
      setCurrentMode(null);
      setMlState('running');
      setMlInfo('Normalizing target and running ML model…');
      setWorkspaceSaved(false);

      try {
        const normalized = await normalizeTargetImage(image, circle);
        const detected = await detectBulletHoles(normalized.imageDataUrl);

        const mlMarkers: MarkedPoint[] = detected.detections.map(
          (detection, index) => {
            const sourcePoint = mapNormalizedPointToSource(
              detection,
              normalized.transform,
            );

            return {
              ...sourcePoint,
              id: markerId('ml-' + (index + 1)),
              type: 'bullet',
              source: 'ml',
              confidence: detection.confidence,
            };
          },
        );

        const next = [
          ...baseMarkers.filter((marker) => marker.type !== 'bullet'),
          ...mlMarkers,
        ];

        setMarkers(next);
        setMlState('success');
        setMlInfo(
          String(mlMarkers.length) +
            ' detected' +
            (detected.inferenceMs ? ' · ' + detected.inferenceMs + ' ms' : ''),
        );
        analyze(
          next,
          circle.radiusPixels,
          circle.physicalRadiusInches,
        );
      } catch (error) {
        if (error instanceof DetectorNotConfiguredError) {
          setMarkingMode('manual');
          setMlState('idle');
          setMlInfo('ML service is not configured yet. Manual marking remains available.');
          setCurrentMode('bullet');
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Automatic detection failed.';
        setMlState('error');
        setMlInfo(message);
      }
    },
    [analyze],
  );

  const processTargetImage = useCallback(
    async (
      image: string,
      source: SourceType,
      detectBulletsAfterCalibration: boolean,
    ) => {
      resetTargetState();
      setImageSrc(image);
      setSourceType(source);
      setCalibrationState('running');
      setCalibrationInfo('Detecting outer target circle…');

      try {
        const circle = await detectOuterTargetCircle(image);

        setCalibrationCircle(circle);
        setScalePixels(circle.radiusPixels);
        setScaleInches(circle.physicalRadiusInches);
        setCalibrationState('success');
        setCalibrationInfo(
          'Outer circle detected · radius ' +
            circle.radiusPixels.toFixed(1) +
            ' px · confidence ' +
            Math.round(circle.confidence * 100) +
            '%',
        );

        if (detectBulletsAfterCalibration) {
          await detectBulletsForImage(image, circle, []);
        } else {
          setCurrentMode('bullet');
        }
      } catch (error) {
        setCalibrationState('error');
        setCalibrationInfo(
          error instanceof Error
            ? error.message
            : 'Automatic calibration failed.',
        );
        setCurrentMode('calibration');
      }
    },
    [detectBulletsForImage, resetTargetState],
  );

  const rerunAutoCalibration = useCallback(async () => {
    if (!imageSrc) return;

    setCalibrationState('running');
    setCalibrationInfo('Re-detecting outer target circle…');

    try {
      const circle = await detectOuterTargetCircle(imageSrc);
      setCalibrationCircle(circle);
      setScalePixels(circle.radiusPixels);
      setScaleInches(circle.physicalRadiusInches);
      setCalibrationState('success');
      setCalibrationInfo(
        'Outer circle detected · radius ' +
          circle.radiusPixels.toFixed(1) +
          ' px · confidence ' +
          Math.round(circle.confidence * 100) +
          '%',
      );
      analyze(
        markers,
        circle.radiusPixels,
        circle.physicalRadiusInches,
      );
    } catch (error) {
      setCalibrationState('error');
      setCalibrationInfo(
        error instanceof Error
          ? error.message
          : 'Automatic calibration failed.',
      );
    }
  }, [analyze, imageSrc, markers]);

  const readImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          void processTargetImage(reader.result, 'upload', false);
        }
      };
      reader.readAsDataURL(file);
    },
    [processTargetImage],
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
        if (bulletCount >= ZEROING_PROFILE.requiredShots) {
          return;
        }

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
          'Automatic calibration failed. Enter the actual distance between these two fallback points in inches:',
          '1',
        );
        const knownInches = Number(entered);

        if (!Number.isFinite(knownInches) || knownInches <= 0) {
          setMarkers(
            next.filter((marker) => marker.id !== nextCalibrationMarker.id),
          );
          return;
        }

        const pixels = calculateDistance(calibration[0], calibration[1]);
        if (pixels <= 0) {
          alert('Calibration points must be different.');
          return;
        }

        setCalibrationCircle(null);
        setScalePixels(pixels);
        setScaleInches(knownInches);
        setCalibrationState('success');
        setCalibrationInfo('Manual fallback calibration active.');
        setCurrentMode('bullet');
        analyze(next, pixels, knownInches);
      }
    },
    [analyze, bulletCount, calibrationMarkers.length, markers],
  );

  const handleMarkerRemove = useCallback(
    (id: string) => {
      if (id.startsWith('overlay-')) return;

      const removed = markers.find((marker) => marker.id === id);
      const next = markers.filter((marker) => marker.id !== id);

      setMarkers(next);
      setWorkspaceSaved(false);

      if (removed?.type === 'calibration' && !calibrationCircle) {
        setScalePixels(null);
        setScaleInches(null);
        setResults(null);
        setCalibrationState('error');
        setCalibrationInfo('Fallback calibration is incomplete.');
        return;
      }

      analyze(next);
    },
    [analyze, calibrationCircle, markers],
  );

  const startManualCalibration = () => {
    setMarkers((current) =>
      current.filter((marker) => marker.type !== 'calibration'),
    );
    setCalibrationCircle(null);
    setScalePixels(null);
    setScaleInches(null);
    setResults(null);
    setCalibrationState('idle');
    setCalibrationInfo('Manual fallback: mark two known points.');
    setCurrentMode('calibration');
  };

  const startManualMarking = () => {
    setMarkingMode('manual');
    setMlState('idle');
    setMlInfo('');
    setCurrentMode('bullet');
  };

  const runAutoDetection = useCallback(async () => {
    if (!imageSrc || !calibrationCircle) return;
    await detectBulletsForImage(imageSrc, calibrationCircle, markers);
  }, [
    calibrationCircle,
    detectBulletsForImage,
    imageSrc,
    markers,
  ]);

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
    if (bulletCount !== ZEROING_PROFILE.requiredShots) return;

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
      calibration: calibrationCircle,
      sourceType,
      savedAt: new Date().toISOString(),
      targetImageBase64: canvasRef.current?.captureCanvas() || undefined,
    };
  }, [
    calibrationCircle,
    firerInfo,
    markingMode,
    results,
    sourceType,
  ]);

  const handleSave = async () => {
    const session = currentSession();
    if (!session) return;

    const localSaved = saveSession(session);
    if (!localSaved) {
      alert('Session could not be saved in this browser.');
      return;
    }

    setWorkspaceSaved(true);

    try {
      const cloud = await saveSessionToCloud(session);
      if (cloud.mode === 'cloud' && cloud.saved) {
        alert('Session and individual record saved to the database.');
      } else {
        alert('Session saved locally. Configure Firebase to enable the central database.');
      }
    } catch (error) {
      console.error(error);
      alert('Session saved locally, but the cloud database save failed.');
    }
  };

  const handleReport = () => {
    const session = currentSession();
    if (session) generateFiringReport(session);
  };

  const canSave = Boolean(
    results &&
      bulletCount === ZEROING_PROFILE.requiredShots &&
      poaMarker &&
      isCalibrated,
  );

  const activeStage: WorkflowStage = useMemo(() => {
    if (!imageSrc) return 'source';
    if (!isCalibrated) return 'calibration';
    if (bulletCount !== ZEROING_PROFILE.requiredShots) return 'marking';
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
    if (bulletCount === ZEROING_PROFILE.requiredShots) stages.push('marking');
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
        databaseMode={databaseMode}
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
                  ? 'Auto-calibrated target analysis'
                  : 'Start with a target image'}
              </h2>
            </div>

            {imageSrc && (
              <div className="rfa-workspace-badges">
                <span className={isCalibrated ? 'is-ok' : ''}>
                  {calibrationState === 'running'
                    ? 'CALIBRATING…'
                    : isCalibrated
                      ? calibrationCircle
                        ? 'AUTO CALIBRATED'
                        : 'MANUAL CALIBRATED'
                      : 'NOT CALIBRATED'}
                </span>
                <span>{bulletCount} / {ZEROING_PROFILE.requiredShots} SHOTS</span>
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
                  <span>
                    Outer-circle calibration starts automatically after loading.
                  </span>
                </label>
              ) : (
                <CameraCapture
                  onCapture={(image) => {
                    void processTargetImage(image, 'camera', true);
                  }}
                />
              )}
            </div>
          ) : (
            <>
              <div className="rfa-command-bar">
                <button
                  type="button"
                  className="command"
                  disabled={calibrationState === 'running'}
                  onClick={() => void rerunAutoCalibration()}
                >
                  <span>01</span>
                  Re-detect Circle
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
                  disabled={
                    !calibrationCircle ||
                    mlState === 'running'
                  }
                  onClick={() => void runAutoDetection()}
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
                  disabled={
                    !isCalibrated ||
                    bulletCount !== ZEROING_PROFILE.requiredShots
                  }
                  onClick={() => setCurrentMode('poa')}
                >
                  <span>03</span>
                  Mark POA
                </button>

                <div className="rfa-command-spacer" />

                <button
                  type="button"
                  className="rfa-compact-command"
                  onClick={startManualCalibration}
                >
                  Manual Cal
                </button>
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
                  disabled={
                    bulletCount !== ZEROING_PROFILE.requiredShots
                  }
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

              {calibrationState === 'running' && (
                <div className="rfa-alert">
                  <strong>Auto Calibration:</strong> {calibrationInfo}
                </div>
              )}

              {calibrationState === 'success' && calibrationInfo && (
                <div className="rfa-alert is-success">
                  <strong>Calibration complete.</strong> {calibrationInfo}
                </div>
              )}

              {calibrationState === 'error' && (
                <div className="rfa-alert is-error">
                  <strong>Auto Calibration:</strong> {calibrationInfo}
                  {' '}Use Re-detect Circle or Manual Cal.
                </div>
              )}

              {mlState === 'error' && (
                <div className="rfa-alert is-error">
                  <strong>Auto Detect:</strong> {mlInfo}
                </div>
              )}

              {mlState === 'success' && (
                <div className="rfa-alert is-success">
                  <strong>Auto Detect complete.</strong> {mlInfo}. Click an
                  incorrect ML mark to remove it, or choose Manual Mark to add a
                  missed shot.
                </div>
              )}

              {mlState === 'idle' && mlInfo && (
                <div className="rfa-alert">
                  <strong>Auto Detect:</strong> {mlInfo}
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
                  calibrationCircle={calibrationCircle}
                />
              </div>

              <div className="rfa-workspace-foot">
                <div className="rfa-legend">
                  <span><i className="manual" /> Manual shot</span>
                  <span><i className="ml" /> ML detected</span>
                  <span><i className="poa" /> Point of aim</span>
                  <span><i className="cal" /> Auto-cal circle</span>
                </div>
                <div className="rfa-tip">
                  Camera capture: circle calibration runs first, then ML detection.
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
          onSave={() => void handleSave()}
          onReport={handleReport}
          canSave={canSave}
        />
      </main>
    </div>
  );
}
