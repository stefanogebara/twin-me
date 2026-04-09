/**
 * ActivityFeed
 *
 * Hairline-border row list of recent department activities.
 * No glass card wrapper — raw rows with bottom borders.
 * Status shown as a small text label (no pill badges).
 */

import React, { useState } from 'react';
import type { ActivityItem } from '@/services/api/departmentsAPI';

const DEPT_COLORS: Record<string, string> = {
  communications: '#3B82F6',
  scheduling: '#8B5CF6',
  health: '#EF4444',
  content: '#F59E0B',
  finance: '#10B981',
  research: '#6366F1',
  social: '#EC4899',
};

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  proposal:   { text: 'Proposed',   color: '#F59E0B' },
  approved:   { text: 'Approved',   color: '#22C55E' },
  rejected:   { text: 'Rejected',   color: '#EF4444' },
  executed:   { text: 'Executed',   color: '#3B82F6' },
  suggestion: { text: 'Suggestion', color: 'rgba(255,255,255,0.35)' },
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
      <p
        className="text-[13px] py-6 text-center"
        style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
      >
        No activity yet. Departments will start logging once they have enough data.
      </p>
    );
  }

  return (
    <div>
      {visible.map((item) => {
        const s = STATUS_LABEL[item.type] || STATUS_LABEL.suggestion;
        return (
          <div
            key={item.id}
            className="flex items-center gap-3 py-3 transition-colors duration-150"
            style={{
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              fontFamily: "'Inter', sans-serif",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            {/* Timestamp */}
            <span
              className="text-[11px] w-14 flex-shrink-0 tabular-nums"
              style={{ color: 'rgba(255,255,255,0.2)' }}
            >
              {relativeTime(item.createdAt)}
            </span>

            {/* Dept dot */}
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: DEPT_COLORS[item.department] || '#6366F1' }}
            />

            {/* Description */}
            <span
              className="text-[13px] flex-1 min-w-0 truncate"
              style={{ color: 'var(--foreground)' }}
            >
              {item.description}
            </span>

            {/* Status text label — no badge */}
            <span
              className="text-[11px] flex-shrink-0"
              style={{ color: s.color }}
            >
              {s.text}
            </span>
          </div>
        );
      })}

      {!showAll && items.length > 10 && (
        <button
          onClick={() => setShowAll(true)}
          className="text-[11px] py-3 w-full text-center cursor-pointer transition-opacity hover:opacity-80"
          style={{
            color: 'rgba(255,255,255,0.3)',
            fontFamily: "'Inter', sans-serif",
            background: 'none',
            border: 'none',
          }}
        >
          Show {items.length - 10} more
        </button>
      )}
    </div>
  );
};

export default ActivityFeed;
