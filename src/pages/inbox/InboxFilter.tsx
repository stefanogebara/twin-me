/**
 * InboxFilter
 *
 * Dropdown for filtering the inbox stream:
 *   - all       : everything (default)
 *   - pending   : needs decision
 *   - done      : did it (executed)
 *   - skipped   : skipped or expired
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

export type InboxFilterValue = 'all' | 'pending' | 'done' | 'skipped' | 'snoozed';

const LABELS: Record<InboxFilterValue, string> = {
  all: 'All',
  pending: 'Needs decision',
  done: 'Did it',
  skipped: 'Skipped',
  snoozed: 'Snoozed',
};

interface Props {
  value: InboxFilterValue;
  onChange: (v: InboxFilterValue) => void;
}

const InboxFilter: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as InboxFilterValue)}
        className="appearance-none pl-3 pr-8 py-1.5 rounded-[100px] text-[12px] font-medium cursor-pointer transition-opacity hover:opacity-90"
        style={{
          background: 'rgba(255,255,255,0.08)',
          color: 'var(--text-primary)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
        aria-label="Filter inbox"
      >
        {(['all', 'pending', 'done', 'snoozed', 'skipped'] as const).map((v) => (
          <option key={v} value={v} style={{ background: '#13121a', color: '#F5F5F4' }}>
            {LABELS[v]}
          </option>
        ))}
      </select>
      <ChevronDown
        className="w-3 h-3 absolute right-2.5 pointer-events-none"
        style={{ color: 'var(--text-muted)' }}
      />
    </div>
  );
};

export default InboxFilter;
