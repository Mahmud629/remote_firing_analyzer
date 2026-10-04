'use client';
import { FileDown, Trash2 } from 'lucide-react';
import { Button, Dialog, StatusPill } from '@/components/ui';
import type { FirerRecord, SessionRecord } from '@/services/db';
import { deleteSession } from '@/services/records';
import { downloadPdf } from '@/services/pdf';
import { db } from '@/services/db';

import { correctionText, fmt, turnsText } from '@/lib/format';
import { useBlobUrl } from '@/lib/useBlobUrl';

export function SessionDialog({ session, firer, onClose }: { session: SessionRecord | null; firer: FirerRecord | null; onClose: () => void }) {
  const url = useBlobUrl(session?.image);
  if (!session) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;
  const s = session;
  const rows: [string, string][] = [
    ['Date', s.date],
    ...(s.groupNo ? ([['Group', `${s.groupNo}`]] as [string, string][]) : []),
    ['Weapon no', s.weaponSerial || '–'],
    ['Range', `${s.rangeM} m`],
    ['Rounds', `${s.shotsIn.length} of ${s.requiredRounds}`],
    ['Grouping', s.groupIn != null ? `${fmt(s.groupIn)} in (${fmt(s.groupIn * 2.54, 1)} cm)` : '–'],
    ['Classification', s.classification ?? '–'],
    ['Radial error', s.radialCm != null ? `${fmt(s.radialCm, 1)} cm` : '–'],
  ];
  if (s.correction) {
    rows.push(['Move MPI, lateral', `${correctionText(s.correction.lateral)}, ${turnsText(s.correction.lateral)}`]);
    rows.push(['Move MPI, vertical', `${correctionText(s.correction.vertical)}, ${turnsText(s.correction.vertical)}`]);
  }
  return (
    <Dialog open onClose={onClose} title={`Group fired ${s.date}`} wide>
      <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
        <div>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Marked target" className="w-full rounded-md border border-rule bg-scope" />
          ) : (
            <div className="grid aspect-square place-items-center rounded-md bg-sunk text-sm text-muted">No picture saved</div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <StatusPill status={s.status} className="self-start text-base" />
          {s.reasons.length > 0 && <p className="text-sm text-muted">{s.reasons.join(' ')}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="num text-[15px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {s.diagnostics.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {s.diagnostics.map((d) => (
                <li key={d.title}>
                  <span className="font-semibold">{d.title}.</span> {d.detail}
                </li>
              ))}
            </ul>
          )}
          {s.notes && <p className="text-sm">{s.notes}</p>}
          <div className="mt-auto flex gap-2 pt-2">
            <Button
              icon={<FileDown size={16} />}
              onClick={async () => {
                const groups = s.sessionId ? (await db().sessions.toArray()).filter((x) => x.sessionId === s.sessionId).sort((a, b) => (a.groupNo ?? 0) - (b.groupNo ?? 0)) : [];
                const img = s.image ? await blobToDataUrl(s.image) : undefined;
                const close = s.closeUp ? await blobToDataUrl(s.closeUp) : undefined;
                await downloadPdf({ group: s, firer, imageDataUrl: img, closeUpDataUrl: close, sessionGroups: groups });
              }}
            >
              PDF
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 size={16} />}
              onClick={async () => {
                if (confirm('Delete this group from the record? This cannot be undone.')) {
                  await deleteSession(s.id);
                  onClose();
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function blobToDataUrl(b: Blob) {
  return new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(b);
  });
}
