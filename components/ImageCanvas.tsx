'use client';

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  MouseEvent,
  useState,
} from 'react';
import { Point, MarkedPoint } from '@/types';

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
  onMarkerAdd: (point: Point, type: 'bullet' | 'poa' | 'calibration') => void;
  onMarkerRemove: (id: string) => void;
  onMarkerHover: (id: string | null) => void;
  currentMode: 'bullet' | 'poa' | 'calibration' | null;
  hoveredMarkerId: string | null;
  scalePixels: number | null;
  groupingPair?: [Point, Point] | null;
  mpiPoint?: Point | null;
  poaPoint?: Point | null;
}

type RenderBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const ImageCanvas = forwardRef<ImageCanvasHandle, ImageCanvasProps>(
  (
    {
      imageSrc,
      markers,
      onMarkerAdd,
      onMarkerRemove,
      onMarkerHover,
      currentMode,
      groupingPair,
      mpiPoint,
    },
    ref
  ) => {
    const imgRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });

    // Zoom + pan states
    const [zoom, setZoom] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragMoved, setDragMoved] = useState(false);

    const resetView = () => {
      setZoom(1);
      setPanX(0);
      setPanY(0);
    };

    const zoomIn = () => {
      setZoom((prev) => Math.min(prev + 0.2, 5));
    };

    const zoomOut = () => {
      setZoom((prev) => {
        const next = Math.max(prev - 0.2, 1);
        if (next === 1) {
          setPanX(0);
          setPanY(0);
        }
        return next;
      });
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom((prev) => Math.min(prev + 0.1, 5));
      } else {
        setZoom((prev) => {
          const next = Math.max(prev - 0.1, 1);
          if (next === 1) {
            setPanX(0);
            setPanY(0);
          }
          return next;
        });
      }
    };

    const getBaseImageBox = (): RenderBox | null => {
      const container = containerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width;
      const containerHeight = rect.height;

      const naturalWidth = naturalSize.width;
      const naturalHeight = naturalSize.height;

      if (!naturalWidth || !naturalHeight || !containerWidth || !containerHeight) {
        return null;
      }

      const imageAspect = naturalWidth / naturalHeight;
      const containerAspect = containerWidth / containerHeight;

      let width = 0;
      let height = 0;
      let left = 0;
      let top = 0;

      if (imageAspect > containerAspect) {
        width = containerWidth;
        height = containerWidth / imageAspect;
        left = 0;
        top = (containerHeight - height) / 2;
      } else {
        height = containerHeight;
        width = containerHeight * imageAspect;
        top = 0;
        left = (containerWidth - width) / 2;
      }

      return { left, top, width, height };
    };

    const getRenderedImageBox = (): RenderBox | null => {
      const base = getBaseImageBox();
      if (!base) return null;

      const zoomedWidth = base.width * zoom;
      const zoomedHeight = base.height * zoom;

      const centerX = base.left + base.width / 2 + panX;
      const centerY = base.top + base.height / 2 + panY;

      return {
        width: zoomedWidth,
        height: zoomedHeight,
        left: centerX - zoomedWidth / 2,
        top: centerY - zoomedHeight / 2,
      };
    };

    const getImagePointFromClick = (e: MouseEvent<HTMLDivElement>): Point | null => {
      const container = containerRef.current;
      const renderBox = getRenderedImageBox();
      if (!container || !renderBox) return null;

      const containerRect = container.getBoundingClientRect();
      const localX = e.clientX - containerRect.left;
      const localY = e.clientY - containerRect.top;

      if (
        localX < renderBox.left ||
        localY < renderBox.top ||
        localX > renderBox.left + renderBox.width ||
        localY > renderBox.top + renderBox.height
      ) {
        return null;
      }

      const xInImage = localX - renderBox.left;
      const yInImage = localY - renderBox.top;

      return {
        x: (xInImage / renderBox.width) * naturalSize.width,
        y: (yInImage / renderBox.height) * naturalSize.height,
      };
    };

    const toDisplayPosition = (point: Point) => {
      const renderBox = getRenderedImageBox();
      if (!renderBox) return { x: 0, y: 0 };

      return {
        x: renderBox.left + (point.x / naturalSize.width) * renderBox.width,
        y: renderBox.top + (point.y / naturalSize.height) * renderBox.height,
      };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (zoom <= 1) return;
      setIsDragging(true);
      setDragMoved(false);
      setDragStart({
        x: e.clientX - panX,
        y: e.clientY - panY,
      });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || zoom <= 1) return;
      setDragMoved(true);
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleCanvasClick = (e: MouseEvent<HTMLDivElement>) => {
      if (dragMoved) return;
      if (!currentMode || !imageSrc) return;
      const point = getImagePointFromClick(e);
      if (!point) return;
      onMarkerAdd(point, currentMode);
    };

    const getMarkerColor = (marker: DisplayMarker) => {
      if (marker.displayColor) return marker.displayColor;
      if (marker.type === 'calibration') return '#a855f7'; // purple
      if (marker.type === 'poa') return '#2563eb'; // blue
      return '#22c55e'; // green
    };

    const drawMarkerOnCanvas = (
      ctx: CanvasRenderingContext2D,
      marker: DisplayMarker,
      index: number
    ) => {
      const color = getMarkerColor(marker);
      const opacity = marker.displayOpacity ?? 1;

      ctx.save();
      ctx.globalAlpha = opacity;

      if (marker.type === 'bullet') {
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      if (marker.type === 'poa') {
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      if (marker.type === 'calibration') {
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(marker.displayLabel || String(index + 1), marker.x, marker.y - 14);

      ctx.restore();
    };

    useImperativeHandle(ref, () => ({
      captureCanvas: () => {
        if (!imageSrc || !imgRef.current) return '';

        const canvas = captureCanvasRef.current || document.createElement('canvas');
        captureCanvasRef.current = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        canvas.width = naturalSize.width;
        canvas.height = naturalSize.height;

        ctx.drawImage(imgRef.current, 0, 0, naturalSize.width, naturalSize.height);

        markers.forEach((marker, index) => {
          drawMarkerOnCanvas(ctx, marker, index);
        });

        if (groupingPair) {
          ctx.save();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(groupingPair[0].x, groupingPair[0].y);
          ctx.lineTo(groupingPair[1].x, groupingPair[1].y);
          ctx.stroke();
          ctx.restore();
        }

        if (mpiPoint) {
          ctx.save();
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 4;
          const size = 14;
          ctx.beginPath();
          ctx.moveTo(mpiPoint.x - size, mpiPoint.y);
          ctx.lineTo(mpiPoint.x + size, mpiPoint.y);
          ctx.moveTo(mpiPoint.x, mpiPoint.y - size);
          ctx.lineTo(mpiPoint.x, mpiPoint.y + size);
          ctx.stroke();
          ctx.restore();
        }

        return canvas.toDataURL('image/png');
      },
    }));

    return (
      <div className="relative flex-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
        {/* Controls */}
        <div className="absolute top-2 left-2 z-30 flex gap-2">
          <button
            type="button"
            onClick={zoomIn}
            className="px-3 py-1 rounded bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600"
          >
            +
          </button>
          <button
            type="button"
            onClick={zoomOut}
            className="px-3 py-1 rounded bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600"
          >
            -
          </button>
          <button
            type="button"
            onClick={resetView}
            className="px-3 py-1 rounded bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600"
          >
            Reset View
          </button>
          <div className="px-3 py-1 rounded bg-black/60 text-white text-sm">
            {zoom.toFixed(1)}x
          </div>
        </div>

        <div
          ref={containerRef}
          className={`relative w-full h-full overflow-hidden ${zoom > 1 ? 'cursor-move' : 'cursor-crosshair'}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
        >
          {imageSrc && (() => {
            const renderBox = getRenderedImageBox();

            return (
              <>
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Target"
                  className="absolute select-none pointer-events-none"
                  style={{
                    left: renderBox?.left ?? 0,
                    top: renderBox?.top ?? 0,
                    width: renderBox?.width ?? 0,
                    height: renderBox?.height ?? 0,
                  }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setNaturalSize({
                      width: img.naturalWidth || 1,
                      height: img.naturalHeight || 1,
                    });
                  }}
                  draggable={false}
                />

                {markers.map((marker, index) => {
                  const pos = toDisplayPosition(marker);
                  const color = getMarkerColor(marker);
                  const opacity = marker.displayOpacity ?? 1;

                  const circleSize =
                    marker.type === 'poa' ? 20 :
                    marker.type === 'calibration' ? 14 :
                    10;

                  return (
                    <div
                      key={marker.id}
                      className="absolute pointer-events-auto"
                      style={{
                        left: pos.x,
                        top: pos.y,
                        opacity,
                        transform: 'translate(-50%, -50%)',
                      }}
                      onMouseEnter={() => onMarkerHover(marker.id)}
                      onMouseLeave={() => onMarkerHover(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!marker.readonlyMarker) {
                          onMarkerRemove(marker.id);
                        }
                      }}
                    >
                      {marker.type === 'bullet' ? (
                        <div
                          className="absolute rounded-full"
                          style={{
                            width: circleSize,
                            height: circleSize,
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            border: `1.5px solid ${color}`,
                            background: 'transparent',
                          }}
                        >
                          <div
                            style={{
                              width: 3,
                              height: 3,
                              backgroundColor: color,
                              borderRadius: '50%',
                              position: 'absolute',
                              left: '50%',
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className="absolute flex items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white shadow-lg"
                          style={{
                            width: circleSize,
                            height: circleSize,
                            backgroundColor: color,
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          {marker.type === 'poa' ? 'P' : 'C'}
                        </div>
                      )}

                      <div
                        className="absolute text-[10px] font-bold text-white bg-black/60 px-1 rounded whitespace-nowrap"
                        style={{
                          left: '50%',
                          top: `-${circleSize / 2 + 16}px`,
                          transform: 'translateX(-50%)',
                        }}
                      >
                        {marker.displayLabel || index + 1}
                      </div>
                    </div>
                  );
                })}

                {groupingPair && (() => {
                  const p1 = toDisplayPosition(groupingPair[0]);
                  const p2 = toDisplayPosition(groupingPair[1]);
                  return (
                    <svg className="absolute inset-0 pointer-events-none w-full h-full">
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#f59e0b"
                        strokeWidth="3"
                      />
                    </svg>
                  );
                })()}

                {mpiPoint && (() => {
                  const p = toDisplayPosition(mpiPoint);
                  return (
                    <svg className="absolute inset-0 pointer-events-none w-full h-full">
                      <line
                        x1={p.x - 14}
                        y1={p.y}
                        x2={p.x + 14}
                        y2={p.y}
                        stroke="#facc15"
                        strokeWidth="4"
                      />
                      <line
                        x1={p.x}
                        y1={p.y - 14}
                        x2={p.x}
                        y2={p.y + 14}
                        stroke="#facc15"
                        strokeWidth="4"
                      />
                    </svg>
                  );
                })()}
              </>
            );
          })()}
        </div>
      </div>
    );
  }
);

ImageCanvas.displayName = 'ImageCanvas';