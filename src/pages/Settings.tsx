import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDemo } from '../contexts/DemoContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  Info,
  Shield,
  Lock,
  Eye,
  ServerCrash,
  Database,
  LogOut
} from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';
import ConnectedPlatformsSettings from './components/settings/ConnectedPlatformsSettings';
import DataConsentSettings from './components/settings/DataConsentSettings';
import ClaudeDesktopSync from './components/settings/ClaudeDesktopSync';
import DataManagementSettings from './components/settings/DataManagementSettings';
import GitHubConnectCard from './components/settings/GitHubConnectCard';
import WhatsAppImportCard from './components/settings/WhatsAppImportCard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const Settings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isDemoMode } = useDemo();
  const [disconnectingService, setDisconnectingService] = useState<string | null>(null);
  const [userIdCopied, setUserIdCopied] = useState(false);
  const [syncStats, setSyncStats] = useState<{
    totalConversations: number;
    claudeDesktopConversations: number;
    lastSyncAt: string | null;
  } | null>(null);
  const [loadingSyncStats, setLoadingSyncStats] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Consent management state
  const [consents, setConsents] = useState<Array<{
    id: string;
    consent_type: string;
    platform: string | null;
    granted: boolean;
    consent_version: string;
    granted_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>>([]);
  const [loadingConsents, setLoadingConsents] = useState(false);
  const [revokingConsent, setRevokingConsent] = useState<string | null>(null);

  // Data management state
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dataMessage, setDataMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Use unified platform status hook
  const {
    data: connectorStatus,
    isLoading,
    error: statusError,
    refetch,
    optimisticDisconnect,
    revertOptimisticUpdate
  } = usePlatformStatus(user?.id);

  const error = statusError?.message || null;

  // Fetch Claude Desktop sync stats
  useEffect(() => {
    const fetchSyncStats = async () => {
      if (!user?.id) return;
      setLoadingSyncStats(true);
      try {
        const response = await fetch(`${API_URL}/conversations/stats/${user.id}`, {
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          setSyncStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch sync stats:', err);
      } finally {
        setLoadingSyncStats(false);
      }
    };
    fetchSyncStats();
  }, [user?.id]);

  // Fetch user consents
  useEffect(() => {
    const fetchConsents = async () => {
      if (!user?.id) return;
      setLoadingConsents(true);
      try {
        const response = await fetch(`${API_URL}/consent`, {
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          setConsents((data.consents || []).filter((c: { granted: boolean }) => c.granted));
        }
      } catch (err) {
        console.error('Failed to fetch consents:', err);
      } finally {
        setLoadingConsents(false);
      }
    };
    fetchConsents();
  }, [user?.id]);

  // Revoke a consent
  const handleRevokeConsent = async (consentType: string, platform: string) => {
    const key = `${consentType}:${platform}`;
    setRevokingConsent(key);
    try {
      const response = await fetch(
        `${API_URL}/consent/${encodeURIComponent(consentType)}/${encodeURIComponent(platform)}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      if (response.ok) {
        setConsents((prev) => prev.filter(
          (c) => !(c.consent_type === consentType && c.platform === platform)
        ));
      }
    } catch (err) {
      console.error('Failed to revoke consent:', err);
    } finally {
      setRevokingConsent(null);
    }
  };

  // Copy user ID to clipboard
  const handleCopyUserId = async () => {
    if (!user?.id) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setUserIdCopied(true);
      setTimeout(() => setUserIdCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Manual sync trigger
  const handleManualSync = async () => {
    if (!user?.id) return;
    setSyncing(true);
    setSyncMessage({ type: 'info', text: 'Starting sync... Make sure Claude Desktop is closed.' });

    try {
      const response = await fetch(`${API_URL}/claude-sync/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      if (response.ok) {
        const data = await response.json();
        setSyncMessage({ type: 'success', text: `Synced ${data.conversationsSynced || 0} new conversations!` });
        const statsResponse = await fetch(`${API_URL}/conversations/stats/${user.id}`, {
          headers: getAuthHeaders(),
        });
        if (statsResponse.ok) {
          setSyncStats(await statsResponse.json());
        }
      } else {
        const errorData = await response.json();
        setSyncMessage({ type: 'error', text: errorData.message || 'Sync failed. Is Claude Desktop closed?' });
      }
    } catch (err) {
      setSyncMessage({ type: 'error', text: 'Could not connect to sync service. Try again later.' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleDisconnectService = async (provider: string) => {
    try {
      setDisconnectingService(provider);
      optimisticDisconnect(provider);

      const response = await fetch(`${API_URL}/connectors/${provider}/${user?.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await refetch();
      } else {
        await revertOptimisticUpdate();
        throw new Error('Failed to disconnect service');
      }
    } catch (error) {
      console.error('Error disconnecting service:', error);
      await revertOptimisticUpdate();
    } finally {
      setDisconnectingService(null);
    }
  };

  // Export user data
  const handleExportData = async () => {
    setExporting(true);
    setDataMessage(null);
    try {
      const response = await fetch(`${API_URL}/account/export`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Export failed');

      const result = await response.json();

      // Download as JSON file
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `twin-me-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDataMessage({ type: 'success', text: 'Your data has been exported successfully.' });
    } catch (err) {
      setDataMessage({ type: 'error', text: 'Failed to export data. Please try again.' });
    } finally {
      setExporting(false);
      setTimeout(() => setDataMessage(null), 5000);
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;

    setDeleting(true);
    try {
      const response = await fetch(`${API_URL}/account`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Deletion failed');

      // Sign out and redirect
      await signOut();
      navigate('/auth');
    } catch (err) {
      setDataMessage({ type: 'error', text: 'Failed to delete account. Please try again.' });
      setDeleting(false);
    }
  };

  // Shared card styles — Liquid glass card
  const cardStyle = 'glass-card';

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <main className="max-w-4xl mx-auto pt-12 lg:pt-16 pb-20 px-6">
        {/* Page title */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1
            className="heading-serif"
            style={{
              fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
              letterSpacing: '-0.05em',
              lineHeight: 1.1,
              color: 'var(--foreground)'
            }}
          >
            Settings
          </h1>
        </motion.div>
        <motion.div
          className="space-y-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >

          {/* Demo Mode Notice */}
          {isDemoMode && (
            <div
              className="rounded-2xl p-6 flex items-center gap-3"
              style={{
                backgroundColor: 'rgba(251, 191, 36, 0.08)',
                border: '1px solid rgba(251, 191, 36, 0.3)'
              }}
            >
              <Info className="w-5 h-5 flex-shrink-0" style={{ color: '#FBBF24' }} />
              <p className="text-sm" style={{ color: '#B45309' }}>
                You're in demo mode. Platform connections and sync features are simulated. Sign up to connect your real accounts.
              </p>
            </div>
          )}

          {/* Account Information */}
          <section className={`p-8 ${cardStyle}`}>
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <Clay3DIcon name="robot" size={20} />
                <h2 className="heading-serif text-base">
                  Account
                </h2>
              </div>
              <button
                onClick={async () => { try { await signOut(); } catch { /* ignore */ } navigate('/auth'); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
            <div className="flex flex-wrap gap-6 body-text" style={{ color: 'var(--foreground)' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Name: </span>
                {user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not set'}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Email: </span>
                {user?.email}
              </div>
            </div>
          </section>

          {/* Connected Services */}
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

          {/* GitHub + WhatsApp (B-phase integrations) */}
          {!isDemoMode && <GitHubConnectCard />}
          {!isDemoMode && <WhatsAppImportCard />}

          {/* Data Consent */}
          <DataConsentSettings
            consents={consents}
            loadingConsents={loadingConsents}
            revokingConsent={revokingConsent}
            handleRevokeConsent={handleRevokeConsent}
            cardStyle={cardStyle}
          />

          {/* Claude Desktop Sync */}
          <ClaudeDesktopSync
            user={user}
            syncStats={syncStats}
            loadingSyncStats={loadingSyncStats}
            syncing={syncing}
            syncMessage={syncMessage}
            userIdCopied={userIdCopied}
            handleManualSync={handleManualSync}
            handleCopyUserId={handleCopyUserId}
            cardStyle={cardStyle}
          />

          {/* How Your Data is Protected */}
          <section className={`p-8 ${cardStyle}`}>
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5" style={{ color: '#10B981' }} />
              <h2 className="heading-serif text-base">
                How Your Data is Protected
              </h2>
            </div>
            <p className="body-text mb-6" style={{ color: 'var(--text-secondary)' }}>
              Your privacy is fundamental to Twin Me. Here's how we protect you.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                { icon: Lock, label: 'OAuth-only connections', desc: 'We never see or store your platform passwords' },
                { icon: Database, label: 'Encrypted at rest', desc: 'All data stored in encrypted Supabase (PostgreSQL)' },
                { icon: Eye, label: 'No data selling', desc: 'Your data is never sold, shared, or used for ads' },
                { icon: ServerCrash, label: 'Complete deletion', desc: 'Delete your account and ALL data is removed instantly' },
              ].map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 p-5 rounded-2xl"
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.03)',
                    border: '1px solid rgba(16, 185, 129, 0.08)',
                  }}
                >
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#10B981' }} />
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{label}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Privacy & Data Management */}
          <DataManagementSettings
            isDemoMode={isDemoMode}
            navigate={navigate}
            exporting={exporting}
            deleting={deleting}
            showDeleteConfirm={showDeleteConfirm}
            deleteConfirmText={deleteConfirmText}
            dataMessage={dataMessage}
            handleExportData={handleExportData}
            handleDeleteAccount={handleDeleteAccount}
            setShowDeleteConfirm={setShowDeleteConfirm}
            setDeleteConfirmText={setDeleteConfirmText}
            cardStyle={cardStyle}
          />

        </motion.div>
      </main>
    </div>
  );
};

export default Settings;
