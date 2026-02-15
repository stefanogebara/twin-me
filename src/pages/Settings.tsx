import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDemo } from '../contexts/DemoContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Copy,
  Play,
  Info,
  Download,
  Trash2,
  Shield,
  ExternalLink,
  Lock,
  Eye,
  ServerCrash,
  Database
} from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';

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
  const { theme } = useTheme();
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
        const response = await fetch(`${API_URL}/conversations/stats/${user.id}`);
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
        const statsResponse = await fetch(`${API_URL}/conversations/stats/${user.id}`);
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

  // MVP platforms
  const connectorConfig = [
    { id: 'spotify', name: 'Spotify', description: 'Music preferences and listening patterns' },
    { id: 'google_calendar', name: 'Google Calendar', description: 'Schedule and event patterns' },
    { id: 'whoop', name: 'Whoop', description: 'Health, recovery, and strain data' }
  ];

  // Shared card styles
  const cardStyle = {
    backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
    boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.03)'
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}
    >
      <main className="max-w-4xl mx-auto pt-8 pb-20 px-6">
        {/* Page title */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1
            className="text-2xl"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, letterSpacing: '-0.02em', color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
          >
            Settings
          </h1>
        </motion.div>
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >

          {/* Demo Mode Notice */}
          {isDemoMode && (
            <div
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.08)',
                border: '1px solid rgba(251, 191, 36, 0.3)'
              }}
            >
              <Info className="w-5 h-5 flex-shrink-0" style={{ color: '#FBBF24' }} />
              <p className="text-sm" style={{ color: theme === 'dark' ? '#FCD34D' : '#B45309' }}>
                You're in demo mode. Platform connections and sync features are simulated. Sign up to connect your real accounts.
              </p>
            </div>
          )}

          {/* Account Information */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-3 mb-4">
              <Clay3DIcon name="robot" size={20} />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                Account
              </h2>
            </div>
            <div className="flex flex-wrap gap-6 text-sm" style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#44403c' }}>
              <div>
                <span style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>Name: </span>
                {user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not set'}
              </div>
              <div>
                <span style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>Email: </span>
                {user?.email}
              </div>
            </div>
          </section>

          {/* Connected Services */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Clay3DIcon name="globe" size={20} />
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                  Connected Platforms
                </h2>
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#10B981',
                  border: '1px solid rgba(16, 185, 129, 0.15)'
                }}>
                  <Lock className="w-3 h-3" />
                  OAuth
                </span>
              </div>
              <button
                onClick={() => refetch()}
                className="p-2 rounded-lg transition-all hover:scale-105"
                style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
              >
                <RefreshCw className="w-4 h-4" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {isLoading && !isDemoMode ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              </div>
            ) : (
              <div className="space-y-2">
                {connectorConfig.map((connector) => {
                  const connectionInfo = connectorStatus[connector.id];
                  const isConnected = isDemoMode ? true : connectionInfo?.connected;
                  const isExpired = isDemoMode ? false : (connectionInfo?.tokenExpired || connectionInfo?.status === 'expired');
                  const isActiveConnection = isConnected && !isExpired;

                  return (
                    <div
                      key={connector.id}
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)'
                      }}
                    >
                      <div>
                        <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 500, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                          {connector.name}
                        </h3>
                        <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>
                          {connector.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isActiveConnection ? (
                          <>
                            <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
                            {!isDemoMode && (
                              <button
                                onClick={() => handleDisconnectService(connector.id)}
                                disabled={disconnectingService === connector.id}
                                className="text-xs px-2 py-1 rounded-lg"
                                style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                              >
                                {disconnectingService === connector.id ? '...' : 'Disconnect'}
                              </button>
                            )}
                            {isDemoMode && (
                              <span className="text-xs px-2 py-1 rounded-lg" style={{ color: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                                Demo
                              </span>
                            )}
                          </>
                        ) : isExpired ? (
                          <>
                            <AlertCircle className="w-4 h-4" style={{ color: '#f59e0b' }} />
                            <button
                              onClick={() => navigate('/get-started')}
                              className="text-xs px-2 py-1 rounded-lg"
                              style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}
                            >
                              Reconnect
                            </button>
                          </>
                        ) : (
                          <XCircle className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : '#d6d3d1' }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>


          {/* Data Consent */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5" style={{ color: '#A78BFA' }} />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                Data Consent
              </h2>
            </div>
            <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
              Manage the permissions you've granted for platform data access.
            </p>

            {loadingConsents ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              </div>
            ) : consents.length === 0 ? (
              <div
                className="text-sm py-4 text-center rounded-xl"
                style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c',
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                }}
              >
                No active consents. Connect a platform to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {consents.map((consent) => (
                  <div
                    key={consent.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                      border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    <div>
                      <h3 className="text-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                        {consent.platform
                          ? `${consent.platform.charAt(0).toUpperCase() + consent.platform.slice(1).replace(/_/g, ' ')} - ${consent.consent_type.replace(/_/g, ' ')}`
                          : consent.consent_type.replace(/_/g, ' ')}
                      </h3>
                      <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>
                        Granted {consent.granted_at ? new Date(consent.granted_at).toLocaleDateString() : 'N/A'}
                        {' '}&middot; v{consent.consent_version}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeConsent(consent.consent_type, consent.platform || '')}
                      disabled={revokingConsent === `${consent.consent_type}:${consent.platform}`}
                      className="text-xs px-3 py-1.5 rounded-lg transition-all"
                      style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                    >
                      {revokingConsent === `${consent.consent_type}:${consent.platform}` ? '...' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Claude Desktop Sync */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare className="w-5 h-5" style={{ color: '#A78BFA' }} />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                Claude Desktop Sync
              </h2>
            </div>
            <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
              Import your Claude Desktop conversations so your twin can learn your writing style and topics you care about.
            </p>

            {loadingSyncStats ? (
              <div className="flex items-center gap-2 mb-4">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
                <span className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>Loading...</span>
              </div>
            ) : syncStats && syncStats.claudeDesktopConversations > 0 ? (
              <div
                className="flex items-center gap-4 p-3 rounded-xl mb-4"
                style={{ backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)' }}
              >
                <CheckCircle className="w-5 h-5" style={{ color: '#10B981' }} />
                <div className="flex-1">
                  <span className="text-sm font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                    {syncStats.claudeDesktopConversations} conversations imported
                  </span>
                  {syncStats.lastSyncAt && (
                    <span className="text-xs ml-2" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>
                      · Last sync: {new Date(syncStats.lastSyncAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {syncMessage && (
              <div
                className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
                style={{
                  backgroundColor: syncMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' :
                                   syncMessage.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(167, 139, 250, 0.1)',
                  color: syncMessage.type === 'success' ? '#10B981' :
                         syncMessage.type === 'error' ? '#ef4444' : '#A78BFA'
                }}
              >
                {syncMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
                 syncMessage.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                {syncMessage.text}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleManualSync}
                disabled={syncing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(167, 139, 250, 0.15)' : 'rgba(124, 58, 237, 0.1)',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  color: '#A78BFA',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  opacity: syncing ? 0.7 : 1
                }}
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>

              <div
                className="p-3 rounded-xl"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)'
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>
                    Your User ID (for manual setup)
                  </span>
                  <button
                    onClick={handleCopyUserId}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{
                      backgroundColor: userIdCopied ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                      color: userIdCopied ? '#10B981' : (theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c')
                    }}
                  >
                    {userIdCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {userIdCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <code className="text-xs break-all" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}>
                  {user?.id || 'Loading...'}
                </code>
              </div>

              <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}>
                <strong>Note:</strong> Close Claude Desktop before syncing. Your conversations are analyzed locally to learn your writing patterns.
              </p>
            </div>
          </section>

          {/* How Your Data is Protected */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-5 h-5" style={{ color: '#10B981' }} />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                How Your Data is Protected
              </h2>
            </div>
            <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
              Your privacy is fundamental to Twin Me. Here's how we protect you.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Lock, label: 'OAuth-only connections', desc: 'We never see or store your platform passwords' },
                { icon: Database, label: 'Encrypted at rest', desc: 'All data stored in encrypted Supabase (PostgreSQL)' },
                { icon: Eye, label: 'No data selling', desc: 'Your data is never sold, shared, or used for ads' },
                { icon: ServerCrash, label: 'Complete deletion', desc: 'Delete your account and ALL data is removed instantly' },
              ].map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)',
                    border: theme === 'dark' ? '1px solid rgba(16, 185, 129, 0.1)' : '1px solid rgba(16, 185, 129, 0.08)',
                  }}
                >
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#10B981' }} />
                  <div>
                    <div className="text-sm font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>{label}</div>
                    <div className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Privacy & Data Management */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-3 mb-2">
              <Download className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                Your Data
              </h2>
            </div>
            <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
              You own your data. Export it anytime, or delete your account to permanently remove everything.
            </p>

            {/* Data message */}
            {dataMessage && (
              <div
                className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
                style={{
                  backgroundColor: dataMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: dataMessage.type === 'success' ? '#10B981' : '#ef4444'
                }}
              >
                {dataMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {dataMessage.text}
              </div>
            )}

            <div className="space-y-3">
              {/* Privacy Policy link */}
              <button
                onClick={() => navigate('/privacy-policy')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                  border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <span className="text-sm">Privacy Policy</span>
                <ExternalLink className="w-4 h-4 opacity-40" />
              </button>

              {/* Export Data */}
              <button
                onClick={handleExportData}
                disabled={exporting || isDemoMode}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  color: '#3B82F6',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  opacity: (exporting || isDemoMode) ? 0.5 : 1,
                }}
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exporting ? 'Exporting...' : 'Download My Data'}
              </button>

              {/* Delete Account */}
              {!showDeleteConfirm ? (
                <button
                  onClick={() => !isDemoMode && setShowDeleteConfirm(true)}
                  disabled={isDemoMode}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    opacity: isDemoMode ? 0.5 : 1,
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete My Account
                </button>
              ) : (
                <div
                  className="p-4 rounded-xl space-y-3"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: '#ef4444' }}>
                    This will permanently delete:
                  </p>
                  <ul className="text-xs space-y-1" style={{ color: theme === 'dark' ? 'rgba(239, 68, 68, 0.8)' : '#dc2626' }}>
                    <li>- Your profile and account data</li>
                    <li>- All platform connections and extracted data</li>
                    <li>- Your soul signature and personality analysis</li>
                    <li>- All twin conversations and memories</li>
                    <li>- Behavioral patterns and insights</li>
                  </ul>
                  <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
                    Type <strong style={{ color: '#ef4444' }}>DELETE</strong> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.8)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                      fontFamily: 'var(--font-body)',
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                      className="flex-1 px-4 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || deleting}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: deleteConfirmText === 'DELETE' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)',
                        color: '#fff',
                        fontFamily: 'var(--font-body)',
                        opacity: deleteConfirmText !== 'DELETE' ? 0.5 : 1,
                      }}
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {deleting ? 'Deleting...' : 'Delete Forever'}
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}>
                Account deletion is immediate and irreversible. We recommend exporting your data first.
              </p>
            </div>
          </section>

        </motion.div>
      </main>
    </div>
  );
};

export default Settings;
