'use client';
import { useState } from 'react';
import { Dialog, Segmented } from '@/components/ui';

type Topic = 'photo' | 'live' | 'cctv' | 'calib' | 'session' | 'keys';

const STEPS: Record<Exclude<Topic, 'keys'>, string[]> = {
  photo: [
    'Photograph the target square-on with the whole 32 in outer ring in view.',
    'Analyze → Photo → Choose a photo (or drop the file on the picture).',
    'The ring is calibrated and the holes are marked automatically.',
    'Fix marks if needed: drag to move, right-click to delete, Add hit for a missed hole.',
    'Choose the firer, then Save group.',
  ],
  live: [
    'Fix the camera so the target fills most of the picture.',
    'Analyze → Camera (or CCTV) → Start live.',
    'Wait for "Ring locked" and "Ready". Marks already on the target are ignored.',
    'Fire. Each new hole is numbered in the order it appears.',
    'When all rounds are in, the frame is captured for review automatically.',
  ],
  cctv: [
    'Open the mediamtx folder in this project and double-click start-mediamtx.bat. Keep the black window open.',
    'Settings → CCTV cameras → Add camera: name, brand, IP address, username, password.',
    'Press Save and connect. A green dot means the picture is arriving; amber means no picture yet.',
    'Analyze → CCTV → pick the camera → Start live. A check runs first and shows what is wrong, if anything.',
    'Camera not showing? Press the Test button next to it in Settings. Set the camera to H.264 (not H.265 or MJPEG).',
  ],
  calib: [
    'Automatic: the outer 32 in ring is found by itself (green ring).',
    'Ring tool: drag the green handles onto the outer ring if it is off.',
    'Two points tool: click two points a known distance apart, then type the distance.',
    'After two-point calibration, click the aiming point with the Aim tool.',
  ],
  session: [
    'Save group 1 after the first 5 rounds.',
    'Press Next group. Group 1 stays on screen as a see-through overlay.',
    'Fire again and analyse: old holes are not counted again.',
    'Each group is saved in the firer’s record. Press End session when done.',
    'Download PDF gives the result sheet with every group of the session.',
  ],
};

const KEYS: [string, string][] = [
  ['V', 'Move'],
  ['A', 'Add hit'],
  ['P', 'Aiming point'],
  ['R', 'Ring'],
  ['M', 'Two points'],
  ['Delete', 'Delete selected mark'],
  ['Right-click', 'Delete a mark'],
  ['Ctrl + Z', 'Undo'],
  ['+ / − / 0', 'Zoom in, out, fit'],
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [topic, setTopic] = useState<Topic>('photo');
  return (
    <Dialog open={open} onClose={onClose} title="How to use" wide>
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <Segmented<Topic>
              label="Topic"
              value={topic}
              onChange={setTopic}
              options={[
                { value: 'photo', label: 'Photo' },
                { value: 'live', label: 'Live' },
                { value: 'cctv', label: 'CCTV setup' },
                { value: 'calib', label: 'Calibration' },
                { value: 'session', label: 'Sessions' },
                { value: 'keys', label: 'Keys' },
              ]}
            />
          </div>
        </div>
        {topic === 'keys' ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            {KEYS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded border border-rule bg-sunk px-2 py-0.5 text-sm font-semibold">{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <ol className="flex flex-col gap-3">
            {STEPS[topic].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-olive text-sm font-bold text-olive-ink">{i + 1}</span>
                <span className="pt-0.5 leading-snug">{t}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Dialog>
  );
}
