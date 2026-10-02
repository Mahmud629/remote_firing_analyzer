import type { SavedSession } from '@/types';
import { getFirerClassification } from '@/lib/firingClassification';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function format(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return value.toFixed(2) + suffix;
}

function statusClass(status: SavedSession['results']['status']): string {
  if (status === 'ZEROED') return 'status-ok';
  if (status === 'ADJUSTMENT_REQUIRED') return 'status-warn';
  if (status === 'WASHOUT') return 'status-bad';
  return 'status-neutral';
}

function row(label: string, value: string): string {
  return (
    '<div class="row"><span>' +
    escapeHtml(label) +
    '</span><span class="value">' +
    value +
    '</span></div>'
  );
}

export function generateFiringReport(session: SavedSession): void {
  if (typeof window === 'undefined') return;

  const popup = window.open('', '_blank', 'width=980,height=1200');
  if (!popup) {
    alert('Please allow pop-ups to export the report.');
    return;
  }

  const firerInfo = session.firerInfo;
  const results = session.results;
  const classification = getFirerClassification(results.groupingInches);
  const serviceNo = firerInfo.serviceNumber || firerInfo.weaponNumber || '-';
  const weaponSerial = firerInfo.weaponSerial || firerInfo.wpnNo || '-';

  const lateral =
    results.sightDirections && results.sightRotations
      ? results.sightDirections.lateral +
        ' ' +
        results.sightRotations.lateral.toFixed(2) +
        ' rotation'
      : 'N/A';

  const vertical =
    results.sightDirections && results.sightRotations
      ? results.sightDirections.vertical +
        ' ' +
        results.sightRotations.vertical.toFixed(2) +
        ' rotation'
      : 'N/A';

  const firerRows =
    row('Name', escapeHtml(firerInfo.name || '-')) +
    row('Rank', escapeHtml(firerInfo.rank || '-')) +
    row('BA/Snk No.', escapeHtml(serviceNo)) +
    row('Weapon Serial', escapeHtml(weaponSerial)) +
    row('Range', escapeHtml(firerInfo.range) + ' m') +
    row('Date', escapeHtml(firerInfo.date)) +
    row(
      'Marking Method',
      escapeHtml((session.markingMode || 'manual').toUpperCase()),
    );

  const analysisRows =
    row('Shots', String(results.bulletCount) + '/5') +
    row('Grouping', format(results.groupingInches, '"')) +
    row('Radial Error', format(results.radialErrorCm, ' cm')) +
    row('Classification', escapeHtml(classification));

  const correctionRows =
    row('MPI Horizontal', format(results.mpiCm?.x, ' cm')) +
    row('MPI Vertical', format(results.mpiCm?.y, ' cm')) +
    row('Lateral Adjustment', escapeHtml(lateral)) +
    row('Vertical Adjustment', escapeHtml(vertical));

  const feedback = escapeHtml(
    results.trainingFeedback ||
      results.feedback.join('\n') ||
      'No additional feedback.',
  );

  const washout = results.washoutReasons.length
    ? '<div class="feedback warning">' +
      escapeHtml(results.washoutReasons.join('\n')) +
      '</div>'
    : '';

  const target = session.targetImageBase64
    ? '<section class="card wide"><h2>Marked Target</h2><img class="target" src="' +
      session.targetImageBase64 +
      '" alt="Marked target" /></section>'
    : '';

  const css = [
    '@page{size:A4;margin:12mm}',
    '*{box-sizing:border-box}',
    'body{margin:0;font-family:Arial,sans-serif;color:#172033;background:#fff}',
    '.sheet{max-width:190mm;margin:0 auto}',
    '.header{background:#0b1d33;color:#fff;padding:18px 20px;border-bottom:5px solid #c59a32}',
    '.header h1{margin:0;font-size:26px;letter-spacing:.8px}',
    '.header p{margin:5px 0 0;color:#cbd5e1;font-size:12px}',
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}',
    '.card{border:1px solid #d7dde7;border-radius:8px;padding:12px;break-inside:avoid}',
    '.card h2{margin:0 0 8px;font-size:13px;color:#0b1d33;text-transform:uppercase;letter-spacing:.6px}',
    '.row{display:flex;justify-content:space-between;gap:16px;border-top:1px solid #eef1f5;padding:7px 0;font-size:12px}',
    '.row:first-of-type{border-top:none}',
    '.value{font-weight:700;text-align:right}',
    '.status{margin-top:10px;padding:10px;border-radius:6px;text-align:center;font-weight:800}',
    '.status-ok{background:#dcfce7;color:#166534}',
    '.status-warn{background:#fef3c7;color:#92400e}',
    '.status-bad{background:#fee2e2;color:#991b1b}',
    '.status-neutral{background:#e2e8f0;color:#334155}',
    '.wide{grid-column:1/-1}',
    '.target{width:100%;max-height:340px;object-fit:contain;background:#f8fafc;border:1px solid #e2e8f0}',
    '.feedback{white-space:pre-wrap;font-size:12px;line-height:1.5}',
    '.warning{margin-top:8px;color:#991b1b}',
    '.footer{margin-top:16px;padding-top:10px;border-top:1px solid #d7dde7;font-size:10px;color:#64748b;display:flex;justify-content:space-between}',
    '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
  ].join('');

  const report =
    '<!doctype html><html><head><meta charset="utf-8" />' +
    '<title>Remote Firing Analyzer Report</title><style>' +
    css +
    '</style></head><body><div class="sheet">' +
    '<div class="header"><h1>REMOTE FIRING ANALYZER</h1>' +
    '<p>Digital Target Analysis Report · Session ' +
    escapeHtml(session.id) +
    '</p></div>' +
    '<div class="grid">' +
    '<section class="card"><h2>Firer / Weapon</h2>' +
    firerRows +
    '</section>' +
    '<section class="card"><h2>Analysis</h2>' +
    analysisRows +
    '<div class="status ' +
    statusClass(results.status) +
    '">' +
    escapeHtml(results.status.replaceAll('_', ' ')) +
    '</div></section>' +
    '<section class="card"><h2>MPI / Correction</h2>' +
    correctionRows +
    '</section>' +
    '<section class="card"><h2>Feedback</h2><div class="feedback">' +
    feedback +
    '</div>' +
    washout +
    '</section>' +
    target +
    '</div>' +
    '<div class="footer"><span>Remote Firing Analyzer v2.0</span><span>Generated ' +
    escapeHtml(new Date().toLocaleString()) +
    '</span></div>' +
    '</div><script>window.addEventListener("load",function(){window.print();});</script>' +
    '</body></html>';

  popup.document.open();
  popup.document.write(report);
  popup.document.close();
}
