/**
 * WearableConnection Component
 *
 * Allows users to connect their wearable devices (Garmin, Polar, Suunto, Whoop, Apple Health)
 * via the Open Wearables integration and sync their health data.
 *
 * Redesigned to match Settings page styling with glass-morphism and theme awareness.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

// Use relative URL in dev mode to go through Vite proxy, absolute in production
const API_URL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface Provider {
  id: string;
  name: string;
  logo: string;
  description: string;
}

interface ConnectedProvider {
  provider: string;
  connected_at: string;
  last_sync: string;
}

interface SyncResult {
  activities: number;
  sleep: number;
  daily: number;
  heartRate: number;
  total_stored: number;
}

const PROVIDERS: Provider[] = [
  {
    id: 'garmin',
    name: 'Garmin',
    logo: '/garmin-logo.svg',
    description: 'Garmin watches and fitness devices'
  },
  {
    id: 'polar',
    name: 'Polar',
    logo: '/polar-logo.svg',
    description: 'Polar heart rate monitors'
  },
  {
    id: 'suunto',
    name: 'Suunto',
    logo: '/suunto-logo.svg',
    description: 'Suunto sports watches'
  },
  {
    id: 'whoop',
    name: 'WHOOP',
    logo: '/whoop-logo.svg',
    description: 'WHOOP fitness band'
  },
  {
    id: 'apple_health',
    name: 'Apple Health',
    logo: '/apple-health-logo.svg',
    description: 'Apple Watch via Health'
  }
];

export const WearableConnection: React.FC = () => {
  const { theme } = useTheme();
  const getAuthToken = () => localStorage.getItem('auth_token');

  const [connectedProviders, setConnectedProviders] = useState<ConnectedProvider[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking');

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/wearables/status`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      setConnectedProviders(data.providers || []);
      if (data.twinme_last_sync) {
        setLastSync(data.twinme_last_sync);
      }
      setServiceStatus('connected');
    } catch (err) {
      console.error('Failed to fetch wearable status:', err);
      setServiceStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('wearable') === 'success') {
      setTimeout(fetchStatus, 1000);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchStatus]);

  const connectProvider = async (providerId: string) => {
    setConnecting(providerId);
    setError(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/wearables/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ provider: providerId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect');
      }

      const { authUrl } = await response.json();
      window.open(authUrl, '_blank');
    } catch (err) {
      console.error('Failed to connect wearable:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect wearable');
    } finally {
      setConnecting(null);
    }
  };

  const disconnectProvider = async (providerId: string) => {
    setDisconnecting(providerId);
    setError(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/wearables/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ provider: providerId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect');
      }

      setConnectedProviders(prev => prev.filter(p => p.provider !== providerId));
    } catch (err) {
      console.error('Failed to disconnect wearable:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect wearable');
    } finally {
      setDisconnecting(null);
    }
  };

  const syncData = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/wearables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ days: 30 })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync');
      }

      const result = await response.json();
      setSyncResult(result.synced);
      setLastSync(new Date().toISOString());
    } catch (err) {
      console.error('Failed to sync wearable data:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync data');
    } finally {
      setSyncing(false);
    }
  };

  const isProviderConnected = (providerId: string) => {
    return connectedProviders.some(p => p.provider === providerId);
  };

  if (serviceStatus === 'checking') {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
        />
        <span
          className="ml-2"
          style={{
            fontFamily: 'var(--font-body)',
            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
          }}
        >
          Checking service status...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Sync Button */}
      {connectedProviders.length > 0 && (
        <div className="flex items-center justify-between">
          <div>
            {lastSync && (
              <p
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                }}
              >
                Last sync: {new Date(lastSync).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={syncData}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-all hover:scale-[1.02]"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
              fontFamily: 'var(--font-body)',
              opacity: syncing ? 0.7 : 1,
              cursor: syncing ? 'not-allowed' : 'pointer'
            }}
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sync Data
              </>
            )}
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          className="flex items-center gap-2 p-4 rounded-xl"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444'
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span style={{ fontFamily: 'var(--font-body)' }}>
            {error}
          </span>
        </div>
      )}

      {/* Sync Result */}
      {syncResult && (
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}
        >
          <p
            className="font-medium mb-1"
            style={{
              fontFamily: 'var(--font-body)',
              color: '#10B981'
            }}
          >
            Sync Complete!
          </p>
          <p
            className="text-sm"
            style={{
              fontFamily: 'var(--font-body)',
              color: '#10B981'
            }}
          >
            Activities: {syncResult.activities} | Sleep: {syncResult.sleep} | Daily: {syncResult.daily} | Heart Rate: {syncResult.heartRate}
          </p>
        </div>
      )}

      {/* Service Unavailable Warning */}
      {serviceStatus === 'unavailable' && (
        <div
          className="flex items-center gap-2 p-4 rounded-xl"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#f59e0b'
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div style={{ fontFamily: 'var(--font-body)' }}>
            <p className="font-medium">Open Wearables service is not available</p>
            <p className="text-sm mt-1">Make sure the Open Wearables Docker container is running on port 8000.</p>
          </div>
        </div>
      )}

      {/* Provider Cards - Matching Connected Services Style */}
      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const isConnected = isProviderConnected(provider.id);
          const isConnectingThis = connecting === provider.id;
          const isDisconnectingThis = disconnecting === provider.id;
          const connectedInfo = connectedProviders.find(p => p.provider === provider.id);

          return (
            <div
              key={provider.id}
              className="flex items-center justify-between p-4 rounded-xl"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)'
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 flex items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                  }}
                >
                  <img
                    src={provider.logo}
                    alt={`${provider.name} logo`}
                    className="w-6 h-6"
                    style={{
                      filter: theme === 'dark' ? 'invert(0.85)' : 'none'
                    }}
                  />
                </div>
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    {provider.name}
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                    }}
                  >
                    {provider.description}
                  </p>
                  {isConnected && connectedInfo && (
                    <p
                      className="text-xs mt-1"
                      style={{
                        fontFamily: 'var(--font-body)',
                        color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                      }}
                    >
                      Connected: {new Date(connectedInfo.connected_at).toLocaleDateString()}
                      {connectedInfo.last_sync && ` • Last sync: ${new Date(connectedInfo.last_sync).toLocaleString()}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isConnected ? (
                  <>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
                      <span
                        className="text-sm"
                        style={{
                          color: '#10B981',
                          fontFamily: 'var(--font-body)',
                          fontWeight: 500
                        }}
                      >
                        Connected
                      </span>
                    </div>
                    <button
                      onClick={() => disconnectProvider(provider.id)}
                      disabled={isDisconnectingThis}
                      className="px-3 py-1.5 rounded-xl text-sm flex items-center gap-2 transition-all"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontFamily: 'var(--font-body)',
                        opacity: isDisconnectingThis ? 0.7 : 1,
                        cursor: isDisconnectingThis ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isDisconnectingThis ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        'Disconnect'
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <XCircle
                        className="w-4 h-4"
                        style={{
                          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d6d3d1'
                        }}
                      />
                      <span
                        className="text-sm"
                        style={{
                          fontFamily: 'var(--font-body)',
                          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                        }}
                      >
                        Not connected
                      </span>
                    </div>
                    <button
                      onClick={() => connectProvider(provider.id)}
                      disabled={isConnectingThis || serviceStatus === 'unavailable'}
                      className="px-3 py-1.5 rounded-xl text-sm flex items-center gap-2 transition-all hover:scale-[1.02]"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
                        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                        fontFamily: 'var(--font-body)',
                        opacity: (isConnectingThis || serviceStatus === 'unavailable') ? 0.5 : 1,
                        cursor: (isConnectingThis || serviceStatus === 'unavailable') ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isConnectingThis ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      {serviceStatus === 'connected' && (
        <div
          className="mt-4 p-4 rounded-xl border-l-4"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)',
            borderLeftColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}
        >
          <p
            className="text-sm"
            style={{
              fontFamily: 'var(--font-body)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#44403c'
            }}
          >
            <strong>Note:</strong> Powered by Open Wearables - Your health data stays on your infrastructure and syncs directly to your Soul Signature.
          </p>
        </div>
      )}
    </div>
  );
};

export default WearableConnection;
