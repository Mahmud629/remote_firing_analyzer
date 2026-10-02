'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StreamPlayer, { type StreamStatus } from './StreamPlayer';
import { STREAM_BASE_URL, STREAM_CAMERA_COUNT } from '@/lib/config';

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

function buildStreamSources(): StreamCameraSource[] {
  return Array.from({ length: Math.max(0, STREAM_CAMERA_COUNT) }, (_, index) => {
    const number = index + 1;
    return {
      id: 'cam' + number,
      name: 'Range Camera ' + String(number).padStart(2, '0'),
      type: 'stream' as const,
      streamUrl: STREAM_BASE_URL + '/cam' + number + '/index.m3u8',
    };
  });
}

const STREAM_SOURCES = buildStreamSources();

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const [browserSources, setBrowserSources] = useState<BrowserCameraSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    STREAM_SOURCES[0]?.id || '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamVideoEl, setStreamVideoEl] = useState<HTMLVideoElement | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');

  const allSources = useMemo<CameraSource[]>(
    () => [...browserSources, ...STREAM_SOURCES],
    [browserSources],
  );

  const selectedSource = useMemo(
    () => allSources.find((source) => source.id === selectedSourceId) || null,
    [allSources, selectedSourceId],
  );

  const stopBrowserCamera = useCallback(() => {
    webcamStreamRef.current?.getTracks().forEach((track) => track.stop());
    webcamStreamRef.current = null;

    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
    }
  }, []);

  const discoverBrowserCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;

    setBusy(true);
    setError('');

    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      permissionStream.getTracks().forEach((track) => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          id: 'browser-' + device.deviceId,
          name: device.label || 'Local Camera ' + (index + 1),
          type: 'browser' as const,
          deviceId: device.deviceId,
        }));

      setBrowserSources(cameras);

      if (!selectedSourceId && cameras.length) {
        setSelectedSourceId(cameras[0].id);
      }
    } catch {
      setError('Local camera access is unavailable. Network cameras can still be used.');
    } finally {
      setBusy(false);
    }
  }, [selectedSourceId]);

  useEffect(() => {
    discoverBrowserCameras();
    return () => stopBrowserCamera();
  }, [discoverBrowserCameras, stopBrowserCamera]);

  const startSelectedSource = useCallback(async () => {
    if (!selectedSource) return;

    setError('');
    setBusy(true);

    try {
      if (selectedSource.type === 'stream') {
        stopBrowserCamera();
        return;
      }

      stopBrowserCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: selectedSource.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      webcamStreamRef.current = stream;
      const video = webcamVideoRef.current;

      if (!video) throw new Error('Camera preview is not available.');

      video.srcObject = stream;
      await video.play();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to start the selected camera.',
      );
    } finally {
      setBusy(false);
    }
  }, [selectedSource, stopBrowserCamera]);

  const captureFrame = useCallback(() => {
    const video =
      selectedSource?.type === 'stream'
        ? streamVideoEl
        : webcamVideoRef.current;

    if (!video?.videoWidth || !video.videoHeight) {
      setError('The video frame is not ready yet.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create capture canvas.');

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      onCapture(canvas.toDataURL('image/jpeg', 0.94));
      setError('');
    } catch {
      setError(
        'Frame capture was blocked. If this is a network stream, enable CORS on the HLS server.',
      );
    }
  }, [onCapture, selectedSource, streamVideoEl]);

  return (
    <div className="rfa-camera-card">
      <div className="rfa-camera-toolbar">
        <label className="rfa-field rfa-grow">
          <span>Camera Source</span>
          <select
            value={selectedSourceId}
            onChange={(e) => setSelectedSourceId(e.target.value)}
          >
            {browserSources.length > 0 && (
              <optgroup label="Local / USB Cameras">
                {browserSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Range Network Cameras">
              {STREAM_SOURCES.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <button
          type="button"
          className="rfa-ghost-button"
          onClick={discoverBrowserCameras}
          disabled={busy}
        >
          Refresh
        </button>

        <button
          type="button"
          className="rfa-primary-action rfa-inline-action"
          onClick={startSelectedSource}
          disabled={!selectedSource || busy}
        >
          {busy ? 'Starting…' : 'Start'}
        </button>
      </div>

      {error && <div className="rfa-alert is-error">{error}</div>}

      <div className="rfa-camera-preview">
        {selectedSource?.type === 'stream' ? (
          <StreamPlayer
            key={selectedSource.streamUrl}
            streamUrl={selectedSource.streamUrl}
            onVideoReady={setStreamVideoEl}
            onStatusChange={setStreamStatus}
          />
        ) : (
          <video
            ref={webcamVideoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full bg-black object-contain"
          />
        )}

        <div className={'rfa-stream-state state-' + streamStatus}>
          {selectedSource?.type === 'stream'
            ? streamStatus.toUpperCase()
            : 'LOCAL CAMERA'}
        </div>
      </div>

      <div className="rfa-camera-footer">
        <span>
          Network base: <strong>{STREAM_BASE_URL}</strong>
        </span>
        <button type="button" onClick={captureFrame} className="rfa-capture-button">
          Capture Target
        </button>
      </div>
    </div>
  );
}
