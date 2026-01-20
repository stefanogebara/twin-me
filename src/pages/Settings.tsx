import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  ArrowLeft,
  User,
  Shield,
  Bell,
  Palette,
  Link,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Brain
} from 'lucide-react';

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [disconnectingService, setDisconnectingService] = useState<string | null>(null);

  // Use unified platform status hook
  const {
    data: connectorStatus,
    isLoading,
    error: statusError,
    refetch,
    optimisticDisconnect,
    revertOptimisticUpdate
  } = usePlatformStatus(user?.id);

  // Convert status error to string for display
  const error = statusError?.message || null;

  const handleDisconnectService = async (provider: string) => {
    try {
      setDisconnectingService(provider);

      // Optimistically update UI immediately for instant feedback
      optimisticDisconnect(provider);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/connectors/${provider}/${user?.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Confirm optimistic update with server data
        await refetch();
      } else {
        // Revert optimistic update on failure
        await revertOptimisticUpdate();
        throw new Error('Failed to disconnect service');
      }
    } catch (error) {
      console.error('Error disconnecting service:', error);
      // Ensure we revert if anything goes wrong
      await revertOptimisticUpdate();
    } finally {
      setDisconnectingService(null);
    }
  };

  // MVP platforms - Spotify, Calendar, Whoop
  const connectorConfig = [
    {
      id: 'spotify',
      name: 'Spotify',
      description: 'Music preferences and listening patterns',
      icon: '🎵'
    },
    {
      id: 'google_calendar',
      name: 'Google Calendar',
      description: 'Schedule and event patterns',
      icon: '📅'
    },
    {
      id: 'whoop',
      name: 'Whoop',
      description: 'Health, recovery, and strain data',
      icon: '💪'
    }
  ];

  return (
    <div className="min-h-screen" style={{
      backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA'
    }}>
      {/* Header */}
      <div
        className="px-6 py-4 border-b"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.6)' : 'rgba(255, 255, 255, 0.9)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 text-sm transition-colors"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <div>
              <h1
                className="text-2xl mb-1"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                Settings
              </h1>
              <p
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                }}
              >
                Manage your account, connected services, and preferences
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto pt-8 pb-20 px-6">
        <div className="space-y-8">

          {/* Account Information */}
          <section
            className="rounded-3xl p-6"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(16px) saturate(180%)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
              border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              <h2
                className="text-xl"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                Account Information
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label
                  className="block text-sm mb-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  Name
                </label>
                <div
                  className="p-3 rounded-xl"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                    border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  {user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not set'}
                </div>
              </div>

              <div>
                <label
                  className="block text-sm mb-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  Email
                </label>
                <div
                  className="p-3 rounded-xl"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                    border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  {user?.email}
                </div>
              </div>
            </div>
          </section>

          {/* Connected Services */}
          <section
            className="rounded-3xl p-6"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(16px) saturate(180%)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
              border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Link className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
                <h2
                  className="text-xl"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 400,
                    letterSpacing: '-0.02em',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  Connected Services
                </h2>
              </div>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  fontFamily: 'var(--font-body)'
                }}
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            <p
              className="text-sm mb-6"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
              }}
            >
              These services help your digital twin understand your communication style and preferences.
            </p>

            {error && (
              <div
                className="flex items-center gap-2 p-4 mb-4 rounded-xl"
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

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
                <span
                  className="ml-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                  }}
                >
                  Loading connection status...
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {connectorConfig.map((connector) => {
                  const connectionInfo = connectorStatus[connector.id];
                  const isConnected = connectionInfo?.connected;
                  const isExpired = connectionInfo?.tokenExpired || connectionInfo?.status === 'expired';
                  const isActiveConnection = isConnected && !isExpired;

                  return (
                    <div
                      key={connector.id}
                      className="flex items-center justify-between p-4 rounded-xl"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)'
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{connector.icon}</span>
                        <div>
                          <h3
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontWeight: 500,
                              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                            }}
                          >
                            {connector.name}
                          </h3>
                          <p
                            className="text-sm"
                            style={{
                              fontFamily: 'var(--font-body)',
                              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                            }}
                          >
                            {connector.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isActiveConnection ? (
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
                              onClick={() => handleDisconnectService(connector.id)}
                              disabled={disconnectingService === connector.id}
                              className="px-3 py-1.5 rounded-xl text-sm flex items-center gap-2 transition-all"
                              style={{
                                backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#ef4444',
                                fontFamily: 'var(--font-body)',
                                opacity: disconnectingService === connector.id ? 0.7 : 1,
                                cursor: disconnectingService === connector.id ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {disconnectingService === connector.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Disconnecting...
                                </>
                              ) : (
                                'Disconnect'
                              )}
                            </button>
                          </>
                        ) : isExpired ? (
                          <>
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" style={{ color: '#f59e0b' }} />
                              <span
                                className="text-sm"
                                style={{
                                  color: '#f59e0b',
                                  fontFamily: 'var(--font-body)',
                                  fontWeight: 500
                                }}
                              >
                                Token Expired
                              </span>
                            </div>
                            <button
                              onClick={() => navigate('/get-started')}
                              className="px-3 py-1.5 rounded-xl text-sm flex items-center gap-2 transition-all hover:scale-[1.02]"
                              style={{
                                backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                color: '#f59e0b',
                                fontFamily: 'var(--font-body)'
                              }}
                            >
                              Reconnect
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4" style={{
                              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d6d3d1'
                            }} />
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
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className="mt-6 p-4 rounded-xl border-l-4"
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
                <strong>Note:</strong> To connect new services, go back to the{' '}
                <button
                  onClick={() => navigate('/soul-signature')}
                  className="underline transition-colors"
                  style={{
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Soul Signature Dashboard
                </button>{' '}
                where you can manage your data connections.
              </p>
            </div>
          </section>

          {/* Privacy & Security */}
          <section
            className="rounded-3xl p-6"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(16px) saturate(180%)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
              border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              <h2
                className="text-xl"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                Privacy & Security
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    Data Usage Consent
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                    }}
                  >
                    Allow the platform to analyze your connected data to improve your digital twin
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div
                    className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : '#d1d5db',
                      '--tw-peer-checked-bg': theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    } as any}
                  >
                    <style>{`
                      .peer:checked ~ div { background-color: ${theme === 'dark' ? '#C1C0B6' : '#0c0a09'}; }
                      .peer ~ div::after { background-color: ${theme === 'dark' ? '#232320' : '#ffffff'}; }
                    `}</style>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    Analytics
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                    }}
                  >
                    Share anonymous usage data to help improve the platform
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div
                    className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : '#d1d5db'
                    }}
                  >
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section
            className="rounded-3xl p-6"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(16px) saturate(180%)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
              border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Palette className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              <h2
                className="text-xl"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                Preferences
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <h3
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  Voice Settings
                </h3>
                <button
                  onClick={() => navigate('/voice-settings')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Configure Voice Clone
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  Twin Builder
                </h3>
                <button
                  onClick={() => navigate('/twin-builder')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Manage Your Digital Twin
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Soul Signature */}
          <section
            className="rounded-3xl p-6"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(16px) saturate(180%)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
              border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              <h2
                className="text-xl"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                Soul Signature
              </h2>
            </div>

            <p
              className="text-sm mb-6"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
              }}
            >
              Your Soul Signature is a unique profile built from your personality traits and connected platforms.
            </p>

            <div className="space-y-4">
              <div>
                <h3
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  Discover Your Signature
                </h3>
                <p
                  className="text-sm mb-3"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                  }}
                >
                  Take the guided onboarding to discover or refine your soul signature through personality questions and platform connections.
                </p>
                <button
                  onClick={() => {
                    // Clear onboarding state to start fresh
                    localStorage.removeItem('soul-signature-onboarding');
                    navigate('/soul-onboarding');
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Start Soul Signature Onboarding
                </button>
              </div>

              <div>
                <h3
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  View Your Signature
                </h3>
                <button
                  onClick={() => navigate('/soul-signature')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Soul Signature Dashboard
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  Personality Assessment
                </h3>
                <p
                  className="text-sm mb-3"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                  }}
                >
                  Take the scientific Big Five (IPIP-NEO) personality assessment for a deeper understanding of your traits.
                </p>
                <button
                  onClick={() => navigate('/big-five')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  <Brain className="w-4 h-4" />
                  Take Big Five Assessment
                </button>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default Settings;
