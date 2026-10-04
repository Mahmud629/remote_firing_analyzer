import type { FirerRecord, SessionRecord } from './db';
import { STATUS_LABEL, correctionText, escapeHtml as e, fmt, turnsText } from '../lib/format';

export type ReportSession = Omit<SessionRecord, 'id' | 'createdAt'> & { createdAt?: number };

/**
 * Prints an A4 zeroing record through a hidden iframe (no pop-up window, so
 * pop-up blockers never interfere).
 */
export async function printReport(session: ReportSession, firer: FirerRecord | null, imageUrl?: string) {
  const html = reportHtml(session, firer, imageUrl);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await Promise.all(Array.from(doc.images).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1500);
}

function reportHtml(s: ReportSession, f: FirerRecord | null, imageUrl?: string) {
  const status = STATUS_LABEL[s.status === 'INCOMPLETE' ? 'WASHOUT' : s.status];
  const tone = s.status === 'ZEROED' ? '#2D7A3A' : s.status === 'ADJUST' ? '#9A5B00' : '#B3261E';
  const row = (k: string, v: string) => `<tr><th>${e(k)}</th><td>${v}</td></tr>`;
  const diag = s.diagnostics
    .map((d) => `<li><strong>${e(d.title)}.</strong> ${e(d.detail)}${d.advice ? ` <span class="adv">${e(d.advice)}</span>` : ''}</li>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Zeroing record ${e(f?.serviceNo ?? '')}</title>
<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { font-family: "Barlow", Arial, sans-serif; color: #1B201C; margin: 0; font-size: 11pt; line-height: 1.4; }
h1 { font-family: "Barlow Condensed", Arial Narrow, Arial, sans-serif; font-weight: 700; font-size: 22pt; margin: 0; letter-spacing: .01em; }
.sub { color: #5E665F; margin: 2px 0 0; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #3E4B32; padding-bottom: 8px; margin-bottom: 12px; }
.status { font-family: "Barlow Condensed", Arial Narrow, sans-serif; font-weight: 700; font-size: 20pt; color: ${tone}; text-align: right; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 4px 0; border-bottom: 1px solid #DDE1D8; vertical-align: top; }
th { color: #5E665F; font-weight: 500; width: 46%; }
td { font-variant-numeric: tabular-nums; font-weight: 600; }
h2 { font-family: "Barlow Condensed", Arial Narrow, sans-serif; font-size: 13pt; margin: 14px 0 4px; color: #3E4B32; }
.target { text-align: center; }
.target img { max-width: 100%; max-height: 92mm; border: 1px solid #C8CEC4; }
ul { margin: 4px 0 0; padding-left: 18px; }
li { margin-bottom: 4px; }
.adv { color: #5E665F; }
.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 28px; }
.sign div { border-top: 1px solid #1B201C; padding-top: 4px; color: #5E665F; font-size: 10pt; }
footer { margin-top: 14px; color: #8A918A; font-size: 9pt; }
</style></head><body>
<header>
  <div><h1>Rifle zeroing record</h1><p class="sub">Remote Firing Analyzer</p></div>
  <div class="status">${e(status)}</div>
</header>
<div class="grid">
  <section>
    <h2>Firer</h2>
    <table>
      ${row('Name', e(f ? `${f.rank} ${f.name}`.trim() : 'Not recorded'))}
      ${row('Personal no', e(f?.serviceNo || '–'))}
      ${row('Unit', e(f?.unit || '–'))}
      ${row('Weapon no', e(s.weaponSerial || '–'))}
      ${row('Date', e(s.date))}
      ${row('Range', `${s.rangeM} m`)}
    </table>
    <h2>Result</h2>
    <table>
      ${row('Rounds on target', `${s.shotsIn.length} of ${s.requiredRounds}`)}
      ${row('Grouping', s.groupIn != null ? `${fmt(s.groupIn)} in (${fmt(s.groupIn * 2.54, 1)} cm)` : '–')}
      ${row('Classification', e(s.classification ?? '–'))}
      ${row('Radial error', s.radialCm != null ? `${fmt(s.radialCm, 1)} cm` : '–')}
      ${row('MPI from aiming point', s.offsetCm ? `${fmt(Math.abs(s.offsetCm.x), 1)} cm ${s.offsetCm.x >= 0 ? 'right' : 'left'}, ${fmt(Math.abs(s.offsetCm.y), 1)} cm ${s.offsetCm.y >= 0 ? 'high' : 'low'}` : '–')}
      ${s.correction ? row('Move MPI (lateral)', `${e(correctionText(s.correction.lateral))}, ${e(turnsText(s.correction.lateral))}`) : ''}
      ${s.correction ? row('Move MPI (vertical)', `${e(correctionText(s.correction.vertical))}, ${e(turnsText(s.correction.vertical))}`) : ''}
    </table>
    ${s.reasons.length ? `<p>${s.reasons.map(e).join(' ')}</p>` : ''}
  </section>
  <section class="target">
    <h2>Target</h2>
    ${imageUrl ? `<img src="${imageUrl}" alt="Marked target">` : '<p>No image</p>'}
    <p class="sub">Yellow: hits in order. Blue cross: aiming point. Red: MPI.</p>
  </section>
</div>
${diag ? `<h2>Coaching notes</h2><ul>${diag}</ul>` : ''}
${s.notes ? `<h2>Remarks</h2><p>${e(s.notes)}</p>` : ''}
<div class="sign"><div>Firer</div><div>Instructor</div></div>
<footer>Calibration: ${s.calibration.method === 'auto' ? 'automatic' : 'manual'} on the ${s.calibration.diameterIn} in ring. Printed ${e(new Date().toLocaleString())}.</footer>
</body></html>`;
}
