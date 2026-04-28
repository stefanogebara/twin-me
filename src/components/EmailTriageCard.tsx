/**
 * EmailTriageCard
 * Renders an inbox intelligence brief: scored emails with one-sentence summaries
 * and pre-drafted replies. Powered by the morning briefing Inngest step that
 * scans Gmail, filters noise, and generates context-aware drafts.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

interface EmailItem {
  id: string;
  from: string;
  subject: string;
  summary: string;
  draft: string | null;
  score: number;
  category: 'lead' | 'relationship' | 'action_required' | 'fyi' | string;
}

interface InboxBrief {
  id: string;
  insight: string;
  created_at: string;
  metadata: {
    emails: EmailItem[];
    count: number;
  } | null;
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return from.split('@')[0].replace(/[._]/g, ' ').trim();
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

function categoryLabel(cat: string): string {
  return { lead: 'Lead', relationship: 'Relationship', action_required: 'Action needed', fyi: 'FYI' }[cat] ?? cat;
}

function categoryColor(cat: string): string {
  return {
    lead: 'rgba(193,126,44,0.25)',
    relationship: 'rgba(100,160,100,0.25)',
    action_required: 'rgba(200,80,80,0.25)',
  }[cat] ?? 'rgba(255,255,255,0.08)';
}

const EmailRow: React.FC<{ email: EmailItem }> = ({ email }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const name = extractName(email.from);
  const addr = extractEmail(email.from);
  const replyUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(addr)}&su=${encodeURIComponent(`Re: ${email.subject || ''}`)}&body=${encodeURIComponent(email.draft ?? '')}`;

  const copyDraft = async () => {
    if (!email.draft) return;
    await navigator.clipboard.writeText(email.draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px',
        padding: '12px 14px',
      }}
    >
      {/* Top row: name + category + chevron */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{name}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: categoryColor(email.category), color: 'rgba(255,255,255,0.7)' }}
            >
              {categoryLabel(email.category)}
            </span>
          </div>
          {email.subject && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {email.subject}
            </p>
          )}
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {email.summary}
          </p>
        </div>
        {email.draft && (
          <button
            onClick={() => setOpen(p => !p)}
            className="flex-shrink-0 mt-0.5 p-1 rounded transition-opacity hover:opacity-100 opacity-60"
            title="Show draft"
          >
            <ChevronDown
              className="w-4 h-4 transition-transform duration-200"
              style={{ color: 'rgba(255,255,255,0.5)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
        )}
      </div>

      {/* Draft section */}
      {open && email.draft && (
        <div
          className="mt-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Draft reply</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {email.draft}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={copyDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--foreground)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              href={replyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--foreground)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Open in Gmail
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export const EmailTriageCard: React.FC = () => {
  const { data, isLoading } = useQuery<{ success: boolean; brief: InboxBrief | null }>({
    queryKey: ['inbox-brief'],
    queryFn: async () => {
      const resp = await authFetch('/insights/inbox');
      return resp.json() as Promise<{ success: boolean; brief: InboxBrief | null }>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading || !data?.brief) return null;

  const { brief } = data;
  const emails = brief.metadata?.emails ?? [];
  if (!emails.length) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className="w-1 h-5 rounded-full"
          style={{ background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(255,255,255,0.10))' }}
        />
        <Mail className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <h3 className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Inbox
        </h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--glass-surface-bg)', color: 'rgba(255,255,255,0.4)' }}
        >
          {emails.length}
        </span>
        <span className="ml-auto text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {formatRelativeTime(brief.created_at)}
        </span>
      </div>

      {/* Email rows */}
      <div className="space-y-2">
        {emails.map((email) => (
          <EmailRow key={email.id || email.from} email={email} />
        ))}
      </div>
    </div>
  );
};

export default EmailTriageCard;
