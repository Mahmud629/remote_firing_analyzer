'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export type StreamStatus = 'idle' | 'connecting' | 'live' | 'recovering' | 'error';

interface StreamPlayerProps {
  streamUrl: string;
  onVideoReady?: (video: HTMLVideoElement | null) => void;
  onStatusChange?: (status: StreamStatus) => void;
}

export default function StreamPlayer({
  streamUrl,
  onVideoReady,
  onStatusChange,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    onVideoReady?.(video);
    onStatusChange?.('connecting');

    let hls: Hls | null = null;
    let disposed = false;

    const markLive = () => {
      if (!disposed) onStatusChange?.('live');
    };

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('playing', markLive);
      video.play().catch(() => onStatusChange?.('error'));
    } else if (Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 30,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 5,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => onStatusChange?.('error'));
      });

      hls.on(Hls.Events.LEVEL_LOADED, markLive);

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || disposed) return;

        onStatusChange?.('recovering');

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          return;
        }

        onStatusChange?.('error');
        hls?.destroy();
      });
    } else {
      onStatusChange?.('error');
    }

    return () => {
      disposed = true;
      video.removeEventListener('playing', markLive);
      onVideoReady?.(null);
      onStatusChange?.('idle');
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [streamUrl, onStatusChange, onVideoReady]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      controls
      crossOrigin="anonymous"
      className="h-full w-full bg-black object-contain"
    />
  );
}
