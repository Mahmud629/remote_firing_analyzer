export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** Lists cameras. Labels only appear after the user has granted camera access once. */
export async function listCameras(askPermission = false): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  if (askPermission) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      /* permission refused: we still list devices without labels */
    }
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/** Opens a camera at the highest practical resolution: more pixels per hole = better detection. */
export async function openCamera(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open cameras. Use Chrome or Edge over https or localhost.');
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 15, max: 30 },
    },
  });
}

export function stopStream(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop());
}

/** Copies the current video frame into a JPEG/PNG blob. */
export async function grabFrame(video: HTMLVideoElement, type = 'image/jpeg'): Promise<{ blob: Blob; width: number; height: number }> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('The video has no picture yet.');
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d')!.drawImage(video, 0, 0, width, height);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the video frame. A stream without CORS headers cannot be captured.'))), type, 0.95));
  return { blob, width, height };
}
