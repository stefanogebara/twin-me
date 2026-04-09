import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useDemo } from '../contexts/DemoContext';
import { getAccessToken } from '@/services/api/apiBase';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { Download, Info, ArrowRight, Send, ExternalLink, Check } from 'lucide-react';
import ConnectedPlatformsSettings from './components/settings/ConnectedPlatformsSettings';
import AutonomySettings from './components/settings/AutonomySettings';
import UserRulesSettings from './components/settings/UserRulesSettings';
import WhatsAppConnect from './components/settings/WhatsAppConnect';
import NotificationSettings from './components/settings/NotificationSettings';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import TwinIntelligence from './components/settings/TwinIntelligence';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const getAuthHeaders = () => {
  const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// ── Sub-components ───────────────────────────────────────────────────────

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <h2
    className="text-[11px] font-medium tracking-[0.1em] uppercase block mb-4"
    style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter, sans-serif', fontSize: '11px', lineHeight: 'normal' }}
  >
    {label}
  </h2>
);

const Divider: React.FC = () => (
  <div className="my-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
);

const SettingsRow: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div
    className="flex items-center justify-between gap-3 py-4 px-1 -mx-1 rounded-[4px] transition-colors"
    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)')}
    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
  >
    <div className="min-w-0 flex-1">
      <span className="text-[14px]" style={{ color: 'var(--foreground)' }}>{label}</span>
      {description && (
        <p className="text-[12px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{description}</p>
      )}
    </div>
    <div className="flex-shrink-0">
      {children}
    </div>
  </div>
);

const ToggleSwitch: React.FC<{
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
}> = ({ enabled, onChange, disabled, label }) => (
  <button
    role="switch"
    aria-checked={enabled}
    aria-label={label}
    onClick={() => !disabled && onChange(!enabled)}
    className="relative w-10 h-5 rounded-full transition-colors duration-200 ease-out active:scale-95"
    style={{
      backgroundColor: enabled ? 'var(--accent-vibrant)' : 'var(--glass-surface-border)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <div
      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ease-out"
      style={{ left: enabled ? '22px' : '2px' }}
    />
  </button>
);

const TelegramConnect: React.FC<{ isDemoMode: boolean }> = ({ isDemoMode }) => {
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
    if (isDemoMode) return;
    const res = await fetch(`${API_URL}/telegram/generate-code`, {
      method: 'POST', headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      setLinkCode(data.code);
      if (data.botUsername) setBotUsername(data.botUsername);
    }
  };

  const handleUnlink = async () => {
    await fetch(`${API_URL}/telegram/unlink`, { method: 'DELETE', headers: getAuthHeaders() });
    setStatus({ linked: false, enabled: false });
    setLinkCode(null);
  };

  if (loading) return <div className="py-4 text-center text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 py-4 px-1 -mx-1 rounded-[4px] transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Send className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-vibrant)' }} />
          <div className="min-w-0">
            <span className="text-sm" style={{ color: 'var(--foreground)' }}>Telegram</span>
            <p className="text-[12px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {status?.linked ? 'Connected — twin sends insights here' : 'Chat with your twin on Telegram'}
            </p>
          </div>
        </div>
        {status?.linked ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(16,183,127,0.8)' }}>
              <Check className="w-3 h-3" /> Linked
            </span>
            <button
              onClick={handleUnlink}
              className="text-[11px] transition-opacity hover:opacity-60"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Unlink
            </button>
          </div>
        ) : (
          <button
            onClick={generateCode}
            disabled={isDemoMode || !!linkCode}
            className="text-[12px] px-3 py-1.5 rounded-[6px] transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: 'var(--button-bg-dark, #252222)', color: 'var(--foreground)' }}
          >
            Connect
          </button>
        )}
      </div>

      {linkCode && !status?.linked && (
        <div className="py-4 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-center gap-3 p-4 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <span className="text-xl sm:text-2xl font-mono tracking-[0.2em] sm:tracking-[0.3em] font-semibold" style={{ color: 'var(--foreground)' }}>
              {linkCode}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Open Telegram, search for <strong style={{ color: 'rgba(255,255,255,0.6)' }}>@{botUsername}</strong>, and send: <strong style={{ color: 'rgba(255,255,255,0.6)' }}>/start {linkCode}</strong>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────────────────

const Settings = () => {
  useDocumentTitle('Settings');
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isDemoMode } = useDemo();
  const [disconnectingService, setDisconnectingService] = useState<string | null>(null);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);

  // Subscription state
  const [subscription, setSubscription] = useState<{ plan: string; status: string; cancelAtPeriodEnd?: boolean } | null>(null);
  const [managingBilling, setManagingBilling] = useState(false);

  // Data management state
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Feature toggles — persisted in DB via /api/feature-flags (not localStorage)
  const [featureToggles, setFeatureToggles] = useState({
    personality_oracle: false,
    neurotransmitter_modes: true,
    connectome_neuropils: true,
    graph_retrieval: false,
  });

  const {
    data: connectorStatus,
    isLoading,
    error: statusError,
    refetch,
    optimisticDisconnect,
    revertOptimisticUpdate
  } = usePlatformStatus(user?.id);

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
      if (data.url) window.location.href = data.url;
    } catch { /* non-fatal */ }
    finally { setManagingBilling(false); }
  };

  const handleDisconnectService = async (provider: string) => {
    try {
      setDisconnectingService(provider);
      optimisticDisconnect(provider);
      const response = await fetch(`${API_URL}/connectors/${provider}/${user?.id}`, { method: 'DELETE' });
      if (response.ok) {
        await refetch();
      } else {
        await revertOptimisticUpdate();
      }
    } catch {
      await revertOptimisticUpdate();
    } finally {
      setDisconnectingService(null);
    }
  };

  const handleToggleFeature = async (key: keyof typeof featureToggles) => {
    const newValue = !featureToggles[key];
    setFeatureToggles(prev => ({ ...prev, [key]: newValue }));
    try {
      await fetch(`${API_URL}/feature-flags`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ flag: key, value: newValue }),
      });
    } catch {
      // Revert on network failure
      setFeatureToggles(prev => ({ ...prev, [key]: !newValue }));
    }
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
    } catch { /* handled silently */ }
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
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-[680px] mx-auto px-4 sm:px-6 py-10 sm:py-16">

      {/* Header */}
      <h1
        className="mb-12"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        Settings
      </h1>

      {/* Demo notice */}
      {isDemoMode && (
        <div
          className="flex items-center gap-2 mb-8 text-sm"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>Demo mode — connections are simulated.</span>
        </div>
      )}

      {/* ── SECTION 1: ACCOUNT ── */}
      <SectionLabel label="Account" />
      <div className="mb-8">
        <SettingsRow label="Email">
          <span className="text-[14px] truncate max-w-[140px] sm:max-w-none inline-block" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {user?.email ?? 'Not set'}
          </span>
        </SettingsRow>
        <SettingsRow label="Display Name">
          <span className="text-[14px] truncate max-w-[140px] sm:max-w-none inline-block" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not set'}
          </span>
        </SettingsRow>
        <SettingsRow label="Authentication" description="Managed via Google OAuth">
          <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Google
          </span>
        </SettingsRow>
        <SettingsRow label="User ID" description="Used by the browser extension">
          <button
            onClick={() => {
              if (user?.id) {
                navigator.clipboard.writeText(user.id);
                toast.success('User ID copied');
              }
            }}
            className="text-xs font-mono truncate max-w-[140px] sm:max-w-[240px] inline-block hover:opacity-80 transition-opacity cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            title="Click to copy"
          >
            {user?.id ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}` : 'Not available'}
          </button>
        </SettingsRow>
      </div>

      {/* ── SECTION 1.5: TWIN INTELLIGENCE (TRIBE v2) ── */}
      {!isDemoMode && <TwinIntelligence />}

      {/* ── SECTION 2: PLAN ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '32px', paddingTop: '32px' }} className="mb-8">
        <SectionLabel label="Plan" />
        <div
          className="flex items-center justify-between gap-3 py-4 px-1 -mx-1 rounded-[4px] transition-colors"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div className="min-w-0 flex-1">
            <span className="text-[14px] font-medium" style={{ color: 'var(--foreground)' }}>
              {PLAN_NAMES[subscription?.plan || 'free'] || 'Free'}
            </span>
            {subscription?.cancelAtPeriodEnd && (
              <p className="text-[12px] mt-0.5" style={{ color: 'rgba(239,68,68,0.6)' }}>
                Cancels at end of period
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {subscription?.plan && subscription.plan !== 'free' ? (
              <button
                onClick={handleManageBilling}
                disabled={managingBilling || isDemoMode}
                className="text-[12px] px-3 py-1.5 rounded-[100px] transition-opacity hover:opacity-60 disabled:opacity-30"
                style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
              >
                {managingBilling ? '...' : 'Manage'}
              </button>
            ) : (
              <button
                onClick={() => navigate('/talk-to-twin')}
                disabled={isDemoMode}
                className="text-[12px] px-3 py-1.5 rounded-[100px] font-medium transition-opacity hover:opacity-80"
                style={{ background: 'rgba(196,162,101,0.15)', color: '#C4A265' }}
              >
                Upgrade
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 3: CONNECTED PLATFORMS ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '32px', paddingTop: '32px' }} className="mb-8">
        <SectionLabel label="Connected Platforms" />
        <ConnectedPlatformsSettings
          isDemoMode={isDemoMode}
          connectorStatus={connectorStatus}
          isLoading={isLoading}
          error={error}
          disconnectingService={disconnectingService}
          refetch={refetch}
          navigate={navigate}
          handleDisconnectService={handleDisconnectService}
        />
      </div>

      {/* ── SECTION 4: PERSONALITY ENGINE ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '32px', paddingTop: '32px' }} className="mb-8">
        <SectionLabel label="Personality Engine" />
        <SettingsRow
          label="Enhanced Personality"
          description="Use your fine-tuned model to make responses more authentically you (requires training data)"
        >
          <ToggleSwitch
            enabled={featureToggles.personality_oracle}
            onChange={() => handleToggleFeature('personality_oracle')}
            label="Enable Enhanced Personality"
          />
        </SettingsRow>
        <SettingsRow
          label="Mood-Aware Responses"
          description="Twin adjusts its tone based on the emotional context of your message"
        >
          <ToggleSwitch
            enabled={featureToggles.neurotransmitter_modes}
            onChange={() => handleToggleFeature('neurotransmitter_modes')}
            label="Enable Mood-Aware Responses"
          />
        </SettingsRow>
        <SettingsRow
          label="Domain Memory Routing"
          description="Twin searches different memory categories depending on what you're asking about"
        >
          <ToggleSwitch
            enabled={featureToggles.connectome_neuropils}
            onChange={() => handleToggleFeature('connectome_neuropils')}
            label="Enable Domain Memory Routing"
          />
        </SettingsRow>
        <SettingsRow
          label="Associative Memory"
          description="Twin follows memory connections — surfacing related memories you haven't explicitly mentioned (experimental)"
        >
          <ToggleSwitch
            enabled={featureToggles.graph_retrieval}
            onChange={() => handleToggleFeature('graph_retrieval')}
            label="Enable Associative Memory"
          />
        </SettingsRow>
      </div>

      {/* ── SECTION 5: TWIN AUTONOMY ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '32px', paddingTop: '32px' }} className="mb-8">
        <SectionLabel label="Twin Autonomy" />
        <AutonomySettings isDemoMode={isDemoMode} />
      </div>

      {/* ── SECTION 5B: USER RULES ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '32px', paddingTop: '32px' }} className="mb-8">
        <SectionLabel label="Twin Rules" />
        <UserRulesSettings isDemoMode={isDemoMode} />
      </div>

      {/* ── SECTION 6: MESSAGING CHANNELS ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '32px', paddingTop: '32px' }} className="mb-8">
        <SectionLabel label="Messaging" />
        <TelegramConnect isDemoMode={isDemoMode} />
        <WhatsAppConnect isDemoMode={isDemoMode} />
      </div>

      {/* ── SECTION 6B: NOTIFICATIONS ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '32px', paddingTop: '32px' }} className="mb-8">
        <SectionLabel label="Notifications" />
        <NotificationSettings userId={user?.id || ''} />
      </div>

      {/* ── SECTION 7: DATA & PRIVACY ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '32px', paddingTop: '32px' }} className="mb-8">
        <SectionLabel label="Data & Privacy" />

        {/* Privacy Spectrum — row with nav arrow */}
        <button
          onClick={() => navigate('/privacy-spectrum')}
          className="w-full flex items-center justify-between gap-3 py-4 px-1 -mx-1 rounded-[4px] transition-colors text-left"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div className="min-w-0 flex-1">
            <span className="text-[14px]" style={{ color: 'var(--foreground)' }}>Privacy Spectrum</span>
            <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Control what your twin knows and shares
            </p>
          </div>
          <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>

        <SettingsRow label="Export My Data">
          <button
            onClick={handleExportData}
            disabled={exporting || isDemoMode}
            className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-60 disabled:opacity-30"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting...' : 'Download'}
          </button>
        </SettingsRow>
        <SettingsRow label="Memory Count">
          <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {memoryCount != null ? `${memoryCount.toLocaleString()} memories` : '--'}
          </span>
        </SettingsRow>

        {/* Danger zone — subtle red border, no heavy card */}
        <div
          className="mt-4 p-4 rounded-[8px]"
          style={{ border: '1px solid rgba(255,100,100,0.1)' }}
        >
          <SettingsRow label="Delete Account">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-[12px] transition-opacity hover:opacity-60"
                style={{ color: '#c1452c' }}
                disabled={isDemoMode}
              >
                Delete everything
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder='Type "DELETE"'
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  aria-label="Type DELETE to confirm account deletion"
                  className="text-sm px-2 py-1 rounded w-24 sm:w-28 bg-transparent focus:outline-none"
                  style={{ border: '1px solid rgba(193,69,44,0.3)', color: '#c1452c' }}
                />
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  className="text-[12px] px-3 py-1 rounded transition-opacity disabled:opacity-30 flex-shrink-0"
                  style={{ backgroundColor: 'rgba(193,69,44,0.15)', color: '#c1452c' }}
                >
                  {deleting ? '...' : 'Confirm'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                  className="text-[12px] transition-opacity hover:opacity-60 flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </SettingsRow>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-16 text-center">
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
          TwinMe v0.9
        </span>
      </div>
    </div>
  );
};

export default Settings;
