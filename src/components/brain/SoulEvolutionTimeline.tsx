import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-lg"
      style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)' }}
    >
      <p className="font-medium mb-1">{label}</p>
      <p style={{ color: '#8b5cf6' }}>
        Confidence: {((payload[0]?.value ?? 0) * 100).toFixed(0)}%
      </p>
      <p style={{ color: '#10b981' }}>
        Knowledge nodes: {payload[1]?.value}
      </p>
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
      <div
        className="flex items-center justify-center py-8 text-sm"
        style={{ color: '#8A857D' }}
      >
        Collect more data over time to see your soul signature evolve.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="nodeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#8A857D' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="conf"
            domain={[0, 1]}
            tick={{ fontSize: 11, fill: '#8A857D' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          />
          <YAxis
            yAxisId="nodes"
            orientation="right"
            tick={{ fontSize: 11, fill: '#8A857D' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            yAxisId="conf"
            type="monotone"
            dataKey="confidence"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#confGrad)"
            dot={{ r: 3, fill: '#8b5cf6' }}
          />
          <Area
            yAxisId="nodes"
            type="monotone"
            dataKey="nodes"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#nodeGrad)"
            dot={{ r: 3, fill: '#10b981' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ background: '#8b5cf6' }} />
          <span className="text-xs" style={{ color: '#8A857D' }}>Confidence</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ background: '#10b981' }} />
          <span className="text-xs" style={{ color: '#8A857D' }}>Knowledge nodes</span>
        </div>
      </div>
    </motion.div>
  );
};
