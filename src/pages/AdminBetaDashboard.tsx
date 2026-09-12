import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardCopy, Check, Plus, Layers, Send, RefreshCw } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authFetch } from '@/services/api/apiBase';
import { Page, PageHead, Section, List, Row, Empty } from '@/components/register';
import '@/styles/register-insights.css';

/**
 * Admin: beta invites. Codes, the waitlist and feedback, in the register:
 * figures are rows, the create form sits on the list's ink rule with the one
 * ink primary, and the three tables sit under section headings.
 */

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

/* State is a word in a state ink (register.css: ok 5.1:1, danger 5.5:1 on
   the page), never a tinted chip. */
function getInviteStatus(invite: InviteCode): { label: string; cls: string } {
  const now = new Date();
  if (invite.expires_at && new Date(invite.expires_at) < now) {
    return { label: 'Expired', cls: 'ri-danger' };
  }
  if (invite.use_count >= invite.max_uses) {
    return { label: 'Used', cls: 'ri-q' };
  }
  if (invite.use_count > 0) {
    return { label: 'Partly used', cls: '' };
  }
  return { label: 'Available', cls: 'ri-ok' };
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ========================================================================
// Sub-components
// ========================================================================

/** A figure as a row: the value, then what it counts. */
function Metric({ label, value }: { label: string; value: number | string }) {
  return <Row title={String(value)} line={label} />;
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <button type="button" onClick={handleCopy} className="ri-code" title="Click to copy" aria-label={`Copy ${code}`}>
      {code}
      {copied ? <Check aria-hidden="true" /> : <ClipboardCopy aria-hidden="true" />}
    </button>
  );
}

function StatusText({ invite }: { invite: InviteCode }) {
  const { label, cls } = getInviteStatus(invite);
  return <span className={cls || undefined}>{label}</span>;
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
      // The code is created even when the invite email is rejected. Say so —
      // otherwise the invite looks delivered and nobody sends the code on.
      if (json.emailSent === false) {
        setError('Code created, but the invite email did not send. Share the code manually.');
      }
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
    <Section title="Create a code" line="Name and email are optional.">
      <div className="ri-ruled">
        <div className="ri-form">
          <div className="ri-field">
            <label className="ri-label" htmlFor="invite-name">Who it is for</label>
            <input id="invite-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className="ri-input" />
          </div>
          <div className="ri-field">
            <label className="ri-label" htmlFor="invite-email">Email</label>
            <input id="invite-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className="ri-input" />
          </div>
          <div className="ri-field">
            <label className="ri-label" htmlFor="invite-uses">Uses</label>
            <input id="invite-uses" type="number" min="1" value={maxUses} onChange={e => setMaxUses(e.target.value)} className="ri-input" />
          </div>
          <div className="ri-field">
            <label className="ri-label" htmlFor="invite-days">Expires in (days)</label>
            <input id="invite-days" type="number" min="1" value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} className="ri-input" />
          </div>
        </div>

        <div className="ri-actions">
          <button type="button" onClick={handleCreate} disabled={loading} className="n-btn n-btn--primary">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
            Create code
          </button>
          <button type="button" onClick={handleBatch} disabled={batchLoading} className="n-btn n-btn--ghost">
            {batchLoading ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Layers className="w-4 h-4" aria-hidden="true" />}
            Generate 5 codes
          </button>
        </div>

        {error && (
          <p role="alert" className="rg-empty ri-danger">{error}</p>
        )}

        {createdCode && (
          <p className="ri-actions" style={{ margin: 0 }}>
            <span className="ri-ok">Code created:</span>
            <CopyableCode code={createdCode} />
          </p>
        )}

        {createdBatch.length > 0 && (
          <div className="ri-actions">
            <span className="ri-ok">5 codes created:</span>
            {createdBatch.map(code => (
              <CopyableCode key={code} code={code} />
            ))}
          </div>
        )}
      </div>
    </Section>
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
      // The waitlist row is removed either way, so a silently rejected email
      // would drop the person off both lists without ever inviting them.
      if (json.emailSent === false) {
        setError(`Invite code created for ${email}, but the email did not send. Share the code manually.`);
      }
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
      <Page>
        <PageHead title="Invites" />
        <p className="rg-empty flex items-center gap-2" role="status">
          <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <PageHead title="Invites" line="Codes, the waitlist and feedback" />

      {error && (
        <p role="alert" className="rg-empty ri-danger" style={{ padding: '0 0 24px' }}>
          {error}
        </p>
      )}

      {/* 1. Summary */}
      <Section title="Overview">
        <List className="ri-compact ri-stats">
          <Metric label="Codes" value={totalCodes} />
          <Metric label="Used" value={usedCodes} />
          <Metric label="Available" value={unusedCodes} />
          <Metric label="On the waitlist" value={waitlistCount} />
          <Metric label="Feedback" value={feedbackCount} />
        </List>
      </Section>

      {/* 2. Create a code */}
      <CreateCodeForm onCreated={fetchAll} />

      {/* 3. Invite codes */}
      <Section title="Invite codes" line={`${totalCodes} ${totalCodes === 1 ? 'code' : 'codes'}`}>
        {sortedInvites.length === 0 ? (
          <>
            <List>{null}</List>
            <Empty>No invite codes yet.</Empty>
          </>
        ) : (
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>For</th>
                  <th>Status</th>
                  <th>Uses</th>
                  <th>Created</th>
                  <th>Used</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvites.map(invite => (
                  <tr key={invite.id}>
                    <td><CopyableCode code={invite.code} /></td>
                    <td>
                      {invite.created_for_name && <span className="ri-strong" style={{ color: 'var(--rg-ink)', fontWeight: 500 }}>{invite.created_for_name}</span>}
                      {invite.created_for_email && <span className="ri-sub">{invite.created_for_email}</span>}
                      {!invite.created_for_name && !invite.created_for_email && <span className="ri-q">None</span>}
                    </td>
                    <td><StatusText invite={invite} /></td>
                    <td>{invite.use_count} of {invite.max_uses}</td>
                    <td>{formatDate(invite.created_at)}</td>
                    <td>{invite.used_at ? formatDateTime(invite.used_at) : <span className="ri-q">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 4. Waitlist */}
      <Section title="Waitlist" line={`${waitlistCount} ${waitlistCount === 1 ? 'person' : 'people'}`}>
        {waitlist.length === 0 ? (
          <>
            <List>{null}</List>
            <Empty>The waitlist is empty.</Empty>
          </>
        ) : (
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map(entry => (
                  <tr key={entry.id}>
                    <td className="ri-strong">{entry.email}</td>
                    <td>{entry.name || <span className="ri-q">None</span>}</td>
                    <td>{entry.source || <span className="ri-q">None</span>}</td>
                    <td>{formatDate(entry.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleInviteFromWaitlist(entry.email, entry.name)}
                        disabled={invitingEmail === entry.email}
                        className="n-btn n-btn--ghost"
                      >
                        {invitingEmail === entry.email ? (
                          <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <Send className="w-3 h-3" aria-hidden="true" />
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
      </Section>

      {/* 5. Feedback */}
      <Section title="Feedback" line={`${feedbackCount} ${feedbackCount === 1 ? 'note' : 'notes'}`}>
        {feedback.length === 0 ? (
          <>
            <List>{null}</List>
            <Empty>No feedback yet.</Empty>
          </>
        ) : (
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Kind</th>
                  <th>Message</th>
                  <th>Page</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map(entry => (
                  <tr key={entry.id}>
                    <td>
                      {entry.user?.first_name && <span style={{ color: 'var(--rg-ink)', fontWeight: 500 }}>{entry.user.first_name}</span>}
                      <span className="ri-sub">{entry.user?.email || 'Unknown'}</span>
                    </td>
                    <td>{entry.category === 'ux' ? 'UX' : capitalize(entry.category)}</td>
                    <td className="ri-wrap">
                      <span className="line-clamp-2">{entry.message}</span>
                    </td>
                    <td>
                      {entry.page_url ? (
                        <span className="truncate block max-w-[150px]">
                          {entry.page_url.replace(/^https?:\/\/[^/]+/, '')}
                        </span>
                      ) : (
                        <span className="ri-q">None</span>
                      )}
                    </td>
                    <td>{formatDate(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </Page>
  );
}

export default AdminBetaDashboard;
