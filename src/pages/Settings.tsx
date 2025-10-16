import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  AlertCircle
} from 'lucide-react';

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [disconnectingService, setDisconnectingService] = useState<string | null>(null);

  // Use unified platform status hook
  const { data: connectorStatus, isLoading, error: statusError, refetch } = usePlatformStatus(user?.id);

  // Convert status error to string for display
  const error = statusError?.message || null;

  const handleDisconnectService = async (provider: string) => {
    try {
      setDisconnectingService(provider);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/connectors/${provider}/${user?.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Refresh status after disconnection using unified hook
        await refetch();
        // Optionally show success toast
      } else {
        throw new Error('Failed to disconnect service');
      }
    } catch (error) {
      console.error('Error disconnecting service:', error);
      // Error will be shown by status error state
    } finally {
      setDisconnectingService(null);
    }
  };

  const connectorConfig = [
    {
      id: 'google_gmail',
      name: 'Gmail',
      description: 'Access your email conversations and writing style',
      icon: '📧'
    },
    {
      id: 'google_calendar',
      name: 'Google Calendar',
      description: 'Understand your schedule and time management patterns',
      icon: '📅'
    },
    {
      id: 'google_drive',
      name: 'Google Drive',
      description: 'Analyze your documents and teaching materials',
      icon: '📁'
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Learn from your workplace communication style',
      icon: '💬'
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      description: 'Integrate with your Teams conversations',
      icon: '👥'
    },
    {
      id: 'discord',
      name: 'Discord',
      description: 'Connect with your Discord communities',
      icon: '🎮'
    }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F5' }}>
      {/* Header */}
      <div
        className="px-6 py-4 border-b"
        style={{
          backgroundColor: 'white',
          borderColor: 'rgba(20,20,19,0.1)'
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/get-started')}
              className="inline-flex items-center gap-2 text-sm"
              style={{
                color: '#141413',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <div>
              <h1
                className="text-2xl mb-1"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: '#141413'
                }}
              >
                Settings
              </h1>
              <p
                className="text-sm"
                style={{
                  color: '#666666',
                  fontFamily: 'var(--_typography---font--tiempos)'
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
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: 'white',
              borderColor: 'rgba(20,20,19,0.1)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5" style={{ color: '#D97706' }} />
              <h2
                className="text-xl"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: '#141413'
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
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--tiempos)',
                    fontWeight: 500
                  }}
                >
                  Name
                </label>
                <div
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: '#F5F5F5',
                    borderColor: 'rgba(20,20,19,0.1)',
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  {user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not set'}
                </div>
              </div>

              <div>
                <label
                  className="block text-sm mb-2"
                  style={{
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--tiempos)',
                    fontWeight: 500
                  }}
                >
                  Email
                </label>
                <div
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: '#F5F5F5',
                    borderColor: 'rgba(20,20,19,0.1)',
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  {user?.email}
                </div>
              </div>
            </div>
          </section>

          {/* Connected Services */}
          <section
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: 'white',
              borderColor: 'rgba(20,20,19,0.1)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Link className="w-5 h-5" style={{ color: '#D97706' }} />
                <h2
                  className="text-xl"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    color: '#141413'
                  }}
                >
                  Connected Services
                </h2>
              </div>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                style={{
                  backgroundColor: '#F5F5F5',
                  color: '#141413',
                  border: '1px solid rgba(20,20,19,0.1)',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            <p
              className="text-sm mb-6"
              style={{
                color: '#666666',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              These services help your digital twin understand your communication style and preferences.
            </p>

            {error && (
              <div
                className="flex items-center gap-2 p-4 mb-4 rounded-lg border"
                style={{
                  backgroundColor: '#FEE2E2',
                  borderColor: '#FECACA',
                  color: '#DC2626'
                }}
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                  {error}
                </span>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6" style={{ color: '#D97706' }} />
                <span
                  className="ml-2"
                  style={{
                    color: '#666666',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  Loading connection status...
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {connectorConfig.map((connector) => {
                  const isConnected = connectorStatus[connector.id]?.connected;

                  return (
                    <div
                      key={connector.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                      style={{
                        backgroundColor: '#F5F5F5',
                        borderColor: 'rgba(20,20,19,0.1)'
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{connector.icon}</span>
                        <div>
                          <h3
                            style={{
                              color: '#141413',
                              fontFamily: 'var(--_typography---font--tiempos)',
                              fontWeight: 500
                            }}
                          >
                            {connector.name}
                          </h3>
                          <p
                            className="text-sm"
                            style={{
                              color: '#666666',
                              fontFamily: 'var(--_typography---font--tiempos)'
                            }}
                          >
                            {connector.description}
                          </p>
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
                                  fontFamily: 'var(--_typography---font--tiempos)',
                                  fontWeight: 500
                                }}
                              >
                                Connected
                              </span>
                            </div>
                            <button
                              onClick={() => handleDisconnectService(connector.id)}
                              disabled={disconnectingService === connector.id}
                              className="px-3 py-1.5 rounded-lg text-sm border flex items-center gap-2"
                              style={{
                                borderColor: '#FCA5A5',
                                color: '#DC2626',
                                backgroundColor: 'white',
                                fontFamily: 'var(--_typography---font--tiempos)',
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
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4" style={{ color: '#666666' }} />
                            <span
                              className="text-sm"
                              style={{
                                color: '#666666',
                                fontFamily: 'var(--_typography---font--tiempos)'
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
              className="mt-6 p-4 rounded-lg border-l-4"
              style={{
                backgroundColor: '#F5F5F5',
                borderLeftColor: '#D97706',
                borderColor: 'rgba(20,20,19,0.1)'
              }}
            >
              <p
                className="text-sm"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                <strong>Note:</strong> To connect new services, go back to the{' '}
                <button
                  onClick={() => navigate('/get-started')}
                  className="underline"
                  style={{
                    color: '#D97706',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  onboarding page
                </button>{' '}
                where you can manage your data connections.
              </p>
            </div>
          </section>

          {/* Privacy & Security */}
          <section
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: 'white',
              borderColor: 'rgba(20,20,19,0.1)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5" style={{ color: '#D97706' }} />
              <h2
                className="text-xl"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: '#141413'
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
                      color: '#141413',
                      fontFamily: 'var(--_typography---font--tiempos)',
                      fontWeight: 500
                    }}
                  >
                    Data Usage Consent
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      color: '#666666',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Allow the platform to analyze your connected data to improve your digital twin
                  </p>
                </div>
                <label className="relative inline-flex items-center">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 peer-checked:bg-green-600" style={{ backgroundColor: '#D1D5DB' }}></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3
                    style={{
                      color: '#141413',
                      fontFamily: 'var(--_typography---font--tiempos)',
                      fontWeight: 500
                    }}
                  >
                    Analytics
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      color: '#666666',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Share anonymous usage data to help improve the platform
                  </p>
                </div>
                <label className="relative inline-flex items-center">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 peer-checked:bg-green-600" style={{ backgroundColor: '#D1D5DB' }}></div>
                </label>
              </div>
            </div>
          </section>

          {/* Additional Settings */}
          <section
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: 'white',
              borderColor: 'rgba(20,20,19,0.1)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Palette className="w-5 h-5" style={{ color: '#D97706' }} />
              <h2
                className="text-xl"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: '#141413'
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
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--tiempos)',
                    fontWeight: 500
                  }}
                >
                  Voice Settings
                </h3>
                <button
                  onClick={() => navigate('/voice-settings')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: '#F5F5F5',
                    color: '#141413',
                    border: '1px solid rgba(20,20,19,0.1)',
                    fontFamily: 'var(--_typography---font--tiempos)'
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
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--tiempos)',
                    fontWeight: 500
                  }}
                >
                  Twin Builder
                </h3>
                <button
                  onClick={() => navigate('/twin-builder')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: '#F5F5F5',
                    color: '#141413',
                    border: '1px solid rgba(20,20,19,0.1)',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  Manage Your Digital Twin
                  <ExternalLink className="w-4 h-4" />
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