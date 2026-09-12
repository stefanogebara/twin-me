import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import { usePlatformsSummary, useDisconnectPlatform } from '../hooks/usePlatformsSummary';
import { Download, Send, ExternalLink, Brain, RefreshCw, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ConnectedPlatformsSettings from './components/settings/ConnectedPlatformsSettings';
import AutonomySettings from './components/settings/AutonomySettings';
import UserRulesSettings from './components/settings/UserRulesSettings';
import WhatsAppConnect from './components/settings/WhatsAppConnect';
import NotificationSettings from './components/settings/NotificationSettings';
import ChatImportCard from './components/settings/ChatImportCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import TwinIntelligence from './components/settings/TwinIntelligence';
import { markTimezoneSynced } from '@/utils/timezoneSync';
import { Switch } from '@/components/ui/switch';
import { Page, PageHead, Section, List, Row } from '@/components/register';
import '@/styles/register-public.css';
import '@/styles/register-settings.css';


const getAuthHeaders = () => {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// ── Sub-components ───────────────────────────────────────────────────────

// The Appearance row is gone: it said "Nocturne is dark by design" with the
// value DARK, which stopped being true when the register (a light page) shipped.
// There is one appearance and nothing to choose, so there is no row.

const TelegramConnect: React.FC = () => {
  const [status, setStatus] = useState<{ linked: boolean; enabled: boolean } | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [botUsername, setBotUsername] = useState('TwinMeBot');

  useEffect(() => {
    fetch(`${API_URL}/telegram/status`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setStatus({ linked: d.linked, enabled: d.enabled }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const generateCode = async () => {
    try {
      const res = await fetch(`${API_URL}/telegram/generate-code`, {
        method: 'POST', headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLinkCode(data.code);
        if (data.botUsername) setBotUsername(data.botUsername);
      } else {
        toast.error('Could not start Telegram connect. Please try again.');
      }
    } catch {
      toast.error('Could not start Telegram connect. Please try again.');
    }
  };

  const handleUnlink = async () => {
    try {
      const res = await fetch(`${API_URL}/telegram/unlink`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) {
        toast.error('Could not unlink Telegram. Please try again.');
        return;
      }
      setStatus({ linked: false, enabled: false });
      setLinkCode(null);
    } catch {
      toast.error('Could not unlink Telegram. Please try again.');
      // Refetch so the badge reflects the real server state
      fetch(`${API_URL}/telegram/status`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(d => { if (d.success) setStatus({ linked: d.linked, enabled: d.enabled }); })
        .catch(() => {});
    }
  };

  if (loading) {
    return (
      <li className="rs-note">
        <Loader2 className="animate-spin" aria-hidden="true" />
        Checking Telegram
      </li>
    );
  }

  return (
    <>
      <Row
        icon={<Send />}
        title="Telegram"
        line={status?.linked
          ? <><span className="rs-ok">Connected</span> · Your twin sends insights here</>
          : 'Talk to your twin on Telegram'}
        action={status?.linked ? (
          <button type="button" onClick={handleUnlink} className="n-btn n-btn--ghost">Unlink</button>
        ) : (
          <button type="button" onClick={generateCode} disabled={!!linkCode} className="n-btn n-btn--ghost">Connect</button>
        )}
        className={linkCode && !status?.linked ? 'rs-row-has-body' : undefined}
      />

      {linkCode && !status?.linked && (
        <li className="rs-body">
          {/* The code is a value to type elsewhere: the one job monospace keeps. */}
          <p className="rs-mono" style={{ margin: 0, padding: '11px 14px', borderRadius: 4, background: 'var(--rg-field)', color: 'var(--rg-ink)', fontSize: 16, letterSpacing: '0.2em', justifySelf: 'start' }}>
            {linkCode}
          </p>
          <p className="rs-quiet" style={{ color: 'var(--rg-ink-2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <ExternalLink className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              In Telegram, find <span className="rs-strong">@{botUsername}</span> and send <span className="rs-strong">/start {linkCode}</span>
            </span>
          </p>
        </li>
      )}
    </>
  );
};

// ── Main page ────────────────────────────────────────────────────────────

const Settings = () => {
  useDocumentTitle('Settings');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [memoryCount, setMemoryCount] = useState<number | null>(null);

  // Subscription state
  const [subscription, setSubscription] = useState<{ plan: string; status: string; cancelAtPeriodEnd?: boolean } | null>(null);
  const [managingBilling, setManagingBilling] = useState(false);

  // Data management state
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Timezone
  const [timezone, setTimezone] = useState<string>('');
  const [savingTimezone, setSavingTimezone] = useState(false);

  // Feature toggles — persisted in DB via /api/feature-flags (not localStorage)
  // Phase 1 (2026-08-09): neurotransmitter_modes, connectome_neuropils, and
  // graph_retrieval toggles removed with their backend subsystems.
  const [featureToggles, setFeatureToggles] = useState({
    personality_oracle: false,
  });

  // Batch-3 state unification: settings reads the canonical /platforms/summary
  // (breakdown entry = connected; state==='expired' = needs reconnection).
  const {
    data: platformsSummary,
    isLoading,
    error: statusError,
    refetch,
  } = usePlatformsSummary();

  const disconnectPlatform = useDisconnectPlatform(user?.id);
  const disconnectingService = disconnectPlatform.isPending
    ? disconnectPlatform.variables ?? null
    : null;

  const error = statusError?.message || null;

  // Fetch memory count + subscription + feature flags in parallel
  useEffect(() => {
    if (!user?.id) return;
    const headers = getAuthHeaders();
    // Memory count
    fetch(`${API_URL}/dashboard/context`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setMemoryCount(data.twinStats?.totalMemories ?? null); })
      .catch(() => {});
    // Subscription
    fetch(`${API_URL}/billing/subscription`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.subscription) setSubscription(data.subscription); })
      .catch(() => {});
    // Feature flags — source of truth is DB, not localStorage
    fetch(`${API_URL}/feature-flags`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.flags) setFeatureToggles(prev => ({ ...prev, ...data.flags }));
      })
      .catch(() => {});
    // Saved account timezone — reflect persisted value, not the browser's
    fetch(`${API_URL}/account/timezone`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.timezone) setTimezone(data.timezone); })
      .catch(() => {});
  }, [user?.id]);

  const PLAN_NAMES: Record<string, string> = { free: 'Free', pro: 'Plus', max: 'Pro' };

  const handleManageBilling = async () => {
    setManagingBilling(true);
    try {
      const res = await fetch(`${API_URL}/billing/portal`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        // No Stripe customer yet (free plan) — send to upgrade flow
        navigate('/pricing');
      }
    } catch {
      toast.error('Could not open billing portal. Please try again.');
    } finally {
      setManagingBilling(false);
    }
  };

  // Optimistic removal, auth headers, revert + error toast on failure, and
  // ['platforms'] invalidation all live inside useDisconnectPlatform.
  const handleDisconnectService = (provider: string) => {
    disconnectPlatform.mutate(provider);
  };

  const handleToggleFeature = async (key: keyof typeof featureToggles) => {
    const newValue = !featureToggles[key];
    setFeatureToggles(prev => ({ ...prev, [key]: newValue }));
    try {
      const res = await fetch(`${API_URL}/feature-flags`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ flag: key, value: newValue }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        // Revert on server rejection
        setFeatureToggles(prev => ({ ...prev, [key]: !newValue }));
        toast.error('Could not update setting. Please try again.');
      }
    } catch {
      // Revert on network failure
      setFeatureToggles(prev => ({ ...prev, [key]: !newValue }));
      toast.error('Could not update setting. Please try again.');
    }
  };

  const handleAutoDetectTimezone = async () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setSavingTimezone(true);
    try {
      const res = await fetch(`${API_URL}/account/timezone`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ timezone: detected }),
      });
      if (res.ok) {
        setTimezone(detected);
        // Keep AuthContext's per-load sync guard coherent: record that this
        // device already delivered this zone so the next page load skips its
        // redundant PATCH (audit-2026-07-03 cost fix).
        markTimezoneSynced(user?.id, detected);
        toast.success('Timezone updated');
      } else {
        toast.error('Could not update timezone. Please try again.');
      }
    } catch { toast.error('Could not update timezone. Please try again.'); }
    finally { setSavingTimezone(false); }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API_URL}/account/export`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error('Export failed');
      const result = await response.json();
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `twin-me-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast.error('Couldn’t export your data. Please try again.'); }
    finally { setExporting(false); }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_URL}/account`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!response.ok) throw new Error('Deletion failed');
      await signOut();
      navigate('/auth');
    } catch {
      toast.error('Account deletion failed — your account is unchanged. Please try again.');
      setDeleting(false);
    }
  };

  // ── Section navigation config (desktop sub-nav + phone jump select) ──
  const sections: { id: string; label: string }[] = [
    { id: 'section-account', label: 'Account' },
    { id: 'section-twin-intelligence', label: 'Accuracy' },
    { id: 'section-plan', label: 'Plan' },
    { id: 'section-platforms', label: 'Platforms' },
    { id: 'section-chat-voice', label: 'Chat voice' },
    { id: 'section-personality', label: 'Personality' },
    { id: 'section-autonomy', label: 'Autonomy' },
    { id: 'section-rules', label: 'Rules' },
    { id: 'section-messaging', label: 'Messaging' },
    { id: 'section-notifications', label: 'Notifications' },
    { id: 'section-privacy', label: 'Data and privacy' },
    { id: 'section-advanced', label: 'Advanced' },
  ];

  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id || '');

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // IntersectionObserver — mark whichever section is closest to the top
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link: /settings?reconnect=<platform> (inbox failed-proposal CTAs) and
  // /settings#connections both target the Connected Platforms section.
  // audit-2026-06-10: InboxTile emitted these URLs but nothing consumed them,
  // so users landed at the top of Settings with no guidance.
  useEffect(() => {
    const reconnectTarget = new URLSearchParams(location.search).get('reconnect');
    if (!reconnectTarget && location.hash !== '#connections') return;
    // Small delay so the sections above have rendered before scrolling.
    const timer = setTimeout(() => {
      scrollToSection('section-platforms');
      if (reconnectTarget) {
        const PLATFORM_LABELS: Record<string, string> = {
          gmail: 'Gmail',
          calendar: 'Google Calendar',
        };
        const label = PLATFORM_LABELS[reconnectTarget] || 'your platform';
        toast.info(`Reconnect ${label} under Platforms to restore access.`);
      }
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInLine = user?.oauthProvider === 'magic_link'
    ? 'With a link sent to your email'
    : user?.oauthProvider === 'google'
      ? 'With Google'
      : user?.oauthProvider
        ? `With ${user.oauthProvider.charAt(0).toUpperCase() + user.oauthProvider.slice(1)}`
        : 'With OAuth';

  const planName = PLAN_NAMES[subscription?.plan || 'free'] || 'Free';

  return (
    <Page className="rs rs-wide">
      <div className="rs-frame">
        {/* Sub-nav — wide screens only. The current item is underlined. */}
        <nav className="rs-subnav" aria-label="Settings sections">
          {sections.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToSection(s.id)}
              aria-current={activeSection === s.id ? 'true' : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="rs-col">
          <PageHead title="Settings" />

          {/* Jump to a section — below the wide breakpoint */}
          <div className="rs-jump">
            <label htmlFor="settings-jump">Jump to</label>
            <select
              id="settings-jump"
              value={activeSection}
              onChange={(e) => { setActiveSection(e.target.value); scrollToSection(e.target.value); }}
              className="rs-select rs-select--wide"
            >
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* ── ACCOUNT ── */}
          <Section id="section-account" title="Account">
            <List label="Account" className="pb-stack">
              <Row title="Email" line={user?.email ?? 'Not set'} />
              <Row
                title="Name"
                line={user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not set'}
              />
              <Row title="Sign-in" line={signInLine} />
              <Row
                title="Timezone"
                line={`${timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}, for briefings`}
                action={
                  <button type="button" onClick={handleAutoDetectTimezone} disabled={savingTimezone} className="n-btn n-btn--ghost">
                    {savingTimezone ? 'Saving' : 'Detect'}
                  </button>
                }
              />
              <Row
                title="User ID"
                line={<><span className="rs-mono">{user?.id ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}` : 'Not available'}</span>, for the browser extension</>}
                action={
                  <button
                    type="button"
                    className="n-btn n-btn--ghost"
                    onClick={() => {
                      if (user?.id) {
                        navigator.clipboard.writeText(user.id);
                        toast.success('User ID copied');
                      }
                    }}
                  >
                    Copy
                  </button>
                }
              />
            </List>
          </Section>

          {/* ── TWIN INTELLIGENCE (TRIBE v2) ── */}
          <Section id="section-twin-intelligence" title="Accuracy">
            <List label="Twin accuracy">
              <TwinIntelligence />
            </List>
          </Section>

          {/* ── PLAN ── */}
          <Section id="section-plan" title="Plan">
            <List label="Plan">
              <Row
                title={planName}
                line={subscription?.cancelAtPeriodEnd ? <span className="rs-bad">Ends with this billing period</span> : 'Your plan'}
                action={subscription?.plan && subscription.plan !== 'free' ? (
                  <button type="button" onClick={handleManageBilling} disabled={managingBilling} className="n-btn n-btn--ghost">
                    {managingBilling ? 'Opening' : 'Manage'}
                  </button>
                ) : (
                  <button type="button" onClick={() => navigate('/pricing')} className="n-btn n-btn--ghost">
                    Upgrade
                  </button>
                )}
              />
            </List>
          </Section>

          {/* ── CONNECTED PLATFORMS ── */}
          <Section
            id="section-platforms"
            title="Platforms"
            action={
              <button
                type="button"
                onClick={() => refetch()}
                className="rg-iconbtn"
                aria-label="Refresh platform connection status"
                title="Refresh"
              >
                <RefreshCw aria-hidden="true" />
              </button>
            }
          >
            <ConnectedPlatformsSettings
              summary={platformsSummary}
              isLoading={isLoading}
              error={error}
              disconnectingService={disconnectingService}
              refetch={refetch}
              navigate={navigate}
              handleDisconnectService={handleDisconnectService}
            />
          </Section>

          {/* ── CHAT VOICE IMPORT ── */}
          <Section id="section-chat-voice" title="Chat voice" line="One chat per kind of relationship, so your twin learns each voice.">
            <ChatImportCard />
          </Section>

          {/* ── PERSONALITY ENGINE ── */}
          <Section id="section-personality" title="Personality">
            <List label="Personality">
              <Row
                title="Enhanced personality"
                line="Replies from a model trained on your writing"
                action={
                  <Switch
                    checked={featureToggles.personality_oracle}
                    onCheckedChange={() => handleToggleFeature('personality_oracle')}
                    aria-label="Enhanced personality"
                  />
                }
              />
            </List>
          </Section>

          {/* ── TWIN AUTONOMY ── */}
          <Section
            id="section-autonomy"
            title="Autonomy"
            line={<>How much your twin does alone. Or <Link to="/talk-to-twin" className="rs-link">tell it in chat</Link>.</>}
          >
            <AutonomySettings />
          </Section>

          {/* ── USER RULES ── */}
          <Section id="section-rules" title="Rules" line="What your twin always keeps to.">
            <UserRulesSettings />
          </Section>

          {/* ── MESSAGING CHANNELS ── */}
          <Section id="section-messaging" title="Messaging">
            <List label="Messaging" className="pb-stack">
              <TelegramConnect />
              <WhatsAppConnect />
            </List>
          </Section>

          {/* ── NOTIFICATIONS ── */}
          <Section id="section-notifications" title="Notifications">
            <List label="Notifications">
              <NotificationSettings userId={user?.id || ''} />
            </List>
          </Section>

          {/* ── DATA & PRIVACY ── */}
          <Section id="section-privacy" title="Data and privacy">
            <List label="Data and privacy" className="pb-stack">
              <Row to="/privacy-spectrum" title="Privacy spectrum" line="What your twin knows and shares" />
              <Row
                title="Export my data"
                line="Everything, as one file"
                action={
                  <button type="button" onClick={handleExportData} disabled={exporting} className="n-btn n-btn--ghost">
                    <Download className="w-4 h-4" aria-hidden="true" />
                    {exporting ? 'Exporting' : 'Download'}
                  </button>
                }
              />
              <Row
                title="Memories"
                line={memoryCount != null ? `${memoryCount.toLocaleString('en-US')} memories` : '--'}
              />
              <Row
                title="Delete account"
                line="Your twin and all your data, for good"
                className={showDeleteConfirm ? 'rs-row-has-body' : undefined}
                action={!showDeleteConfirm ? (
                  <button type="button" onClick={() => setShowDeleteConfirm(true)} className="n-btn rs-danger">
                    Delete everything
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                    className="n-btn n-btn--ghost"
                  >
                    Cancel
                  </button>
                )}
              />
              {showDeleteConfirm && (
                <li className="rs-body rs-body--plain">
                  <div className="rs-inline">
                    <input
                      type="text"
                      placeholder='Type "DELETE"'
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      aria-label="Type DELETE to confirm account deletion"
                      className="n-input"
                    />
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || deleting}
                      className="n-btn rs-danger"
                    >
                      {deleting ? 'Deleting' : 'Confirm'}
                    </button>
                  </div>
                </li>
              )}
            </List>
          </Section>

          {/* ── Advanced ── */}
          <Section id="section-advanced" title="Advanced">
            <List label="Advanced">
              <Row to="/brain" icon={<Brain />} title="Memory explorer" line="Browse and search every memory" />
            </List>
          </Section>

          <p className="rs-quiet rs-foot">TwinMe v0.9</p>
        </div>
      </div>
    </Page>
  );
};

export default Settings;
