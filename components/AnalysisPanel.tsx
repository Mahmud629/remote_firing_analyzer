'use client';

import type { MarkingMode, Unit, ZeroingResults } from '@/types';
import { convertValue } from '@/lib/calculations';
import { getFirerClassification } from '@/lib/firingClassification';

interface AnalysisPanelProps {
  results: ZeroingResults | null;
  unit: Unit;
  markingMode: MarkingMode;
  mlInfo?: string;
  onUnitChange: (unit: Unit) => void;
  onSave: () => void;
  onReport: () => void;
  canSave: boolean;
}

function displayDistance(
  value: number | null,
  fromUnit: 'inches' | 'cm',
  unit: Unit,
) {
  if (value === null) return '—';
  const converted = convertValue(value, fromUnit, unit);
  const suffix = unit === 'inches' ? '"' : ' ' + unit;
  return converted.toFixed(2) + suffix;
}

export function AnalysisPanel({
  results,
  unit,
  markingMode,
  mlInfo,
  onUnitChange,
  onSave,
  onReport,
  canSave,
}: AnalysisPanelProps) {
  const status = results?.status ?? 'INCOMPLETE';
  const classification = getFirerClassification(
    results?.groupingInches ?? null,
  );

  return (
    <aside className="rfa-panel rfa-analysis">
      <div className="rfa-panel-heading">
        <div>
          <span className="rfa-eyebrow">ANALYSIS</span>
          <h2>Result & decision support</h2>
        </div>
      </div>

      <div className={'rfa-result-status status-' + status.toLowerCase()}>
        <small>CURRENT STATUS</small>
        <strong>{status.replaceAll('_', ' ')}</strong>
      </div>

      <div className="rfa-unit-switch">
        {(['inches', 'cm', 'mm'] as Unit[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onUnitChange(item)}
            className={unit === item ? 'is-selected' : ''}
          >
            {item === 'inches' ? 'IN' : item.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="rfa-metric-grid">
        <div className="rfa-metric">
          <span>Shots</span>
          <strong>{results?.bulletCount ?? 0}/5</strong>
        </div>
        <div className="rfa-metric">
          <span>Grouping</span>
          <strong>
            {results
              ? displayDistance(results.groupingInches, 'inches', unit)
              : '—'}
          </strong>
        </div>
        <div className="rfa-metric">
          <span>Radial Error</span>
          <strong>
            {results
              ? displayDistance(results.radialErrorCm, 'cm', unit)
              : '—'}
          </strong>
        </div>
        <div className="rfa-metric">
          <span>Classification</span>
          <strong className="rfa-small-value">{classification}</strong>
        </div>
      </div>

      <div className="rfa-info-block">
        <div className="rfa-info-title">Marking Method</div>
        <div className="rfa-info-row">
          <span>{markingMode === 'auto' ? 'ML Auto Detect' : 'Manual'}</span>
          <strong>{mlInfo || 'Operator verified'}</strong>
        </div>
      </div>

      <div className="rfa-info-block">
        <div className="rfa-info-title">MPI / Correction</div>
        <div className="rfa-info-row">
          <span>Horizontal MPI</span>
          <strong>
            {results?.mpiCm ? results.mpiCm.x.toFixed(2) + ' cm' : '—'}
          </strong>
        </div>
        <div className="rfa-info-row">
          <span>Vertical MPI</span>
          <strong>
            {results?.mpiCm ? results.mpiCm.y.toFixed(2) + ' cm' : '—'}
          </strong>
        </div>
        <div className="rfa-info-row">
          <span>Lateral</span>
          <strong>
            {results?.sightRotations && results.sightDirections
              ? results.sightDirections.lateral +
                ' ' +
                results.sightRotations.lateral.toFixed(2) +
                ' rot'
              : '—'}
          </strong>
        </div>
        <div className="rfa-info-row">
          <span>Vertical</span>
          <strong>
            {results?.sightRotations && results.sightDirections
              ? results.sightDirections.vertical +
                ' ' +
                results.sightRotations.vertical.toFixed(2) +
                ' rot'
              : '—'}
          </strong>
        </div>
      </div>

      {(results?.trainingFeedback ||
        (results?.washoutReasons?.length ?? 0) > 0) && (
        <div className="rfa-feedback">
          <div className="rfa-info-title">Feedback</div>
          {results?.trainingFeedback && <p>{results.trainingFeedback}</p>}
          {results?.washoutReasons.map((reason) => (
            <p key={reason} className="is-warning">
              {reason}
            </p>
          ))}
        </div>
      )}

      <div className="rfa-action-stack">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rfa-primary-action"
        >
          Save Session
        </button>
        <button
          type="button"
          onClick={onReport}
          disabled={!canSave}
          className="rfa-secondary-action"
        >
          Print / Export Report
        </button>
      </div>
    </aside>
  );
}
