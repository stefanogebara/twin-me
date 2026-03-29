import React, { useEffect, useState, useCallback } from 'react';
import {
  TicketCheck,
  Users,
  MessageSquare,
  ClipboardCopy,
  Check,
  Plus,
  Layers,
  Send,
  RefreshCw,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authFetch } from '@/services/api/apiBase';

// ========================================================================
// Types
// ========================================================================

interface InviteCode {
  id: string;
  code: string;
  created_for_email: string | null;
  created_for_name: string | null;
  max_uses: number;
  use_count: number;
  used_by_user_id: string | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  created_at: string;
}

interface FeedbackEntry {
  id: string;
  category: string;
  message: string;
  page_url: string | null;
  created_at: string;
  user: {
    id: string;
    email: string;
    first_name: string | null;
  } | null;
}

// ========================================================================
// Constants
// ========================================================================

const CARD_STYLE = {
  border: '1px solid var(--border-glass)',
  backgroundColor: 'rgba(255,255,255,0.02)',
} as const;

const TABLE_BORDER = '1px solid var(--border-glass)';

const CATEGORY_COLORS: Record<string, string> = {
  bug: 'bg-red-500/20 text-red-400 border-red-500/30',
  feature: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ux: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  general: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

// ========================================================================
// Helpers
// ========================================================================

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInviteStatus(invite: InviteCode): { label: string; cls: string } {
  const now = new Date();
  if (invite.expires_at && new Date(invite.expires_at) < now) {
    return { label: 'Expired', cls: 'bg-red-500/20 text-red-400 border-red-500/30' };
  }
  if (invite.use_count >= invite.max_uses) {
    return { label: 'Used', cls: 'bg-red-500/20 text-red-400 border-red-500/30' };
  }
  if (invite.use_count > 0) {
    return { label: 'Partial', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
  }
  return { label: 'Available', cls: 'bg-green-500/20 text-green-400 border-green-500/30' };
}

// ========================================================================
// Sub-components
// ========================================================================

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-lg px-5 py-4" style={CARD_STYLE}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
        {value}
      </div>
    </div>
  );
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[13px] transition-colors hover:bg-white/10"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'var(--foreground)',
      }}
      title="Click to copy"
    >
      {code}
      {copied ? (
        <Check className="w-3 h-3 text-green-400" />
      ) : (
        <ClipboardCopy className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
      )}
    </button>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] || CATEGORY_COLORS.general;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {category}
    </span>
  );
}

function StatusBadge({ invite }: { invite: InviteCode }) {
  const { label, cls } = getInviteStatus(invite);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ========================================================================
// Create Code Form
// ========================================================================

function CreateCodeForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdBatch, setCreatedBatch] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const buildBody = useCallback(() => {
    const expiresAt = expiresInDays
      ? new Date(Date.now() + parseInt(expiresInDays, 10) * 86400000).toISOString()
      : undefined;

    return {
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      maxUses: parseInt(maxUses, 10) || 1,
      expiresAt,
    };
  }, [name, email, maxUses, expiresInDays]);

  const handleCreate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCreatedCode(null);
    setCreatedBatch([]);
    try {
      const res = await authFetch('/beta/admin/invite', {
        method: 'POST',
        body: JSON.stringify(buildBody()),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create code');
      setCreatedCode(json.data.code);
      setName('');
      setEmail('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [buildBody, onCreated]);

  const handleBatch = useCallback(async () => {
    setBatchLoading(true);
    setError(null);
    setCreatedCode(null);
    setCreatedBatch([]);
    try {
      const expiresAt = expiresInDays
        ? new Date(Date.now() + parseInt(expiresInDays, 10) * 86400000).toISOString()
        : undefined;
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await authFetch('/beta/admin/invite', {
          method: 'POST',
          body: JSON.stringify({
            maxUses: parseInt(maxUses, 10) || 1,
            expiresAt,
          }),
        });
        const json = await res.json();
        if (json.success) {
          codes.push(json.data.code);
        }
      }
      setCreatedBatch(codes);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBatchLoading(false);
    }
  }, [maxUses, expiresInDays, onCreated]);

  return (
    <div className="rounded-lg p-5" style={CARD_STYLE}>
      <div className="flex items-center gap-2 mb-4">
        <Plus className="w-4 h-4" style={{ color: '#10b77f' }} />
        <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
          Create New Code
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Name (who is this for)</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="John Doe"
            className="w-full px-3 py-2.5 rounded-[6px] text-[14px] outline-none focus:ring-1"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
              '--tw-ring-color': 'rgba(255,132,0,0.25)',
            } as React.CSSProperties}
          />
        </div>
        <div>
          <label className="block text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="john@example.com"
            className="w-full px-3 py-2.5 rounded-[6px] text-[14px] outline-none focus:ring-1"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
            } as React.CSSProperties}
          />
        </div>
        <div>
          <label className="block text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Max Uses</label>
          <input
            type="number"
            min="1"
            value={maxUses}
            onChange={e => setMaxUses(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[6px] text-[14px] outline-none focus:ring-1"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
            } as React.CSSProperties}
          />
        </div>
        <div>
          <label className="block text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Expires in (days)</label>
          <input
            type="number"
            min="1"
            value={expiresInDays}
            onChange={e => setExpiresInDays(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[6px] text-[14px] outline-none focus:ring-1"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
            } as React.CSSProperties}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[100px] text-[14px] font-medium transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: '#F5F5F4',
            color: '#110f0f',
          }}
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create Code
        </button>
        <button
          onClick={handleBatch}
          disabled={batchLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[100px] text-[14px] font-medium transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: 'rgba(255,255,255,0.08)',
            color: 'var(--foreground)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {batchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
          Generate 5 Codes
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-[13px] mb-3">{error}</div>
      )}

      {createdCode && (
        <div className="rounded-lg px-4 py-3" style={{ backgroundColor: 'rgba(16,183,127,0.1)', border: '1px solid rgba(16,183,127,0.3)' }}>
          <span className="text-[13px] text-green-400 mr-2">Code created:</span>
          <CopyableCode code={createdCode} />
        </div>
      )}

      {createdBatch.length > 0 && (
        <div className="rounded-lg px-4 py-3" style={{ backgroundColor: 'rgba(16,183,127,0.1)', border: '1px solid rgba(16,183,127,0.3)' }}>
          <span className="text-[13px] text-green-400 block mb-2">5 codes created:</span>
          <div className="flex flex-wrap gap-2">
            {createdBatch.map(code => (
              <CopyableCode key={code} code={code} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================================================
// Main Component
// ========================================================================

function AdminBetaDashboard() {
  useDocumentTitle('Beta Admin');

  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitingEmail, setInvitingEmail] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invitesRes, waitlistRes, feedbackRes] = await Promise.all([
        authFetch('/beta/admin/invites'),
        authFetch('/beta/admin/waitlist'),
        authFetch('/beta/admin/feedback'),
      ]);

      const [invitesJson, waitlistJson, feedbackJson] = await Promise.all([
        invitesRes.json(),
        waitlistRes.json(),
        feedbackRes.json(),
      ]);

      if (invitesJson.success) setInvites(invitesJson.data || []);
      if (waitlistJson.success) setWaitlist(waitlistJson.data || []);
      if (feedbackJson.success) setFeedback(feedbackJson.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleInviteFromWaitlist = useCallback(async (email: string, name: string | null) => {
    setInvitingEmail(email);
    try {
      const res = await authFetch('/beta/admin/invite-from-waitlist', {
        method: 'POST',
        body: JSON.stringify({ email, name: name || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to invite');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite from waitlist');
    } finally {
      setInvitingEmail(null);
    }
  }, [fetchAll]);

  // Derived stats
  const totalCodes = invites.length;
  const usedCodes = invites.filter(i => i.use_count >= i.max_uses).length;
  const unusedCodes = invites.filter(i => {
    const isExpired = i.expires_at && new Date(i.expires_at) < new Date();
    return i.use_count < i.max_uses && !isExpired;
  }).length;
  const waitlistCount = waitlist.length;
  const feedbackCount = feedback.length;

  // Sort invites by created_at DESC
  const sortedInvites = [...invites].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>
          Beta Admin
        </h1>
        <p className="text-[14px] mt-1" style={{ color: 'var(--text-secondary)' }}>
          Manage invite codes, waitlist, and feedback
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 mb-6 text-red-400 text-[13px]" style={{ backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)' }}>
          {error}
        </div>
      )}

      {/* ── 1. Summary Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard
          icon={<TicketCheck className="w-4 h-4" style={{ color: '#3B82F6' }} />}
          label="Total Codes"
          value={totalCodes}
        />
        <StatCard
          icon={<Check className="w-4 h-4" style={{ color: '#22C55E' }} />}
          label="Used"
          value={usedCodes}
        />
        <StatCard
          icon={<TicketCheck className="w-4 h-4" style={{ color: '#EAB308' }} />}
          label="Available"
          value={unusedCodes}
        />
        <StatCard
          icon={<Users className="w-4 h-4" style={{ color: '#A855F7' }} />}
          label="Waitlist"
          value={waitlistCount}
        />
        <StatCard
          icon={<MessageSquare className="w-4 h-4" style={{ color: '#F97316' }} />}
          label="Feedback"
          value={feedbackCount}
        />
      </div>

      {/* ── 2. Create New Code ── */}
      <div className="mb-8">
        <CreateCodeForm onCreated={fetchAll} />
      </div>

      {/* ── 3. Invite Codes Table ── */}
      <div className="rounded-lg p-5 mb-8" style={CARD_STYLE}>
        <div className="flex items-center gap-2 mb-4">
          <TicketCheck className="w-4 h-4" style={{ color: '#3B82F6' }} />
          <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#3B82F6' }}>
            Invite Codes ({totalCodes})
          </span>
        </div>

        {sortedInvites.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No invite codes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ color: 'var(--foreground)' }}>
              <thead>
                <tr style={{ borderBottom: TABLE_BORDER }}>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Code</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Created For</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Status</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Uses</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Created</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Used At</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvites.map(invite => (
                  <tr key={invite.id} style={{ borderBottom: TABLE_BORDER }}>
                    <td className="py-2 px-3"><CopyableCode code={invite.code} /></td>
                    <td className="py-2 px-3">
                      <div>
                        {invite.created_for_name && (
                          <span className="block" style={{ color: 'var(--foreground)' }}>
                            {invite.created_for_name}
                          </span>
                        )}
                        {invite.created_for_email && (
                          <span className="block text-[12px]" style={{ color: 'var(--text-muted)' }}>
                            {invite.created_for_email}
                          </span>
                        )}
                        {!invite.created_for_name && !invite.created_for_email && (
                          <span style={{ color: 'var(--text-placeholder)' }}>--</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3"><StatusBadge invite={invite} /></td>
                    <td className="py-2 px-3">
                      <span className="font-mono">{invite.use_count}/{invite.max_uses}</span>
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(invite.created_at)}
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                      {invite.used_at ? formatDateTime(invite.used_at) : (
                        <span style={{ color: 'var(--text-placeholder)' }}>--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 4. Waitlist Table ── */}
      <div className="rounded-lg p-5 mb-8" style={CARD_STYLE}>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4" style={{ color: '#A855F7' }} />
          <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#A855F7' }}>
            Waitlist ({waitlistCount})
          </span>
        </div>

        {waitlist.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Waitlist is empty.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ color: 'var(--foreground)' }}>
              <thead>
                <tr style={{ borderBottom: TABLE_BORDER }}>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Email</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Name</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Source</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: TABLE_BORDER }}>
                    <td className="py-2 px-3">{entry.email}</td>
                    <td className="py-2 px-3">
                      {entry.name || <span style={{ color: 'var(--text-placeholder)' }}>--</span>}
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                      {entry.source || '--'}
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(entry.created_at)}
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleInviteFromWaitlist(entry.email, entry.name)}
                        disabled={invitingEmail === entry.email}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[100px] text-[12px] font-medium transition-opacity disabled:opacity-50"
                        style={{
                          backgroundColor: '#F5F5F4',
                          color: '#110f0f',
                        }}
                      >
                        {invitingEmail === entry.email ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                        Invite
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 5. Feedback Table ── */}
      <div className="rounded-lg p-5" style={CARD_STYLE}>
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4" style={{ color: '#F97316' }} />
          <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#F97316' }}>
            Feedback ({feedbackCount})
          </span>
        </div>

        {feedback.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No feedback yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ color: 'var(--foreground)' }}>
              <thead>
                <tr style={{ borderBottom: TABLE_BORDER }}>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>User</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Category</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Message</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Page</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: TABLE_BORDER }}>
                    <td className="py-2 px-3">
                      <div>
                        {entry.user?.first_name && (
                          <span className="block" style={{ color: 'var(--foreground)' }}>
                            {entry.user.first_name}
                          </span>
                        )}
                        <span className="block text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          {entry.user?.email || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3"><CategoryBadge category={entry.category} /></td>
                    <td className="py-2 px-3 max-w-[300px]">
                      <span className="line-clamp-2">{entry.message}</span>
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                      {entry.page_url ? (
                        <span className="text-[12px] font-mono truncate block max-w-[150px]">
                          {entry.page_url.replace(/^https?:\/\/[^/]+/, '')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-placeholder)' }}>--</span>
                      )}
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(entry.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminBetaDashboard;
