'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StreamPlayer from './StreamPlayer';

type CameraCaptureProps = {
  onCapture: (image: string) => void;
};

type BrowserCameraSource = {
  id: string;
  name: string;
  type: 'browser';
  deviceId: string;
};

type StreamCameraSource = {
  id: string;
  name: string;
  type: 'stream';
  streamUrl: string;
};

type CameraSource = BrowserCameraSource | StreamCameraSource;

const STREAM_SOURCES: StreamCameraSource[] = [
  { id: 'cam1', name: 'Camera 1', type: 'stream', streamUrl: 'http://localhost:8888/cam1/index.m3u8' },
  { id: 'cam2', name: 'Camera 2', type: 'stream', streamUrl: 'http://localhost:8888/cam2/index.m3u8' },
  { id: 'cam3', name: 'Camera 3', type: 'stream', streamUrl: 'http://localhost:8888/cam3/index.m3u8' },
  { id: 'cam4', name: 'Camera 4', type: 'stream', streamUrl: 'http://localhost:8888/cam4/index.m3u8' },
  { id: 'cam5', name: 'Camera 5', type: 'stream', streamUrl: 'http://localhost:8888/cam5/index.m3u8' },
  { id: 'cam6', name: 'Camera 6', type: 'stream', streamUrl: 'http://localhost:8888/cam6/index.m3u8' },
  { id: 'cam7', name: 'Camera 7', type: 'stream', streamUrl: 'http://localhost:8888/cam7/index.m3u8' },
  { id: 'cam8', name: 'Camera 8', type: 'stream', streamUrl: 'http://localhost:8888/cam8/index.m3u8' },
  { id: 'cam9', name: 'Camera 9', type: 'stream', streamUrl: 'http://localhost:8888/cam9/index.m3u8' },
  { id: 'cam10', name: 'Camera 10', type: 'stream', streamUrl: 'http://localhost:8888/cam10/index.m3u8' },
  { id: 'cam11', name: 'Camera 11', type: 'stream', streamUrl: 'http://localhost:8888/cam11/index.m3u8' },
  { id: 'cam12', name: 'Camera 12', type: 'stream', streamUrl: 'http://localhost:8888/cam12/index.m3u8' },
];

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const [browserSources, setBrowserSources] = useState<BrowserCameraSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeBrowserCameraId, setActiveBrowserCameraId] = useState<string>('');
  const [streamVideoEl, setStreamVideoEl] = useState<HTMLVideoElement | null>(null);

  const allSources = useMemo<CameraSource[]>(() => {
    return [...browserSources, ...STREAM_SOURCES];
  }, [browserSources]);

  const selectedSource = useMemo(() => {
    return allSources.find((source) => source.id === selectedSourceId) || null;
  }, [allSources, selectedSourceId]);

  const stopBrowserCamera = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }

    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
    }

    setActiveBrowserCameraId('');
  }, []);

  const loadBrowserCameras = useCallback(async () => {
    setIsLoadingSources(true);
    setError('');

    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      tempStream.getTracks().forEach((track) => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((device) => device.kind === 'videoinput');

      const mapped: BrowserCameraSource[] = videoInputs.map((device, index) => ({
        id: `browser-${device.deviceId}`,
        name: device.label || `Camera Device ${index + 1}`,
        type: 'browser',
        deviceId: device.deviceId,
      }));

      setBrowserSources(mapped);

      if (!selectedSourceId) {
        if (mapped.length > 0) {
          setSelectedSourceId(mapped[0].id);
        } else if (STREAM_SOURCES.length > 0) {
          setSelectedSourceId(STREAM_SOURCES[0].id);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Could not load camera devices. Permission may be blocked.');
      if (!selectedSourceId && STREAM_SOURCES.length > 0) {
        setSelectedSourceId(STREAM_SOURCES[0].id);
      }
    } finally {
      setIsLoadingSources(false);
    }
  }, [selectedSourceId]);

  useEffect(() => {
    loadBrowserCameras();

    return () => {
      stopBrowserCamera();
    };
  }, [loadBrowserCameras, stopBrowserCamera]);

  const startSelectedSource = useCallback(async () => {
    if (!selectedSource) {
      setError('No camera source selected.');
      return;
    }

    setError('');
    setIsStarting(true);

    try {
      if (selectedSource.type === 'browser') {
        stopBrowserCamera();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedSource.deviceId },
          },
          audio: false,
        });

        webcamStreamRef.current = stream;

        const video = webcamVideoRef.current;
        if (!video) {
          throw new Error('Video element not found.');
        }

        video.srcObject = stream;
        await video.play();

        setActiveBrowserCameraId(selectedSource.id);
      } else {
        stopBrowserCamera();
        setActiveBrowserCameraId('');
      }
    } catch (err: any) {
      console.error(err);
      setError(`Failed to start selected camera. ${err?.message ? `Error ${err.message}` : ''}`.trim());
    } finally {
      setIsStarting(false);
    }
  }, [selectedSource, stopBrowserCamera]);

  const handleCapture = useCallback(() => {
    if (!selectedSource) {
      setError('No source selected.');
      return;
    }

    let sourceVideo: HTMLVideoElement | null = null;

    if (selectedSource.type === 'browser') {
      sourceVideo = webcamVideoRef.current;
    } else {
      sourceVideo = streamVideoEl;
    }

    if (!sourceVideo) {
      setError('Video source is not ready.');
      return;
    }

    const videoWidth = sourceVideo.videoWidth;
    const videoHeight = sourceVideo.videoHeight;

    if (!videoWidth || !videoHeight) {
      setError('Video frame is not available yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Could not capture frame.');
      return;
    }

    ctx.drawImage(sourceVideo, 0, 0, videoWidth, videoHeight);

    const image = canvas.toDataURL('image/png');
    onCapture(image);
  }, [onCapture, selectedSource, streamVideoEl]);

  const handleStop = useCallback(() => {
    stopBrowserCamera();
    setError('');
  }, [stopBrowserCamera]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-2">
          Camera Source
        </label>

        <select
          value={selectedSourceId}
          onChange={(e) => setSelectedSourceId(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-700 text-white px-3 py-2 outline-none"
        >
          {browserSources.length > 0 && (
            <optgroup label="Local / Virtual Cameras">
              {browserSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </optgroup>
          )}

          <optgroup label="Network Cameras">
            {STREAM_SOURCES.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={loadBrowserCameras}
          className="px-4 py-2 rounded bg-slate-600 text-white text-sm font-semibold hover:bg-slate-500"
        >
          {isLoadingSources ? 'Refreshing...' : 'Refresh Devices'}
        </button>

        <button
          type="button"
          onClick={startSelectedSource}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500"
        >
          {isStarting ? 'Starting...' : 'Start Camera'}
        </button>
      </div>

      <div className="text-xs text-slate-400">
        Select any source from the list and click Start Camera.
      </div>

      {error && (
        <div className="rounded border border-red-700 bg-red-950/60 text-red-200 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg overflow-hidden border border-slate-700 bg-black min-h-[320px] flex items-center justify-center">
        {selectedSource?.type === 'stream' ? (
          <div className="w-full h-full">
            <StreamPlayer
              streamUrl={selectedSource.streamUrl}
              onVideoReady={setStreamVideoEl}
            />
          </div>
        ) : (
          <video
            ref={webcamVideoRef}
            autoPlay
            muted
            playsInline
            controls={false}
            className="w-full h-full object-contain bg-black"
          />
        )}
      </div>

      <div className="flex gap-2 justify-center">
        <button
          type="button"
          onClick={handleCapture}
          className="px-6 py-2 rounded bg-red-600 text-white text-sm font-bold hover:bg-red-500"
        >
          Capture
        </button>

        <button
          type="button"
          onClick={handleStop}
          className="px-6 py-2 rounded bg-slate-600 text-white text-sm font-semibold hover:bg-slate-500"
        >
          Stop
        </button>
      </div>
    </div>
  );
}