/**
 * InboxSummary
 *
 * Compact inbox overview for the Communications department card.
 * Shows categorized email counts with a "Summarize inbox" trigger.
 */

import React, { useState, useCallback } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

interface InboxEmail {
  from: string;
  subject: string;
  date: string | null;
}

interface InboxSummaryData {
  needsReply: InboxEmail[];
  fyi: InboxEmail[];
  promotional: number;
  total: number;
}

const InboxSummary: React.FC = () => {
  const [data, setData] = useState<InboxSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/inbox/summary');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch inbox summary');
      }
      const result = await response.json();
      setData({
        needsReply: result.needsReply || [],
        fyi: result.fyi || [],
        promotional: result.promotional || 0,
        total: result.total || 0,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, []);

  if (!data && !loading && !error) {
    return (
      <button
        onClick={fetchSummary}
        className="flex items-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer"
        style={{
          color: 'rgba(255,255,255,0.35)',
          fontFamily: "'Inter', sans-serif",
          background: 'none',
          border: 'none',
          padding: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
      >
        <Mail className="w-3 h-3" />
        Summarize inbox
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgba(255,255,255,0.25)' }} />
        <span
          className="text-[11px]"
          style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
        >
          Scanning inbox...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-[11px]"
          style={{ color: 'rgba(239,68,68,0.6)', fontFamily: "'Inter', sans-serif" }}
        >
          {error}
        </span>
        <button
          onClick={fetchSummary}
          className="text-[10px] underline cursor-pointer"
          style={{
            color: 'rgba(255,255,255,0.3)',
            fontFamily: "'Inter', sans-serif",
            background: 'none',
            border: 'none',
            padding: 0,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (data && data.total === 0) {
    return (
      <span
        className="text-[11px]"
        style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
      >
        Inbox clear -- no unread emails
      </span>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="text-[10px] font-medium tracking-[0.08em] uppercase"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          Inbox
        </span>
      </div>
      <span
        className="text-[11px]"
        style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
      >
        {data!.needsReply.length} need reply
        {' | '}
        {data!.fyi.length} FYI
        {' | '}
        {data!.promotional} promotional
      </span>
      {data!.needsReply.length > 0 && (
        <div className="mt-2 space-y-1">
          {data!.needsReply.slice(0, 3).map((email, i) => (
            <div
              key={i}
              className="text-[11px] truncate"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
            >
              {email.from.split('<')[0].trim()} -- {email.subject}
            </div>
          ))}
        </div>
      )}
      <button
        onClick={fetchSummary}
        className="mt-2 text-[10px] cursor-pointer transition-colors"
        style={{
          color: 'rgba(255,255,255,0.25)',
          fontFamily: "'Inter', sans-serif",
          background: 'none',
          border: 'none',
          padding: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
      >
        Refresh
      </button>
    </div>
  );
};

export default InboxSummary;
