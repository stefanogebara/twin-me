import React from 'react';
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
      <div className="flex items-center justify-center py-8 text-sm"
        style={{ color: 'var(--text-secondary)' }}>
        Collect more data over time to see your soul signature evolve.
      </div>
    );
  }

  const maxNodes = Math.max(...data.map(d => d.nodes), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Timeline bars */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140, marginBottom: 8 }}>
        {data.map((item, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              height: '100%',
              justifyContent: 'flex-end',
            }}
          >
            {/* Dual bars container */}
            <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 110 }}>
              {/* Confidence bar */}
              <motion.div
                title={`Confidence: ${(item.confidence * 100).toFixed(0)}%`}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(item.confidence * 100, 4)}%` }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                style={{
                  flex: 1,
                  background: 'rgba(139,92,246,0.6)',
                  borderRadius: '3px 3px 0 0',
                  minHeight: 4,
                }}
              />
              {/* Nodes bar */}
              <motion.div
                title={`Nodes: ${item.nodes}`}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max((item.nodes / maxNodes) * 100, 4)}%` }}
                transition={{ duration: 0.5, delay: i * 0.05 + 0.05 }}
                style={{
                  flex: 1,
                  background: 'rgba(16,185,129,0.6)',
                  borderRadius: '3px 3px 0 0',
                  minHeight: 4,
                }}
              />
            </div>
            {/* Date label */}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
              {item.date}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm" style={{ background: 'rgba(139,92,246,0.6)' }} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Confidence</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm" style={{ background: 'rgba(16,185,129,0.6)' }} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Knowledge nodes</span>
        </div>
      </div>
    </motion.div>
  );
};
