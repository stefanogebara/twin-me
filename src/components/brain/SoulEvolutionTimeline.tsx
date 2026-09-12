import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

interface Snapshot {
  id: string;
  snapshot_date: string;
  node_count: number;
  avg_confidence: number;
  snapshot_type: string;
}

interface Props {
  snapshots: Snapshot[];
}

/* Chart colours are SVG presentation attributes, which do not resolve var(),
   so they are register.css's hex values written out: iris and verdigris for
   the two series (marks only), the hairline for the grid, quiet ink for ticks. */
const CONFIDENCE = '#8179fb';
const NODES = '#4c9786';
const GRID = '#eae9ea';
const TICK = '#6c6867';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const Swatch: React.FC<{ color: string }> = ({ color }) => (
  <span aria-hidden="true" className="inline-block w-3 h-0.5 rounded" style={{ background: color }} />
);

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2"
      style={{ backgroundColor: 'var(--rg-white)', border: '1px solid var(--rg-rule)', borderRadius: 'var(--rg-radius)', color: 'var(--rg-ink)', fontSize: 'var(--rg-text)', fontVariantNumeric: 'tabular-nums' }}
    >
      <p className="font-medium mb-1">{label}</p>
      <p className="flex items-center gap-1.5"><Swatch color={CONFIDENCE} />Confidence: {((payload[0]?.value ?? 0) * 100).toFixed(0)}%</p>
      <p className="flex items-center gap-1.5"><Swatch color={NODES} />Knowledge nodes: {payload[1]?.value}</p>
    </div>
  );
};

export const SoulEvolutionTimeline: React.FC<Props> = ({ snapshots }) => {
  const data = snapshots
    .slice()
    .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime())
    .map(s => ({
      date: formatDate(s.snapshot_date),
      confidence: s.avg_confidence ?? 0,
      nodes: s.node_count ?? 0,
    }));

  if (data.length < 2) {
    return (
      <p className="rg-empty">Collect more data over time to see your soul signature evolve.</p>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CONFIDENCE} stopOpacity={0.15} />
              <stop offset="95%" stopColor={CONFIDENCE} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="nodeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={NODES} stopOpacity={0.12} />
              <stop offset="95%" stopColor={NODES} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 13, fill: TICK }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="conf"
            domain={[0, 1]}
            tick={{ fontSize: 13, fill: TICK }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          />
          <YAxis
            yAxisId="nodes"
            orientation="right"
            tick={{ fontSize: 13, fill: TICK }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            yAxisId="conf"
            type="monotone"
            dataKey="confidence"
            stroke={CONFIDENCE}
            strokeWidth={2}
            fill="url(#confGrad)"
            dot={{ r: 3, fill: CONFIDENCE }}
          />
          <Area
            yAxisId="nodes"
            type="monotone"
            dataKey="nodes"
            stroke={NODES}
            strokeWidth={2}
            fill="url(#nodeGrad)"
            dot={{ r: 3, fill: NODES }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 justify-center" style={{ color: 'var(--rg-ink-2)', fontWeight: 350 }}>
        <span className="flex items-center gap-1.5"><Swatch color={CONFIDENCE} />Confidence</span>
        <span className="flex items-center gap-1.5"><Swatch color={NODES} />Knowledge nodes</span>
      </div>
    </div>
  );
};
