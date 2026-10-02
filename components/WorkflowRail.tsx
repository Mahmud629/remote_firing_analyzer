'use client';

import { WORKFLOW_STEPS } from '@/lib/config';
import type { FirerInfo, WorkflowStage } from '@/types';

interface WorkflowRailProps {
  activeStage: WorkflowStage;
  completedStages: WorkflowStage[];
  firerInfo: FirerInfo;
  onFirerInfoChange: (next: FirerInfo) => void;
}

export function WorkflowRail({
  activeStage,
  completedStages,
  firerInfo,
  onFirerInfoChange,
}: WorkflowRailProps) {
  return (
    <aside className="rfa-panel rfa-workflow">
      <div className="rfa-panel-heading">
        <div>
          <span className="rfa-eyebrow">WORKFLOW</span>
          <h2>Layer-by-layer process</h2>
        </div>
      </div>

      <div className="rfa-steps">
        {WORKFLOW_STEPS.map((step) => {
          const isActive = step.id === activeStage;
          const isDone = completedStages.includes(step.id);
          return (
            <div
              key={step.id}
              className={[
                'rfa-step',
                isActive ? 'is-active' : '',
                isDone ? 'is-done' : '',
              ].join(' ')}
            >
              <div className="rfa-step-number">
                {isDone ? '✓' : step.number}
              </div>
              <div className="rfa-step-copy">
                <strong>{step.title}</strong>
                <span>{step.short}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rfa-divider" />

      <div className="rfa-firer-card">
        <div className="rfa-card-title">
          <span>FIRER / WEAPON</span>
          <small>Session details</small>
        </div>

        <label className="rfa-field">
          <span>BA/Snk No.</span>
          <input
            value={firerInfo.serviceNumber || ''}
            onChange={(e) =>
              onFirerInfoChange({
                ...firerInfo,
                serviceNumber: e.target.value,
                weaponNumber: e.target.value,
              })
            }
            placeholder="Service number"
          />
        </label>

        <div className="rfa-field-grid">
          <label className="rfa-field">
            <span>Rank</span>
            <input
              value={firerInfo.rank}
              onChange={(e) =>
                onFirerInfoChange({ ...firerInfo, rank: e.target.value })
              }
              placeholder="Rank"
            />
          </label>

          <label className="rfa-field">
            <span>Name</span>
            <input
              value={firerInfo.name}
              onChange={(e) =>
                onFirerInfoChange({ ...firerInfo, name: e.target.value })
              }
              placeholder="Name"
            />
          </label>
        </div>

        <label className="rfa-field">
          <span>Weapon Serial</span>
          <input
            value={firerInfo.weaponSerial || ''}
            onChange={(e) =>
              onFirerInfoChange({
                ...firerInfo,
                weaponSerial: e.target.value,
                wpnNo: e.target.value,
              })
            }
            placeholder="Weapon serial"
          />
        </label>

        <div className="rfa-field-grid">
          <label className="rfa-field">
            <span>Date</span>
            <input
              type="date"
              value={firerInfo.date}
              onChange={(e) =>
                onFirerInfoChange({ ...firerInfo, date: e.target.value })
              }
            />
          </label>

          <label className="rfa-field">
            <span>Range (m)</span>
            <input
              type="number"
              min="1"
              value={firerInfo.range}
              onChange={(e) =>
                onFirerInfoChange({
                  ...firerInfo,
                  range: Number(e.target.value) || 100,
                })
              }
            />
          </label>
        </div>
      </div>
    </aside>
  );
}
