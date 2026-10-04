import type { FirerRecord, SessionRecord } from './db';
import { STATUS_LABEL, adviceFix, correctionText, turnsText } from '../lib/format';

export type PdfGroup = Omit<SessionRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number };

export interface PdfInput {
  group: PdfGroup;
  firer: FirerRecord | null;
  imageDataUrl?: string;
  /** Zoomed view of the group. */
  closeUpDataUrl?: string;
  /** All saved groups of the same session (for the session table). */
  sessionGroups?: PdfGroup[];
}

const CREDIT = '(c) BA-9388 Maj Noor Mohammad Nofaer, Sigs & BA-11108 Capt Asif Mahmud, Sigs';
type RGB = [number, number, number];
const NAVY: RGB = [15, 27, 45];
const BRASS: RGB = [200, 150, 30];
const INK: RGB = [20, 28, 40];
const MUTED: RGB = [100, 112, 130];
const LINE: RGB = [210, 218, 228];
const TONE: Record<string, RGB> = { ZEROED: [31, 157, 85], ADJUST: [214, 128, 0], WASHOUT: [211, 47, 69], INCOMPLETE: [211, 47, 69] };

async function toDataUrl(src: Blob | string): Promise<string | undefined> {
  try {
    const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
    return await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

const firstSentence = (t: string) => (t.match(/^[^.!?]*[.!?]/)?.[0] ?? t).trim();
const fmt = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '-' : v.toFixed(d));

/** Builds the A4 result sheet and downloads it. */
export async function downloadPdf(input: PdfInput) {
  const doc = await buildPdf(input);
  const f = input.firer;
  const name = `Zeroing_${(f?.serviceNo || 'firer').replace(/[^\w-]+/g, '')}_${input.group.date}_G${input.group.groupNo ?? 1}.pdf`;
  doc.save(name);
}

export async function buildPdf({ group: g, firer: f, imageDataUrl, closeUpDataUrl, sessionGroups = [] }: PdfInput) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 12;
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (style: 'normal' | 'bold', size: number) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };

  // ---- header band
  setFill(NAVY);
  doc.rect(0, 0, W, 28, 'F');
  setFill(BRASS);
  doc.rect(0, 28, W, 1.2, 'F');
  const logo = await toDataUrl('/bd-army-logo.png');
  if (logo) doc.addImage(logo, 'PNG', M, 5, 18, 18);
  setText([255, 255, 255]);
  font('bold', 17);
  doc.text('Rifle Zeroing Result Sheet', M + 23, 13.5);
  font('normal', 9.5);
  setText([200, 210, 225]);
  doc.text('Remote Firing Analyzer', M + 23, 19.5);
  font('bold', 10);
  setText([255, 255, 255]);
  doc.text(g.date, W - M, 12, { align: 'right' });
  font('normal', 9);
  setText([200, 210, 225]);
  doc.text(`Group ${g.groupNo ?? 1}${sessionGroups.length > 1 ? ` of ${sessionGroups.length}` : ''}`, W - M, 18, { align: 'right' });

  // ---- status banner
  const tone = TONE[g.status] ?? TONE.WASHOUT;
  let y = 35;
  setFill(tone);
  doc.roundedRect(M, y, W - 2 * M, 17, 2, 2, 'F');
  setText([255, 255, 255]);
  font('bold', 20);
  doc.text(STATUS_LABEL[g.status === 'INCOMPLETE' ? 'WASHOUT' : g.status].toUpperCase(), M + 5, y + 11.5);
  font('bold', 11);
  doc.text(`${g.classification ?? '-'}`, W - M - 5, y + 7.5, { align: 'right' });
  font('normal', 9.5);
  doc.text(`Grouping ${fmt(g.groupIn)} in   Radial error ${fmt(g.radialCm, 1)} cm`, W - M - 5, y + 13, { align: 'right' });

  // ---- firer + result tables
  y = 60;
  const colW = (W - 2 * M - 8) / 2;
  const table = (x: number, top: number, w: number, title: string, rows: [string, string][]) => {
    font('bold', 10.5);
    setText(NAVY);
    doc.text(title, x, top);
    setDraw(BRASS);
    doc.setLineWidth(0.6);
    doc.line(x, top + 1.6, x + w, top + 1.6);
    let yy = top + 7.5;
    for (const [k, v] of rows) {
      font('normal', 9.5);
      setText(MUTED);
      doc.text(k, x, yy);
      font('bold', 10);
      setText(INK);
      doc.text(doc.splitTextToSize(v, w * 0.58)[0] ?? '', x + w, yy, { align: 'right' });
      setDraw(LINE);
      doc.setLineWidth(0.2);
      doc.line(x, yy + 2, x + w, yy + 2);
      yy += 6.6;
    }
    return yy;
  };
  const photo = f?.photo ? await toDataUrl(f.photo) : undefined;
  const firerW = photo ? colW - 26 : colW;
  const leftEnd = table(M, y, firerW, 'Firer', [
    ['Rank and name', f ? `${f.rank} ${f.name}`.trim() : '-'],
    ['Personal no', f?.serviceNo || '-'],
    ['Unit', f?.unit || '-'],
    ['Sub unit / Coy', f?.subunit || '-'],
    ['Weapon no', g.weaponSerial || '-'],
    ['Range', `${g.rangeM} m`],
  ]);
  if (photo) {
    setDraw(LINE);
    doc.rect(M + colW - 23, y - 2, 23, 29);
    doc.addImage(photo, 'JPEG', M + colW - 22.5, y - 1.5, 22, 28);
  }
  const rx = M + colW + 8;
  const off = g.offsetCm;
  const rightEnd = table(rx, y, colW, 'Result', [
    ['Rounds on target', `${g.shotsIn.length} of ${g.requiredRounds}`],
    ['Grouping', g.groupIn != null ? `${fmt(g.groupIn)} in (${fmt(g.groupIn * 2.54, 1)} cm)` : '-'],
    ['Radial error', g.radialCm != null ? `${fmt(g.radialCm, 1)} cm` : '-'],
    ['MPI from aiming point', off ? `${fmt(Math.abs(off.x), 1)} ${off.x >= 0 ? 'R' : 'L'}, ${fmt(Math.abs(off.y), 1)} ${off.y >= 0 ? 'high' : 'low'} cm` : '-'],
    ['Classification', g.classification ?? '-'],
  ]);

  // ---- correction box
  y = Math.max(leftEnd, rightEnd) + 2;
  setFill([246, 239, 220]);
  setDraw(BRASS);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, W - 2 * M, 16, 1.5, 1.5, 'FD');
  font('bold', 10);
  setText(NAVY);
  doc.text('Sight correction (BD-08): move the MPI', M + 4, y + 6);
  font('normal', 10);
  setText(INK);
  if (g.correction) {
    doc.text(`Lateral: ${correctionText(g.correction.lateral)}  (${turnsText(g.correction.lateral)})`, M + 4, y + 12);
    doc.text(`Vertical: ${correctionText(g.correction.vertical)}  (${turnsText(g.correction.vertical)})`, M + 95, y + 12);
  } else doc.text('Not available', M + 4, y + 12);

  // ---- images: whole target and group close-up
  y += 23;
  const imgSize = (W - 2 * M - 6) / 2;
  const picture = (url: string | undefined, x: number, title: string) => {
    font('bold', 10.5);
    setText(NAVY);
    doc.text(title, x, y - 2);
    setDraw(LINE);
    doc.setLineWidth(0.3);
    doc.rect(x, y, imgSize, imgSize);
    if (!url) {
      font('normal', 9);
      setText(MUTED);
      doc.text('Not available', x + imgSize / 2, y + imgSize / 2, { align: 'center' });
      return;
    }
    const props = doc.getImageProperties(url);
    const sc = Math.min(imgSize / props.width, imgSize / props.height);
    doc.addImage(url, 'JPEG', x + (imgSize - props.width * sc) / 2, y + (imgSize - props.height * sc) / 2, props.width * sc, props.height * sc);
  };
  picture(imageDataUrl, M, 'Target');
  picture(closeUpDataUrl, M + imgSize + 6, 'Group close-up');
  const ly = y + imgSize + 5;
  const legend: [RGB, string][] = [
    [[255, 196, 0], 'Hits (numbered)'],
    [[11, 116, 209], 'Aiming point'],
    [[225, 29, 72], 'MPI'],
    [[255, 79, 216], 'Earlier groups'],
  ];
  let lx = M;
  font('normal', 8.5);
  for (const [c, t] of legend) {
    setFill(c);
    doc.circle(lx + 1.5, ly - 1, 1.5, 'F');
    setText(MUTED);
    doc.text(t, lx + 4.5, ly);
    lx += doc.getTextWidth(t) + 10;
  }

  // ---- session table (left) and notes (right)
  const top = ly + 8;
  const limit = 262;
  const half = (W - 2 * M - 8) / 2;
  const heading = (x: number, yy: number, t: string, w: number) => {
    font('bold', 10.5);
    setText(NAVY);
    doc.text(t, x, yy);
    setDraw(BRASS);
    doc.setLineWidth(0.6);
    doc.line(x, yy + 1.6, x + w, yy + 1.6);
  };
  if (sessionGroups.length > 0) {
    heading(M, top, 'Session', half);
    let sy = top + 7;
    font('bold', 8.5);
    setText(MUTED);
    doc.text('Group', M, sy);
    doc.text('Size', M + 22, sy);
    doc.text('Radial', M + 44, sy);
    doc.text('Result', M + half, sy, { align: 'right' });
    sy += 5;
    for (const sg of sessionGroups.slice(-4)) {
      font(sg.groupNo === g.groupNo ? 'bold' : 'normal', 9.5);
      setText(INK);
      doc.text(String(sg.groupNo ?? '-'), M + 2, sy);
      doc.text(`${fmt(sg.groupIn)} in`, M + 22, sy);
      doc.text(`${fmt(sg.radialCm, 1)} cm`, M + 44, sy);
      setText(TONE[sg.status] ?? TONE.WASHOUT);
      font('bold', 9.5);
      doc.text(STATUS_LABEL[sg.status], M + half, sy, { align: 'right' });
      setDraw(LINE);
      doc.setLineWidth(0.2);
      doc.line(M, sy + 2, M + half, sy + 2);
      sy += 6;
    }
  }
  const nx = sessionGroups.length > 0 ? M + half + 8 : M;
  const nw = sessionGroups.length > 0 ? half : W - 2 * M;
  const lines: [string, boolean][] = [];
  for (const r of g.reasons) lines.push([r, false]);
  for (const d of g.diagnostics) lines.push([`${d.title}. ${d.advice ? adviceFix(d.advice) : firstSentence(d.detail)}`, false]);
  if (g.notes) lines.push([`Remarks: ${g.notes}`, true]);
  if (lines.length) {
    heading(nx, top, 'Notes', nw);
    let sy = top + 7;
    for (const [t, bold] of lines) {
      font(bold ? 'bold' : 'normal', 8.8);
      setText(bold ? INK : MUTED);
      for (const ln of doc.splitTextToSize(t, nw)) {
        if (sy > limit) break;
        doc.text(ln, nx, sy);
        sy += 4.1;
      }
      sy += 1;
    }
  }

  // ---- signatures
  const sigY = 274;
  setDraw(INK);
  doc.setLineWidth(0.3);
  const sigs = ['Firer', 'Instructor', 'OIC Range'];
  const sigW = (W - 2 * M - 16) / 3;
  sigs.forEach((t, i) => {
    const x = M + i * (sigW + 8);
    doc.line(x, sigY, x + sigW, sigY);
    font('normal', 9);
    setText(MUTED);
    doc.text(t, x + sigW / 2, sigY + 4.5, { align: 'center' });
  });

  // ---- footer
  setFill(NAVY);
  doc.rect(0, 284, W, 13, 'F');
  font('normal', 8);
  setText([200, 210, 225]);
  doc.text(CREDIT, W / 2, 290, { align: 'center' });
  doc.text(`Generated ${new Date().toLocaleString()}  |  Calibration: ${g.calibration.method === 'auto' ? 'automatic (32 in ring)' : g.calibration.method === 'points' ? 'two known points' : 'ring placed by hand'}`, W / 2, 294.5, { align: 'center' });
  return doc;
}
