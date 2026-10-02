'use client';

import type { MarkingMode } from '@/types';
import { APP_NAME, APP_VERSION } from '@/lib/config';

interface AppHeaderProps {
  sessionCount: number;
  markingMode: MarkingMode;
  onReset: () => void;
}

export function AppHeader({
  sessionCount,
  markingMode,
  onReset,
}: AppHeaderProps) {
  return (
    <header className="rfa-header">
      <div className="rfa-brand">
        <img src="/bd-army-logo.png" alt="Bangladesh Army" className="rfa-logo" />
        <div>
          <div className="rfa-kicker">DIGITAL TARGET ANALYSIS</div>
          <h1>{APP_NAME}</h1>
          <p>Layered firing analysis workspace · v{APP_VERSION}</p>
        </div>
      </div>

      <div className="rfa-header-actions">
        <div className="rfa-status-chip">
          <span className="rfa-status-dot" />
          SYSTEM READY
        </div>
        <div className="rfa-mode-chip">
          {markingMode === 'auto' ? 'ML AUTO DETECT' : 'MANUAL MARKING'}
        </div>
        <div className="rfa-session-chip">{sessionCount} SAVED</div>
        <button type="button" onClick={onReset} className="rfa-reset-button">
          Reset Workspace
        </button>
      </div>
    </header>
  );
}
