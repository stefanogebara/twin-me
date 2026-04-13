/**
 * RecentActivityCards -- Activity rendered as cards with status badges
 * IN PROGRESS = amber, DONE = green, UPCOMING = blue
 */

import React from 'react';
import { motion } from 'framer-motion';

const DEPT_COLORS: Record<string, string> = {
  communications: '#3B82F6',
  scheduling: '#8B5CF6',
  health: '#EF4444',
  content: '#F59E0B',
  finance: '#10B981',
  research: '#6366F1',
  social: '#EC4899',
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  executed: { label: 'DONE', bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
  approved: { label: 'IN PROGRESS', bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  proposal: { label: 'UPCOMING', bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
  suggestion: { label: 'SUGGESTED', bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' },
  rejected: { label: 'DISMISSED', bg: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface ActivityItem {
  id: string;
  type: string;
  department: string;
  description: string;
  createdAt: string;
}

interface RecentActivityCardsProps {
  items: ActivityItem[];
  maxItems?: number;
}

const RecentActivityCards: React.FC<RecentActivityCardsProps> = ({
  items,
  maxItems = 8,
}) => {
  if (items.length === 0) return null;

  const visible = items.slice(0, maxItems);
  const handled = visible.filter(i => i.type === 'executed');
  const other = visible.filter(i => i.type !== 'executed');

  return (
    <div className="mb-6">
      {other.length > 0 && (
        <>
          <h3
            className="text-[11px] font-medium uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Recent activity
          </h3>
          <div className="space-y-1.5 mb-4">
            {other.map((item, i) => (
              <ActivityCard key={item.id} item={item} index={i} />
            ))}
          </div>
        </>
      )}

      {handled.length > 0 && (
        <>
          <h3
            className="text-[11px] font-medium uppercase tracking-wider mb-2 flex items-center gap-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Handled for you
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}
            >
              {handled.length}
            </span>
          </h3>
          <div className="space-y-1.5">
            {handled.map((item, i) => (
              <ActivityCard key={item.id} item={item} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const ActivityCard: React.FC<{ item: ActivityItem; index: number }> = ({ item, index }) => {
  const color = DEPT_COLORS[item.department] || '#6366F1';
  const status = STATUS_CONFIG[item.type] || STATUS_CONFIG.suggestion;
  const deptName = item.department.charAt(0).toUpperCase() + item.department.slice(1);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, delay: index * 0.03 }}
      className="flex items-center gap-3 px-3 py-2 rounded-[10px]"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
          <span className="font-medium" style={{ color }}>{deptName}</span>
          {' '}{item.description}
        </span>
      </div>
      <span
        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider flex-shrink-0"
        style={{ background: status.bg, color: status.color }}
      >
        {status.label}
      </span>
      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
        {timeAgo(item.createdAt)}
      </span>
    </motion.div>
  );
};

export default RecentActivityCards;
