'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface StreamPlayerProps {
  streamUrl: string;
  onVideoReady?: (video: HTMLVideoElement | null) => void;
}

export default function StreamPlayer({ streamUrl, onVideoReady }: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    onVideoReady?.(video);

    let hls: Hls | null = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(() => {});
    } else if (Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: true,
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      onVideoReady?.(null);
      if (hls) hls.destroy();
    };
  }, [streamUrl, onVideoReady]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      controls
      className="w-full h-full rounded-lg bg-black object-contain"
    />
  );
}