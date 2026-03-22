/**
 * Overview Section
 *
 * Statistics cards showing cluster activity, average privacy, and global level.
 */

import React from 'react';

// --- Design tokens (shared with parent) ---
const TEXT_PRIMARY = 'var(--foreground)';
const BORDER_COLOR = 'var(--border-glass)';
const CARD_BG = 'rgba(255,255,255,0.02)';

// --- Stat Card ---
const StatCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div
    style={{
      flex: '1 1 120px',
      background: `${color}0D`,
      borderRadius: 10,
      border: `1px solid ${color}30`,
      padding: '12px 16px',
    }}
  >
    <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Instrument Serif', Georgia, serif" }}>
      {value}
    </div>
    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontWeight: 500 }}>
      {label}
    </div>
  </div>
);

// --- Types ---
interface OverviewSectionProps {
  activeClusters: number;
  totalClusters: number;
  averagePrivacy: string;
  currentGlobal: number;
}

const OverviewSection: React.FC<OverviewSectionProps> = ({
  activeClusters,
  totalClusters,
  averagePrivacy,
  currentGlobal,
}) => (
  <section
    style={{
      background: CARD_BG,
      borderRadius: 16,
      border: `1px solid ${BORDER_COLOR}`,
      padding: '20px 24px',
    }}
  >
    <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>
      Overview
    </h2>

    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <StatCard
        label="Clusters active"
        value={`${activeClusters} / ${totalClusters}`}
        color="#10B981"
      />
      <StatCard
        label="Avg. privacy"
        value={averagePrivacy}
        color="#3B82F6"
      />
      <StatCard
        label="Global level"
        value={`${currentGlobal}%`}
        color="#8B5CF6"
      />
    </div>
  </section>
);

export default OverviewSection;
