'use client';
import type { SessionRecord } from '@/services/db';

/** Group size over time with the class limits drawn in. Oldest on the left. */
export function TrendChart({ sessions, limits }: { sessions: SessionRecord[]; limits: { value: number; label: string }[] }) {
  const pts = sessions
    .filter((s) => s.groupIn != null)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-20);
  if (pts.length < 2) return <p className="text-sm text-muted">The trend appears after two groups.</p>;
  const W = 560;
  const H = 170;
  const pad = { l: 34, r: 12, t: 10, b: 22 };
  const maxY = Math.max(12, ...pts.map((p) => p.groupIn!)) * 1.05;
  const x = (i: number) => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.groupIn!).toFixed(1)}`).join('');
  const color = (s: SessionRecord) => (s.status === 'ZEROED' ? 'var(--c-ok)' : s.status === 'ADJUST' ? 'var(--c-warn)' : 'var(--c-bad)');
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px]" role="img" aria-label="Group size over time, in inches">
        {limits.map((l) => (
          <g key={l.label}>
            <line x1={pad.l} x2={W - pad.r} y1={y(l.value)} y2={y(l.value)} stroke="var(--c-rule)" strokeDasharray="4 4" />
            <text x={W - pad.r} y={y(l.value) - 4} textAnchor="end" fontSize={11} fill="var(--c-muted)">
              {l.label} {l.value} in
            </text>
          </g>
        ))}
        {[0, 4, 8, 12].filter((v) => v <= maxY).map((v) => (
          <text key={v} x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--c-muted)" className="num">
            {v}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--c-olive)" strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.groupIn!)} r={4.5} fill={color(p)} stroke="var(--c-sheet)" strokeWidth={1.5}>
            <title>{`${p.date}: ${p.groupIn!.toFixed(2)} in, ${p.status}`}</title>
          </circle>
        ))}
        <text x={pad.l} y={H - 5} fontSize={11} fill="var(--c-muted)">
          {pts[0].date}
        </text>
        <text x={W - pad.r} y={H - 5} textAnchor="end" fontSize={11} fill="var(--c-muted)">
          {pts[pts.length - 1].date}
        </text>
      </svg>
    </div>
  );
}
