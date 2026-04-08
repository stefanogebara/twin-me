/**
 * ActivityFeed
 *
 * Compact list of recent department activities.
 * Displays timestamp + department color dot + description + status badge.
 */

import React, { useState } from 'react';
import type { ActivityItem } from '@/services/api/departmentsAPI';

const DEPT_COLORS: Record<string, string> = {
  communications: '#3B82F6', scheduling: '#8B5CF6', health: '#EF4444',
  content: '#F59E0B', finance: '#10B981', research: '#6366F1', social: '#EC4899',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  proposal:   { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', label: 'Proposed' },
  approved:   { bg: 'rgba(34,197,94,0.12)',  text: '#22C55E', label: 'Approved' },
  rejected:   { bg: 'rgba(239,68,68,0.12)',  text: '#EF4444', label: 'Rejected' },
  executed:   { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6', label: 'Executed' },
  suggestion: { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.4)', label: 'Suggestion' },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface Props { items: ActivityItem[]; }

const ActivityFeed: React.FC<Props> = ({ items }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 10);

  if (items.length === 0) {
    return (
      <p className="text-[13px] py-6 text-center" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}>
        No activity yet. Your departments will start working once they have enough data.
      </p>
    );
  }

  return (
    <div className="rounded-[16px] px-4 py-2" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {visible.map((item) => {
        const s = STATUS_STYLES[item.type] || STATUS_STYLES.suggestion;
        return (
          <div key={item.id} className="flex items-center gap-2.5 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-[10px] w-12 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}>{relativeTime(item.createdAt)}</span>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: DEPT_COLORS[item.department] || '#6366F1' }} />
            <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>{item.description}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: s.bg, color: s.text }}>{s.label}</span>
          </div>
        );
      })}
      {!showAll && items.length > 10 && (
        <button onClick={() => setShowAll(true)} className="text-[11px] py-2 w-full text-center cursor-pointer" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif", background: 'none', border: 'none' }}>
          Show {items.length - 10} more
        </button>
      )}
    </div>
  );
};

export default ActivityFeed;
