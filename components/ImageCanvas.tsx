'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  DetectedCircle,
  MarkedPoint,
  MarkerType,
  Point,
} from '@/types';

export interface DisplayMarker extends MarkedPoint {
  readonlyMarker?: boolean;
  displayColor?: string;
  displayOpacity?: number;
  displayLabel?: string;
}

export interface ImageCanvasHandle {
  captureCanvas: () => string;
}

interface ImageCanvasProps {
  imageSrc: string | null;
  markers: DisplayMarker[];
  onMarkerAdd: (point: Point, type: MarkerType) => void;
  onMarkerRemove: (id: string) => void;
  onMarkerHover: (id: string | null) => void;
  currentMode: MarkerType | null;
  hoveredMarkerId: string | null;
  scalePixels: number | null;
  groupingPair?: [Point, Point] | null;
  mpiPoint?: Point | null;
  poaPoint?: Point | null;
  calibrationCircle?: DetectedCircle | null;
}

type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const ImageCanvas = forwardRef<ImageCanvasHandle, ImageCanvasProps>(
  function ImageCanvas(
    {
      imageSrc,
      markers,
      onMarkerAdd,
      onMarkerRemove,
      onMarkerHover,
      currentMode,
      hoveredMarkerId,
      groupingPair,
      mpiPoint,
      calibrationCircle,
    },
    ref,
  ) {
    const imageRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pointerRef = useRef<{
      id: number;
      x: number;
      y: number;
      panX: number;
      panY: number;
      moved: boolean;
    } | null>(null);

    const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
    const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    useEffect(() => {
      const element = containerRef.current;
      if (!element) return;

      const update = () => {
        const rect = element.getBoundingClientRect();
        setContainerSize({
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        });
      };

      update();
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }, [imageSrc]);

    const baseBox = useMemo<Box>(() => {
      const imageAspect = naturalSize.width / naturalSize.height;
      const containerAspect = containerSize.width / containerSize.height;

      if (imageAspect > containerAspect) {
        const width = containerSize.width;
        const height = width / imageAspect;
        return {
          left: 0,
          top: (containerSize.height - height) / 2,
          width,
          height,
        };
      }

      const height = containerSize.height;
      const width = height * imageAspect;
      return {
        left: (containerSize.width - width) / 2,
        top: 0,
        width,
        height,
      };
    }, [containerSize, naturalSize]);

    const renderBox = useMemo<Box>(() => {
      const width = baseBox.width * zoom;
      const height = baseBox.height * zoom;
      const centerX = baseBox.left + baseBox.width / 2 + pan.x;
      const centerY = baseBox.top + baseBox.height / 2 + pan.y;

      return {
        left: centerX - width / 2,
        top: centerY - height / 2,
        width,
        height,
      };
    }, [baseBox, pan, zoom]);

    const toDisplay = (point: Point) => ({
      x: renderBox.left + (point.x / naturalSize.width) * renderBox.width,
      y: renderBox.top + (point.y / naturalSize.height) * renderBox.height,
    });

    const toImagePoint = (clientX: number, clientY: number): Point | null => {
      const container = containerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      if (
        x < renderBox.left ||
        y < renderBox.top ||
        x > renderBox.left + renderBox.width ||
        y > renderBox.top + renderBox.height
      ) {
        return null;
      }

      return {
        x: ((x - renderBox.left) / renderBox.width) * naturalSize.width,
        y: ((y - renderBox.top) / renderBox.height) * naturalSize.height,
      };
    };

    const markerColor = (marker: DisplayMarker) => {
      if (marker.displayColor) return marker.displayColor;
      if (marker.type === 'calibration') return '#a78bfa';
      if (marker.type === 'poa') return '#22c55e';
      if (marker.source === 'ml') return '#22d3ee';
      return '#fb923c';
    };

    const bulletLabels = useMemo(() => {
      const map = new Map<string, number>();
      let index = 0;
      markers.forEach((marker) => {
        if (marker.type === 'bullet') {
          index += 1;
          map.set(marker.id, index);
        }
      });
      return map;
    }, [markers]);

    const drawMarker = (
      context: CanvasRenderingContext2D,
      marker: DisplayMarker,
    ) => {
      const color = markerColor(marker);
      context.save();
      context.globalAlpha = marker.displayOpacity ?? 1;
      context.strokeStyle = color;
      context.fillStyle = color;

      if (marker.type === 'bullet') {
        context.lineWidth = 2;
        context.beginPath();
        context.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.arc(marker.x, marker.y, 2.2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.arc(marker.x, marker.y, marker.type === 'poa' ? 10 : 8, 0, Math.PI * 2);
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = '#ffffff';
        context.stroke();
      }

      const label =
        marker.displayLabel ||
        (marker.type === 'bullet'
          ? String(bulletLabels.get(marker.id) || '')
          : marker.type === 'poa'
            ? 'POA'
            : 'CAL');

      context.globalAlpha = 1;
      context.font = '700 12px Arial';
      context.textAlign = 'center';
      context.fillStyle = '#ffffff';
      context.strokeStyle = '#0f172a';
      context.lineWidth = 3;
      context.strokeText(label, marker.x, marker.y - 15);
      context.fillText(label, marker.x, marker.y - 15);
      context.restore();
    };

    const drawCalibrationCircle = (context: CanvasRenderingContext2D) => {
      if (!calibrationCircle) return;
      context.save();
      context.strokeStyle = '#22d3ee';
      context.lineWidth = Math.max(3, naturalSize.width / 500);
      context.setLineDash([14, 10]);
      context.beginPath();
      context.arc(
        calibrationCircle.center.x,
        calibrationCircle.center.y,
        calibrationCircle.radiusPixels,
        0,
        Math.PI * 2,
      );
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#22d3ee';
      context.font = '700 16px Arial';
      context.textAlign = 'center';
      context.fillText(
        'AUTO CAL ' +
          calibrationCircle.physicalRadiusInches +
          '" R',
        calibrationCircle.center.x,
        Math.max(24, calibrationCircle.center.y - calibrationCircle.radiusPixels + 28),
      );
      context.restore();
    };

    useImperativeHandle(ref, () => ({
      captureCanvas: () => {
        if (!imageSrc || !imageRef.current) return '';

        const canvas = document.createElement('canvas');
        canvas.width = naturalSize.width;
        canvas.height = naturalSize.height;
        const context = canvas.getContext('2d');
        if (!context) return '';

        context.drawImage(
          imageRef.current,
          0,
          0,
          naturalSize.width,
          naturalSize.height,
        );

        drawCalibrationCircle(context);
        markers.forEach((marker) => drawMarker(context, marker));

        if (groupingPair) {
          context.save();
          context.strokeStyle = '#f59e0b';
          context.lineWidth = 3;
          context.beginPath();
          context.moveTo(groupingPair[0].x, groupingPair[0].y);
          context.lineTo(groupingPair[1].x, groupingPair[1].y);
          context.stroke();
          context.restore();
        }

        if (mpiPoint) {
          context.save();
          context.strokeStyle = '#fde047';
          context.lineWidth = 4;
          const size = 16;
          context.beginPath();
          context.moveTo(mpiPoint.x - size, mpiPoint.y);
          context.lineTo(mpiPoint.x + size, mpiPoint.y);
          context.moveTo(mpiPoint.x, mpiPoint.y - size);
          context.lineTo(mpiPoint.x, mpiPoint.y + size);
          context.stroke();
          context.restore();
        }

        return canvas.toDataURL('image/jpeg', 0.94);
      },
    }));

    const zoomBy = (amount: number) => {
      setZoom((current) => {
        const next = Math.min(5, Math.max(1, current + amount));
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    const resetView = () => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (zoom <= 1) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
        moved: false,
      };
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.id !== event.pointerId) return;

      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;

      if (Math.abs(dx) + Math.abs(dy) > 4) pointer.moved = true;
      setPan({ x: pointer.panX + dx, y: pointer.panY + dy });
    };

    const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.id !== event.pointerId) return;

      if (!pointer.moved && currentMode && imageSrc) {
        const point = toImagePoint(event.clientX, event.clientY);
        if (point) onMarkerAdd(point, currentMode);
      }

      pointerRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer may already be released by the browser.
      }
    };

    const clickToAdd = (event: React.MouseEvent<HTMLDivElement>) => {
      if (zoom > 1 || !currentMode || !imageSrc) return;
      const point = toImagePoint(event.clientX, event.clientY);
      if (point) onMarkerAdd(point, currentMode);
    };

    return (
      <div className="rfa-canvas-shell">
        <div className="rfa-canvas-toolbar">
          <div className="rfa-canvas-mode">
            {currentMode
              ? currentMode === 'bullet'
                ? 'MARK BULLETS'
                : currentMode === 'poa'
                  ? 'MARK POA'
                  : 'MANUAL CALIBRATION'
              : calibrationCircle
                ? 'AUTO CALIBRATED'
                : 'REVIEW TARGET'}
          </div>
          <button type="button" onClick={() => zoomBy(-0.25)} aria-label="Zoom out">
            −
          </button>
          <span>{zoom.toFixed(2)}×</span>
          <button type="button" onClick={() => zoomBy(0.25)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={resetView}>
            Fit
          </button>
        </div>

        <div
          ref={containerRef}
          className={'rfa-canvas ' + (zoom > 1 ? 'is-pannable' : '')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pointerRef.current = null;
          }}
          onClick={clickToAdd}
          onWheel={(event) => {
            event.preventDefault();
            zoomBy(event.deltaY < 0 ? 0.15 : -0.15);
          }}
        >
          {imageSrc && (
            <>
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Target"
                draggable={false}
                className="rfa-target-image"
                style={{
                  left: renderBox.left,
                  top: renderBox.top,
                  width: renderBox.width,
                  height: renderBox.height,
                }}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setNaturalSize({
                    width: img.naturalWidth || 1,
                    height: img.naturalHeight || 1,
                  });
                }}
              />

              {calibrationCircle && (() => {
                const center = toDisplay(calibrationCircle.center);
                const displayRadius =
                  (calibrationCircle.radiusPixels / naturalSize.width) *
                  renderBox.width;
                return (
                  <svg className="rfa-overlay-svg">
                    <circle
                      cx={center.x}
                      cy={center.y}
                      r={displayRadius}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="3"
                      strokeDasharray="10 8"
                    />
                    <line
                      x1={center.x - 12}
                      y1={center.y}
                      x2={center.x + 12}
                      y2={center.y}
                      stroke="#22d3ee"
                      strokeWidth="2"
                    />
                    <line
                      x1={center.x}
                      y1={center.y - 12}
                      x2={center.x}
                      y2={center.y + 12}
                      stroke="#22d3ee"
                      strokeWidth="2"
                    />
                    <text
                      x={center.x}
                      y={Math.max(24, center.y - displayRadius + 24)}
                      fill="#a5f3fc"
                      fontSize="12"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      AUTO CAL {calibrationCircle.physicalRadiusInches}" R · {Math.round(calibrationCircle.confidence * 100)}%
                    </text>
                  </svg>
                );
              })()}

              {markers.map((marker) => {
                const pos = toDisplay(marker);
                const color = markerColor(marker);
                const bulletNumber = bulletLabels.get(marker.id);
                const label =
                  marker.displayLabel ||
                  (marker.type === 'bullet'
                    ? String(bulletNumber || '')
                    : marker.type === 'poa'
                      ? 'P'
                      : 'C');

                return (
                  <button
                    key={marker.id}
                    type="button"
                    className={[
                      'rfa-marker',
                      'marker-' + marker.type,
                      marker.source === 'ml' ? 'is-ml' : '',
                      hoveredMarkerId === marker.id ? 'is-hovered' : '',
                    ].join(' ')}
                    style={{
                      left: pos.x,
                      top: pos.y,
                      borderColor: color,
                      color,
                      opacity: marker.displayOpacity ?? 1,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!marker.readonlyMarker) onMarkerRemove(marker.id);
                    }}
                    onMouseEnter={() => onMarkerHover(marker.id)}
                    onMouseLeave={() => onMarkerHover(null)}
                    title={
                      marker.confidence !== undefined
                        ? 'ML confidence: ' + Math.round(marker.confidence * 100) + '%'
                        : 'Click to remove'
                    }
                  >
                    <span>{label}</span>
                  </button>
                );
              })}

              {groupingPair && (
                <svg className="rfa-overlay-svg">
                  {(() => {
                    const start = toDisplay(groupingPair[0]);
                    const end = toDisplay(groupingPair[1]);
                    return (
                      <line
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke="#f59e0b"
                        strokeWidth="3"
                      />
                    );
                  })()}
                </svg>
              )}

              {mpiPoint && (
                <svg className="rfa-overlay-svg">
                  {(() => {
                    const point = toDisplay(mpiPoint);
                    return (
                      <>
                        <line
                          x1={point.x - 15}
                          y1={point.y}
                          x2={point.x + 15}
                          y2={point.y}
                          stroke="#fde047"
                          strokeWidth="4"
                        />
                        <line
                          x1={point.x}
                          y1={point.y - 15}
                          x2={point.x}
                          y2={point.y + 15}
                          stroke="#fde047"
                          strokeWidth="4"
                        />
                      </>
                    );
                  })()}
                </svg>
              )}
            </>
          )}
        </div>
      </div>
    );
  },
);
