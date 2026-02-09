import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  ArrowLeft,
  User,
  Link,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  Zap,
  MessageSquare,
  Copy,
  Clock,
  Play,
  Info
} from 'lucide-react';
import { TriggerManagement } from '../components/moltbot/TriggerManagement';

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
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
        const response = await fetch(`${import.meta.env.VITE_API_URL}/conversations/stats/${user.id}`);
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
      const response = await fetch(`${import.meta.env.VITE_API_URL}/claude-sync/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      if (response.ok) {
        const data = await response.json();
        setSyncMessage({ type: 'success', text: `Synced ${data.conversationsSynced || 0} new conversations!` });
        // Refresh stats
        const statsResponse = await fetch(`${import.meta.env.VITE_API_URL}/conversations/stats/${user.id}`);
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

      const response = await fetch(`${import.meta.env.VITE_API_URL}/connectors/${provider}/${user?.id}`, {
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

  // MVP platforms - cleaner without emojis
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
    <div className="min-h-screen" style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}>
      {/* Header */}
      <div
        className="px-6 py-4 border-b"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.6)' : 'rgba(255, 255, 255, 0.9)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(12px)'
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 text-sm transition-colors"
            style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h1
              className="text-2xl"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, letterSpacing: '-0.02em', color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
            >
              Settings
            </h1>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto pt-8 pb-20 px-6">
        <div className="space-y-6">

          {/* Account Information - Compact */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
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

          {/* Connected Services - Cleaner */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Link className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                  Connected Platforms
                </h2>
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

            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              </div>
            ) : (
              <div className="space-y-2">
                {connectorConfig.map((connector) => {
                  const connectionInfo = connectorStatus[connector.id];
                  const isConnected = connectionInfo?.connected;
                  const isExpired = connectionInfo?.tokenExpired || connectionInfo?.status === 'expired';
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
                            <button
                              onClick={() => handleDisconnectService(connector.id)}
                              disabled={disconnectingService === connector.id}
                              className="text-xs px-2 py-1 rounded-lg"
                              style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                            >
                              {disconnectingService === connector.id ? '...' : 'Disconnect'}
                            </button>
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

          {/* Proactive Automations - User was interested */}
          <section className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-5 h-5" style={{ color: '#FBBF24' }} />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                Proactive Automations
              </h2>
            </div>
            <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
              Set up triggers that automatically detect patterns in your data and take actions.
              For example: "When my recovery is low and I have meetings, suggest calming music."
            </p>
            <TriggerManagement userId={user?.id} />
          </section>

          {/* Claude Desktop Sync - Made Actionable */}
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

            {/* Sync Status */}
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

            {/* Sync Message */}
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

            {/* Actions */}
            <div className="space-y-3">
              {/* Sync Now Button */}
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
                {syncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>

              {/* User ID for advanced users */}
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

              {/* Info note */}
              <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}>
                <strong>Note:</strong> Close Claude Desktop before syncing. Your conversations are analyzed locally to learn your writing patterns.
              </p>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default Settings;
