import { SavedSession, FiringResult } from '@/types';
import { analyzeZeroing } from './calculations';
import { getClassificationWithColor } from './firingClassification';

export function generateFiringReport(session: SavedSession) {
  console.log('[v0] Starting report generation for session:', session.firerInfo.name);
  
  try {
    const { firerInfo, results, id } = session;
    const results_analysis = analyzeZeroing(results);
    const firingFeedback = results.trainingFeedback || 'No feedback generated';

    // Use the stored target canvas image from the session
    const imageToUse = session.targetImageBase64 || '';

    const htmlContent = generateReportHTML(
      firerInfo,
      results,
      results_analysis,
      firingFeedback,
      imageToUse,
      id
    );
    
    // Create new window
    const printWindow = window.open('', '', 'width=900,height=1200');
    
    if (!printWindow) {
      console.error('[v0] Failed to open print window - popup may be blocked');
      alert('Please allow popups to export the report');
      return;
    }
    
    console.log('[v0] Print window opened, writing content');
    
    try {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      console.log('[v0] Content written to window');
      
      // Wait for content to load then focus
      setTimeout(() => {
        printWindow.focus();
        console.log('[v0] Window focused');
      }, 500);
    } catch (writeError) {
      console.error('[v0] Error writing to window:', writeError);
      printWindow.close();
      throw writeError;
    }
  } catch (error) {
    console.error('[v0] Error generating report:', error);
    alert('Error generating report. Please try again.');
  }
}

function generateReportHTML(
  firerInfo: any,
  results: FiringResult,
  results_analysis: any,
  firingFeedback: string,
  canvasImage: string = '',
  sessionId: string = ''
): string {
  const formatValue = (value: any, unit: string = '') => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
      return `${value.toFixed(2)}${unit ? ' ' + unit : ''}`;
    }
    return value;
  };

  // Get classification with color
  const classInfo = getClassificationWithColor(results.groupingInches);
  let classificationClassName = 'classification';
  if (classInfo.classification === 'Marksman') classificationClassName += ' classification-marksman';
  else if (classInfo.classification === 'First class firer') classificationClassName += ' classification-firstclass';
  else if (classInfo.classification === 'Standard firer') classificationClassName += ' classification-standard';
  else if (classInfo.classification === 'Requires Training') classificationClassName += ' classification-training';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Remote Firing Analyzer Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: 'Arial', sans-serif; 
    padding: 20px;
    background: white;
    color: #222;
  }
  .container {
    max-width: 8.5in;
    height: 11in;
    margin: 0 auto;
    background: white;
    border: 1px solid #ddd;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .header {
    background: #1a2a4a;
    color: white;
    padding: 12px;
    border-bottom: 3px solid #f39c12;
    display: flex;
    justify-content: space-between;
    align-items: center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header-text {
    flex: 1;
  }
  .header-text h1 {
    margin: 0;
    font-size: 28px;
    font-weight: bold;
  }
  .header-text p {
    margin: 0;
    font-size: 11px;
    color: #f39c12;
  }
  .header-photo {
    width: 60px;
    height: 75px;
    border: 2px solid #2563eb;
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .header-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .header-text h1 {
    font-size: 36px;
    margin-bottom: 2px;
    letter-spacing: 1px;
    font-weight: bold;
  }
  .header-text p {
    font-size: 16px;
    opacity: 0.9;
  }
  .content {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px;
    font-size: 13px;
    align-content: start;
    overflow: hidden;
  }
  .section {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 3px;
    padding: 6px;
  }
  .section-title {
    font-weight: bold;
    font-size: 13px;
    background: #495057;
    color: white;
    padding: 4px 5px;
    margin-bottom: 4px;
    border-radius: 2px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .info-item {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    border-bottom: 1px solid #e9ecef;
    font-size: 13px;
  }
  .info-item:last-child {
    border-bottom: none;
  }
  .label {
    font-weight: bold;
    color: #333;
  }
  .value {
    text-align: right;
    color: #555;
  }
  .classification {
    padding: 6px;
    border-radius: 3px;
    font-weight: bold;
    text-align: center;
    margin: 5px 0;
    font-size: 13px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .classification-marksman {
    background: #dc2626;
    color: white;
    border: 1px solid #991b1b;
  }
  .classification-firstclass {
    background: #2563eb;
    color: white;
    border: 1px solid #1e40af;
  }
  .classification-standard {
    background: #16a34a;
    color: white;
    border: 1px solid #15803d;
  }
  .classification-training {
    background: #ea580c;
    color: white;
    border: 1px solid #c2410c;
  }
  .signature-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    padding: 15px 0;
    margin-bottom: 10px;
  }
  .signature-box {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .signature-line {
    width: 100%;
    border-top: 2px solid #333;
    margin-bottom: 5px;
    min-height: 40px;
  }
  .signature-label {
    font-size: 12px;
    font-weight: bold;
    text-align: center;
    color: #333;
  }
  .recommendation {
    background: #e3f2fd;
    border-left: 4px solid #2196f3;
    padding: 5px;
    margin: 5px 0;
    font-size: 13px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .feedback-section {
    grid-column: 1 / -1;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 3px;
    padding: 8px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .feedback-title {
    font-weight: bold;
    color: white;
    background: #495057;
    padding: 4px 5px;
    margin-bottom: 6px;
    font-size: 13px;
    border-radius: 2px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .feedback-content {
    font-size: 15px;
    line-height: 1.6;
    color: #333;
  }
  .quote-section {
    text-align: center;
    padding: 15px;
    margin: 8px 0;
    font-style: italic;
    font-weight: bold;
    font-size: 18px;
    color: white;
    border: 2px solid #1b5e20;
    background: #1b5e20;
    border-radius: 3px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .footer {
    background: #ecf0f1;
    padding: 8px 12px;
    text-align: center;
    font-size: 12px;
    border-top: 2px solid #f39c12;
    margin-top: auto;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .target-image-container {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 10px 0;
    grid-column: 1 / -1;
  }
  .target-image-box {
    border: 3px solid #f39c12;
    border-radius: 3px;
    overflow: hidden;
    width: 300px;
    height: 300px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .target-image-box img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
    body { padding: 0; margin: 0; }
    .container { border: none; max-width: 100%; height: 100%; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-text">
      <h1>REMOTE FIRING ANALYZER</h1>
      <p>Digital Target Analysis and Rifle Zeroing Report</p>
    </div>
    ${firerInfo.photoBase64 ? `
    <div class="header-photo">
      <img src="${firerInfo.photoBase64}" alt="Firer Photo" />
    </div>
    ` : ''}
  </div>

  <div class="content">
    <!-- Left Column -->
    <div>
      <!-- Firer Details -->
      <div class="section">
        <div class="section-title">FIRER DETAILS</div>
        <div class="info-item">
          <span class="label">Rank:</span>
          <span class="value">${firerInfo.rank || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Name:</span>
          <span class="value">${firerInfo.name || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">ID:</span>
          <span class="value">${sessionId || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Wpn No:</span>
          <span class="value">${firerInfo.weaponNumber || firerInfo.wpnNo || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Range:</span>
          <span class="value">${firerInfo.range || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Date:</span>
          <span class="value">${firerInfo.date || 'N/A'}</span>
        </div>
      </div>

      <!-- Analysis Results -->
      <div class="section" style="margin-top: 6px;">
        <div class="section-title">ANALYSIS RESULTS</div>
        <div class="info-item">
          <span class="label">Bullets:</span>
          <span class="value">${results.bulletCount}/5</span>
        </div>
        <div class="info-item">
          <span class="label">Grouping:</span>
          <span class="value">${formatValue(results.groupingInches, '"')}</span>
        </div>
        <div class="info-item">
          <span class="label">Radial Error:</span>
          <span class="value">${formatValue(results.radialErrorCm, 'cm')}</span>
        </div>
        <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e9ecef;">
          <div class="info-item">
            <span class="label">CLASS REQUIRES TRAINING</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Target Image (Full Width) -->
    ${canvasImage ? `<div class="target-image-container">
      <div class="target-image-box">
        <img src="${canvasImage}" alt="Firing Target" />
      </div>
    </div>` : ''}

    <!-- Right Column -->
    <div>
      <!-- MPI -->
      <div class="section">
        <div class="section-title">MEAN POINT OF IMPACT</div>
        <div class="info-item">
          <span class="label">Horizontal:</span>
          <span class="value">${results.mpiCm?.x ? (results.mpiCm.x > 0 ? 'R' : 'L') + ' ' + Math.abs(results.mpiCm.x).toFixed(1) + 'cm' : 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Vertical:</span>
          <span class="value">${results.mpiCm?.y ? (results.mpiCm.y > 0 ? 'H' : 'L') + ' ' + Math.abs(results.mpiCm.y).toFixed(1) + 'cm' : 'N/A'}</span>
        </div>
      </div>

      <!-- Corrections -->
      <div class="section" style="margin-top: 6px;">
        <div class="section-title">ZEROING ADJUSTMENT</div>
        <div class="recommendation">
          <strong>Lateral:</strong> ${results.sightRotations?.lateral ? (
            results.sightRotations.lateral > 0 
              ? 'RIGHT ' + Math.abs(results.sightRotations.lateral).toFixed(1)
              : 'LEFT ' + Math.abs(results.sightRotations.lateral).toFixed(1)
          ) : 'N/A'} rotation
        </div>
        <div class="recommendation">
          <strong>Vertical:</strong> ${results.sightRotations?.vertical ? (
            results.sightRotations.vertical > 0 
              ? 'UP ' + Math.abs(results.sightRotations.vertical).toFixed(1)
              : 'DOWN ' + Math.abs(results.sightRotations.vertical).toFixed(1)
          ) : 'N/A'} rotation
        </div>
      </div>

      <!-- Feedback Section -->
      <div class="feedback-section" style="margin-top: 6px;">
        <div class="feedback-title">FEEDBACK</div>
        <div class="feedback-content">${firingFeedback.replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  </div>

  <div class="quote-section">
    Your Weapon Your skill, One Shot One Kill
  </div>

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Signature of Firer</div>
    </div>
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Signature of Instructor</div>
    </div>
  </div>

  <div class="footer">
    Report Generated: ${new Date().toLocaleString()} | Digital Target Analysis and Rifle Zeroing System
  </div>
</div>
</body>
</html>`;
}
