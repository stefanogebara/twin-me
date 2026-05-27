/**
 * InboxEmptyState
 *
 * Shown when the inbox stream is empty. Steers the user toward connecting
 * more platforms — without observations there's nothing for the twin to
 * propose.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Inbox as InboxIcon } from 'lucide-react';

const InboxEmptyState: React.FC = () => {
  return (
    <div
      className="flex flex-col items-center text-center px-6 py-16 rounded-[20px] backdrop-blur-[42px]"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <InboxIcon className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
      </div>
      <h2
        className="text-[20px] mb-2"
        style={{
          fontFamily: "'Instrument Serif', serif",
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}
      >
        Your twin is still learning what to bring you.
      </h2>
      <p
        className="text-[14px] max-w-md leading-relaxed mb-5"
        style={{ color: 'var(--text-secondary)' }}
      >
        Connect more platforms so your twin can spot patterns worth acting on.
      </p>
      <Link
        to="/settings#connections"
        className="px-4 py-2 rounded-[100px] text-[13px] font-medium transition-opacity hover:opacity-90"
        style={{ background: '#F5F5F4', color: '#110f0f' }}
      >
        Connect platforms
      </Link>
    </div>
  );
};

export default InboxEmptyState;
