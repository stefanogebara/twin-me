import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDemo } from '../contexts/DemoContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { Download, Trash2, Info, Shield, ArrowRight, Sparkles } from 'lucide-react';
import ConnectedPlatformsSettings from './components/settings/ConnectedPlatformsSettings';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// ── Sub-components ───────────────────────────────────────────────────────

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <span
    className="text-[11px] font-medium tracking-widest uppercase block mb-5"
    style={{ color: 'var(--accent-vibrant, #ff8400)', fontFamily: 'Inter, sans-serif' }}
  >
    {label}
  </span>
);

const Divider: React.FC = () => (
  <div className="my-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
);

const SettingsRow: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div
    className="flex items-center justify-between py-4"
    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
  >
    <div>
      <span className="text-sm" style={{ color: 'var(--foreground)' }}>{label}</span>
      {description && (
        <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{description}</p>
      )}
    </div>
    <div className="flex-shrink-0 ml-4">
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
    className="relative w-10 h-5 rounded-full transition-colors"
    style={{
      backgroundColor: enabled ? 'var(--accent-vibrant, #ff8400)' : 'rgba(255,255,255,0.1)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <div
      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
      style={{ left: enabled ? '22px' : '2px' }}
    />
  </button>
);

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

  // Feature toggles — read from localStorage
  const [featureToggles, setFeatureToggles] = useState({
    personality_oracle: localStorage.getItem('feature_personality_oracle') === 'true',
    neurotransmitter_modes: localStorage.getItem('feature_neurotransmitter_modes') !== 'false',
    connectome_neuropils: localStorage.getItem('feature_connectome_neuropils') !== 'false',
    graph_retrieval: localStorage.getItem('feature_graph_retrieval') === 'true',
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

  // Fetch memory count + subscription in parallel
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

  const handleToggleFeature = (key: keyof typeof featureToggles) => {
    const newValue = !featureToggles[key];
    setFeatureToggles(prev => ({ ...prev, [key]: newValue }));
    localStorage.setItem(`feature_${key}`, String(newValue));
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
    <div className="max-w-[680px] mx-auto px-6 py-16">

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
      <div
        className="rounded-[20px] px-5 py-4 mb-10"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        <SettingsRow label="Email">
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {user?.email ?? 'Not set'}
          </span>
        </SettingsRow>
        <SettingsRow label="Display Name">
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not set'}
          </span>
        </SettingsRow>
        <SettingsRow label="Password">
          <button
            className="text-[12px] transition-opacity hover:opacity-60"
            style={{ color: 'var(--accent-vibrant, #ff8400)' }}
            onClick={() => navigate('/auth?action=reset')}
          >
            Change
          </button>
        </SettingsRow>
      </div>

      {/* ── SECTION 2: PLAN ── */}
      <SectionLabel label="Plan" />
      <div
        className="rounded-[20px] px-5 py-4 mb-10"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-lg"
              style={{ background: 'rgba(196,162,101,0.1)', border: '1px solid rgba(196,162,101,0.2)' }}
            >
              <Sparkles className="w-5 h-5" style={{ color: '#C4A265' }} />
            </div>
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {PLAN_NAMES[subscription?.plan || 'free'] || 'Free'}
              </span>
              {subscription?.cancelAtPeriodEnd && (
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(239,68,68,0.6)' }}>
                  Cancels at end of period
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {subscription?.plan && subscription.plan !== 'free' ? (
              <button
                onClick={handleManageBilling}
                disabled={managingBilling || isDemoMode}
                className="text-[12px] px-3 py-1.5 rounded-lg transition-opacity hover:opacity-60 disabled:opacity-30"
                style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
              >
                {managingBilling ? '...' : 'Manage'}
              </button>
            ) : (
              <button
                onClick={() => navigate('/talk-to-twin')}
                disabled={isDemoMode}
                className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80"
                style={{ background: 'rgba(196,162,101,0.15)', color: '#C4A265' }}
              >
                Upgrade
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 3: CONNECTED PLATFORMS ── */}
      <SectionLabel label="Connected Platforms" />
      <div
        className="rounded-[20px] px-5 py-4 mb-10"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
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
      <SectionLabel label="Personality Engine" />
      <div
        className="rounded-[20px] px-5 py-4 mb-10"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        <SettingsRow
          label="Personality Oracle"
          description="Fine-tuned model for behavioral compass"
        >
          <ToggleSwitch
            enabled={featureToggles.personality_oracle}
            onChange={() => handleToggleFeature('personality_oracle')}
            label="Enable Personality Oracle"
          />
        </SettingsRow>
        <SettingsRow
          label="Neurotransmitter Modes"
          description="Context-dependent response modulation"
        >
          <ToggleSwitch
            enabled={featureToggles.neurotransmitter_modes}
            onChange={() => handleToggleFeature('neurotransmitter_modes')}
            label="Enable Neurotransmitter Modes"
          />
        </SettingsRow>
        <SettingsRow
          label="Connectome Routing"
          description="Domain-specific memory retrieval"
        >
          <ToggleSwitch
            enabled={featureToggles.connectome_neuropils}
            onChange={() => handleToggleFeature('connectome_neuropils')}
            label="Enable Connectome Routing"
          />
        </SettingsRow>
        <SettingsRow
          label="Graph Retrieval"
          description="Associative memory traversal"
        >
          <ToggleSwitch
            enabled={featureToggles.graph_retrieval}
            onChange={() => handleToggleFeature('graph_retrieval')}
            label="Enable Graph Retrieval"
          />
        </SettingsRow>
      </div>

      {/* ── SECTION 5: DATA & PRIVACY ── */}
      <SectionLabel label="Data & Privacy" />
      <div
        className="rounded-[20px] px-5 py-4 mb-10"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        {/* Privacy Spectrum — prominent card */}
        <button
          onClick={() => navigate('/privacy-spectrum')}
          className="w-full flex items-center gap-4 p-4 mb-4 rounded-xl transition-colors"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
            style={{ background: 'rgba(16,183,127,0.1)', border: '1px solid rgba(16,183,127,0.2)' }}
          >
            <Shield className="w-5 h-5" style={{ color: 'var(--accent-vibrant, #ff8400)' }} />
          </div>
          <div className="flex-1 text-left">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Privacy Spectrum</span>
            <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Control what your twin knows and shares
            </p>
          </div>
          <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
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
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {memoryCount != null ? `${memoryCount.toLocaleString()} memories` : '--'}
          </span>
        </SettingsRow>
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
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder='Type "DELETE"'
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="text-sm px-2 py-1 rounded w-28 bg-transparent focus:outline-none"
                style={{ border: '1px solid rgba(193,69,44,0.3)', color: '#c1452c' }}
              />
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="text-[12px] px-3 py-1 rounded transition-opacity disabled:opacity-30"
                style={{ backgroundColor: 'rgba(193,69,44,0.15)', color: '#c1452c' }}
              >
                {deleting ? '...' : 'Confirm'}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                className="text-[12px] transition-opacity hover:opacity-60"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                Cancel
              </button>
            </div>
          )}
        </SettingsRow>
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
